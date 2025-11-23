#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Stopping Arrow HTTPS development environment..."
docker compose -f docker-compose.yml -f compose.dev.yml down

echo "✓ Arrow HTTPS development environment stopped"
