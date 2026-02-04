import asyncio
import os
from typing import Optional

import grpc
from textual.app import App, ComposeResult
from textual.containers import Container, Horizontal, ScrollableContainer
from textual.widgets import Button, Footer, Header, Input, Markdown, Static
from textual.widgets.markdown import MarkdownStream

from pb.api.chat import chat_pb2, chat_pb2_grpc
from pb.shared import content_pb2


def _grpc_server_address() -> str:
    """Get gRPC server address from environment or use default."""
    return os.getenv("CHAT_GRPC_ADDRESS", "localhost:50051")


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
        layout: vertical;
    }
    
    #panels-container {
        layout: grid;
        grid-size: 2 2;
        grid-gutter: 1;
        padding: 1;
        height: 1fr;
    }
    
    ModelPanel {
        border: solid $primary;
        padding: 0 1;
        height: 100%;
    }

    #scroller {
        height: 100%;
    }
    
    #input-container {
        height: auto;
        padding: 1;
        border-top: solid $primary;
        background: $surface;
    }
    
    #input-container Horizontal {
        width: 100%;
        height: auto;
    }
    
    #message-input {
        width: 1fr;
        margin-right: 1;
    }
    
    #send-button {
        width: auto;
    }
    
    RichLog {
        background: $surface;
    }
    """

    BINDINGS = [
        ("r", "restart", "Restart"),
        ("q", "quit", "Quit"),
    ]

    def __init__(self, grpc_address: str, models: list[str], initial_messages: list[dict]):
        super().__init__()
        self.grpc_address = grpc_address
        self.models = models
        # Conversation history - starts with initial messages, grows as user sends more
        self.conversation_history: list[dict] = list(initial_messages)
        self._task: Optional[asyncio.Task] = None
        self._panels: dict[str, ModelPanel] = {}
        self._channel: Optional[grpc.aio.Channel] = None
        self._streaming = False
        # Track accumulated responses per model for current stream
        self._current_responses: dict[str, str] = {}

    def compose(self) -> ComposeResult:
        yield Header()
        with Container(id="panels-container"):
            for model in self.models:
                panel = ModelPanel(model, id=self._model_id(model))
                self._panels[model] = panel
                yield panel
        with Container(id="input-container"):
            with Horizontal():
                yield Input(
                    placeholder="Type your message here... (Press Enter to send)",
                    id="message-input",
                )
                yield Button("Send", variant="primary", id="send-button")
        yield Footer()

    def _model_id(self, model_name: str) -> str:
        """Convert model name to valid CSS id."""
        return "panel-" + model_name.replace("/", "-").replace(".", "-").replace(":", "-")

    def get_panel(self, model_name: str) -> Optional[ModelPanel]:
        """Get the panel for a given model name, or None if not found."""
        return self._panels.get(model_name)

    async def on_mount(self) -> None:
        """Focus the input when the app mounts."""
        input_widget = self.query_one("#message-input", Input)
        input_widget.focus()
        # If there are initial messages, start streaming them
        if self.conversation_history:
            asyncio.create_task(self._start_stream())

    async def on_input_submitted(self, event: Input.Submitted) -> None:
        """Handle Enter key press in the input."""
        if event.input.id == "message-input":
            await self._send_message()

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle Send button press."""
        if event.button.id == "send-button":
            await self._send_message()

    def _to_protobuf_messages(
        self, messages: list[dict]
    ) -> list[content_pb2.Message]:
        """Convert dict messages to protobuf Message format."""
        pb_messages = []
        role_map = {
            "user": content_pb2.USER,
            "assistant": content_pb2.ASSISTANT,
            "system": content_pb2.SYSTEM,
            "tool": content_pb2.TOOL,
        }

        for msg in messages:
            role_str = msg.get("role", "user").lower()
            role = role_map.get(role_str, content_pb2.USER)

            # Extract content - handle both string and dict formats
            content_str = msg.get("content", "")
            if isinstance(content_str, dict):
                # If content is a dict, try to extract text
                content_str = content_str.get("text", str(content_str))
            elif not isinstance(content_str, str):
                content_str = str(content_str)

            pb_msg = content_pb2.Message(
                role=role,
                contents=[content_pb2.Content(text=content_str)],
            )
            pb_messages.append(pb_msg)

        return pb_messages

    async def _send_message(self) -> None:
        """Send a new user message and stream responses."""
        input_widget = self.query_one("#message-input", Input)
        message_text = input_widget.value.strip()

        if not message_text:
            # Don't send if message is empty
            return

        if self._streaming:
            # Don't allow sending while a stream is in progress
            # Could show a message or queue it, but for simplicity just ignore
            return

        # Clear input
        input_widget.value = ""

        # Add user message to conversation history
        user_message = {"role": "user", "content": message_text}
        self.conversation_history.append(user_message)

        # Display user message in all panels with a separator
        user_display = f"\n\n--- **You:** {message_text} ---\n\n"
        for model in self.models:
            panel = self.get_panel(model)
            if panel._stream is None:
                panel.start_streaming()
            await panel.append(user_display)

        # Start streaming responses
        asyncio.create_task(self._start_stream())

    async def _start_stream(self) -> None:
        """Start streaming from gRPC endpoint using current conversation history."""
        if self._streaming:
            # Already streaming, skip
            return

        self._streaming = True
        # Reset accumulated responses for this stream
        self._current_responses = {model: "" for model in self.models}

        # Initialize all panels if not already
        for model in self.models:
            panel = self.get_panel(model)
            if panel._stream is None:
                panel.start_streaming()

        # Create or reuse gRPC channel and stub
        if self._channel is None:
            self._channel = grpc.aio.insecure_channel(self.grpc_address)
        stub = chat_pb2_grpc.ChatStub(self._channel)

        try:
            # Convert conversation history to protobuf format
            pb_messages = self._to_protobuf_messages(self.conversation_history)

            # Build ChatRequest
            request = chat_pb2.ChatRequest(
                messages=pb_messages,
                models=self.models if self.models else [],  # Empty list = use server defaults
            )

            # Add separator for assistant response in all panels
            assistant_separator = "\n**Assistant:** "
            for model in self.models:
                await self.get_panel(model).append(assistant_separator)

            # Stream responses
            async for response in stub.Chat(request):
                model_name = response.model
                delta = response.delta

                # Get the panel for this model
                panel = self.get_panel(model_name)
                if panel is None:
                    # If we don't have a panel for this model, skip it
                    # (This can happen if the server returns a model not in our initial list)
                    continue

                # Append content delta to the panel and accumulate
                if delta.content:
                    await panel.append(delta.content)
                    # Accumulate response for this model
                    if model_name in self._current_responses:
                        self._current_responses[model_name] += delta.content

            # After streaming completes, add the first model's assistant response to conversation history
            # (We use the first model that has a response as the canonical response)
            for model in self.models:
                if model in self._current_responses and self._current_responses[model]:
                    assistant_message = {
                        "role": "assistant",
                        "content": self._current_responses[model],
                    }
                    self.conversation_history.append(assistant_message)
                    break  # Only add one assistant response to history

        except Exception as e:
            # Show error in all panels
            error_msg = f"\n[red]ERROR: {e}[/red]\n"
            for model in self.models:
                await self.get_panel(model).append(error_msg)
        finally:
            self._streaming = False
            self._current_responses = {}

    async def action_restart(self) -> None:
        """Clear all panels and reset conversation to initial state."""
        if self._task:
            self._task.cancel()
        self._streaming = False
        self._current_responses = {}
        for model in self.models:
            await self.get_panel(model).clear()
        # Reset conversation history to initial state (preserve any initial messages)
        # Note: This assumes initial_messages were passed in __init__, but we don't store them separately
        # For now, just clear everything - user can start fresh
        self.conversation_history = []
        # Focus input again
        input_widget = self.query_one("#message-input", Input)
        input_widget.focus()

    async def on_unmount(self) -> None:
        """Clean up resources when app is closed."""
        if self._channel:
            await self._channel.close()


def main():
    grpc_address = _grpc_server_address()
    models = [
        "openai/gpt-5-mini:online",
        "anthropic/claude-haiku-4.5:online",
        "google/gemini-2.5-flash:online",
        "x-ai/grok-4.1-fast:online"
    ]
    # Initial messages (can be empty to start fresh)
    initial_messages: list[dict] = []

    app = MultiModelApp(grpc_address, models, initial_messages)
    app.run()


if __name__ == "__main__":
    main()

