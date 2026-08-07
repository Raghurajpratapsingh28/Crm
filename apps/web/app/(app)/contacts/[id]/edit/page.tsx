"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ContactForm } from "../../../../../components/crm/contact-form";
import { ErrorState, LoadingState } from "../../../../../components/crm/ui";
import { useAuth } from "../../../../../components/auth-provider";
import { apiFetch, ApiRequestError } from "../../../../../lib/api";
import type { ContactRecord } from "../../../../../lib/crm";
import { crmErrorMessage } from "../../../../../lib/crm-errors";
import { PERMISSIONS } from "../../../../../lib/permissions";

export default function EditContactPage() {
  const { id } = useParams<{ id: string }>();
  const { session, user, can } = useAuth();
  const router = useRouter();
  const [contact, setContact] = useState<ContactRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token) return;
    apiFetch<ContactRecord>(`/api/v1/contacts/${id}`, { token: session.access_token })
      .then(setContact)
      .catch((err) => setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load contact."));
  }, [session?.access_token, id]);

  if (!can(PERMISSIONS.CONTACTS_UPDATE)) {
    return (
      <main>
        <div className="card">
          <h1>Edit contact</h1>
          <p className="error">You do not have permission to edit contacts.</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card">
        <h1>Edit contact</h1>
        <p>
          <Link href={`/contacts/${id}`}>Back to contact</Link>
        </p>
        {error ? <ErrorState message={error} /> : null}
        {!contact ? <LoadingState label="Loading contact" /> : null}
        {contact && session?.access_token && user ? (
          <ContactForm
            token={session.access_token}
            currentUser={{ id: user.id, name: user.user_metadata?.full_name ?? user.email ?? "You" }}
            canAssign={can(PERMISSIONS.USERS_READ)}
            initial={contact}
            submitLabel="Save contact"
            onSaved={(saved) => router.push(`/contacts/${saved.id}`)}
          />
        ) : null}
      </div>
    </main>
  );
}
