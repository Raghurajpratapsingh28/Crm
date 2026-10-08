"use client";

export function MetricCard({
  title,
  value,
  subtitle,
  trend,
  loading,
  error,
}: {
  title: string;
  value?: string;
  subtitle?: string;
  trend?: string | null;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <article className="metric-card" aria-busy={loading || undefined}>
      <h2>{title}</h2>
      {loading ? (
        <div className="skeleton-stack">
          <div className="skeleton" />
          <div className="skeleton short" />
        </div>
      ) : error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : (
        <>
          <p className="metric-value">{value}</p>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
          {trend ? <p className="metric-trend">{trend} vs previous period</p> : null}
        </>
      )}
    </article>
  );
}
