import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <div className="card">
        <h1>Company CRM</h1>
        <p>
          Next.js talks to Supabase for auth, then to the Express API with a
          Bearer token. Billing is Razorpay or Stripe. Background work is the Go
          worker.
        </p>
        <p>
          <Link href="/login">Sign in</Link>
          {" · "}
          <Link href="/dashboard">Dashboard</Link>
        </p>
      </div>
    </main>
  );
}
