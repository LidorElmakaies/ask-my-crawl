COMPOSE = docker compose

# ── Lifecycle ──────────────────────────────────────────────────────────────────
.PHONY: up down restart ps logs

up:                  ## Build (if needed) and start the app stack in the background
	$(COMPOSE) up -d --build

down:                ## Stop and remove containers
	$(COMPOSE) down

restart:             ## Restart one service: make restart s=gateway
	$(COMPOSE) restart $(s)

ps:                  ## Show running containers and their status
	$(COMPOSE) ps

logs:                ## Tail logs from all services (Ctrl-C to exit)
	$(COMPOSE) logs -f

logs-%:              ## Tail logs from a single service: make logs-gateway
	$(COMPOSE) logs -f $*

# ── Cleanup ────────────────────────────────────────────────────────────────────
.PHONY: clean

clean:               ## Stop containers and remove built images (fresh start)
	$(COMPOSE) down --rmi local

# ── Help ───────────────────────────────────────────────────────────────────────
.PHONY: help
.DEFAULT_GOAL := help

help:                ## Show this help
	@grep -E '^[a-zA-Z_%-]+:.*##' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*##"}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
