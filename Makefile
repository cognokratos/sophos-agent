COMPOSE_FILE="infra/compose.yml"
ENV_FILE="infra/.env"

.PHONY: help test dev start stop format clean-chat clean-memory clean

help:
	@echo "Available targets:"
	@echo "  help: Show this help message."
	@echo "  test: Run all tests."
	@echo "  dev: Start the development server."
	@echo "  start: Start the app inside a cluster."
	@echo "  stop: Stop the app cluster."
	@echo "  format: Format the codebase."
	@echo "  clean: Clean the entire data directory."
	@echo "  clean-chat: Clean the chat directory."
	@echo "  clean-memory: Clean the memory directory."

test:
	pnpm test && ./scripts/test.sh

dev:
	pnpm run dev -- --open

start:
	docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} up --build -d

stop:
	docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} down

format:
	pnpm format && pnpm check

clean-chat:
	rm -r data/chat/*

clean-memory:
	rm -r data/memory/*

clean:
	make clean-chat
	make clean-memory
