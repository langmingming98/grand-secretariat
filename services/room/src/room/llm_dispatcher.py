"""LLM dispatch logic for @mentions and LLM responses.

Extracted from session.py for better separation of concerns.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from typing import TYPE_CHECKING, Callable, Awaitable, Optional

import grpc

from pb.api.chat import chat_pb2, chat_pb2_grpc
from pb.api.room import room_pb2
from pb.shared import content_pb2

if TYPE_CHECKING:
    from room.registry import HandlerRegistry
    from room.store import MemoryStore, StoredRoom

logger = logging.getLogger(__name__)

# Support Unicode (Chinese, etc.) in mentions
_MENTION_RE = re.compile(r"@([\w\u4e00-\u9fff-]+)")
_MENTION_ALL_RE = re.compile(r"(?<![\w\u4e00-\u9fff])@(all|everyone)(?![\w\u4e00-\u9fff])", re.IGNORECASE)


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
    # Some models repeat their own name prefix more than once.
    for _ in range(3):
        updated = prefix_re.sub("", cleaned, count=1)
        if updated == cleaned:
            break
        cleaned = updated
    return cleaned.lstrip()


def build_poll_tools(poll_id: str, question: str, options: list, mandatory: bool) -> list[chat_pb2.ToolDefinition]:
    """Build tools specifically for poll voting."""
    options_desc = ", ".join(f"{o['id']}: \"{o['text']}\"" for o in options)

    tools = []

    # Only include opt_out if poll is NOT mandatory
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
                    "properties": {
                        "reason": {"type": "string", "description": "Why you're not voting"}
                    },
                    "required": ["reason"],
                }),
            )
        )

    # Vote tool - primary action
    tools.append(
        chat_pb2.ToolDefinition(
            name="vote_on_poll",
            description=(
                f"{'REQUIRED - YOU MUST USE THIS TOOL: ' if mandatory else ''}Cast your vote on the poll. "
                f"Question: \"{question}\". "
                f"Available options: [{options_desc}]. "
                f"Use poll_id=\"{poll_id}\" and set option_ids to the ID(s) you choose."
            ),
            parameters_json=json.dumps({
                "type": "object",
                "properties": {
                    "poll_id": {
                        "type": "string",
                        "description": f"The poll ID - must be exactly: {poll_id}",
                    },
                    "option_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Array of option ID(s) to vote for",
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief explanation for your vote",
                    },
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
        # Tool 1: Opt out of responding
        chat_pb2.ToolDefinition(
            name="opt_out",
            description=(
                "RARELY use this tool to decline responding. Only use when: "
                "(1) you were explicitly mentioned but the question was clearly directed at someone else, "
                "(2) your character would genuinely stay silent based on personality (not just uncertainty). "
                "When in doubt, RESPOND rather than opting out. Your input is valuable."
            ),
            parameters_json=json.dumps({
                "type": "object",
                "properties": {
                    "reason": {
                        "type": "string",
                        "description": "Brief reason for opting out (for logging)",
                    }
                },
                "required": [],
            }),
        ),
        # Tool 2: Mention/tag other participants
        chat_pb2.ToolDefinition(
            name="mention",
            description=(
                f"Use this tool to tag another participant and request their response. "
                f"Available participants: {', '.join(llm_names)}. "
                "Use this when you want to ask someone a question, delegate a task, "
                "or invite them into the conversation."
            ),
            parameters_json=json.dumps({
                "type": "object",
                "properties": {
                    "participant": {
                        "type": "string",
                        "description": "Name of the participant to mention",
                    },
                    "context": {
                        "type": "string",
                        "description": "Why you're mentioning them (optional)",
                    }
                },
                "required": ["participant"],
            }),
        ),
        # Tool 3: Vote on a poll
        chat_pb2.ToolDefinition(
            name="vote_on_poll",
            description=(
                "Cast your vote on an active poll. You can provide reasoning for your choice."
            ),
            parameters_json=json.dumps({
                "type": "object",
                "properties": {
                    "poll_id": {
                        "type": "string",
                        "description": "ID of the poll to vote on",
                    },
                    "option_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "ID(s) of the option(s) to vote for",
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief explanation for your vote (optional)",
                    },
                },
                "required": ["poll_id", "option_ids"],
            }),
        ),
    ]

    # Add poll context if there are active polls
    if active_polls:
        poll_descriptions = []
        for p in active_polls:
            opts = ", ".join(f'{o.id}: "{o.text}"' for o in p.options)
            poll_descriptions.append(f'Poll "{p.question}" (id={p.poll_id}): [{opts}]')
        tools.append(
            chat_pb2.ToolDefinition(
                name="get_active_polls",
                description=(
                    f"Get information about active polls in this room. "
                    f"Current polls: {'; '.join(poll_descriptions)}"
                ),
                parameters_json=json.dumps({"type": "object", "properties": {}}),
            )
        )

    return tools


async def build_system_prompt(
    llm_config: room_pb2.LLMConfig,
    room: "StoredRoom",
    online_humans: list[str],
) -> str:
    """Build a rich system prompt with room context for the LLM."""
    room_name = room.name if room else "Unknown Room"

    # Other LLMs in the room
    other_llms = [
        llm.display_name for llm in room.llms
        if llm.id != llm_config.id
    ]

    parts = []

    # Persona
    if llm_config.persona:
        parts.append(llm_config.persona)

    # Room context
    parts.append(f'You are in a collaborative room called "{room_name}".')

    # Room-wide description/context
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
        "as part of the conversation."
    )

    # Explain multi-LLM mentions
    my_name = llm_config.display_name
    parts.append(
        f"**Multi-mention handling:** When a user mentions multiple participants in one message, "
        f"they may assign different tasks to each. For example:\n"
        f"  \"@Trevor please review the architecture. @{my_name} please implement the feature.\"\n"
        f"In this case, YOU ({my_name}) should respond to the portion addressed to you. "
        f"Look for your name (@{my_name} or similar) and focus on what follows until the next @mention."
    )

    # Explain available tools
    parts.append(
        "You have access to two tools:\n"
        "1. `opt_out`: RARELY use this - only when the message is clearly directed at someone else, not you.\n"
        "2. `mention`: Use this to tag another participant and invite them to respond.\n\n"
        "IMPORTANT: When you are mentioned, you should almost always respond. "
        "Prefer responding over opting out. Your input is valuable to the conversation."
    )

    return "\n\n".join(parts)


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

    # Check for @all / @everyone → dispatch to ALL room LLMs.
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


class LLMDispatcher:
    """Handles LLM calls and streaming responses.

    Extracted from StreamHandler to reduce file size and improve testability.
    """

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
            task = asyncio.create_task(
                self.call_llm(room_id, llm_config, trigger_msg_id)
            )
            self._track_task(task)

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
                logger.info("LLM mention: %s -> %s", source_llm_id, llm.id)
                task = asyncio.create_task(
                    self.call_llm(room_id, llm, trigger_msg_id)
                )
                self._track_task(task)

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
                self.call_llm_for_poll(
                    room_id=room_id,
                    llm_config=llm_config,
                    poll_id=poll_id,
                    question=question,
                    options=options,
                    mandatory=mandatory,
                    trigger_msg_id=trigger_msg_id,
                )
            )
            self._track_task(task)

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
        room = await self._store.get_room(room_id)
        if not room:
            return

        # Notify: LLM is thinking
        await self._registry.broadcast(
            room_id,
            room_pb2.ServerEvent(
                llm_thinking=room_pb2.LLMThinking(
                    llm_id=llm_id,
                    reply_to=trigger_msg_id,
                )
            ),
        )

        # Build context
        recent_msgs, _ = await self._store.load_history(room_id, limit=50)
        chat_messages = []

        # Get online humans
        online_ids = self._registry.get_online_user_ids(room_id)
        all_participants = await self._store.get_participants(room_id)
        online_humans = [p.display_name for p in all_participants if p.user_id in online_ids]

        # Build system prompt with poll-specific instructions
        base_prompt = await build_system_prompt(llm_config, room, online_humans)
        mandatory_text = "This is a MANDATORY poll - you MUST cast a vote using the vote_on_poll tool." if mandatory else "Please vote or explain why none of the options fit."
        options_text = ", ".join(f"{o['id']}: {o['text']}" for o in options)
        poll_instruction = (
            f"\n\n**POLL VOTING REQUEST**\n"
            f"A poll has been created: \"{question}\"\n"
            f"{mandatory_text}\n"
            f"Poll ID: {poll_id}\n"
            f"Options: {options_text}\n"
            f"Use the vote_on_poll tool to cast your vote."
        )

        chat_messages.append(
            content_pb2.Message(
                role=content_pb2.SYSTEM,
                contents=[content_pb2.Content(text=base_prompt + poll_instruction)],
            )
        )

        # Conversation history
        for msg in recent_msgs:
            if msg.sender_type == room_pb2.LLM and msg.sender_id == llm_id:
                role = content_pb2.ASSISTANT
                text = msg.content
            else:
                role = content_pb2.USER
                text = f"{msg.sender_name}: {msg.content}"
            chat_messages.append(
                content_pb2.Message(
                    role=role,
                    contents=[content_pb2.Content(text=text)],
                )
            )

        # Build poll-specific tools
        tools = build_poll_tools(poll_id, question, options, mandatory)

        response_msg_id = uuid.uuid4().hex[:16]
        full_content: list[str] = []
        voted = False

        try:
            channel = grpc.aio.insecure_channel(self._chat_address)
            stub = chat_pb2_grpc.ChatStub(channel)

            request = chat_pb2.ChatRequest(
                messages=chat_messages,
                models=[llm_config.model],
                tools=tools,
            )

            async for response in stub.Chat(request):
                # Check for tool calls
                if response.delta.tool_calls:
                    logger.info("LLM %s poll tool calls: %s", llm_id, [tc.name for tc in response.delta.tool_calls])
                for tc in response.delta.tool_calls:
                    if tc.name == "vote_on_poll":
                        try:
                            args = json.loads(tc.arguments) if tc.arguments else {}
                            logger.info("LLM %s vote args: %s", llm_id, args)
                            await self._handle_llm_vote(room_id, llm_config, args)
                            voted = True
                        except json.JSONDecodeError:
                            logger.warning("Invalid vote args from %s: %s", llm_id, tc.arguments)
                    elif tc.name == "opt_out" and not mandatory:
                        logger.info("LLM %s opted out of poll voting", llm_id)

                # Stream content chunks
                chunk = response.delta.content
                if chunk:
                    full_content.append(chunk)
                    await self._registry.broadcast(
                        room_id,
                        room_pb2.ServerEvent(
                            llm_chunk=room_pb2.LLMChunk(
                                message_id=response_msg_id,
                                llm_id=llm_id,
                                content=chunk,
                                reply_to=trigger_msg_id,
                            )
                        ),
                    )

            await channel.close()
        except asyncio.CancelledError:
            raise
        except grpc.RpcError as e:
            logger.error("Chat service error for %s: %s", llm_id, e)
            return

        # Store the response
        final_content = strip_self_name_prefix("".join(full_content), llm_config.display_name)

        if final_content.strip():
            await self._store.add_message(
                room_id=room_id,
                sender_id=llm_id,
                sender_name=llm_config.display_name,
                sender_type=room_pb2.LLM,
                content=final_content,
                reply_to=trigger_msg_id,
            )

        await self._registry.broadcast(
            room_id,
            room_pb2.ServerEvent(
                llm_done=room_pb2.LLMDone(
                    message_id=response_msg_id,
                    llm_id=llm_id,
                )
            ),
        )

        if mandatory and not voted:
            logger.warning("LLM %s did NOT vote on mandatory poll (content: %s)", llm_id, final_content[:100] if final_content else "empty")
        else:
            logger.info("LLM %s poll response: voted=%s, content_len=%d", llm_id, voted, len(final_content))

    def _track_task(self, task: asyncio.Task) -> None:
        """Track a fire-and-forget task for cleanup."""
        self._pending_tasks.add(task)
        task.add_done_callback(self._pending_tasks.discard)

    async def cancel_pending_tasks(self) -> None:
        """Cancel all pending LLM tasks (e.g., on cleanup)."""
        for task in list(self._pending_tasks):
            task.cancel()
        if self._pending_tasks:
            await asyncio.gather(*self._pending_tasks, return_exceptions=True)
        self._pending_tasks.clear()

    async def _handle_llm_vote(
        self,
        room_id: str,
        llm_config: room_pb2.LLMConfig,
        args: dict,
    ) -> None:
        """Handle LLM voting on a poll via tool call."""
        poll_id = args.get("poll_id", "")
        option_ids = args.get("option_ids", [])
        reason = args.get("reason", "")

        if not poll_id or not option_ids:
            logger.warning("Invalid vote from %s: poll_id=%r, option_ids=%r", llm_config.id, poll_id, option_ids)
            return

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
                logger.info(
                    "LLM %s voted on poll %s option %s",
                    llm_config.id,
                    poll_id,
                    option_id,
                )

    async def call_llm(
        self,
        room_id: str,
        llm_config: room_pb2.LLMConfig,
        trigger_msg_id: str,
    ) -> None:
        """Call the Chat Service for an LLM response and stream chunks back."""
        llm_id = llm_config.id
        room = await self._store.get_room(room_id)
        if not room:
            return

        # Notify: LLM is thinking
        await self._registry.broadcast(
            room_id,
            room_pb2.ServerEvent(
                llm_thinking=room_pb2.LLMThinking(
                    llm_id=llm_id,
                    reply_to=trigger_msg_id,
                )
            ),
        )

        # Build context: recent messages for the LLM
        recent_msgs, _ = await self._store.load_history(room_id, limit=50)
        chat_messages = []

        # Get online humans for the system prompt
        online_ids = self._registry.get_online_user_ids(room_id)
        all_participants = await self._store.get_participants(room_id)
        online_humans = [
            p.display_name for p in all_participants
            if p.user_id in online_ids
        ]

        # Rich system prompt with room context
        system_prompt = await build_system_prompt(llm_config, room, online_humans)
        chat_messages.append(
            content_pb2.Message(
                role=content_pb2.SYSTEM,
                contents=[content_pb2.Content(text=system_prompt)],
            )
        )

        # Conversation history
        for msg in recent_msgs:
            if msg.sender_type == room_pb2.LLM and msg.sender_id == llm_id:
                role = content_pb2.ASSISTANT
                text = msg.content  # own messages: no name prefix
            else:
                role = content_pb2.USER
                text = f"{msg.sender_name}: {msg.content}"
            chat_messages.append(
                content_pb2.Message(
                    role=role,
                    contents=[content_pb2.Content(text=text)],
                )
            )

        # Load active polls for tool context
        active_polls = await self._store.list_room_polls(room_id, active_only=True)

        # Build tools for opt-out, mentions, and polls
        tools = build_room_tools(room, active_polls=[self._store.poll_to_proto(p) for p in active_polls])

        # Generate a message_id for the LLM response
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
                tools=tools,
            )

            async for response in stub.Chat(request):
                # Debug: log what we're receiving
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

                # Check for tool calls (mentions, polls)
                for tc in response.delta.tool_calls:
                    if tc.name == "opt_out":
                        opted_out = True
                        logger.info("LLM %s opted out via tool call", llm_id)
                        break
                    elif tc.name == "mention":
                        try:
                            args = json.loads(tc.arguments) if tc.arguments else {}
                            participant = args.get("participant", "")
                            if participant:
                                pending_mentions.append(participant)
                                logger.info("LLM %s mentioned %s", llm_id, participant)
                        except json.JSONDecodeError:
                            pass
                    elif tc.name == "vote_on_poll":
                        try:
                            args = json.loads(tc.arguments) if tc.arguments else {}
                            await self._handle_llm_vote(
                                room_id=room_id,
                                llm_config=llm_config,
                                args=args,
                            )
                        except json.JSONDecodeError:
                            logger.warning("Invalid vote_on_poll args from %s", llm_id)

                if opted_out:
                    break

                # Stream content chunks
                chunk = response.delta.content
                if chunk:
                    full_content.append(chunk)
                    await self._registry.broadcast(
                        room_id,
                        room_pb2.ServerEvent(
                            llm_chunk=room_pb2.LLMChunk(
                                message_id=response_msg_id,
                                llm_id=llm_id,
                                content=chunk,
                                reply_to=trigger_msg_id,
                            )
                        ),
                    )

            await channel.close()
        except asyncio.CancelledError:
            logger.info("LLM call cancelled for %s", llm_id)
            raise
        except grpc.RpcError as e:
            logger.error("Chat service error for %s: %s", llm_id, e)
            await self._registry.broadcast(
                room_id,
                room_pb2.ServerEvent(
                    error=room_pb2.Error(
                        code="LLM_ERROR",
                        message=f"Error from {llm_config.display_name}: {e.details() if hasattr(e, 'details') else str(e)}",
                    )
                ),
            )
            return

        # If opted out, send a cancel/done without storing
        if opted_out:
            await self._registry.broadcast(
                room_id,
                room_pb2.ServerEvent(
                    llm_done=room_pb2.LLMDone(
                        message_id=response_msg_id,
                        llm_id=llm_id,
                    )
                ),
            )
            return

        # Store the complete LLM message
        final_content = strip_self_name_prefix(
            "".join(full_content),
            llm_config.display_name,
        )

        logger.info(
            "LLM %s finished: content_len=%d, pending_mentions=%s",
            llm_id,
            len(final_content),
            pending_mentions,
        )

        # Only store if there's actual content
        if final_content.strip():
            stored_msg = await self._store.add_message(
                room_id=room_id,
                sender_id=llm_id,
                sender_name=llm_config.display_name,
                sender_type=room_pb2.LLM,
                content=final_content,
                reply_to=trigger_msg_id,
            )

            # Notify: LLM is done
            await self._registry.broadcast(
                room_id,
                room_pb2.ServerEvent(
                    llm_done=room_pb2.LLMDone(
                        message_id=response_msg_id,
                        llm_id=llm_id,
                    )
                ),
            )

            # Also parse @mentions from the content text (fallback if LLM doesn't use tool)
            text_mentions = _MENTION_RE.findall(final_content)
            for mention in text_mentions:
                normalized = normalize_mention(mention)
                if normalized and normalized not in [m.lower() for m in pending_mentions]:
                    pending_mentions.append(normalized)
                    logger.info("LLM %s text-mentioned %s", llm_id, normalized)

            # Dispatch mentions to trigger other LLMs
            if pending_mentions:
                await self.dispatch_llm_mentions(
                    room_id=room_id,
                    room=room,
                    mentions=pending_mentions,
                    trigger_msg_id=stored_msg.message_id,
                    source_llm_id=llm_id,
                )
        else:
            # No content, just send done
            await self._registry.broadcast(
                room_id,
                room_pb2.ServerEvent(
                    llm_done=room_pb2.LLMDone(
                        message_id=response_msg_id,
                        llm_id=llm_id,
                    )
                ),
            )
