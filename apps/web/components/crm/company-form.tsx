"use client";

import { useState } from "react";
import { apiFetch, ApiRequestError } from "../../lib/api";
import { crmErrorMessage } from "../../lib/crm-errors";
import type { CompanyRecord, CompanySummary } from "../../lib/crm";
import { OwnerSelector, TagInput } from "./fields";
import { ConfirmDialog, ErrorState } from "./ui";

export function CompanyForm({
  token,
  currentUser,
  canAssign,
  initial,
  submitLabel,
  onSaved,
}: {
  token: string;
  currentUser: { id: string; name: string };
  canAssign: boolean;
  initial?: Partial<CompanyRecord>;
  submitLabel: string;
  onSaved: (company: CompanyRecord) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [industry, setIndustry] = useState(initial?.industry ?? "");
  const [employeeCount, setEmployeeCount] = useState(initial?.employeeCount?.toString() ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [ownerId, setOwnerId] = useState(initial?.ownerId ?? currentUser.id);
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<CompanySummary[] | null>(null);

  async function submit(ignoreWarning = false) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (!initial?.id && !ignoreWarning) {
        const suggested = await apiFetch<CompanySummary[]>(`/api/v1/companies/duplicates?name=${encodeURIComponent(name)}`, { token });
        if (suggested.length > 0) {
          setMatches(suggested);
          setPending(false);
          return;
        }
      }
      const payload = {
        name,
        industry: industry || null,
        employeeCount: employeeCount === "" ? null : Number(employeeCount),
        website: website || null,
        ownerId: canAssign ? ownerId : undefined,
        tags,
        notes: notes || null,
      };
      const company = initial?.id
        ? await apiFetch<CompanyRecord>(`/api/v1/companies/${initial.id}`, { method: "PATCH", token, body: JSON.stringify(payload) })
        : await apiFetch<CompanyRecord>("/api/v1/companies", { method: "POST", token, body: JSON.stringify(payload) });
      onSaved(company);
    } catch (err) {
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to save company.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(false);
        }}
      >
        <label>
          Company name *
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Industry
          <input value={industry} onChange={(event) => setIndustry(event.target.value)} />
        </label>
        <label>
          Employee count
          <input
            type="number"
            min={0}
            value={employeeCount}
            onChange={(event) => setEmployeeCount(event.target.value)}
          />
        </label>
        <label>
          Website
          <input value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://" />
        </label>
        <OwnerSelector token={token} value={ownerId} onChange={setOwnerId} canList={canAssign} currentUser={currentUser} />
        <TagInput value={tags} onChange={setTags} />
        <label>
          Notes
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
        </label>
        {error ? <ErrorState message={error} /> : null}
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </form>
      <ConfirmDialog
        open={Boolean(matches?.length)}
        title="Potential duplicate"
        confirmLabel="Create anyway"
        pending={pending}
        onConfirm={() => {
          setMatches(null);
          void submit(true);
        }}
        onClose={() => setMatches(null)}
      >
        <p>A similar company already exists.</p>
        <ul>
          {matches?.map((match) => (
            <li key={match.id}>{match.name}</li>
          ))}
        </ul>
      </ConfirmDialog>
    </>
  );
}
