FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install dependencies
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY arrow_service ./arrow_service

# Expose port
EXPOSE 8000

# Start application
# Granian 配置：极致性能（Rust 实现 + 多进程 + uvloop）
CMD ["granian", "arrow_service.main:app", \
     "--interface", "asgi", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--http", "1", \
     "--backlog", "2048", \
     "--loop", "uvloop", \
     "--respawn-failed-workers"]
