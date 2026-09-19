export default function LoginPage() {
  return (
    <main>
      <div className="card">
        <h1>Sign in</h1>
        <p>
          Wire <code>createBrowserSupabase()</code> here for email magic-link or
          password sign-in. After a session exists, call{" "}
          <code>POST /auth/onboard</code> once, then send the access token on
          every API request.
        </p>
      </div>
    </main>
  );
}
