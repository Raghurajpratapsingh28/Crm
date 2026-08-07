# Kanban

Primary UI: `/pipeline`

## Behavior

- Loads default (or selected) pipeline via `GET /api/v1/pipelines/:id/kanban`
- Columns follow backend stage `order`
- Drag-and-drop uses `@dnd-kit`; dropping on a column calls `POST /api/v1/deals/:id/stage`
- Optimistic move with rollback on API failure
- Lost and Won use accessible dialogs (reason required for Lost). Backend still enforces `LOST_REASON_REQUIRED`.
- Keyboard/alternative: **Move stage** button on each card (drag is not the only path)
- Optimistic move with snapshot rollback on API failure
- Each column loads at most `perStage` cards (default 50, max 100) via a window query; totals stay aggregated in SQL

## Filters

URL query params: `search`, `owner`, `company`, `stage`, `minAmount`, `maxAmount`, `closeDateFrom`, `closeDateTo`.

## Cards show

Deal name, company, amount, probability, owner. Click opens `/deals/[id]`.
