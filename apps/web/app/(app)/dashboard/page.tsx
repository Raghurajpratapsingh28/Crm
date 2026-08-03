"use client";

import { useAuth } from "../../../components/auth-provider";

export default function Page() {
  const { organization, user } = useAuth();

  return (
    <main>
      <div className="card">
        <h1>Dashboard</h1>
        <p>
          Signed in as {user?.email ?? "you"}
          {organization ? ` · ${organization.name} (${organization.role})` : ""}.
        </p>
        <p>Pipeline, contacts, and deals will load here next.</p>
      </div>
    </main>
  );
}
