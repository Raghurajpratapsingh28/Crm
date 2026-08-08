"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConfirmDialog, ErrorState, LoadingState } from "../../../../components/crm/ui";
import { ActivityTimeline } from "../../../../components/followups/activity-timeline";
import { TaskPanel } from "../../../../components/followups/task-panel";
import { useAuth } from "../../../../components/auth-provider";
import { apiFetch, ApiRequestError } from "../../../../lib/api";
import { contactName, type ContactRecord } from "../../../../lib/crm";
import { crmErrorMessage } from "../../../../lib/crm-errors";
import { PERMISSIONS } from "../../../../lib/permissions";

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session, user, can } = useAuth();
  const router = useRouter();
  const token = session?.access_token;
  const [contact, setContact] = useState<ContactRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch<ContactRecord>(`/api/v1/contacts/${id}`, { token })
      .then(setContact)
      .catch((err) => setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load contact."));
  }, [token, id]);

  async function remove() {
    if (!token || pending) return;
    setPending(true);
    try {
      await apiFetch(`/api/v1/contacts/${id}`, { method: "DELETE", token });
      router.push("/contacts");
    } catch (err) {
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to delete contact.");
      setConfirm(false);
    } finally {
      setPending(false);
    }
  }

  if (!contact && !error) {
    return (
      <main>
        <div className="card wide">
          <LoadingState label="Loading contact" />
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card wide">
        {error ? <ErrorState message={error} /> : null}
        {contact ? (
          <>
            <div className="toolbar">
              <div>
                <h1>{contactName(contact)}</h1>
                <p>{contact.jobTitle || "No title"}</p>
              </div>
              <div className="actions">
                {can(PERMISSIONS.CONTACTS_UPDATE) ? <Link href={`/contacts/${contact.id}/edit`}>Edit</Link> : null}
                {can(PERMISSIONS.CONTACTS_DELETE) ? (
                  <button type="button" className="secondary" onClick={() => setConfirm(true)}>
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
            <dl className="details">
              <div>
                <dt>Email</dt>
                <dd>{contact.email ?? "—"}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{contact.phone ?? "—"}</dd>
              </div>
              <div>
                <dt>Company</dt>
                <dd>
                  {contact.company ? <Link href={`/companies/${contact.company.id}`}>{contact.company.name}</Link> : "No company"}
                </dd>
              </div>
              <div>
                <dt>Industry</dt>
                <dd>{contact.industry ?? "—"}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{contact.source ?? "—"}</dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{contact.owner?.fullName ?? "—"}</dd>
              </div>
            </dl>
            {contact.tags.length > 0 ? (
              <p>
                {contact.tags.map((tag) => (
                  <span key={tag} className="badge">
                    {tag}
                  </span>
                ))}
              </p>
            ) : null}
            <section>
              <h2>Notes</h2>
              <p>{contact.notes || "No notes."}</p>
            </section>
            <section>
              <h2>Deals</h2>
              {(contact.deals ?? []).length === 0 ? <p>No deals yet.</p> : (
                <ul className="plain-list">
                  {contact.deals?.map((deal) => (
                    <li key={deal.id}>
                      <Link href={`/deals/${deal.id}`}>{deal.name}</Link> · {deal.stage?.name ?? "Stage"}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <ActivityTimeline
              token={token}
              canCreate={can(PERMISSIONS.ACTIVITIES_CREATE)}
              filters={{ contactId: contact.id, companyId: contact.companyId ?? undefined }}
            />
            <TaskPanel
              token={token}
              currentUser={user ? { id: user.id, name: user.user_metadata?.full_name ?? user.email ?? "You" } : undefined}
              canCreate={can(PERMISSIONS.TASKS_CREATE)}
              canAssign={can(PERMISSIONS.DEALS_ASSIGN)}
              filters={{ contactId: contact.id, companyId: contact.companyId ?? undefined }}
            />
          </>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirm}
        title="Delete contact"
        confirmLabel="Delete"
        pending={pending}
        onConfirm={() => void remove()}
        onClose={() => setConfirm(false)}
      >
        <p>This cannot be undone. Related deals must be reassigned first.</p>
      </ConfirmDialog>
    </main>
  );
}
