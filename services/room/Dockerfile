FROM python:3.12-slim
WORKDIR /app

RUN pip install uv

# Copy workspace files from root
COPY pyproject.toml uv.lock ./
COPY services/room ./services/room
COPY libs/pb ./libs/pb

# Install workspace dependencies
RUN uv sync --frozen

WORKDIR /app/services/room
EXPOSE 50052
CMD ["uv", "run", "python", "src/room/main.py"]
