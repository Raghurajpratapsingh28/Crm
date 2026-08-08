"use client";

import { useState } from "react";
import { apiFetch, ApiRequestError } from "../../lib/api";
import { crmErrorMessage } from "../../lib/crm-errors";
import { fromDateTimeLocal, toDateTimeLocal, type TaskRecord } from "../../lib/followups";
import { OwnerSelector } from "../crm/fields";
import { ErrorState } from "../crm/ui";
import { RelationFields, type FollowupRelations } from "./relation-fields";

export function TaskForm({
  token,
  currentUser,
  canAssign,
  submitLabel = "Create task",
  defaults,
  initial,
  onSaved,
}: {
  token: string;
  currentUser: { id: string; name: string };
  canAssign: boolean;
  submitLabel?: string;
  defaults?: { dealId?: string; contactId?: string; companyId?: string };
  initial?: Partial<TaskRecord>;
  onSaved: (task: TaskRecord) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dueDate, setDueDate] = useState(toDateTimeLocal(initial?.dueDate));
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId ?? currentUser.id);
  const [relations, setRelations] = useState<FollowupRelations>({
    companyId: defaults?.companyId ?? initial?.companyId ?? undefined,
    contactId: defaults?.contactId ?? initial?.contactId ?? undefined,
    dealId: defaults?.dealId ?? initial?.dealId ?? undefined,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const payload = {
        title,
        description: description || null,
        dueDate: fromDateTimeLocal(dueDate) ?? null,
        assigneeId: canAssign ? assigneeId : undefined,
        dealId: relations.dealId,
        contactId: relations.contactId,
        companyId: relations.companyId,
      };
      const task = initial?.id
        ? await apiFetch<TaskRecord>(`/api/v1/tasks/${initial.id}`, { method: "PATCH", token, body: JSON.stringify(payload) })
        : await apiFetch<TaskRecord>("/api/v1/tasks", { method: "POST", token, body: JSON.stringify(payload) });
      onSaved(task);
    } catch (err) {
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to save task.");
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
        Title *
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <label>
        Description
        <textarea value={description ?? ""} onChange={(event) => setDescription(event.target.value)} rows={3} />
      </label>
      <label>
        Due date
        <input type="datetime-local" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
      </label>
      <OwnerSelector token={token} value={assigneeId} onChange={setAssigneeId} canList={canAssign} currentUser={currentUser} label="Assignee" />
      <RelationFields
        token={token}
        value={relations}
        onChange={setRelations}
        locked={Boolean(defaults?.dealId || defaults?.contactId || defaults?.companyId)}
      />
      {error ? <ErrorState message={error} /> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
