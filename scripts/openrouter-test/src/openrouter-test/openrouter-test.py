from openrouter import OpenRouter
import asyncio

from textual.app import App, ComposeResult
from textual.widgets import Header, Footer, Static, Markdown
from textual.widgets.markdown import MarkdownStream
from textual.containers import ScrollableContainer
from typing import Optional

def _setup_api_key() -> str:
    return "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"


class ModelPanel(Static):
    """A panel for a single model's streaming output."""

    def __init__(self, model_name: str, **kwargs) -> None:
        super().__init__(**kwargs)
        self.model_name = model_name
        self.border_title = model_name
        self._stream: Optional[MarkdownStream] = None

    def compose(self) -> ComposeResult:
        yield ScrollableContainer(Markdown(id="content"), id="scroller")

    def start_streaming(self) -> None:
        """Initialize the MarkdownStream for efficient streaming."""
        markdown_widget = self.query_one("#content", Markdown)
        self._stream = Markdown.get_stream(markdown_widget)

    async def append(self, text: str) -> None:
        """Append text to the markdown stream."""
        if self._stream is None:
            self.start_streaming()
        assert self._stream is not None, "Stream should be initialized"
        # Type checker: _stream is guaranteed to be non-None after start_streaming()
        await self._stream.write(text)
        self.query_one("#scroller", ScrollableContainer).scroll_end(animate=False)

    async def clear(self) -> None:
        """Clear the markdown content and stop the stream."""
        if self._stream is not None:
            await self._stream.stop()
            self._stream = None
        self.query_one("#content", Markdown).update("")


class MultiModelApp(App):
    CSS = """
    Screen {
        layout: grid;
        grid-size: 2 2;
        grid-gutter: 1;
        padding: 1;
    }
    
    ModelPanel {
        border: solid $primary;
        padding: 0 1;
        height: 100%;
    }

    #scroller {
        height: 100%;
    }
    
    RichLog {
        background: $surface;
    }
    """

    BINDINGS = [
        ("r", "restart", "Restart"),
        ("q", "quit", "Quit"),
    ]

    def __init__(self, api_key: str, models: list[str], messages):
        super().__init__()
        self.api_key = api_key
        self.models = models
        self.messages = messages
        self._tasks: list[asyncio.Task] = []

    def compose(self) -> ComposeResult:
        yield Header()
        for model in self.models:
            yield ModelPanel(model, id=self._model_id(model))
        yield Footer()

    def _model_id(self, model_name: str) -> str:
        """Convert model name to valid CSS id."""
        return "panel-" + model_name.replace("/", "-").replace(".", "-")

    def get_panel(self, model_name: str) -> ModelPanel:
        return self.query_one(f"#{self._model_id(model_name)}", ModelPanel)

    async def on_mount(self) -> None:
        asyncio.create_task(self._start_streams())

    async def _start_streams(self) -> None:
        async with OpenRouter(api_key=self.api_key) as client:
            self._tasks = [
                asyncio.create_task(self._stream_model(client, model))
                for model in self.models
            ]
            await asyncio.gather(*self._tasks, return_exceptions=True)

    async def _stream_model(self, client: OpenRouter, model_name: str) -> None:
        panel = self.get_panel(model_name)
        panel.start_streaming()
        try:
            # Set reasoning: minimal for OpenAI models, none otherwise
            reasoning_effort = "minimal" if model_name.startswith("openai/") else "none"
            
            response = await client.chat.send_async(
                model=model_name,
                messages=self.messages,
                stream=True,
                reasoning={"effort": reasoning_effort}
            )
            async with response as event_stream:
                async for event in event_stream:
                    for choice in event.choices:
                        if choice.delta.content:
                            await panel.append(choice.delta.content)
                    if event.usage:
                        await panel.append('\n\n<span>■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■</span>\n\n')
                        await panel.append(f'Congrats you used {event.usage.completion_tokens} tokens!\n\n')
        except Exception as e:
            await panel.append(f"[red]ERROR: {e}[/red]")
        finally:
            # Stop the stream when done
            if panel._stream is not None:
                await panel._stream.stop()
                panel._stream = None

    async def action_restart(self) -> None:
        for task in self._tasks:
            task.cancel()
        for model in self.models:
            await self.get_panel(model).clear()
        asyncio.create_task(self._start_streams())


def main():
    api_key = _setup_api_key()
    models = [
        "openai/gpt-5-mini",
        "anthropic/claude-haiku-4.5",
        "google/gemini-2.5-flash",
        "x-ai/grok-4.1-fast"
    ]
    messages = [{
        "role": "user", 
        "content": "hi! what can i do after snow in nyc"
    }]

    app = MultiModelApp(api_key, models, messages)
    app.run()


if __name__ == "__main__":
    main()
    