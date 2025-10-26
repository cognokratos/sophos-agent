COMPOSE_FILE="infra/compose.yml"
ENV_FILE="infra/.env"

test:
	./scripts/test.sh

start:
	docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} up --build -d

stop:
	docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} down
