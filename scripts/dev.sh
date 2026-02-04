#!/bin/bash
# Local development script - starts all services

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track PIDs for cleanup
PIDS=()

cleanup() {
    echo -e "\n${RED}Shutting down...${NC}"
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
        fi
    done
    exit 0
}

trap cleanup SIGINT SIGTERM

# Load API key from .env if not already set
if [ -z "$OPENROUTER_API_KEY" ]; then
    ENV_FILE="$ROOT_DIR/services/chat/.env"
    if [ -f "$ENV_FILE" ]; then
        echo -e "${GREEN}Loading API key from services/chat/.env${NC}"
        export $(grep -v '^#' "$ENV_FILE" | xargs)
    else
        echo -e "${RED}Error: OPENROUTER_API_KEY not set and no .env file found${NC}"
        echo "Either run: export OPENROUTER_API_KEY='your-key'"
        echo "Or create: services/chat/.env with OPENROUTER_API_KEY=your-key"
        exit 1
    fi
fi

echo -e "${BLUE}Starting Grand Secretariat local dev...${NC}\n"

# Sync dependencies (--all-packages needed for workspace)
echo -e "${GREEN}[0/3] Syncing dependencies...${NC}"
uv sync --all-packages --quiet

# Start chat service (gRPC :50051)
echo -e "${GREEN}[1/3] Starting chat service on :50051${NC}"
cd "$ROOT_DIR/services/chat"
uv run python src/chat/main.py 2>&1 | sed 's/^/[chat] /' &
PIDS+=($!)
cd "$ROOT_DIR"
sleep 2

# Start gateway (FastAPI :8000)
echo -e "${GREEN}[2/3] Starting gateway on :8000${NC}"
cd "$ROOT_DIR/services/gateway"
uv run uvicorn gateway.main:app --reload --port 8000 2>&1 | sed 's/^/[gateway] /' &
PIDS+=($!)
cd "$ROOT_DIR"
sleep 2

# Start frontend (Next.js :3000)
echo -e "${GREEN}[3/3] Starting frontend on :3000${NC}"
cd "$ROOT_DIR/web"
npm run dev 2>&1 | sed 's/^/[web] /' &
PIDS+=($!)
cd "$ROOT_DIR"

echo -e "\n${BLUE}========================================${NC}"
echo -e "${GREEN}All services running!${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Frontend:     http://localhost:3000"
echo -e "Gateway:      http://localhost:8000"
echo -e "Chat (gRPC):  localhost:50051"
echo -e "\nPress Ctrl+C to stop all services"

# Wait for all processes
wait
