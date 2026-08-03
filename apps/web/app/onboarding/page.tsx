"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthGate } from "../../components/auth-gate";
import { useAuth } from "../../components/auth-provider";
import { apiFetch } from "../../lib/api";

export default function OnboardingPage() {
  const router = useRouter();
  const { session, refreshProfile } = useAuth();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [currency, setCurrency] = useState("INR");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <AuthGate>
      <main>
        <div className="card">
          <h1>Create your organization</h1>
          <p>This creates your workspace, makes you ADMIN, and adds the default sales pipeline.</p>
          <form
            className="form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (pending) return;
              setError(null);
              setPending(true);
              try {
                const created = await apiFetch<{
                  id: string;
                  name: string;
                  timezone: string;
                  currency: string;
                  role: "ADMIN" | "MANAGER" | "MEMBER";
                  membershipStatus: string;
                }>("/api/v1/organizations", {
                  method: "POST",
                  token: session?.access_token,
                  body: JSON.stringify({ name, timezone, currency }),
                });
                await refreshProfile();
                if (created?.id) {
                  router.replace("/dashboard");
                }
              } catch (err) {
                setError(err instanceof Error ? err.message : "Unable to create organization.");
              } finally {
                setPending(false);
              }
            }}
          >
            <label>
              Company name
              <input required value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Timezone
              <input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
            </label>
            <label>
              Currency
              <input
                maxLength={3}
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
              />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Creating workspace…" : "Create organization"}
            </button>
          </form>
        </div>
      </main>
    </AuthGate>
  );
}
