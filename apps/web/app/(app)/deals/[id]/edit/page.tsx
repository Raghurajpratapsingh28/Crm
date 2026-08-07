"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DealForm } from "../../../../../components/deals/deal-form";
import { ErrorState, LoadingState } from "../../../../../components/crm/ui";
import { useAuth } from "../../../../../components/auth-provider";
import { apiFetch, ApiRequestError } from "../../../../../lib/api";
import type { DealRecord } from "../../../../../lib/deals";
import { crmErrorMessage } from "../../../../../lib/crm-errors";
import { PERMISSIONS } from "../../../../../lib/permissions";

export default function EditDealPage() {
  const { id } = useParams<{ id: string }>();
  const { session, user, can } = useAuth();
  const router = useRouter();
  const [deal, setDeal] = useState<DealRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token) return;
    apiFetch<DealRecord>(`/api/v1/deals/${id}`, { token: session.access_token })
      .then(setDeal)
      .catch((err) => setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load deal."));
  }, [session?.access_token, id]);

  if (!can(PERMISSIONS.DEALS_UPDATE)) {
    return (
      <main>
        <div className="card">
          <h1>Edit deal</h1>
          <p className="error">You do not have permission to edit deals.</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card wide">
        <h1>Edit deal</h1>
        <p>
          <Link href={`/deals/${id}`}>Back to deal</Link>
        </p>
        {error ? <ErrorState message={error} /> : null}
        {!deal ? <LoadingState label="Loading deal" /> : null}
        {deal && session?.access_token && user ? (
          <DealForm
            token={session.access_token}
            currentUser={{ id: user.id, name: user.user_metadata?.full_name ?? user.email ?? "You" }}
            canAssign={can(PERMISSIONS.DEALS_ASSIGN)}
            initial={deal}
            submitLabel="Save deal"
            onSaved={(saved) => router.push(`/deals/${saved.id}`)}
          />
        ) : null}
      </div>
    </main>
  );
}
