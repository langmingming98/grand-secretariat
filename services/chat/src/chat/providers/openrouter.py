from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from typing import AsyncIterator, Iterable, List, Mapping, MutableMapping, Optional

from openrouter import OpenRouter

from chat.config.config import AppConfig, OpenRouterProviderConfig


logger = logging.getLogger(__name__)


@dataclass
class ToolCall:
    """A tool call from the model."""
    id: str
    name: str
    arguments: str


@dataclass
class ProviderDelta:
    """
    A single streamed chunk from the provider for a specific model.
    """

    model: str
    content: str
    role: Optional[str] = None
    tool_calls: Optional[List[ToolCall]] = None
    opted_out: bool = False


def _env_api_key() -> str:
    key = os.getenv("CHAT_OPENROUTER_API_KEY") or os.getenv("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError(
            "OpenRouter API key not set. "
            "Set CHAT_OPENROUTER_API_KEY or OPENROUTER_API_KEY in the environment."
        )
    return key


class OpenRouterChatProvider:
    """
    Async wrapper around the `openrouter` client with a streaming interface
    suitable for the gRPC Chat service.
    """

    def __init__(self, app_config: AppConfig) -> None:
        self._config: OpenRouterProviderConfig = app_config.providers.openrouter

    async def stream_chat(
        self,
        *,
        messages: Iterable[Mapping[str, object]],
        models: List[str],
        max_tokens: Optional[int] = None,
        tools: Optional[List[Mapping[str, object]]] = None,
    ) -> AsyncIterator[ProviderDelta]:
        """
        Stream chat completions from OpenRouter for one or more models.

        The `messages` parameter must be compatible with the OpenRouter Python client
        (list of dicts with `role` and `content` keys).

        The `tools` parameter is a list of tool definitions in OpenAI format.
        """
        if not self._config.enabled:
            raise RuntimeError("OpenRouter provider is disabled by configuration.")

        api_key = _env_api_key()

        # Apply defaults when request does not specify models / max_tokens.
        target_models = models or list(self._config.default_models)
        logger.info(target_models)
        effective_max_tokens = max_tokens or self._config.default_max_tokens

        queue: "asyncio.Queue[Optional[ProviderDelta]]" = asyncio.Queue()

        async def _producer() -> None:
            # Single shared client across all model streams.
            client_kwargs: MutableMapping[str, object] = {"api_key": api_key}
            if self._config.base_url:
                client_kwargs["base_url"] = self._config.base_url
            async with OpenRouter(**client_kwargs) as client:
                tasks: List[asyncio.Task[None]] = []
                for model_name in target_models:
                    task = asyncio.create_task(
                        self._stream_single_model(
                            client=client,
                            model_name=model_name,
                            messages=list(messages),
                            max_tokens=effective_max_tokens,
                            tools=tools,
                            queue=queue,
                        )
                    )
                    tasks.append(task)

                try:
                    await asyncio.gather(*tasks)
                finally:
                    # Signal to the consumer that no more items will be produced.
                    await queue.put(None)

        # Kick off producer in the background and start consuming from the queue.
        asyncio.create_task(_producer())

        while True:
            item = await queue.get()
            if item is None:
                break
            yield item

    async def _stream_single_model(
        self,
        *,
        client: OpenRouter,
        model_name: str,
        messages: List[Mapping[str, object]],
        max_tokens: int,
        tools: Optional[List[Mapping[str, object]]],
        queue: "asyncio.Queue[Optional[ProviderDelta]]",
    ) -> None:
        """
        Stream responses for a single model and push deltas onto the shared queue.
        """
        import json

        # Reasoning effort heuristic similar to the textual test client.
        reasoning_effort: str | None = None
        if model_name.startswith("openai/"):
            reasoning_effort = self._config.default_reasoning_effort or "minimal"

        kwargs: dict = {
            "model": model_name,
            "messages": messages,
            "stream": True,
            "max_tokens": max_tokens
        }
        if reasoning_effort and reasoning_effort.lower() != "none":
            kwargs["reasoning"] = {"effort": reasoning_effort}
        if tools:
            kwargs["tools"] = tools

        try:
            response = await client.chat.send_async(**kwargs)
            # Accumulate tool calls across chunks (they come in pieces)
            accumulated_tool_calls: dict[int, dict] = {}

            async with response as event_stream:
                async for event in event_stream:
                    for choice in getattr(event, "choices", []) or []:
                        delta = getattr(choice, "delta", None)
                        if delta is None:
                            continue

                        # Handle tool calls
                        delta_tool_calls = getattr(delta, "tool_calls", None)
                        if delta_tool_calls:
                            for tc in delta_tool_calls:
                                idx = getattr(tc, "index", 0)
                                if idx not in accumulated_tool_calls:
                                    accumulated_tool_calls[idx] = {
                                        "id": "",
                                        "name": "",
                                        "arguments": "",
                                    }
                                tc_id = getattr(tc, "id", None)
                                if tc_id:
                                    accumulated_tool_calls[idx]["id"] = tc_id
                                func = getattr(tc, "function", None)
                                if func:
                                    name = getattr(func, "name", None)
                                    if name:
                                        accumulated_tool_calls[idx]["name"] = name
                                    args = getattr(func, "arguments", None)
                                    if args:
                                        accumulated_tool_calls[idx]["arguments"] += args

                        # Handle content
                        content = getattr(delta, "content", None)
                        if content:
                            role = getattr(delta, "role", None)
                            await queue.put(
                                ProviderDelta(
                                    model=model_name,
                                    content=str(content),
                                    role=str(role) if role is not None else None,
                                )
                            )

            # After streaming, emit tool calls if any
            if accumulated_tool_calls:
                tool_call_list = [
                    ToolCall(
                        id=tc["id"],
                        name=tc["name"],
                        arguments=tc["arguments"],
                    )
                    for tc in accumulated_tool_calls.values()
                ]
                # Check for opt-out tool
                for tc in tool_call_list:
                    if tc.name == "opt_out":
                        await queue.put(
                            ProviderDelta(
                                model=model_name,
                                content="",
                                opted_out=True,
                            )
                        )
                        return
                # Emit tool calls for processing
                await queue.put(
                    ProviderDelta(
                        model=model_name,
                        content="",
                        tool_calls=tool_call_list,
                    )
                )

        except asyncio.CancelledError:
            # Task was cancelled, propagate without logging as error
            logger.debug("Stream cancelled for %s", model_name)
            raise
        except Exception as exc:
            # Surface provider errors as a synthetic delta chunk.
            # Log with context but avoid overly verbose stack traces for common errors
            if isinstance(exc, (ConnectionError, TimeoutError)):
                logger.warning("Connection error for %s: %s", model_name, exc)
            else:
                logger.exception("Provider error for %s", model_name)
            await queue.put(
                ProviderDelta(
                    model=model_name,
                    content=f"[provider-error] {type(exc).__name__}: {exc}",
                    role="assistant",
                )
            )


