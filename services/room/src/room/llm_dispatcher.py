"""LLM dispatch logic for @mentions and LLM responses.

Extracted from session.py for better separation of concerns.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

import grpc

from pb.api.chat import chat_pb2, chat_pb2_grpc
from pb.api.room import room_pb2
from pb.shared import content_pb2

if TYPE_CHECKING:
    from room.registry import HandlerRegistry
    from room.store import MemoryStore, StoredRoom, StoredMessage

logger = logging.getLogger(__name__)

# Support Unicode (Chinese, etc.) in mentions
_MENTION_RE = re.compile(r"@([\w\u4e00-\u9fff-]+)")
_MENTION_ALL_RE = re.compile(r"(?<![\w\u4e00-\u9fff])@(all|everyone)(?![\w\u4e00-\u9fff])", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def normalize_mention(token: str) -> str:
    """Normalize a mention token (from client or regex match) to compare safely."""
    return token.strip().lstrip("@").rstrip(".,!?;:").lower()


def strip_self_name_prefix(text: str, display_name: str) -> str:
    """Remove repeated leading '<name>:' style prefixes from model output."""
    if not text or not display_name:
        return text
    escaped = re.escape(display_name.strip())
    if not escaped:
        return text
    prefix_re = re.compile(rf"^\s*{escaped}\s*[:\-]\s*", re.IGNORECASE)
    cleaned = text
    for _ in range(3):
        updated = prefix_re.sub("", cleaned, count=1)
        if updated == cleaned:
            break
        cleaned = updated
    return cleaned.lstrip()


def get_chat_style_modifier(chat_style: int) -> str:
    """Return system prompt modifier based on chat style."""
    CONVERSATIONAL, DETAILED, BULLET = 1, 2, 3

    modifiers = {
        CONVERSATIONAL: (
            "RESPONSE STYLE: Keep responses brief - 1-2 sentences max. "
            "Think of this as Slack chat, not email. Be punchy and conversational."
        ),
        DETAILED: (
            "RESPONSE STYLE: Provide thorough, well-structured responses. "
            "Take time to explain your reasoning fully."
        ),
        BULLET: (
            "RESPONSE STYLE: Use bullet points. Be concise and scannable. "
            "Structure your response as a list."
        ),
    }
    return modifiers.get(chat_style, "")


# ---------------------------------------------------------------------------
# Tool builders
# ---------------------------------------------------------------------------


def build_poll_tools(poll_id: str, question: str, options: list, mandatory: bool) -> list[chat_pb2.ToolDefinition]:
    """Build tools specifically for poll voting."""
    options_desc = ", ".join(f"{o['id']}: \"{o['text']}\"" for o in options)
    tools = []

    if not mandatory:
        tools.append(
            chat_pb2.ToolDefinition(
                name="opt_out",
                description=(
                    "Use this to decline voting if none of the options fit your view. "
                    "You should still provide a text response explaining why."
                ),
                parameters_json=json.dumps({
                    "type": "object",
                    "properties": {"reason": {"type": "string", "description": "Why you're not voting"}},
                    "required": ["reason"],
                }),
            )
        )

    tools.append(
        chat_pb2.ToolDefinition(
            name="vote_on_poll",
            description=(
                f"{'REQUIRED - YOU MUST USE THIS TOOL: ' if mandatory else ''}Cast your vote on the poll. "
                f"Question: \"{question}\". Options: [{options_desc}]. "
                f"Use poll_id=\"{poll_id}\" and set option_ids to the ID(s) you choose."
            ),
            parameters_json=json.dumps({
                "type": "object",
                "properties": {
                    "poll_id": {"type": "string", "description": f"The poll ID - must be exactly: {poll_id}"},
                    "option_ids": {"type": "array", "items": {"type": "string"}, "description": "Array of option ID(s) to vote for"},
                    "reason": {"type": "string", "description": "Optional - only provide if you have specific context to share."},
                },
                "required": ["poll_id", "option_ids"],
            }),
        )
    )

    return tools


def build_room_tools(room: "StoredRoom", active_polls: list = None) -> list[chat_pb2.ToolDefinition]:
    """Build the tool definitions for LLM interaction."""
    llm_names = [llm.display_name for llm in room.llms]

    tools = [
        chat_pb2.ToolDefinition(
            name="opt_out",
            description=(
                "RARELY use this tool to decline responding. Only use when: "
                "(1) you were explicitly mentioned but the question was clearly directed at someone else, "
                "(2) your character would genuinely stay silent based on personality."
            ),
            parameters_json=json.dumps({
                "type": "object",
                "properties": {"reason": {"type": "string", "description": "Brief reason for opting out"}},
                "required": [],
            }),
        ),
        chat_pb2.ToolDefinition(
            name="mention",
            description=(
                f"Use this tool to tag another participant. Available: {', '.join(llm_names)}. "
                "Use when you want to ask someone a question or invite them into the conversation."
            ),
            parameters_json=json.dumps({
                "type": "object",
                "properties": {
                    "participant": {"type": "string", "description": "Name of the participant to mention"},
                    "context": {"type": "string", "description": "Why you're mentioning them (optional)"},
                },
                "required": ["participant"],
            }),
        ),
        chat_pb2.ToolDefinition(
            name="vote_on_poll",
            description="Cast your vote on an active poll. Just vote - no explanation needed unless you have specific context.",
            parameters_json=json.dumps({
                "type": "object",
                "properties": {
                    "poll_id": {"type": "string", "description": "ID of the poll to vote on"},
                    "option_ids": {"type": "array", "items": {"type": "string"}, "description": "ID(s) of the option(s) to vote for"},
                    "reason": {"type": "string", "description": "Optional - only if you have specific context to share"},
                },
                "required": ["poll_id", "option_ids"],
            }),
        ),
    ]

    if active_polls:
        poll_descriptions = []
        for p in active_polls:
            opts = ", ".join(f'{o.id}: "{o.text}"' for o in p.options)
            poll_descriptions.append(f'Poll "{p.question}" (id={p.poll_id}): [{opts}]')
        tools.append(
            chat_pb2.ToolDefinition(
                name="get_active_polls",
                description=f"Current polls: {'; '.join(poll_descriptions)}",
                parameters_json=json.dumps({"type": "object", "properties": {}}),
            )
        )

    return tools


# ---------------------------------------------------------------------------
# System prompt builder
# ---------------------------------------------------------------------------


async def build_system_prompt(
    llm_config: room_pb2.LLMConfig,
    room: "StoredRoom",
    online_humans: list[str],
    extra_instruction: str = "",
) -> str:
    """Build a rich system prompt with room context for the LLM."""
    my_name = llm_config.display_name
    room_name = room.name if room else "Unknown Room"
    other_llms = [llm.display_name for llm in room.llms if llm.id != llm_config.id]

    parts = []

    # Chat style modifier
    style_modifier = get_chat_style_modifier(llm_config.chat_style)
    if style_modifier:
        parts.append(style_modifier)

    # Persona
    if llm_config.persona:
        parts.append(llm_config.persona)

    # Room context
    parts.append(f'You are in a collaborative room called "{room_name}".')
    if room and room.description:
        parts.append(f"Room context: {room.description}")

    parts.append(
        "Multiple participants (humans and AI assistants) are chatting together. "
        "Messages are prefixed with the sender's name so you can tell who said what."
    )

    if online_humans:
        parts.append(f"Online humans: {', '.join(online_humans)}.")
    if other_llms:
        parts.append(f"Other AI assistants in this room: {', '.join(other_llms)}.")

    parts.append(
        "When you see a message like \"Alice: hello\", Alice is the speaker. "
        "Do NOT prefix your responses with your own name — just respond naturally "
        "as part of the conversation.\n\n"
        f"CRITICAL IDENTITY RULE: You are {my_name}. When you respond, you speak as {my_name} only. "
        "NEVER write messages pretending to be another participant (human or AI). "
        "NEVER write dialogue like 'Alice: ...' or speak as if you are Alice, Bob, or any other participant."
    )

    parts.append(
        f"**Multi-mention handling:** When a user mentions multiple participants, "
        f"focus on the portion addressed to you (@{my_name})."
    )

    parts.append(
        "You have access to tools:\n"
        "1. `opt_out`: RARELY use this - only when the message is clearly directed at someone else.\n"
        "2. `mention`: Tag another participant to invite them to respond.\n\n"
        "IMPORTANT: When mentioned, you should almost always respond. Your input is valuable."
    )

    if extra_instruction:
        parts.append(extra_instruction)

    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Mention matching
# ---------------------------------------------------------------------------


def match_llms_from_mentions(
    content: str,
    client_mentions: list[str],
    room: "StoredRoom",
) -> list[room_pb2.LLMConfig]:
    """Parse @mentions and return matched LLM configs."""
    normalized_mentions = {
        normalize_mention(m) for m in (set(client_mentions) | set(_MENTION_RE.findall(content)))
    }
    normalized_mentions.discard("")

    # Check for @all / @everyone
    has_mention_all = bool(_MENTION_ALL_RE.search(content)) or any(
        m in {"all", "everyone"} for m in normalized_mentions
    )
    if has_mention_all:
        return list(room.llms)

    llm_lookup = {
        llm.id.lower(): llm for llm in room.llms
    } | {
        llm.display_name.lower(): llm for llm in room.llms
    } | {
        llm.display_name.lower().replace(" ", "_"): llm for llm in room.llms
    }

    matched_llms = []
    for mention in normalized_mentions:
        llm = llm_lookup.get(mention.lower())
        if llm and llm not in matched_llms:
            matched_llms.append(llm)

    return matched_llms


def match_llm_from_name(
    name: str,
    room: "StoredRoom",
    exclude_llm_id: Optional[str] = None,
) -> Optional[room_pb2.LLMConfig]:
    """Match an LLM by display name (case-insensitive)."""
    llm_lookup = {
        llm.display_name.lower(): llm for llm in room.llms
    } | {
        llm.display_name.lower().replace(" ", "_"): llm for llm in room.llms
    }

    normalized = name.lower().strip()
    llm = llm_lookup.get(normalized)
    if llm and (exclude_llm_id is None or llm.id != exclude_llm_id):
        return llm
    return None


# ---------------------------------------------------------------------------
# LLM response context
# ---------------------------------------------------------------------------


@dataclass
class LLMCallContext:
    """Shared context for LLM calls."""
    room_id: str
    llm_config: room_pb2.LLMConfig
    trigger_msg_id: str
    room: "StoredRoom"
    online_humans: list[str]
    recent_messages: list["StoredMessage"]
    tools: list[chat_pb2.ToolDefinition]
    system_prompt: str


# ---------------------------------------------------------------------------
# LLMDispatcher class
# ---------------------------------------------------------------------------


class LLMDispatcher:
    """Handles LLM calls and streaming responses."""

    def __init__(
        self,
        chat_service_address: str,
        store: "MemoryStore",
        registry: "HandlerRegistry",
    ) -> None:
        self._chat_address = chat_service_address
        self._store = store
        self._registry = registry
        self._pending_tasks: set[asyncio.Task] = set()
        # Track active tasks by llm_id for interrupt support
        self._active_llm_tasks: dict[str, asyncio.Task] = {}

    # -----------------------------------------------------------------------
    # Public dispatch methods
    # -----------------------------------------------------------------------

    async def dispatch_mentions(
        self,
        room_id: str,
        content: str,
        client_mentions: list[str],
        trigger_msg_id: str,
        room: "StoredRoom",
    ) -> None:
        """Parse @mentions and fire off LLM requests for matched LLMs."""
        matched_llms = match_llms_from_mentions(content, client_mentions, room)
        for llm_config in matched_llms:
            logger.info(
                "LLM mention dispatch: room=%s, target=%s (%s), trigger_msg=%s, mention_type=text",
                room_id,
                llm_config.id,
                llm_config.display_name,
                trigger_msg_id,
            )
            task = asyncio.create_task(self.call_llm(room_id, llm_config, trigger_msg_id))
            self._track_task(task, llm_config.id)

    async def dispatch_llm_mentions(
        self,
        room_id: str,
        room: "StoredRoom",
        mentions: list[str],
        trigger_msg_id: str,
        source_llm_id: str,
    ) -> None:
        """Dispatch mentions from one LLM to trigger other LLMs."""
        for mention in mentions:
            llm = match_llm_from_name(mention, room, exclude_llm_id=source_llm_id)
            if llm:
                logger.info(
                    "LLM mention dispatch: room=%s, source=%s, target=%s (%s), trigger_msg=%s, mention_type=tool",
                    room_id,
                    source_llm_id,
                    llm.id,
                    llm.display_name,
                    trigger_msg_id,
                )
                task = asyncio.create_task(self.call_llm(room_id, llm, trigger_msg_id))
                self._track_task(task, llm.id)

    async def dispatch_poll_voting(
        self,
        room_id: str,
        poll_id: str,
        question: str,
        options: list[dict],
        mandatory: bool,
        trigger_msg_id: str,
    ) -> None:
        """Trigger all LLMs to vote on a poll."""
        room = await self._store.get_room(room_id)
        if not room or not room.llms:
            return

        for llm_config in room.llms:
            task = asyncio.create_task(
                self.call_llm_for_poll(room_id, llm_config, poll_id, question, options, mandatory, trigger_msg_id)
            )
            self._track_task(task, llm_config.id)

    # -----------------------------------------------------------------------
    # Private: Context building
    # -----------------------------------------------------------------------

    async def _build_context(
        self,
        room_id: str,
        llm_config: room_pb2.LLMConfig,
        trigger_msg_id: str,
        extra_system_instruction: str = "",
        custom_tools: list[chat_pb2.ToolDefinition] | None = None,
    ) -> Optional[LLMCallContext]:
        """Build common context for an LLM call."""
        room = await self._store.get_room(room_id)
        if not room:
            return None

        # Get online humans
        online_ids = self._registry.get_online_user_ids(room_id)
        all_participants = await self._store.get_participants(room_id)
        online_humans = [p.display_name for p in all_participants if p.user_id in online_ids]

        # Load message history
        recent_msgs, _ = await self._store.load_history(room_id, limit=50)

        # Build system prompt
        system_prompt = await build_system_prompt(llm_config, room, online_humans, extra_system_instruction)

        # Build tools
        if custom_tools is not None:
            tools = custom_tools
        else:
            active_polls = await self._store.list_room_polls(room_id, active_only=True)
            tools = build_room_tools(room, active_polls=[self._store.poll_to_proto(p) for p in active_polls])

        return LLMCallContext(
            room_id=room_id,
            llm_config=llm_config,
            trigger_msg_id=trigger_msg_id,
            room=room,
            online_humans=online_humans,
            recent_messages=recent_msgs,
            tools=tools,
            system_prompt=system_prompt,
        )

    def _format_message_history(
        self,
        ctx: LLMCallContext,
    ) -> list[content_pb2.Message]:
        """Format message history for the Chat service."""
        llm_id = ctx.llm_config.id
        messages = [
            content_pb2.Message(
                role=content_pb2.SYSTEM,
                contents=[content_pb2.Content(text=ctx.system_prompt)],
            )
        ]

        for msg in ctx.recent_messages:
            if msg.sender_type == room_pb2.LLM and msg.sender_id == llm_id:
                role = content_pb2.ASSISTANT
                text = msg.content
            else:
                role = content_pb2.USER
                text = f"{msg.sender_name}: {msg.content}"
            messages.append(
                content_pb2.Message(
                    role=role,
                    contents=[content_pb2.Content(text=text)],
                )
            )

        return messages

    # -----------------------------------------------------------------------
    # Private: Broadcasting helpers
    # -----------------------------------------------------------------------

    async def _broadcast_thinking(self, room_id: str, llm_id: str, trigger_msg_id: str) -> None:
        """Broadcast LLM thinking event."""
        await self._registry.broadcast(
            room_id,
            room_pb2.ServerEvent(
                llm_thinking=room_pb2.LLMThinking(llm_id=llm_id, reply_to=trigger_msg_id)
            ),
        )

    async def _broadcast_chunk(
        self, room_id: str, msg_id: str, llm_id: str, content: str, reply_to: str
    ) -> None:
        """Broadcast LLM chunk event."""
        await self._registry.broadcast(
            room_id,
            room_pb2.ServerEvent(
                llm_chunk=room_pb2.LLMChunk(
                    message_id=msg_id, llm_id=llm_id, content=content, reply_to=reply_to
                )
            ),
        )

    async def _broadcast_done(self, room_id: str, msg_id: str, llm_id: str) -> None:
        """Broadcast LLM done event."""
        await self._registry.broadcast(
            room_id,
            room_pb2.ServerEvent(llm_done=room_pb2.LLMDone(message_id=msg_id, llm_id=llm_id)),
        )

    async def _broadcast_error(self, room_id: str, llm_name: str, error: str) -> None:
        """Broadcast error event."""
        await self._registry.broadcast(
            room_id,
            room_pb2.ServerEvent(
                error=room_pb2.Error(code="LLM_ERROR", message=f"Error from {llm_name}: {error}")
            ),
        )

    # -----------------------------------------------------------------------
    # Private: Tool call handling
    # -----------------------------------------------------------------------

    async def _handle_vote_tool_call(
        self,
        room_id: str,
        llm_config: room_pb2.LLMConfig,
        arguments: str,
    ) -> bool:
        """Handle vote_on_poll tool call. Returns True if vote was cast."""
        try:
            args = json.loads(arguments) if arguments else {}
        except json.JSONDecodeError:
            logger.warning("Invalid vote args from %s: %s", llm_config.id, arguments)
            return False

        poll_id = args.get("poll_id", "")
        option_ids = args.get("option_ids", [])
        reason = args.get("reason", "")

        if not poll_id or not option_ids:
            logger.warning("Invalid vote from %s: poll_id=%r, option_ids=%r", llm_config.id, poll_id, option_ids)
            return False

        voted = False
        for option_id in option_ids:
            result = await self._store.add_vote(
                poll_id=poll_id,
                option_id=option_id,
                voter_id=llm_config.id,
                voter_name=llm_config.display_name,
                reason=reason,
            )
            if result:
                poll, option, stored_vote = result
                await self._registry.broadcast(
                    room_id,
                    room_pb2.ServerEvent(
                        poll_voted=room_pb2.PollVoted(
                            poll_id=poll.poll_id,
                            option_id=option.id,
                            vote=self._store.poll_vote_to_proto(stored_vote),
                        )
                    ),
                )
                voted = True
                logger.info("LLM %s voted on poll %s option %s", llm_config.id, poll_id, option_id)

        return voted

    def _extract_mention_from_tool_call(self, arguments: str) -> Optional[str]:
        """Extract participant name from mention tool call."""
        try:
            args = json.loads(arguments) if arguments else {}
            return args.get("participant", "")
        except json.JSONDecodeError:
            return None

    # -----------------------------------------------------------------------
    # Main LLM call methods
    # -----------------------------------------------------------------------

    async def call_llm(
        self,
        room_id: str,
        llm_config: room_pb2.LLMConfig,
        trigger_msg_id: str,
    ) -> None:
        """Call the Chat Service for an LLM response and stream chunks back."""
        llm_id = llm_config.id
        ctx = await self._build_context(room_id, llm_config, trigger_msg_id)
        if not ctx:
            return

        await self._broadcast_thinking(room_id, llm_id, trigger_msg_id)

        chat_messages = self._format_message_history(ctx)
        response_msg_id = uuid.uuid4().hex[:16]
        full_content: list[str] = []
        opted_out = False
        pending_mentions: list[str] = []

        try:
            channel = grpc.aio.insecure_channel(self._chat_address)
            stub = chat_pb2_grpc.ChatStub(channel)

            request = chat_pb2.ChatRequest(
                messages=chat_messages,
                models=[llm_config.model],
                tools=ctx.tools,
                max_tokens=1500,  # Cost control: limit response length
            )

            async for response in stub.Chat(request):
                # Log non-content responses
                if response.delta.tool_calls or response.delta.opted_out or not response.delta.content:
                    logger.info(
                        "LLM %s response: content=%r, tool_calls=%s, opted_out=%s",
                        llm_id,
                        response.delta.content[:50] if response.delta.content else None,
                        [tc.name for tc in response.delta.tool_calls],
                        response.delta.opted_out,
                    )

                # Check for opt-out
                if response.delta.opted_out:
                    opted_out = True
                    logger.info("LLM %s opted out of responding", llm_id)
                    break

                # Process tool calls
                for tc in response.delta.tool_calls:
                    if tc.name == "opt_out":
                        opted_out = True
                        logger.info("LLM %s opted out via tool call", llm_id)
                        break
                    elif tc.name == "mention":
                        participant = self._extract_mention_from_tool_call(tc.arguments)
                        if participant:
                            pending_mentions.append(participant)
                            logger.info("LLM %s mentioned %s", llm_id, participant)
                    elif tc.name == "vote_on_poll":
                        await self._handle_vote_tool_call(room_id, llm_config, tc.arguments)

                if opted_out:
                    break

                # Stream content chunks
                chunk = response.delta.content
                if chunk:
                    full_content.append(chunk)
                    await self._broadcast_chunk(room_id, response_msg_id, llm_id, chunk, trigger_msg_id)

            await channel.close()
        except asyncio.CancelledError:
            logger.info("LLM call cancelled for %s", llm_id)
            raise
        except grpc.RpcError as e:
            logger.error("Chat service error for %s: %s", llm_id, e)
            await self._broadcast_error(room_id, llm_config.display_name, str(e.details() if hasattr(e, 'details') else e))
            return

        if opted_out:
            await self._broadcast_done(room_id, response_msg_id, llm_id)
            return

        # Store and finalize
        final_content = strip_self_name_prefix("".join(full_content), llm_config.display_name)
        logger.info("LLM %s finished: content_len=%d, pending_mentions=%s", llm_id, len(final_content), pending_mentions)

        if final_content.strip():
            stored_msg = await self._store.add_message(
                room_id=room_id,
                sender_id=llm_id,
                sender_name=llm_config.display_name,
                sender_type=room_pb2.LLM,
                content=final_content,
                reply_to=trigger_msg_id,
                message_id=response_msg_id,  # Use same ID as streaming to avoid duplicates
            )

            await self._broadcast_done(room_id, response_msg_id, llm_id)

            # Parse text @mentions as fallback
            text_mentions = _MENTION_RE.findall(final_content)
            for mention in text_mentions:
                normalized = normalize_mention(mention)
                if normalized and normalized not in [m.lower() for m in pending_mentions]:
                    pending_mentions.append(normalized)
                    logger.info("LLM %s text-mentioned %s", llm_id, normalized)

            # Dispatch mentions
            if pending_mentions:
                await self.dispatch_llm_mentions(
                    room_id=room_id,
                    room=ctx.room,
                    mentions=pending_mentions,
                    trigger_msg_id=stored_msg.message_id,
                    source_llm_id=llm_id,
                )
        else:
            await self._broadcast_done(room_id, response_msg_id, llm_id)

    async def call_llm_for_poll(
        self,
        room_id: str,
        llm_config: room_pb2.LLMConfig,
        poll_id: str,
        question: str,
        options: list[dict],
        mandatory: bool,
        trigger_msg_id: str,
    ) -> None:
        """Call an LLM specifically to vote on a poll."""
        llm_id = llm_config.id

        # Build poll-specific instruction
        mandatory_text = "This is a MANDATORY poll - you MUST cast a vote." if mandatory else "Vote or use opt_out if none of the options fit."
        options_text = ", ".join(f"{o['id']}: {o['text']}" for o in options)
        poll_instruction = (
            f"\n\n**POLL VOTING REQUEST**\n"
            f"Question: \"{question}\"\n"
            f"Options: {options_text}\n"
            f"Poll ID: {poll_id}\n\n"
            f"{mandatory_text}\n"
            f"Just call vote_on_poll with your choice - no explanation needed."
        )

        # Build poll-specific tools
        poll_tools = build_poll_tools(poll_id, question, options, mandatory)

        ctx = await self._build_context(
            room_id, llm_config, trigger_msg_id,
            extra_system_instruction=poll_instruction,
            custom_tools=poll_tools,
        )
        if not ctx:
            return

        await self._broadcast_thinking(room_id, llm_id, trigger_msg_id)

        chat_messages = self._format_message_history(ctx)
        response_msg_id = uuid.uuid4().hex[:16]
        full_content: list[str] = []
        voted = False

        try:
            channel = grpc.aio.insecure_channel(self._chat_address)
            stub = chat_pb2_grpc.ChatStub(channel)

            request = chat_pb2.ChatRequest(
                messages=chat_messages,
                models=[llm_config.model],
                tools=ctx.tools,
                max_tokens=500,  # Cost control: polls need less output
            )

            async for response in stub.Chat(request):
                if response.delta.tool_calls:
                    logger.info("LLM %s poll tool calls: %s", llm_id, [tc.name for tc in response.delta.tool_calls])

                for tc in response.delta.tool_calls:
                    if tc.name == "vote_on_poll":
                        if await self._handle_vote_tool_call(room_id, llm_config, tc.arguments):
                            voted = True
                    elif tc.name == "opt_out" and not mandatory:
                        logger.info("LLM %s opted out of poll voting", llm_id)

                chunk = response.delta.content
                if chunk:
                    full_content.append(chunk)
                    await self._broadcast_chunk(room_id, response_msg_id, llm_id, chunk, trigger_msg_id)

            await channel.close()
        except asyncio.CancelledError:
            raise
        except grpc.RpcError as e:
            logger.error("Chat service error for %s: %s", llm_id, e)
            return

        final_content = strip_self_name_prefix("".join(full_content), llm_config.display_name)

        if final_content.strip():
            await self._store.add_message(
                room_id=room_id,
                sender_id=llm_id,
                sender_name=llm_config.display_name,
                sender_type=room_pb2.LLM,
                content=final_content,
                reply_to=trigger_msg_id,
                message_id=response_msg_id,  # Use same ID as streaming to avoid duplicates
            )

        await self._broadcast_done(room_id, response_msg_id, llm_id)

        if mandatory and not voted:
            logger.warning("LLM %s did NOT vote on mandatory poll (content: %s)", llm_id, final_content[:100] if final_content else "empty")
        else:
            logger.info("LLM %s poll response: voted=%s, content_len=%d", llm_id, voted, len(final_content))

    # -----------------------------------------------------------------------
    # Task tracking
    # -----------------------------------------------------------------------

    def _track_task(self, task: asyncio.Task, llm_id: Optional[str] = None) -> None:
        """Track a fire-and-forget task for cleanup.

        If llm_id is provided, the task is also tracked by LLM ID for interrupt support.
        """
        self._pending_tasks.add(task)
        task.add_done_callback(self._pending_tasks.discard)

        if llm_id:
            # Track by LLM ID for interrupt support
            self._active_llm_tasks[llm_id] = task

            def _remove_llm_task(t: asyncio.Task) -> None:
                # Only remove if this task is still the tracked one
                if self._active_llm_tasks.get(llm_id) is t:
                    del self._active_llm_tasks[llm_id]

            task.add_done_callback(_remove_llm_task)

    async def cancel_llm_task(self, llm_id: str, room_id: str) -> bool:
        """Cancel an active LLM task by ID.

        Returns True if a task was cancelled, False if no task was active.
        """
        task = self._active_llm_tasks.get(llm_id)
        if not task or task.done():
            logger.info("No active task to cancel for LLM %s", llm_id)
            return False

        logger.info("Cancelling task for LLM %s", llm_id)
        task.cancel()

        try:
            await task
        except asyncio.CancelledError:
            pass

        # Broadcast that the LLM was interrupted
        await self._registry.broadcast(
            room_id,
            room_pb2.ServerEvent(
                llm_done=room_pb2.LLMDone(llm_id=llm_id)
            ),
        )

        return True

    async def cancel_pending_tasks(self) -> None:
        """Cancel all pending LLM tasks (e.g., on cleanup)."""
        for task in list(self._pending_tasks):
            task.cancel()
        if self._pending_tasks:
            await asyncio.gather(*self._pending_tasks, return_exceptions=True)
        self._pending_tasks.clear()
