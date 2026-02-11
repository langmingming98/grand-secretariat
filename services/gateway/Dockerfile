FROM python:3.12-slim
WORKDIR /app

RUN pip install uv

# 1. Copy only dependency metadata (cached unless deps change)
COPY pyproject.toml uv.lock ./
COPY libs/pb/pyproject.toml ./libs/pb/pyproject.toml
COPY services/gateway/pyproject.toml ./services/gateway/pyproject.toml

# 2. Stub out packages so uv sync can resolve without full source
RUN mkdir -p libs/pb/src/pb services/gateway/src/gateway && \
    touch libs/pb/src/pb/__init__.py services/gateway/src/gateway/__init__.py

# 3. Install deps (this layer is cached when only source code changes)
RUN uv sync --frozen

# 4. Copy actual source
COPY libs/pb ./libs/pb
COPY services/gateway ./services/gateway

WORKDIR /app/services/gateway
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "gateway.main:app", "--host", "0.0.0.0", "--port", "8000"]
