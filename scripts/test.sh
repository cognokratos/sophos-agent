
#!/bin/bash

set -e

COMPOSE_FILE="infra/compose.yml"
ENV_FILE="infra/.env"

function cleanup() {
    echo "Shutting down services..."
    docker compose -f $COMPOSE_FILE --env-file $ENV_FILE down
}

trap cleanup EXIT

echo "Starting services..."
docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up --build -d

echo ""
echo "Waiting for Web App to be healthy..."

# Wait for web healthz
until curl --fail-with-body http://localhost:5173/api/healthz; do
    printf '.'
    sleep 5
done

echo ""
echo "Waiting for Memory MCP to be healthy..."

until curl --fail-with-body http://localhost:8081/ping; do
    printf '.'
    sleep 5
done

echo ""
echo "Waiting for Fetch MCP to be healthy..."

until curl --fail-with-body http://localhost:8082/status; do
    printf '.'
    sleep 5
done

echo ""
echo "Waiting for Web App to be ready..."

# Wait for web readyz
until curl --fail-with-body http://localhost:5173/api/readyz; do
    printf '.'
    sleep 5
done

echo ""
echo "All services are healthy and ready!"
