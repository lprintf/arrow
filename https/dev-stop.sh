#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Stopping Arrow HTTPS development (overlay mode)..."
# Overlay 模式：停止所有容器，然后以生产模式重启
docker compose -f docker-compose.yml -f compose.dev.yml down
docker compose -f docker-compose.yml up -d

echo ""
echo "✓ Development overlay removed, production mode restored"
echo "  To stop all containers: docker compose down"
