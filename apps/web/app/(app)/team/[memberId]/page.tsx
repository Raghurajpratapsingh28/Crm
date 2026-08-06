"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../../../../components/auth-provider";
import { apiFetch, ApiRequestError } from "../../../../lib/api";
import { PERMISSIONS } from "../../../../lib/permissions";
import { teamErrorMessage } from "../../../../lib/team-errors";

interface MemberDetail {
  id: string;
  fullName: string;
  email: string;
  role: string;
  department: string | null;
  status: string;
  createdAt: string;
  assigned: { deals: number; contacts: number; tasks: number };
  recentActivity: { id: string; type: string; content: string | null; occurredAt: string }[];
}

export default function MemberDetailPage() {
  const params = useParams<{ memberId: string }>();
  const { session, can } = useAuth();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [role, setRole] = useState("MEMBER");
  const [department, setDepartment] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"role" | "deactivate" | "reactivate" | null>(null);

  const token = session?.access_token;

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<MemberDetail>(`/api/v1/team/${params.memberId}`, { token });
      setMember(data);
      setRole(data.role);
      setDepartment(data.department ?? "");
    } catch (err) {
      setError(err instanceof ApiRequestError ? teamErrorMessage(err.code === "NOT_FOUND" ? "MEMBER_NOT_FOUND" : err.code, err.message) : "Unable to load member.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, params.memberId]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? teamErrorMessage(err.code, err.message) : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <div className="card wide">
        <p>
          <Link href="/team">Back to team</Link>
        </p>
        <h1>Member</h1>
        {loading ? <p>Loading member…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {member ? (
          <>
            <p>
              <strong>{member.fullName}</strong>
              <br />
              {member.email}
            </p>
            <p>
              Role: {member.role} · Department: {member.department ?? "—"} · Status: {member.status}
              <br />
              Joined: {new Date(member.createdAt).toLocaleDateString()}
            </p>
            <p>
              Assigned deals: {member.assigned.deals} · Contacts: {member.assigned.contacts} · Tasks: {member.assigned.tasks}
            </p>

            {can(PERMISSIONS.USERS_UPDATE) ? (
              <div className="form">
                <label>
                  Role
                  <select value={role} onChange={(event) => setRole(event.target.value)}>
                    <option value="ADMIN">ADMIN</option>
                    <option value="MANAGER">MANAGER</option>
                    <option value="MEMBER">MEMBER</option>
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
                <div className="actions">
                  <button type="button" disabled={busy} onClick={() => setConfirm("role")}>
                    Save role / department
                  </button>
                  {member.status === "ACTIVE" && can(PERMISSIONS.USERS_DEACTIVATE) ? (
                    <button type="button" className="secondary" disabled={busy} onClick={() => setConfirm("deactivate")}>
                      Deactivate
                    </button>
                  ) : null}
                  {member.status === "DEACTIVATED" ? (
                    <button type="button" className="secondary" disabled={busy} onClick={() => setConfirm("reactivate")}>
                      Reactivate
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {confirm ? (
              <div className="card">
                <p>
                  {confirm === "role"
                    ? `Change this member to ${role}${department ? ` / ${department}` : ""}?`
                    : confirm === "deactivate"
                      ? "Deactivate this member? They will lose access. Records stay intact."
                      : "Reactivate this member?"}
                </p>
                <div className="actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        if (!token) return;
                        if (confirm === "role") {
                          await apiFetch(`/api/v1/team/${member.id}`, {
                            method: "PATCH",
                            token,
                            body: JSON.stringify({ role, department: department || null }),
                          });
                        } else if (confirm === "deactivate") {
                          await apiFetch(`/api/v1/team/${member.id}/deactivate`, { method: "POST", token });
                        } else {
                          await apiFetch(`/api/v1/team/${member.id}/reactivate`, { method: "POST", token });
                        }
                      })
                    }
                  >
                    {busy ? "Working…" : "Confirm"}
                  </button>
                  <button type="button" className="secondary" onClick={() => setConfirm(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            <h2>Recent activity</h2>
            {member.recentActivity.length === 0 ? <p>No activity yet.</p> : null}
            <ul>
              {member.recentActivity.map((row) => (
                <li key={row.id}>
                  {row.type} · {new Date(row.occurredAt).toLocaleString()}
                  {row.content ? ` — ${row.content}` : ""}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </main>
  );
}
