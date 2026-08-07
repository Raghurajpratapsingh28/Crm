"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ContactForm } from "../../../../components/crm/contact-form";
import { useAuth } from "../../../../components/auth-provider";
import { apiFetch } from "../../../../lib/api";
import type { CompanyRecord } from "../../../../lib/crm";
import { PERMISSIONS } from "../../../../lib/permissions";

export default function NewContactPage() {
  return (
    <Suspense fallback={<main><div className="card"><p>Loading…</p></div></main>}>
      <NewContactForm />
    </Suspense>
  );
}

function NewContactForm() {
  const { session, user, can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const companyId = params.get("companyId") ?? "";
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    if (!session?.access_token || !companyId) return;
    apiFetch<CompanyRecord>(`/api/v1/companies/${companyId}`, { token: session.access_token })
      .then((company) => setCompanyName(company.name))
      .catch(() => setCompanyName(""));
  }, [session?.access_token, companyId]);

  if (!can(PERMISSIONS.CONTACTS_CREATE)) {
    return (
      <main>
        <div className="card">
          <h1>Add contact</h1>
          <p className="error">You do not have permission to create contacts.</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card">
        <h1>Add contact</h1>
        <p>
          <Link href="/contacts">Back to contacts</Link>
        </p>
        {session?.access_token && user ? (
          <ContactForm
            token={session.access_token}
            currentUser={{ id: user.id, name: user.user_metadata?.full_name ?? user.email ?? "You" }}
            canAssign={can(PERMISSIONS.USERS_READ)}
            initial={{
              companyId,
              company: companyId ? { id: companyId, name: companyName || "Selected company", industry: null } : null,
            }}
            submitLabel="Create contact"
            onSaved={(contact) => router.push(`/contacts/${contact.id}`)}
          />
        ) : null}
      </div>
    </main>
  );
}
