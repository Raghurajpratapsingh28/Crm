# Dashboard

`/dashboard` is the high-level home. `/analytics` is exploration. Both read the same backend aggregations. Filters live in the URL (`from`, `to`, `owner`, `team`, `pipeline`, plus `groupBy` / `sort` on analytics).

## Dashboard vs analytics

| | Dashboard | Analytics |
|---|---|---|
| Purpose | Fast KPIs | Charts and team table |
| Route | `/dashboard` | `/analytics` |
| Primary fetch | `/analytics/overview` (+ revenue & pipeline charts) | revenue, pipeline, win-rate, follow-ups, leaderboard |
| Audience | Anyone with `analytics.read` | Same; leaderboard needs `analytics.team` |

Default date range: **this month** in the organization timezone.

## Layout

1. Filter bar (date presets, owner, department, pipeline, refresh)
2. KPI cards: Revenue, Open deals, Win rate, Pipeline value, Leads, Follow-ups
3. Revenue over time
4. Pipeline funnel + follow-up counts
5. Recent activity (10 rows)

Loading uses skeletons (`MetricCard` / `LoadingState`). If revenue fails and overview succeeds, the KPIs still render. Empty orgs show zeros and “No recent activity yet.” Win rate with no closed deals shows “No closed deals”, not a fake 0% performance story. Mixed currencies show “Multiple currencies”. No fabricated trend percentages.

Charts are CSS/SVG bars (no extra chart library). Every chart also has a numeric summary and, for revenue, an HTML table.

## Filters

Presets: Today, Yesterday, Last 7 / 30 days, This month, Last month, This quarter, This year, Custom. Changing a filter refetches all affected sections together. Dropdowns are not debounced. Refresh bypasses any browser cache by re-requesting the API.

Mobile: KPI cards and charts stack to one column.
