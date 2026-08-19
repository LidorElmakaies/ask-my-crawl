# Observability Stack

A self-contained local observability stack for development and monitoring.
Collects **logs**, **metrics**, and **traces** from your application and routes
them to purpose-built backends, all visualised through a single Grafana dashboard.

---

## Architecture

```
Your App
   │
   │  OTLP (gRPC :4317 / HTTP :4318)
   ▼
OpenTelemetry Collector
   ├── Logs    ──────────────► Loki   (log storage & query)
   ├── Metrics ──────────────► Prometheus  (metrics storage & query)
   └── Traces  ──────────────► Tempo  (trace storage & query)
                                    ▲
                               Grafana  :3001*
                          (unified dashboard UI)
```
\* host port — container's internal port is still 3000; remapped because another process on the
dev machine already held host `:3000`.

### Components

| Service | Role | Internal port |
|---|---|---|
| **OTel Collector** | Single ingestion point — receives all telemetry from your app and fans it out to each backend | 4317 (gRPC), 4318 (HTTP) |
| **Loki** | Log aggregation and query engine | 3100 |
| **Prometheus** | Time-series metrics storage, scrapes OTel Collector every 15 s | 9090 |
| **Tempo** | Distributed trace storage | 3200 |
| **Grafana** | Dashboard and exploration UI, pre-wired to all three backends | 3000 |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose plugin)
- `make` — comes with Git Bash / WSL on Windows; native on Mac and Linux

---

## Quick start

```bash
cd devops/observability
make up
```

Grafana will be available at **http://localhost:3001** (user: `admin`, password: `admin`).

---

## Sending telemetry from your app

Point your OpenTelemetry SDK at the collector — no other configuration needed:

| Protocol | Endpoint |
|---|---|
| OTLP gRPC | `http://localhost:4317` |
| OTLP HTTP | `http://localhost:4318` |

All three signal types (logs, metrics, traces) go to the same endpoint.
The collector automatically routes each to the right backend.

### Example — Python

```python
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

provider = TracerProvider()
provider.add_span_processor(
    BatchSpanProcessor(OTLPSpanExporter(endpoint="http://localhost:4318/v1/traces"))
)
```

---

## Make commands

Run all commands from the `devops/observability/` directory.

| Command | What it does |
|---|---|
| `make up` | Start the full stack in the background |
| `make down` | Stop all containers (your data in `./data/` is kept) |
| `make restart s=<name>` | Restart a single service, e.g. `make restart s=otel-collector` |
| `make ps` | Show which containers are running and their status |
| `make logs` | Tail logs from every service (Ctrl-C to exit) |
| `make logs-<name>` | Tail logs from one service, e.g. `make logs-loki` |
| `make clean` | Stop containers **and delete all stored data** (fresh start) |
| `make nuke` | Same as `clean`, also removes pulled Docker images |
| `make help` | Print all available commands |

Service names for `restart` and `logs-*`: `otel-collector`, `loki`, `prometheus`, `tempo`, `grafana`.

---

## Grafana — exploring your data

Open **http://localhost:3001** and use the **Explore** view (compass icon in the sidebar).

| What you want to see | Data source to select | Example query |
|---|---|---|
| Logs | Loki | `{service_name="your-service"}` |
| Metrics | Prometheus | `your_metric_name` |
| Traces | Tempo | Search by service name or paste a trace ID |

All three data sources are pre-provisioned automatically on first start — no manual setup required.

Tempo also generates **service graph** and **span metrics** from incoming traces and pushes them to Prometheus, enabling the built-in service map view in Grafana.

---

## Data persistence

All backend data is stored locally under `./data/`:

```
data/
├── grafana/     ← dashboards, users, settings
├── loki/        ← log chunks and index
├── prometheus/  ← metrics TSDB blocks
└── tempo/       ← trace blocks and WAL
```

Data survives `make down` and `make up` cycles. To start completely fresh, run `make clean`.

> Add `data/` to your `.gitignore` — it holds runtime state, not config.

---

## Log limits

Each container's stdout/stderr is capped at **10 MB per file, 3 rotating files** (30 MB max per service) so Docker's log directory never grows unbounded on long-running dev setups.

---

## Future — Kubernetes

The config files in this directory are the source of truth for both Docker Compose and future Kubernetes deployments. When moving to k8s:

1. Add a `k8s/` folder next to `docker-compose.yml` with equivalent manifests or a Helm chart.
2. Add `k8s-apply` / `k8s-delete` targets to the `Makefile`.
3. The OTel Collector config (`otel-collector/config.yaml`) can be used as-is inside a `ConfigMap`.
