#!/bin/bash
# 停止所有服务（生产 + 开发）
set -e

cd "$(dirname "$0")"

echo "停止 Arrow 所有服务..."

# 停止开发环境
if docker compose -f docker-compose.yml -f compose.dev.yml ps --quiet 2>/dev/null | grep -q .; then
    echo "  停止开发环境..."
    docker compose -f docker-compose.yml -f compose.dev.yml down
fi

# 停止生产环境
if docker compose ps --quiet 2>/dev/null | grep -q .; then
    echo "  停止生产环境..."
    docker compose down
fi

echo ""
echo "✓ Arrow HTTP 已停止"

