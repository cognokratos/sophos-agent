COMPOSE_FILE="infra/compose.yml"
ENV_FILE="infra/.env"

.PHONY: test
test:
	./scripts/test.sh

.PHONY: start
start:
	docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} up --build -d

.PHONY: stop
stop:
	docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} down

.PHONY: clean-logs
clean-logs:
	rm -r data/logs/*

.PHONY: clean-memory
clean-memory:
	rm -r data/memory/*

.PHONY: clean
clean:
	make clean-logs
	make clean-memory
