"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import type { Paginated } from "../../lib/followups";
import { CompanySelector } from "../crm/fields";

export interface FollowupRelations {
  companyId?: string;
  contactId?: string;
  dealId?: string;
}

interface Option {
  id: string;
  label: string;
}

export function RelationFields({
  token,
  value,
  onChange,
  locked,
}: {
  token: string;
  value: FollowupRelations;
  onChange: (next: FollowupRelations) => void;
  locked?: boolean;
}) {
  const [contacts, setContacts] = useState<Option[]>([]);
  const [deals, setDeals] = useState<Option[]>([]);

  useEffect(() => {
    if (locked) return;
    const contactQuery = new URLSearchParams({ limit: "50" });
    const dealQuery = new URLSearchParams({ limit: "50" });
    if (value.companyId) {
      contactQuery.set("companyId", value.companyId);
      dealQuery.set("companyId", value.companyId);
    }
    apiFetch<Paginated<{ id: string; firstName: string; lastName: string }>>(`/api/v1/contacts?${contactQuery}`, { token })
      .then((res) => setContacts(res.items.map((row) => ({ id: row.id, label: `${row.firstName} ${row.lastName}` }))))
      .catch(() => setContacts([]));
    apiFetch<Paginated<{ id: string; name: string }>>(`/api/v1/deals?${dealQuery}`, { token })
      .then((res) => setDeals(res.items.map((row) => ({ id: row.id, label: row.name }))))
      .catch(() => setDeals([]));
  }, [token, value.companyId, locked]);

  if (locked) return null;

  return (
    <>
      <CompanySelector
        token={token}
        value={value.companyId ?? ""}
        onChange={(companyId) => onChange({ ...value, companyId: companyId || undefined, contactId: undefined, dealId: undefined })}
      />
      <label>
        Related contact
        <select value={value.contactId ?? ""} onChange={(event) => onChange({ ...value, contactId: event.target.value || undefined })}>
          <option value="">None</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Related deal
        <select value={value.dealId ?? ""} onChange={(event) => onChange({ ...value, dealId: event.target.value || undefined })}>
          <option value="">None</option>
          {deals.map((deal) => (
            <option key={deal.id} value={deal.id}>
              {deal.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
