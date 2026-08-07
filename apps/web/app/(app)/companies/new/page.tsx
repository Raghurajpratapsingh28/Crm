"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CompanyForm } from "../../../../components/crm/company-form";
import { useAuth } from "../../../../components/auth-provider";
import { PERMISSIONS } from "../../../../lib/permissions";

export default function NewCompanyPage() {
  const { session, user, can } = useAuth();
  const router = useRouter();

  if (!can(PERMISSIONS.COMPANIES_CREATE)) {
    return (
      <main>
        <div className="card">
          <h1>Add company</h1>
          <p className="error">You do not have permission to create companies.</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card">
        <h1>Add company</h1>
        <p>
          <Link href="/companies">Back to companies</Link>
        </p>
        {session?.access_token && user ? (
          <CompanyForm
            token={session.access_token}
            currentUser={{ id: user.id, name: user.user_metadata?.full_name ?? user.email ?? "You" }}
            canAssign={can(PERMISSIONS.USERS_READ)}
            submitLabel="Create company"
            onSaved={(company) => router.push(`/companies/${company.id}`)}
          />
        ) : null}
      </div>
    </main>
  );
}
