FROM python:3.12-slim
WORKDIR /app

RUN pip install uv

# Copy workspace files from root
COPY pyproject.toml uv.lock ./
COPY services/chat ./services/chat
COPY libs/pb ./libs/pb

# Install workspace dependencies (gateway and its workspace deps like pb)
RUN uv sync --frozen

WORKDIR /app/services/chat
EXPOSE 50051
CMD ["uv", "run", "python", "src/chat/main.py"]
