#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Stopping Arrow HTTPS deployment..."
docker compose down

echo "✓ Arrow HTTPS deployment stopped"
