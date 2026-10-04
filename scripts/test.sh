#!/bin/bash
#
# Smoke test for the Docker Compose stack.
# Requires infra/.env and a running Ollama with the configured model.

set -e

COMPOSE_FILE="infra/compose.yml"
ENV_FILE="infra/.env"
COMPOSE="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

function cleanup() {
    echo "Shutting down services..."
    $COMPOSE down
}

trap cleanup EXIT

mkdir -p data/db data/memory

# --wait blocks until every service's healthcheck passes (web /api/healthz,
# Memory MCP /ping, Fetch MCP /status). The MCP servers are not published to
# the host, so their health is only observable through Docker.
echo "Starting services and waiting for health checks..."
$COMPOSE up --build -d --wait --wait-timeout 300

echo ""
echo "Checking that MCP services are not published to the host..."
for service in mcp-memory mcp-fetch; do
    # `docker port` lists host bindings only; it prints nothing for unpublished ports.
    if [ -n "$(docker port "$($COMPOSE ps -q $service)")" ]; then
        echo "ERROR: $service publishes a port to the host"
        exit 1
    fi
done

echo ""
echo "Waiting for Web App to be ready (Ollama reachable, model available)..."

until curl --fail-with-body http://127.0.0.1:5173/api/readyz; do
    printf '.'
    sleep 5
done

echo ""
echo "All services are healthy and ready!"
