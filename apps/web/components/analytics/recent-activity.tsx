"use client";

import Link from "next/link";
import { activityHeadline, type AnalyticsActivity } from "../../lib/analytics";
import { dayGroupLabel, formatTime } from "../../lib/followups";
import { EmptyState } from "../crm/ui";

export function RecentActivityList({ items }: { items: AnalyticsActivity[] }) {
  if (items.length === 0) {
    return <EmptyState title="No recent activity yet." body="Calls, notes, and stage changes will show up here." />;
  }

  return (
    <ol className="timeline">
      {items.map((item) => (
        <li key={item.id}>
          <div className="timeline-meta">
            <strong>{formatTime(item.occurredAt)}</strong>
            <span className="muted">{dayGroupLabel(item.occurredAt)}</span>
          </div>
          <p>
            {item.deal ? <Link href={`/deals/${item.deal.id}`}>{activityHeadline(item)}</Link> : activityHeadline(item)}
          </p>
        </li>
      ))}
    </ol>
  );
}
