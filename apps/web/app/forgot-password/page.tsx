"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthGate } from "../../components/auth-gate";
import { resetPassword } from "../../lib/supabase/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <AuthGate>
      <main>
        <div className="card">
          <h1>Reset password</h1>
          <p>Supabase will email a recovery link. No reset tokens are stored here.</p>
          <form
            className="form"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setMessage(null);
              setPending(true);
              try {
                await resetPassword(email);
                setMessage("If that email exists, a reset link is on its way.");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Unable to send reset email.");
              } finally {
                setPending(false);
              }
            }}
          >
            <label>
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            {error ? <p className="error">{error}</p> : null}
            {message ? <p>{message}</p> : null}
            <button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send reset link"}
            </button>
          </form>
          <p>
            <Link href="/login">Back to sign in</Link>
          </p>
        </div>
      </main>
    </AuthGate>
  );
}
