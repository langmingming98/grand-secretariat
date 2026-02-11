# Multi-Model Chat Web Application

A Next.js web application that streams responses from multiple AI models in parallel using WebSockets.

## Tech Stack

- **Frontend**: Next.js 14, React, Tailwind CSS, TypeScript
- **Backend**: FastAPI service in `/services/web`
- **AI Provider**: OpenRouter

## Setup

### Prerequisites

- Node.js 18+ and npm/yarn
- Python 3.11+
- uv (Python package manager)
- OpenRouter API key

### Backend Setup

The backend is in `/services/web`. See that directory for setup instructions.

Quick start:
```bash
# Set your OpenRouter API key
export OPENROUTER_API_KEY=your-api-key-here

# Install dependencies (from project root)
uv sync

# Run the web service (from project root)
uv run --directory services/web uvicorn web.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.

### Frontend Setup

1. Navigate to the web directory:
```bash
cd web
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Create `.env.local` file (optional, defaults to `ws://localhost:8000/ws/chat/stream`):
```bash
cp .env.local.example .env.local
```

4. Run the development server:
```bash
npm run dev
# or
yarn dev
```

The application will be available at `http://localhost:3000`.

## Usage

1. Start the FastAPI backend server (port 8000)
2. Start the Next.js frontend (port 3000)
3. Open `http://localhost:3000` in your browser
4. Type a message and press Send
5. Watch as 4 models respond in parallel in a 2x2 grid layout

## Project Structure

```
web/                  # Frontend only (Next.js)
├── app/              # Next.js app directory
│   ├── components/   # React components
│   ├── hooks/        # Custom React hooks
│   ├── layout.tsx    # Root layout
│   ├── page.tsx      # Main page
│   └── globals.css   # Global styles
├── package.json
├── tailwind.config.js
└── tsconfig.json

services/web/         # Backend (FastAPI gateway)
└── src/web/
    ├── main.py       # FastAPI app with WebSocket endpoints
    └── routers/      # Feature routers (for future expansion)
```

