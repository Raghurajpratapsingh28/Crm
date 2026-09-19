export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <main>
      <div className="card">
        <h1>{title}</h1>
        <p>{note}</p>
      </div>
    </main>
  );
}
