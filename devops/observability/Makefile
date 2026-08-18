COMPOSE = docker compose

# ── Lifecycle ──────────────────────────────────────────────────────────────────
.PHONY: up down restart ps logs

up:                  ## Start the full observability stack in the background
	$(COMPOSE) up -d

down:                ## Stop and remove containers (data is preserved in ./data)
	$(COMPOSE) down

restart:             ## Restart one service: make restart s=otel-collector
	$(COMPOSE) restart $(s)

ps:                  ## Show running containers and their status
	$(COMPOSE) ps

logs:                ## Tail logs from all services (Ctrl-C to exit)
	$(COMPOSE) logs -f

logs-%:              ## Tail logs from a single service: make logs-loki
	$(COMPOSE) logs -f $*

# ── Cleanup ────────────────────────────────────────────────────────────────────
.PHONY: clean nuke

clean:               ## Stop containers and wipe all stored data (fresh start)
	$(COMPOSE) down
	rm -rf data/loki/* data/prometheus/* data/tempo/* data/grafana/*

nuke:                ## clean + remove Docker images (full reset)
	$(COMPOSE) down --rmi local
	rm -rf data/loki/* data/prometheus/* data/tempo/* data/grafana/*

# ── Help ───────────────────────────────────────────────────────────────────────
.PHONY: help
.DEFAULT_GOAL := help

help:                ## Show this help
	@grep -E '^[a-zA-Z_%-]+:.*##' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*##"}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
