"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConfirmDialog, ErrorState, LoadingState } from "../../../../components/crm/ui";
import { ActivityTimeline } from "../../../../components/followups/activity-timeline";
import { TaskPanel } from "../../../../components/followups/task-panel";
import { useAuth } from "../../../../components/auth-provider";
import { apiFetch, ApiRequestError } from "../../../../lib/api";
import { contactName, formatEmployees, type CompanyRecord } from "../../../../lib/crm";
import { crmErrorMessage } from "../../../../lib/crm-errors";
import { PERMISSIONS } from "../../../../lib/permissions";

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session, user, can } = useAuth();
  const router = useRouter();
  const token = session?.access_token;
  const [company, setCompany] = useState<CompanyRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch<CompanyRecord>(`/api/v1/companies/${id}`, { token })
      .then(setCompany)
      .catch((err) => setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load company."));
  }, [token, id]);

  async function remove() {
    if (!token || pending) return;
    setPending(true);
    try {
      await apiFetch(`/api/v1/companies/${id}`, { method: "DELETE", token });
      router.push("/companies");
    } catch (err) {
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to delete company.");
      setConfirm(false);
    } finally {
      setPending(false);
    }
  }

  if (!company && !error) {
    return (
      <main>
        <div className="card wide">
          <LoadingState label="Loading company" />
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card wide">
        {error ? <ErrorState message={error} /> : null}
        {company ? (
          <>
            <div className="toolbar">
              <div>
                <h1>{company.name}</h1>
                <p>
                  {[company.industry, company.employeeCount != null ? `${formatEmployees(company.employeeCount)} employees` : null]
                    .filter(Boolean)
                    .join(" · ") || "No industry set"}
                </p>
                <p>
                  Owner: {company.owner?.fullName ?? "Unassigned"}
                  {company.website ? (
                    <>
                      {" · "}
                      <a href={company.website} target="_blank" rel="noreferrer">
                        {company.website.replace(/^https?:\/\//, "")}
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="actions">
                {can(PERMISSIONS.COMPANIES_UPDATE) ? <Link href={`/companies/${company.id}/edit`}>Edit</Link> : null}
                {can(PERMISSIONS.COMPANIES_DELETE) ? (
                  <button type="button" className="secondary" onClick={() => setConfirm(true)}>
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
            {company.tags.length > 0 ? (
              <p>
                {company.tags.map((tag) => (
                  <span key={tag} className="badge">
                    {tag}
                  </span>
                ))}
              </p>
            ) : null}

            <section>
              <div className="toolbar">
                <h2>Contacts</h2>
                {can(PERMISSIONS.CONTACTS_CREATE) ? <Link href={`/contacts/new?companyId=${company.id}`}>Add contact</Link> : null}
              </div>
              {(company.contacts ?? []).length === 0 ? <p>No contacts linked yet.</p> : null}
              <ul className="plain-list">
                {(company.contacts ?? []).map((contact) => (
                  <li key={contact.id}>
                    <Link href={`/contacts/${contact.id}`}>{contactName(contact)}</Link>
                    <span className="muted">
                      {" "}
                      {contact.jobTitle ?? "No title"} · {contact.email ?? "No email"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2>Deals</h2>
              <p>Open pipeline value: {company.openPipelineValue ?? 0}</p>
              {(company.deals ?? []).length === 0 ? <p>No deals yet.</p> : (
                <ul className="plain-list">
                  {company.deals?.map((deal) => (
                    <li key={deal.id}>
                      <Link href={`/deals/${deal.id}`}>{deal.name}</Link> · {deal.stage?.name ?? "Stage"} · {deal.amount ?? "—"}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <ActivityTimeline
              token={token}
              canCreate={can(PERMISSIONS.ACTIVITIES_CREATE)}
              filters={{ companyId: company.id }}
            />
            <TaskPanel
              token={token}
              currentUser={user ? { id: user.id, name: user.user_metadata?.full_name ?? user.email ?? "You" } : undefined}
              canCreate={can(PERMISSIONS.TASKS_CREATE)}
              canAssign={can(PERMISSIONS.DEALS_ASSIGN)}
              filters={{ companyId: company.id }}
            />

            <section>
              <h2>Notes</h2>
              <p>{company.notes || "No notes."}</p>
            </section>
          </>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirm}
        title="Delete company"
        confirmLabel="Delete"
        pending={pending}
        onConfirm={() => void remove()}
        onClose={() => setConfirm(false)}
      >
        <p>This cannot be undone. Related contacts or deals must be reassigned first.</p>
      </ConfirmDialog>
    </main>
  );
}
