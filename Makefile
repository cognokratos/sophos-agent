COMPOSE_FILE="infra/compose.yml"
ENV_FILE="infra/.env"
COMPOSE=docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE}

.PHONY: help test dev start stop inspector format clean-chat clean-memory clean

help:
	@echo "Available targets:"
	@echo "  help: Show this help message."
	@echo "  test: Run all tests."
	@echo "  dev: Start the development server."
	@echo "  start: Start the app inside a cluster (http://127.0.0.1:5173)."
	@echo "  stop: Stop the app cluster."
	@echo "  inspector: Start the cluster with the MCP Inspector (http://127.0.0.1:6274)."
	@echo "  format: Format the codebase."
	@echo "  clean: Clean the entire data directory."
	@echo "  clean-chat: Clean the chat directory."
	@echo "  clean-memory: Clean the memory directory."

test:
	pnpm test && ./scripts/test.sh

dev:
	pnpm run dev -- --open

# Create the bind-mounted data directories up front so they are owned by the
# current user rather than created as root by the Docker daemon.
start:
	mkdir -p data/chat data/memory
	${COMPOSE} up --build -d --wait

stop:
	${COMPOSE} --profile inspector down

inspector:
	mkdir -p data/chat data/memory
	${COMPOSE} --profile inspector up --build -d --wait

format:
	pnpm format && pnpm check

clean-chat:
	rm -rf data/chat/*

clean-memory:
	rm -rf data/memory/*

clean:
	make clean-chat
	make clean-memory
