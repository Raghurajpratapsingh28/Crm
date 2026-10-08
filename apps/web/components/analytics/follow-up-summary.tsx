"use client";

import type { FollowUpMetric } from "@crm/types";
import { EmptyState } from "../crm/ui";

export function FollowUpSummary({ metrics }: { metrics?: FollowUpMetric }) {
  if (!metrics) return <EmptyState title="No follow-ups" body="Open tasks will appear as follow-ups." />;
  return (
    <ul className="followup-kpis">
      <li>
        <strong>{metrics.open}</strong>
        <span>Open</span>
      </li>
      <li>
        <strong>{metrics.overdue}</strong>
        <span>Overdue</span>
      </li>
      <li>
        <strong>{metrics.dueToday}</strong>
        <span>Due today</span>
      </li>
    </ul>
  );
}
