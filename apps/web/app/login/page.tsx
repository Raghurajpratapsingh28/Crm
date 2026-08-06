"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthGate } from "../../components/auth-gate";
import { useAuth } from "../../components/auth-provider";
import { signIn } from "../../lib/supabase/auth";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshProfile } = useAuth();
  const next = searchParams.get("next");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
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
                router.replace(next?.startsWith("/") ? next : "/dashboard");
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
            <Link href={next ? `/signup?next=${encodeURIComponent(next)}&email=${encodeURIComponent(email)}` : "/signup"}>
              Create an account
            </Link>
            {" · "}
            <Link href="/forgot-password">Forgot password</Link>
          </p>
        </div>
      </main>
    </AuthGate>
  );
}
