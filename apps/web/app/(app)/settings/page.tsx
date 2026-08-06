"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../../components/auth-provider";
import { apiFetch, ApiRequestError } from "../../../lib/api";
import { PERMISSIONS } from "../../../lib/permissions";
import { teamErrorMessage } from "../../../lib/team-errors";

interface OrganizationSettings {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  role: string;
  department: string | null;
  membershipStatus: string;
}

export default function SettingsPage() {
  const { session, can } = useAuth();
  const editable = can(PERMISSIONS.ORGANIZATION_UPDATE);
  const [org, setOrg] = useState<OrganizationSettings | null>(null);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    apiFetch<OrganizationSettings>("/api/v1/organizations/current", { token })
      .then((data) => {
        if (cancelled) return;
        setOrg(data);
        setName(data.name);
        setTimezone(data.timezone);
        setCurrency(data.currency);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiRequestError ? teamErrorMessage(err.code, err.message) : "Unable to load settings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  return (
    <main>
      <div className="card">
        <h1>Settings</h1>
        <p>Workspace details for the authenticated organization.</p>
        {loading ? <p>Loading organization…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {org ? (
          <form
            className="form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!editable || !session?.access_token) return;
              setSaving(true);
              setError(null);
              setSaved(false);
              try {
                const updated = await apiFetch<OrganizationSettings>("/api/v1/organizations/current", {
                  method: "PATCH",
                  token: session.access_token,
                  body: JSON.stringify({ name, timezone, currency }),
                });
                setOrg(updated);
                setSaved(true);
              } catch (err) {
                setError(err instanceof ApiRequestError ? teamErrorMessage(err.code, err.message) : "Unable to save.");
              } finally {
                setSaving(false);
              }
            }}
          >
            <label>
              Organization name
              <input value={name} onChange={(event) => setName(event.target.value)} disabled={!editable} required />
            </label>
            <label>
              Timezone
              <input value={timezone} onChange={(event) => setTimezone(event.target.value)} disabled={!editable} />
            </label>
            <label>
              Currency
              <input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} disabled={!editable} maxLength={3} />
            </label>
            <p>
              Organization ID: <code>{org.id}</code>
            </p>
            <p>
              Your role: {org.role}
              {org.department ? ` · ${org.department}` : ""}
            </p>
            {saved ? <p>Saved.</p> : null}
            {editable ? (
              <button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            ) : (
              <p>Only an admin can change these settings.</p>
            )}
          </form>
        ) : null}
      </div>
    </main>
  );
}
