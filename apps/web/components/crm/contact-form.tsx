"use client";

import Link from "next/link";
import { useState } from "react";
import { apiFetch, ApiRequestError } from "../../lib/api";
import { CONTACT_SOURCES, contactName, type ContactRecord } from "../../lib/crm";
import { crmErrorMessage } from "../../lib/crm-errors";
import { CompanySelector, OwnerSelector, TagInput } from "./fields";
import { ConfirmDialog, ErrorState } from "./ui";

interface DuplicatePayload {
  existingContactId?: string;
  existingContact?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    company?: { name: string } | null;
  };
}

export function ContactForm({
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
  initial?: Partial<ContactRecord> & { company?: { id: string; name: string } | null };
  submitLabel: string;
  onSaved: (contact: ContactRecord) => void;
}) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [jobTitle, setJobTitle] = useState(initial?.jobTitle ?? "");
  const [companyId, setCompanyId] = useState(initial?.companyId ?? "");
  const [companyName, setCompanyName] = useState(initial?.company?.name ?? "");
  const [industry, setIndustry] = useState(initial?.industry ?? "");
  const [source, setSource] = useState(initial?.source ?? "");
  const [ownerId, setOwnerId] = useState(initial?.ownerId ?? currentUser.id);
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicatePayload | null>(null);

  async function submit() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const payload = {
        firstName,
        lastName,
        email: email || null,
        phone: phone || null,
        jobTitle: jobTitle || null,
        companyId: companyId || null,
        industry: industry || null,
        source: source || null,
        ownerId: canAssign ? ownerId : undefined,
        tags,
        notes: notes || null,
      };
      const contact = initial?.id
        ? await apiFetch<ContactRecord>(`/api/v1/contacts/${initial.id}`, { method: "PATCH", token, body: JSON.stringify(payload) })
        : await apiFetch<ContactRecord>("/api/v1/contacts", { method: "POST", token, body: JSON.stringify(payload) });
      onSaved(contact);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "CONTACT_DUPLICATE") {
        setDuplicate((err.data as DuplicatePayload) ?? {});
        return;
      }
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to save contact.");
    } finally {
      setPending(false);
    }
  }

  const existing = duplicate?.existingContact;

  return (
    <>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label>
          First name *
          <input value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
        </label>
        <label>
          Last name *
          <input value={lastName} onChange={(event) => setLastName(event.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Phone
          <input value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label>
          Job title
          <input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
        </label>
        <CompanySelector
          token={token}
          value={companyId}
          label={companyName}
          onChange={(id, name) => {
            setCompanyId(id);
            setCompanyName(name ?? "");
          }}
        />
        <label>
          Industry
          <input value={industry} onChange={(event) => setIndustry(event.target.value)} />
        </label>
        <label>
          Source
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="">Not set</option>
            {CONTACT_SOURCES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
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
        open={Boolean(duplicate)}
        title="Potential duplicate contact"
        cancelLabel="Cancel"
        onClose={() => setDuplicate(null)}
      >
        <p>A contact with this email already exists.</p>
        {existing ? (
          <p>
            <strong>{contactName(existing)}</strong>
            <br />
            {existing.email}
            <br />
            {existing.company?.name ?? "No company"}
          </p>
        ) : null}
        {duplicate?.existingContactId ? (
          <p>
            <Link href={`/contacts/${duplicate.existingContactId}`}>Open existing contact</Link>
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
