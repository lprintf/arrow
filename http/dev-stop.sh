#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Stopping Arrow HTTP development containers..."
# 只停止开发容器，保留基础设施（postgres, redis）
docker compose -f docker-compose.yml -f compose.dev.yml stop backend-dev frontend-dev
docker compose -f docker-compose.yml -f compose.dev.yml rm -f backend-dev frontend-dev

echo ""
echo "✓ Development containers stopped (infrastructure still running)"
echo "  To stop all containers including postgres/redis: docker compose -f docker-compose.yml -f compose.dev.yml down"
