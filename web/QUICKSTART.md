# Quick Start Guide

Get the multi-model chat application running quickly.

## Prerequisites

- Node.js 18+ installed
- Python 3.11+ installed
- OpenRouter API key

## Steps

1. **Set your API key:**
   ```bash
   export OPENROUTER_API_KEY=your-api-key-here
   ```

2. **Install Python dependencies (from project root):**
   ```bash
   uv sync
   ```

3. **Start the backend (in one terminal):**
   ```bash
   cd services/web
   uvicorn web.main:app --reload --port 8000
   ```
   
   This command:
   - `uvicorn` - Starts the ASGI server for FastAPI
   - `web.main:app` - Loads the `app` variable from `services/web/src/web/main.py`
   - `--reload` - Auto-reloads on code changes (development mode)
   - `--port 8000` - Runs the server on port 8000

4. **Install frontend dependencies (in another terminal):**
   ```bash
   cd web
   npm install
   ```

5. **Start the frontend:**
   ```bash
   npm run dev
   ```

6. **Open your browser:**
   Navigate to `http://localhost:3000`

7. **Try it out:**
   - Type a message in the input box
   - Press Send
   - Watch 4 models respond in parallel!

## Troubleshooting

- **Backend won't start**: Make sure `OPENROUTER_API_KEY` is set
- **WebSocket connection fails**: Ensure backend is running on port 8000, and check that the URL is `ws://localhost:8000/ws/chat/stream`
- **Frontend won't build**: Run `npm install` first
- **Styling looks wrong**: Make sure Tailwind CSS is compiled (should happen automatically with `npm run dev`)

