"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthGate } from "../../components/auth-gate";
import { useAuth } from "../../components/auth-provider";
import { signIn } from "../../lib/supabase/auth";

export default function LoginPage() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <AuthGate>
      <main>
        <div className="card">
          <h1>Sign in</h1>
          <p>Use the email and password from your Supabase account.</p>
          <form
            className="form"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setPending(true);
              try {
                await signIn({ email, password });
                await refreshProfile();
                router.replace("/dashboard");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Unable to sign in.");
              } finally {
                setPending(false);
              }
            }}
          >
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
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <button type="submit" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p>
            <Link href="/signup">Create an account</Link>
            {" · "}
            <Link href="/forgot-password">Forgot password</Link>
          </p>
        </div>
      </main>
    </AuthGate>
  );
}
