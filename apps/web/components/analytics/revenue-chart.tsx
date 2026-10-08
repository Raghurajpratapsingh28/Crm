"use client";

import { chartNumber, formatMoneyMetric, type AnalyticsRevenue } from "../../lib/analytics";
import { EmptyState, ErrorState, LoadingState } from "../crm/ui";

export function RevenueChart({
  data,
  loading,
  error,
}: {
  data?: AnalyticsRevenue | null;
  loading?: boolean;
  error?: string | null;
}) {
  if (loading) return <LoadingState label="Loading revenue" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const points = data.series.map((row) => ({ period: row.period, value: chartNumber(row.amount) }));
  if (points.some((row) => row.value === null)) {
    return <ErrorState message="Revenue chart data is invalid." />;
  }
  const values = points.map((row) => row.value ?? 0);
  const hasRevenue = values.some((value) => value > 0);
  const max = Math.max(...values, 0);
  const total = formatMoneyMetric({ amount: data.total, currency: data.currency, mixed: data.mixed });

  return (
    <section className="chart-block" aria-labelledby="revenue-chart-title">
      <div className="toolbar">
        <div>
          <h2 id="revenue-chart-title">Revenue over time</h2>
          <p>Total revenue: {total}</p>
        </div>
      </div>
      {!hasRevenue ? (
        <EmptyState title="No revenue recorded for this period." body="Won deals in the selected range will appear here." />
      ) : (
        <div className="bar-chart" role="img" aria-label={`Revenue by ${data.groupBy}. Total ${total}.`}>
          {points.map((point) => {
            const height = max === 0 ? 0 : ((point.value ?? 0) / max) * 100;
            return (
              <div key={point.period} className="bar-chart-col">
                <div className="bar-chart-bar" style={{ height: `${height}%` }} />
                <span>{point.period}</span>
              </div>
            );
          })}
        </div>
      )}
      <table className="table">
        <caption className="sr-only">Revenue by period</caption>
        <thead>
          <tr>
            <th>Period</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.series.map((row) => (
            <tr key={row.period}>
              <td>{row.period}</td>
              <td>{formatMoneyMetric({ amount: row.amount, currency: data.currency, mixed: Boolean(row.byCurrency.length > 1) })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
