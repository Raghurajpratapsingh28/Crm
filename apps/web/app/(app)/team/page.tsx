"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../../../components/auth-provider";
import { apiFetch, ApiRequestError } from "../../../lib/api";
import { PERMISSIONS } from "../../../lib/permissions";
import { teamErrorMessage } from "../../../lib/team-errors";

interface TeamMember {
  id: string;
  fullName: string;
  email: string;
  role: string;
  department: string | null;
  status: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  department: string | null;
  status: string;
  expiresAt: string;
}

interface ListResponse<T> {
  items: T[];
  total: number;
}

export default function TeamPage() {
  const { session, can } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const token = session?.access_token;
  const canInvite = can(PERMISSIONS.USERS_INVITE);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (search) query.set("search", search);
      if (role) query.set("role", role);
      if (department) query.set("department", department);
      if (status) query.set("status", status);
      const team = await apiFetch<ListResponse<TeamMember>>(`/api/v1/team?${query.toString()}`, { token });
      setMembers(team.items);
      if (canInvite) {
        const pending = await apiFetch<ListResponse<Invitation>>("/api/v1/team/invitations?status=pending", { token });
        setInvitations(pending.items);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? teamErrorMessage(err.code, err.message) : "Unable to load the team.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, role, department, status, canInvite]);

  async function act(path: string, id: string) {
    if (!token) return;
    setBusyId(id);
    setError(null);
    try {
      await apiFetch(path, { method: "POST", token });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? teamErrorMessage(err.code, err.message) : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main>
      <div className="card wide">
        <div className="toolbar">
          <div>
            <h1>Team</h1>
            <p>Members of the current organization.</p>
          </div>
          {canInvite ? (
            <Link href="/team/invite">Invite member</Link>
          ) : null}
        </div>

        <form
          className="filters"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <input placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="">All roles</option>
            <option value="ADMIN">ADMIN</option>
            <option value="MANAGER">MANAGER</option>
            <option value="MEMBER">MEMBER</option>
          </select>
          <select value={department} onChange={(event) => setDepartment(event.target.value)}>
            <option value="">All departments</option>
            <option value="SALES">SALES</option>
            <option value="MARKETING">MARKETING</option>
            <option value="MANAGEMENT">MANAGEMENT</option>
            <option value="OTHER">OTHER</option>
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INVITED">INVITED</option>
            <option value="DEACTIVATED">DEACTIVATED</option>
          </select>
          <button type="submit">Apply</button>
        </form>

        {loading ? <p>Loading team…</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {!loading && members.length === 0 ? (
          <p>{search || role || status || department ? "No team members match your search." : "No team members found. Invite your first teammate."}</p>
        ) : null}

        {members.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Department</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>
                    <Link href={`/team/${member.id}`}>{member.fullName}</Link>
                  </td>
                  <td>{member.email}</td>
                  <td>{member.role}</td>
                  <td>{member.department ?? "—"}</td>
                  <td>
                    <span className="badge">{member.status}</span>
                  </td>
                  <td>
                    <Link href={`/team/${member.id}`}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {canInvite ? (
          <>
            <h2>Pending invitations</h2>
            {invitations.length === 0 ? <p>No pending invitations.</p> : null}
            {invitations.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((invitation) => (
                    <tr key={invitation.id}>
                      <td>{invitation.email}</td>
                      <td>{invitation.role}</td>
                      <td>{invitation.department ?? "—"}</td>
                      <td>{new Date(invitation.expiresAt).toLocaleDateString()}</td>
                      <td className="actions">
                        <button
                          type="button"
                          className="secondary"
                          disabled={busyId === invitation.id}
                          onClick={() => void act(`/api/v1/team/invitations/${invitation.id}/resend`, invitation.id)}
                        >
                          {busyId === invitation.id ? "Working…" : "Resend"}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busyId === invitation.id}
                          onClick={() => void act(`/api/v1/team/invitations/${invitation.id}/cancel`, invitation.id)}
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
