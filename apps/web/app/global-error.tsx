"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main>
          <div className="card">
            <h1>Something went wrong</h1>
            <p>Please try again.</p>
            <button type="button" className="linkish" onClick={() => reset()}>
              Retry
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
