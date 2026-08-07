"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CompanyForm } from "../../../../../components/crm/company-form";
import { ErrorState, LoadingState } from "../../../../../components/crm/ui";
import { useAuth } from "../../../../../components/auth-provider";
import { apiFetch, ApiRequestError } from "../../../../../lib/api";
import type { CompanyRecord } from "../../../../../lib/crm";
import { crmErrorMessage } from "../../../../../lib/crm-errors";
import { PERMISSIONS } from "../../../../../lib/permissions";

export default function EditCompanyPage() {
  const { id } = useParams<{ id: string }>();
  const { session, user, can } = useAuth();
  const router = useRouter();
  const [company, setCompany] = useState<CompanyRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token) return;
    apiFetch<CompanyRecord>(`/api/v1/companies/${id}`, { token: session.access_token })
      .then(setCompany)
      .catch((err) => setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load company."));
  }, [session?.access_token, id]);

  if (!can(PERMISSIONS.COMPANIES_UPDATE)) {
    return (
      <main>
        <div className="card">
          <h1>Edit company</h1>
          <p className="error">You do not have permission to edit companies.</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card">
        <h1>Edit company</h1>
        <p>
          <Link href={`/companies/${id}`}>Back to company</Link>
        </p>
        {error ? <ErrorState message={error} /> : null}
        {!company ? <LoadingState label="Loading company" /> : null}
        {company && session?.access_token && user ? (
          <CompanyForm
            token={session.access_token}
            currentUser={{ id: user.id, name: user.user_metadata?.full_name ?? user.email ?? "You" }}
            canAssign={can(PERMISSIONS.USERS_READ)}
            initial={company}
            submitLabel="Save company"
            onSaved={(saved) => router.push(`/companies/${saved.id}`)}
          />
        ) : null}
      </div>
    </main>
  );
}
