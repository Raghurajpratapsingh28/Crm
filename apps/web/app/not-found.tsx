import Link from "next/link";

export const dynamic = "force-static";

export default function NotFound() {
  return (
    <main>
      <div className="card">
        <h1>Not found</h1>
        <p>That page does not exist.</p>
        <p>
          <Link href="/">Back home</Link>
        </p>
      </div>
    </main>
  );
}
