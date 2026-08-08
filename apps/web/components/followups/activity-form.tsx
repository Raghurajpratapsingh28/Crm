"use client";

import { useState } from "react";
import { apiFetch, ApiRequestError } from "../../lib/api";
import { crmErrorMessage } from "../../lib/crm-errors";
import { ACTIVITY_TYPES, fromDateTimeLocal, type ActivityRecord } from "../../lib/followups";
import { ErrorState } from "../crm/ui";
import { RelationFields, type FollowupRelations } from "./relation-fields";

export function ActivityForm({
  token,
  submitLabel = "Log activity",
  defaults,
  onSaved,
}: {
  token: string;
  submitLabel?: string;
  defaults?: { dealId?: string; contactId?: string; companyId?: string };
  onSaved: (activity: ActivityRecord) => void;
}) {
  const [type, setType] = useState("CALL");
  const [content, setContent] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [followTitle, setFollowTitle] = useState("");
  const [followDue, setFollowDue] = useState("");
  const [relations, setRelations] = useState<FollowupRelations>({
    companyId: defaults?.companyId,
    contactId: defaults?.contactId,
    dealId: defaults?.dealId,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const activity = await apiFetch<ActivityRecord>("/api/v1/activities", {
        method: "POST",
        token,
        body: JSON.stringify({
          type,
          content,
          occurredAt: fromDateTimeLocal(occurredAt),
          dealId: relations.dealId,
          contactId: relations.contactId,
          companyId: relations.companyId,
          followUp: followUp ? { title: followTitle || `Follow up: ${content}`, dueDate: fromDateTimeLocal(followDue) } : undefined,
        }),
      });
      onSaved(activity);
    } catch (err) {
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to save activity.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label>
        Activity type
        <select value={type} onChange={(event) => setType(event.target.value)}>
          {ACTIVITY_TYPES.filter((item) => item !== "STATUS_CHANGE").map((item) => (
            <option key={item} value={item}>
              {item === "CALL" ? "Call" : item === "EMAIL" ? "Email" : item === "MEETING" ? "Meeting" : "Note"}
            </option>
          ))}
        </select>
      </label>
      <label>
        What happened *
        <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={3} required />
      </label>
      <label>
        Occurred at
        <input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
      </label>
      <RelationFields token={token} value={relations} onChange={setRelations} locked={Boolean(defaults?.dealId || defaults?.contactId || defaults?.companyId)} />
      <label className="checkbox">
        <input type="checkbox" checked={followUp} onChange={(event) => setFollowUp(event.target.checked)} />
        Create follow-up task
      </label>
      {followUp ? (
        <>
          <label>
            Follow-up title
            <input value={followTitle} onChange={(event) => setFollowTitle(event.target.value)} placeholder="Send proposal" />
          </label>
          <label>
            Follow-up due
            <input type="datetime-local" value={followDue} onChange={(event) => setFollowDue(event.target.value)} />
          </label>
        </>
      ) : null}
      {error ? <ErrorState message={error} /> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
