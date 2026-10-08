"use client";

import { formatWinRate, type AnalyticsWinRate } from "../../lib/analytics";
import { EmptyState, ErrorState, LoadingState } from "../crm/ui";

export function WinRateChart({
  data,
  loading,
  error,
}: {
  data?: AnalyticsWinRate | null;
  loading?: boolean;
  error?: string | null;
}) {
  if (loading) return <LoadingState label="Loading win rate" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;
  if (!data.hasData) {
    return <EmptyState title="No closed deals in this period." body="Win rate is Won / (Won + Lost). Open deals are excluded." />;
  }

  const max = Math.max(...data.series.map((row) => row.winRate), 1);

  return (
    <section className="chart-block" aria-labelledby="winrate-chart-title">
      <h2 id="winrate-chart-title">Win rate</h2>
      <p>
        {formatWinRate(data.winRate, data.hasData)} · {data.won} won · {data.lost} lost
      </p>
      <div className="bar-chart" role="img" aria-label={`Win rate ${data.winRate}%`}>
        {data.series.map((row) => (
          <div key={row.period} className="bar-chart-col">
            <div className="bar-chart-bar" style={{ height: `${(row.winRate / max) * 100}%` }} />
            <span>{row.period}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
