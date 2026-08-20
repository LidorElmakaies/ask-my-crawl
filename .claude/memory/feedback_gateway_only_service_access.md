---
name: feedback_gateway_only_service_access
description: "Hard rule for askmycrawl: the frontend/client only ever reaches the Gateway, never a backend service directly — internal service-to-service calls (HTTP/gRPC/Kafka) are unaffected and follow docs/specs/services.md as already resolved"
metadata: 
  node_type: memory
  type: feedback
  modified: 2026-08-20T14:25:13.853Z
  originSessionId: 30cf8736-76d3-474e-aec8-9a5d8545eaa3
---

**Hard rule for [[askmycrawl-project]], scoped to the client/frontend boundary**: the frontend
only ever talks to the Gateway — never a backend service directly. If a design under consideration
would have the *frontend* call a service directly (bypassing the Gateway), stop and ask the user
about that specific case before wiring it.

**Explicitly does NOT restrict internal service-to-service calls.** Clarified directly after an
earlier, over-broad version of this memory implied it might: Crawl Worker→Search Result Manager,
Query/Answer→Search Result Manager, Notification→Auth Service, Crawl Result Manager←Gateway, and
Kafka-mediated events between any services — all of this is normal, expected, already-resolved
architecture per `docs/specs/services.md` ("Internal (service-to-service) calls: Resolved — plain
HTTP via Nest's HttpModule"), not something this rule touches. Internal calls may use HTTP, gRPC,
or Kafka as the message broker (Kafka being what most of the architecture is actually built
around) — none of that needs asking first, it's the documented design.

**Forward-looking intent mentioned alongside this**: the plan is to eventually hide every backend
service's port from the host entirely, so a client call to one becomes structurally invalid, not
just discouraged by convention. Not done yet (e.g. Auth Service's `8001:8001` is still published
in `devops/docker-compose.yml`, flagged in `docs/specs/README.md`'s open items) — mention this as
a possible follow-up when relevant, don't do it unprompted.

**Why:** stated directly — "the gateway role is if you are thinking about talking to a service
directly before doing that ask me about it and only if i aprove that spsific case then ok until
then only from the gateway." Said while asking to eliminate the frontend's one existing exception
(calling Auth Service directly at `:8001`, tracked as temporary debt in `services.md` all along).
Clarifying follow-up, after this memory's first version was written too broadly: "it was meant for
the frontend, the frontend can only reach the gateway... the services can talk to each other using
http grpc or even the kafka as the message broker for events (which our arch resolves around
mostly)."

**How to apply:** when building or extending a *frontend* feature, check whether it would call a
backend service directly instead of the Gateway — surface it and ask before implementing. When
building or extending a *backend* service's calls to another backend service, no extra
confirmation is needed beyond what `services.md`/`event-schemas.md` already specify — that's
already-approved, documented architecture.
