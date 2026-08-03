"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthGate } from "../../components/auth-gate";
import { useAuth } from "../../components/auth-provider";
import { signUp } from "../../lib/supabase/auth";

export default function SignupPage() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <AuthGate>
      <main>
        <div className="card">
          <h1>Create account</h1>
          <p>Passwords stay in Supabase. This app only stores your profile.</p>
          <form
            className="form"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setMessage(null);
              setPending(true);
              try {
                const result = await signUp({ email, password, fullName });
                if (result.session) {
                  await refreshProfile();
                  router.replace("/onboarding");
                  return;
                }
                setMessage("Check your email to confirm the account, then sign in.");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Unable to sign up.");
              } finally {
                setPending(false);
              }
            }}
          >
            <label>
              Full name
              <input
                required
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Password
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
            {message ? <p>{message}</p> : null}
            <button type="submit" disabled={pending}>
              {pending ? "Creating account…" : "Create account"}
            </button>
          </form>
          <p>
            <Link href="/login">Already have an account</Link>
          </p>
        </div>
      </main>
    </AuthGate>
  );
}
