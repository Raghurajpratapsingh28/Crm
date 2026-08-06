"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "../../../../components/auth-provider";
import { apiFetch, ApiRequestError } from "../../../../lib/api";
import { PERMISSIONS } from "../../../../lib/permissions";
import { teamErrorMessage } from "../../../../lib/team-errors";

export default function InvitePage() {
  const { session, can } = useAuth();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [department, setDepartment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (!can(PERMISSIONS.USERS_INVITE)) {
    return (
      <main>
        <div className="card">
          <h1>Invite member</h1>
          <p className="error">You do not have permission to invite teammates.</p>
          <p>
            <Link href="/team">Back to team</Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card">
        <h1>Invite member</h1>
        <p>Send an email invitation. The recipient must sign in with the same address.</p>
        {sent ? (
          <>
            <p>Invitation sent successfully.</p>
            <p>
              <Link href="/team">Back to team</Link>
            </p>
          </>
        ) : (
          <form
            className="form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!session?.access_token || pending) return;
              setPending(true);
              setError(null);
              try {
                await apiFetch("/api/v1/team/invitations", {
                  method: "POST",
                  token: session.access_token,
                  body: JSON.stringify({ email, role, department: department || undefined }),
                });
                setSent(true);
              } catch (err) {
                setError(err instanceof ApiRequestError ? teamErrorMessage(err.code, err.message) : "Unable to send invitation.");
              } finally {
                setPending(false);
              }
            }}
          >
            <label>
              Email
              <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              Role
              <select value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="MEMBER">MEMBER</option>
                <option value="MANAGER">MANAGER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </label>
            <label>
              Department
              <select value={department} onChange={(event) => setDepartment(event.target.value)}>
                <option value="">None</option>
                <option value="SALES">SALES</option>
                <option value="MARKETING">MARKETING</option>
                <option value="MANAGEMENT">MANAGEMENT</option>
                <option value="OTHER">OTHER</option>
              </select>
            </label>
            {error ? <p className="error">{error}</p> : null}
            <button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send invitation"}
            </button>
          </form>
        )}
        <p>
          <Link href="/team">Back to team</Link>
        </p>
      </div>
    </main>
  );
}
