"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ErrorState, LoadingState } from "../../../../components/crm/ui";
import { ActivityTypeIcon } from "../../../../components/followups/activity-type-icon";
import { useAuth } from "../../../../components/auth-provider";
import { apiFetch, ApiRequestError } from "../../../../lib/api";
import { crmErrorMessage } from "../../../../lib/crm-errors";
import { formatDateTime, relatedLabel, type ActivityRecord } from "../../../../lib/followups";
import { PERMISSIONS } from "../../../../lib/permissions";

export default function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session, can } = useAuth();
  const token = session?.access_token;
  const [activity, setActivity] = useState<ActivityRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const next = await apiFetch<ActivityRecord>(`/api/v1/activities/${id}`, { token });
    setActivity(next);
  }, [token, id]);

  useEffect(() => {
    if (!token) return;
    refresh().catch((err) =>
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load activity."),
    );
  }, [token, refresh]);

  if (!can(PERMISSIONS.ACTIVITIES_READ)) {
    return (
      <main>
        <div className="card">
          <h1>Activity</h1>
          <p className="error">You do not have permission to view activities.</p>
        </div>
      </main>
    );
  }

  if (!activity && !error) {
    return (
      <main>
        <div className="card wide">
          <LoadingState label="Loading activity" />
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card wide">
        {error ? <ErrorState message={error} /> : null}
        {activity ? (
          <>
            <div className="toolbar">
              <div>
                <p className="muted">
                  <Link href="/activities">Activities</Link>
                </p>
                <h1>{activity.content?.trim() || "Activity"}</h1>
                <p>
                  <ActivityTypeIcon type={activity.type} />
                </p>
              </div>
            </div>
            <dl className="details">
              <div>
                <dt>When</dt>
                <dd>{formatDateTime(activity.occurredAt)}</dd>
              </div>
              <div>
                <dt>Author</dt>
                <dd>{activity.author?.fullName ?? "—"}</dd>
              </div>
              <div>
                <dt>Related</dt>
                <dd>{relatedLabel(activity) || "—"}</dd>
              </div>
              <div>
                <dt>Company</dt>
                <dd>{activity.company ? <Link href={`/companies/${activity.company.id}`}>{activity.company.name}</Link> : "—"}</dd>
              </div>
              <div>
                <dt>Contact</dt>
                <dd>
                  {activity.contact ? (
                    <Link href={`/contacts/${activity.contact.id}`}>
                      {activity.contact.firstName} {activity.contact.lastName}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>Deal</dt>
                <dd>{activity.deal ? <Link href={`/deals/${activity.deal.id}`}>{activity.deal.name}</Link> : "—"}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDateTime(activity.createdAt)}</dd>
              </div>
            </dl>
          </>
        ) : null}
      </div>
    </main>
  );
}
