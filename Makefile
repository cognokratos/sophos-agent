COMPOSE_FILE="infra/compose.yml"
ENV_FILE="infra/.env"
COMPOSE=docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE}

.PHONY: help test docs-check dev start stop inspector format clean-db clean-memory clean

help:
	@echo "Available targets:"
	@echo "  help: Show this help message."
	@echo "  test: Run all tests."
	@echo "  docs-check: Check documentation links, anchors, paths and commands (offline)."
	@echo "  dev: Start the development server."
	@echo "  start: Start the app inside a cluster (http://127.0.0.1:5173)."
	@echo "  stop: Stop the app cluster."
	@echo "  inspector: Start the cluster with the MCP Inspector (http://127.0.0.1:6274)."
	@echo "  format: Format the codebase."
	@echo "  clean: Clean the entire data directory."
	@echo "  clean-db: Delete the SQLite database (conversations, runs, checkpoints)."
	@echo "  clean-memory: Clean the memory directory."

test: docs-check
	pnpm test && ./scripts/test.sh

# Offline: needs only Node and git (no Docker, Ollama or MCP servers).
docs-check:
	node --test scripts/verify-docs.test.mjs
	node scripts/verify-docs.mjs

dev:
	pnpm run dev -- --open

# Create the bind-mounted data directories up front so they are owned by the
# current user rather than created as root by the Docker daemon.
start:
	mkdir -p data/db data/memory
	${COMPOSE} up --build -d --wait

stop:
	${COMPOSE} --profile inspector down

inspector:
	mkdir -p data/db data/memory
	${COMPOSE} --profile inspector up --build -d --wait

format:
	pnpm format && pnpm check

clean-db:
	rm -rf data/db/*

clean-memory:
	rm -rf data/memory/*

clean:
	make clean-db
	make clean-memory
