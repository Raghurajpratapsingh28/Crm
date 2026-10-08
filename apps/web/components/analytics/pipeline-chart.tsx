"use client";

import { chartNumber, formatMoneyMetric, type AnalyticsPipeline } from "../../lib/analytics";
import { EmptyState, ErrorState, LoadingState } from "../crm/ui";

export function PipelineChart({
  data,
  loading,
  error,
}: {
  data?: AnalyticsPipeline | null;
  loading?: boolean;
  error?: string | null;
}) {
  if (loading) return <LoadingState label="Loading pipeline" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;
  if (!data.pipeline) {
    return (
      <EmptyState
        title="No pipeline configured."
        body="Create a pipeline to view pipeline analytics."
      />
    );
  }

  const amounts = data.stages.map((stage) => chartNumber(stage.amount ?? "0"));
  if (amounts.some((value) => value === null)) return <ErrorState message="Pipeline chart data is invalid." />;
  const max = Math.max(...amounts.map((value) => value ?? 0), 0);

  return (
    <section className="chart-block" aria-labelledby="pipeline-chart-title">
      <h2 id="pipeline-chart-title">Pipeline by stage</h2>
      <p>
        Current deals in {data.pipeline.name}. Open-stage amounts use expected close date in the selected range.
      </p>
      <ul className="funnel">
        {data.stages.map((stage, index) => {
          const amount = amounts[index] ?? 0;
          const width = max === 0 ? 0 : (amount / max) * 100;
          return (
            <li key={stage.stageId}>
              <span>{stage.name}</span>
              <div className="funnel-track" aria-hidden="true">
                <div className="funnel-fill" style={{ width: `${width}%` }} />
              </div>
              <span>
                {stage.dealCount} · {formatMoneyMetric(stage)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
