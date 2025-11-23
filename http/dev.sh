#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Starting Arrow HTTP development environment..."
docker compose -f docker-compose.yml -f compose.dev.yml up -d

echo ""
echo "✓ Arrow HTTP development environment started"
echo ""
echo "Access URLs:"
echo "  Development: http://arrow-dev.\${DOMAIN}  (bypasses auth)"
echo "  Backend API: http://arrow-dev.\${DOMAIN}/docs"
echo ""
echo "Development features:"
echo "  • Backend hot reload enabled"
echo "  • Frontend: rebuild with 'cd ../frontend && pnpm run build'"
echo "  • Test user auto-injected"
echo ""
echo "Useful commands:"
echo "  docker compose -f docker-compose.yml -f compose.dev.yml logs -f backend-dev"
echo "  docker compose -f docker-compose.yml -f compose.dev.yml logs -f frontend-dev"
echo "  ./dev-stop.sh                  # Stop dev environment"
