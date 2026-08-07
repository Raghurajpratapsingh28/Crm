# Pipeline

Each organization receives a default pipeline at onboarding (`Default Sales Pipeline`, `isDefault: true`).

## Stages

Ordered by `order` (position). Default stages:

Lead → Contacted → Qualified → Meeting → Proposal → Negotiation → Won → Lost

Each stage stores:

- `probability` (default weighting)
- `isWon` / `isLost` flags
- optional `key` slug

## Management

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/v1/pipelines` | `pipeline.read` |
| PATCH | `/api/v1/pipelines/:id` | `pipeline.manage` |
| POST/PATCH/DELETE | `/api/v1/pipelines/:id/stages...` | `pipeline.manage` |

## Board endpoints

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/v1/pipelines/:pipelineId/kanban` | `deals.read` |
| GET | `/api/v1/pipelines/:pipelineId/summary` | `deals.read` |

Kanban returns stages in `order` with SQL aggregates (`dealCount`, `totalAmount`, `weightedValue = Σ amount × probability / 100`) and a bounded card list per column (`ROW_NUMBER() PARTITION BY stage_id`). Summary uses the same tenant-scoped aggregation and does not load deal rows.
