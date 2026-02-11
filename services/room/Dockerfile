FROM python:3.12-slim
WORKDIR /app

RUN pip install uv

# 1. Copy only dependency metadata (cached unless deps change)
COPY pyproject.toml uv.lock ./
COPY libs/pb/pyproject.toml ./libs/pb/pyproject.toml
COPY libs/common/pyproject.toml ./libs/common/pyproject.toml
COPY services/room/pyproject.toml ./services/room/pyproject.toml

# 2. Stub out packages so uv sync can resolve without full source
RUN mkdir -p libs/pb/src/pb libs/common/src/common services/room/src/room && \
    touch libs/pb/src/pb/__init__.py libs/common/src/common/__init__.py services/room/src/room/__init__.py

# 3. Install deps (this layer is cached when only source code changes)
RUN uv sync --frozen

# 4. Copy actual source
COPY libs/pb ./libs/pb
COPY libs/common ./libs/common
COPY services/room ./services/room

WORKDIR /app/services/room
EXPOSE 50052
CMD ["uv", "run", "python", "src/room/main.py"]
