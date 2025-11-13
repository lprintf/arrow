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
CMD ["uvicorn", "arrow_service.main:app", "--host", "0.0.0.0", "--port", "8000", "--loop", "uvloop"]
