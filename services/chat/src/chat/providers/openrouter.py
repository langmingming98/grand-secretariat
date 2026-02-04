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
class ProviderDelta:
    """
    A single streamed chunk from the provider for a specific model.
    """

    model: str
    content: str
    role: Optional[str] = None


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
    ) -> AsyncIterator[ProviderDelta]:
        """
        Stream chat completions from OpenRouter for one or more models.

        The `messages` parameter must be compatible with the OpenRouter Python client
        (list of dicts with `role` and `content` keys).
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
        queue: "asyncio.Queue[Optional[ProviderDelta]]",
    ) -> None:
        """
        Stream responses for a single model and push deltas onto the shared queue.
        """
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

        try:
            response = await client.chat.send_async(**kwargs)
            async with response as event_stream:
                async for event in event_stream:
                    for choice in getattr(event, "choices", []) or []:
                        delta = getattr(choice, "delta", None)
                        if delta is None:
                            continue
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
        except Exception as exc:
            # Surface provider errors as a synthetic delta chunk.
            await queue.put(
                ProviderDelta(
                    model=model_name,
                    content=f"[provider-error] {type(exc).__name__}: {exc}",
                    role="assistant",
                )
            )


