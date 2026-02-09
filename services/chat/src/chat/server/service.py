from __future__ import annotations

import json
import time
import uuid
from typing import AsyncIterator, List

from pb.api.chat import chat_pb2, chat_pb2_grpc
from pb.shared import content_pb2

from chat.providers.openrouter import OpenRouterChatProvider, ProviderDelta


def _role_enum_to_str(role: content_pb2.MessageRole.ValueType) -> str:
    if role == content_pb2.MessageRole.USER:
        return "user"
    if role == content_pb2.MessageRole.SYSTEM:
        return "system"
    if role == content_pb2.MessageRole.TOOL:
        return "tool"
    # Default ASSISTANT for unspecified / assistant.
    return "assistant"


def _role_str_to_enum(role: str | None) -> content_pb2.MessageRole.ValueType:
    if not role:
        return content_pb2.MessageRole.ASSISTANT
    value = role.lower()
    if value == "user":
        return content_pb2.MessageRole.USER
    if value == "system":
        return content_pb2.MessageRole.SYSTEM
    if value == "tool":
        return content_pb2.MessageRole.TOOL
    return content_pb2.MessageRole.ASSISTANT


def _to_openrouter_messages(
    messages: List[content_pb2.Message],
) -> list[dict]:
    """
    Convert protobuf `shared.Message` messages into dictionaries compatible with
    the OpenRouter Python client.
    """
    result: list[dict] = []
    for msg in messages:
        role = _role_enum_to_str(msg.role)
        # Concatenate all text contents for now; the proto is designed to be
        # extended with richer content types later.
        text_parts: list[str] = []
        for content in msg.contents:
            # Currently only text is modeled.
            if content.HasField("text"):
                text_parts.append(content.text)
        if not text_parts:
            continue
        result.append({"role": role, "content": "".join(text_parts)})
    return result


def _to_openrouter_tools(
    tools: List[chat_pb2.ToolDefinition],
) -> list[dict]:
    """
    Convert protobuf ToolDefinition to OpenAI-compatible tool format.
    """
    import json
    result: list[dict] = []
    for tool in tools:
        try:
            params = json.loads(tool.parameters_json) if tool.parameters_json else {}
        except json.JSONDecodeError:
            params = {}
        result.append({
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": params,
            }
        })
    return result


class ChatService(chat_pb2_grpc.ChatServicer):
    """
    gRPC Chat service implementation backed by the OpenRouter provider.
    """

    def __init__(self, provider: OpenRouterChatProvider) -> None:
        self._provider = provider

    async def Chat(
        self,
        request: chat_pb2.ChatRequest,
        context,  # grpc.aio.ServicerContext, but keep generic for type stubs
    ) -> AsyncIterator[chat_pb2.ChatResponse]:
        # Stable ID for this request across all streamed chunks.
        request_id = str(uuid.uuid4())

        messages = _to_openrouter_messages(list(request.messages))
        models: List[str] = list(request.models)
        tools = _to_openrouter_tools(list(request.tools)) if request.tools else None

        max_tokens: int | None
        if request.HasField("max_tokens"):
            max_tokens = int(request.max_tokens)
        else:
            max_tokens = None

        response_format: dict | None = None
        if request.HasField("response_format"):
            rf = request.response_format
            response_format = {"type": rf.type}
            if rf.HasField("json_schema"):
                response_format["json_schema"] = json.loads(rf.json_schema)

        async for delta in self._provider.stream_chat(
            messages=messages,
            models=models,
            max_tokens=max_tokens,
            tools=tools,
            response_format=response_format,
        ):
            yield _to_chat_response(request_id=request_id, delta=delta)


def _to_chat_response(
    *,
    request_id: str,
    delta: ProviderDelta,
) -> chat_pb2.ChatResponse:
    """
    Map a `ProviderDelta` into the protobuf `ChatResponse` type.
    """
    ts_ms = int(time.time() * 1000)
    role_enum = _role_str_to_enum(delta.role)

    # Convert tool calls if present
    proto_tool_calls = []
    if delta.tool_calls:
        for tc in delta.tool_calls:
            proto_tool_calls.append(
                content_pb2.ToolCall(
                    id=tc.id,
                    name=tc.name,
                    arguments=tc.arguments,
                )
            )

    return chat_pb2.ChatResponse(
        id=request_id,
        timestamp=ts_ms,
        model=delta.model,
        delta=content_pb2.Delta(
            role=role_enum,
            content=delta.content,
            tool_calls=proto_tool_calls,
            opted_out=delta.opted_out,
        ),
    )


