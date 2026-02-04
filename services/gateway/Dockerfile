FROM python:3.12-slim
WORKDIR /app

RUN pip install uv

# Copy workspace files from root
COPY pyproject.toml uv.lock ./
COPY services/gateway ./services/gateway
COPY libs/pb ./libs/pb

# Install workspace dependencies (gateway and its workspace deps like pb)
RUN uv sync --frozen

WORKDIR /app/services/gateway
EXPOSE 50051

CMD ["uv", "run", "uvicorn", "gateway.main:app", "--host", "0.0.0.0", "--port", "8000"]
