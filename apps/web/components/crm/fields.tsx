"use client";

import { useEffect, useId, useState } from "react";
import { apiFetch } from "../../lib/api";
import type { CompanyRecord, Paginated } from "../../lib/crm";

interface TeamMember {
  userId: string;
  fullName: string;
  email: string;
  status: string;
}

export function TagInput({
  value,
  onChange,
  label = "Tags",
}: {
  value: string[];
  onChange: (value: string[]) => void;
  label?: string;
}) {
  const [draft, setDraft] = useState("");
  const id = useId();

  function add(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (!tag || value.includes(tag) || value.length >= 20) return;
    onChange([...value, tag]);
    setDraft("");
  }

  return (
    <label htmlFor={id}>
      {label}
      <div className="tag-input">
        {value.map((tag) => (
          <button key={tag} type="button" className="badge" onClick={() => onChange(value.filter((item) => item !== tag))}>
            {tag} ×
          </button>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add(draft);
            }
          }}
          onBlur={() => add(draft)}
          placeholder="Add a tag"
        />
      </div>
    </label>
  );
}

export function OwnerSelector({
  token,
  value,
  onChange,
  canList,
  currentUser,
}: {
  token?: string;
  value: string;
  onChange: (value: string) => void;
  canList: boolean;
  currentUser: { id: string; name: string };
}) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const id = useId();

  useEffect(() => {
    if (!token || !canList) return;
    void apiFetch<{ items: TeamMember[] }>("/api/v1/team?status=ACTIVE&limit=100", { token }).then((res) => {
      setMembers(res.items);
    }).catch(() => {
      setMembers([]);
    });
  }, [token, canList]);

  if (!canList) {
    return (
      <label htmlFor={id}>
        Owner
        <input id={id} value={currentUser.name} readOnly />
      </label>
    );
  }

  return (
    <label htmlFor={id}>
      Owner
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value={currentUser.id}>{currentUser.name}</option>
        {members
          .filter((member) => member.userId !== currentUser.id)
          .map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.fullName}
            </option>
          ))}
      </select>
    </label>
  );
}

export function CompanySelector({
  token,
  value,
  label,
  onChange,
}: {
  token?: string;
  value: string;
  label?: string | null;
  onChange: (id: string, name: string | null) => void;
}) {
  const [search, setSearch] = useState(label ?? "");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CompanyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const id = useId();

  useEffect(() => {
    setSearch(label ?? "");
  }, [label]);

  useEffect(() => {
    if (!token || !open) return;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const query = new URLSearchParams({ limit: "20" });
        if (search.trim()) query.set("search", search.trim());
        const res = await apiFetch<Paginated<CompanyRecord>>(`/api/v1/companies?${query}`, { token });
        setItems(res.items);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [token, search, open]);

  return (
    <label htmlFor={id} className="combobox">
      Company
      <input
        id={id}
        value={search}
        placeholder="Search companies"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setSearch(event.target.value);
          setOpen(true);
          if (!event.target.value) onChange("", null);
        }}
      />
      {open ? (
        <ul className="combobox-list" role="listbox">
          <li>
            <button
              type="button"
              onClick={() => {
                onChange("", null);
                setSearch("");
                setOpen(false);
              }}
            >
              No company
            </button>
          </li>
          {loading ? <li>Searching…</li> : null}
          {items.map((company) => (
            <li key={company.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(company.id, company.name);
                  setSearch(company.name);
                  setOpen(false);
                }}
              >
                {company.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {value ? <span className="muted">Selected company is linked.</span> : <span className="muted">Optional. Contacts can exist without a company.</span>}
    </label>
  );
}
