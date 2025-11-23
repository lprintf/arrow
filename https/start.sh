#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Starting Arrow HTTPS deployment..."
docker compose up -d

echo ""
echo "✓ Arrow HTTPS deployment started"
echo ""
echo "Access URLs:"
echo "  Production: https://arrow.\${DOMAIN}"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f         # View logs"
echo "  docker compose ps              # Check status"
echo "  ./stop.sh                      # Stop services"
echo "  ./dev.sh                       # Start development mode"
