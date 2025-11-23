#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Stopping Arrow HTTP deployment..."
docker compose down

echo "✓ Arrow HTTP deployment stopped"
