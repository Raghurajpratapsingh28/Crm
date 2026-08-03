"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updatePassword } from "../../lib/supabase/auth";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <main>
      <div className="card">
        <h1>Choose a new password</h1>
        <p>This uses the Supabase recovery session from your email link.</p>
        <form
          className="form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setPending(true);
            try {
              await updatePassword(password);
              router.replace("/dashboard");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Unable to update password.");
            } finally {
              setPending(false);
            }
          }}
        >
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </main>
  );
}
