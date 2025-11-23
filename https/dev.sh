#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Starting Arrow HTTPS development environment (Overlay mode)..."
docker compose -f docker-compose.yml -f compose.dev.yml up -d

echo ""
echo "✓ Arrow HTTPS development environment started"
echo ""
echo "Access URLs:"
echo "  Production: https://arrow.\${DOMAIN}       (with OIDC auth)"
echo "  Development: https://arrow-dev.\${DOMAIN}  (bypasses auth, direct to backend)"
echo ""
echo "Development features:"
echo "  • Backend hot reload enabled"
echo "  • Frontend: rebuild with 'cd ../frontend && pnpm run build'"
echo "  • Direct backend access at arrow-dev (bypasses OIDC)"
echo ""
echo "Useful commands:"
echo "  docker compose -f docker-compose.yml -f compose.dev.yml logs -f backend"
echo "  docker compose -f docker-compose.yml -f compose.dev.yml logs -f frontend"
echo "  ./dev-stop.sh                  # Stop dev environment"
