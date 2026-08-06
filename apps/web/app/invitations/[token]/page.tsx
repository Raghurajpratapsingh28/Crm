"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../../../components/auth-provider";
import { apiFetch, ApiRequestError } from "../../../lib/api";
import { teamErrorMessage } from "../../../lib/team-errors";

interface InvitationPreview {
  status: "VALID" | "EXPIRED" | "CANCELLED" | "ALREADY_ACCEPTED" | "ACCEPTED" | "INVALID";
  organizationName?: string;
  inviterName?: string;
  role?: string;
  department?: string | null;
  expiresAt?: string;
  email?: string;
}

export default function InvitationPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { session, isAuthenticated, user, refreshProfile } = useAuth();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<InvitationPreview>(`/api/v1/team/invitations/${params.token}`)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setPreview({ status: "INVALID" });
          setError(err instanceof ApiRequestError ? teamErrorMessage(err.code, err.message) : "Unable to load invitation.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  const next = `/invitations/${params.token}`;
  const emailQuery = preview?.email ? `&email=${encodeURIComponent(preview.email)}` : "";

  return (
    <main>
      <div className="card">
        <h1>Invitation</h1>
        {loading ? <p>Checking invitation…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {preview && !loading ? (
          <>
            <p>Status: {preview.status === "ACCEPTED" ? "ALREADY_ACCEPTED" : preview.status}</p>
            {preview.organizationName ? (
              <>
                <p>
                  Join <strong>{preview.organizationName}</strong>
                  {preview.inviterName ? `, invited by ${preview.inviterName}` : ""}.
                </p>
                <p>
                  Role: {preview.role ?? "—"}
                  {preview.department ? ` · ${preview.department}` : ""}
                </p>
                {preview.expiresAt ? <p>Expires {new Date(preview.expiresAt).toLocaleString()}.</p> : null}
                {preview.email ? <p>This invitation is for {preview.email}.</p> : null}
              </>
            ) : null}

            {preview.status === "VALID" ? (
              isAuthenticated ? (
                <button
                  className="linkish"
                  type="button"
                  disabled={pending}
                  onClick={async () => {
                    if (!session?.access_token) return;
                    setPending(true);
                    setError(null);
                    try {
                      await apiFetch(`/api/v1/team/invitations/${params.token}/accept`, {
                        method: "POST",
                        token: session.access_token,
                      });
                      await refreshProfile();
                      router.replace("/dashboard");
                    } catch (err) {
                      setError(err instanceof ApiRequestError ? teamErrorMessage(err.code, err.message) : "Unable to accept invitation.");
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  {pending ? "Joining…" : `Accept as ${user?.email ?? "signed-in user"}`}
                </button>
              ) : (
                <p>
                  <Link href={`/login?next=${encodeURIComponent(next)}${emailQuery}`}>Sign in to accept</Link>
                  {" · "}
                  <Link href={`/signup?next=${encodeURIComponent(next)}${emailQuery}`}>Create an account</Link>
                </p>
              )
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
