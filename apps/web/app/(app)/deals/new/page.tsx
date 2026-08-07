"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DealForm } from "../../../../components/deals/deal-form";
import { useAuth } from "../../../../components/auth-provider";
import { PERMISSIONS } from "../../../../lib/permissions";

export default function NewDealPage() {
  const { session, user, can } = useAuth();
  const router = useRouter();

  if (!can(PERMISSIONS.DEALS_CREATE)) {
    return (
      <main>
        <div className="card">
          <h1>Create deal</h1>
          <p className="error">You do not have permission to create deals.</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card wide">
        <h1>Create deal</h1>
        <p>
          <Link href="/pipeline">Back to pipeline</Link>
        </p>
        {session?.access_token && user ? (
          <DealForm
            token={session.access_token}
            currentUser={{ id: user.id, name: user.user_metadata?.full_name ?? user.email ?? "You" }}
            canAssign={can(PERMISSIONS.DEALS_ASSIGN)}
            submitLabel="Create deal"
            onSaved={(deal) => router.push(`/deals/${deal.id}`)}
          />
        ) : null}
      </div>
    </main>
  );
}
