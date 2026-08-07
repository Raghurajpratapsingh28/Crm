"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { DataTable } from "../../../components/crm/data-table";
import { ErrorState, FilterBar, Pagination, SearchInput } from "../../../components/crm/ui";
import { useAuth } from "../../../components/auth-provider";
import { apiFetch, ApiRequestError } from "../../../lib/api";
import { CONTACT_SOURCES, contactName, formatUpdated, type ContactRecord, type Paginated } from "../../../lib/crm";
import { crmErrorMessage } from "../../../lib/crm-errors";
import { PERMISSIONS } from "../../../lib/permissions";

export default function ContactsPage() {
  return (
    <Suspense fallback={<main><div className="card wide"><p>Loading contacts…</p></div></main>}>
      <ContactsList />
    </Suspense>
  );
}

function ContactsList() {
  const { session, can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const token = session?.access_token;
  const [data, setData] = useState<Paginated<ContactRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      search: params.get("search") ?? "",
      owner: params.get("owner") ?? "",
      company: params.get("company") ?? "",
      industry: params.get("industry") ?? "",
      source: params.get("source") ?? "",
      sortBy: params.get("sortBy") ?? "updatedAt",
      sortOrder: params.get("sortOrder") ?? "desc",
      page: params.get("page") ?? "1",
    }),
    [params],
  );

  function updateQuery(next: Record<string, string>) {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) search.set(key, value);
      else search.delete(key);
    }
    if (!next.page) search.delete("page");
    router.replace(`/contacts?${search.toString()}`);
  }

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const search = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value) search.set(key, value);
    });
    apiFetch<Paginated<ContactRecord>>(`/api/v1/contacts?${search}`, { token })
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load contacts.");
      })
      .finally(() => setLoading(false));
  }, [token, query]);

  const createAction = can(PERMISSIONS.CONTACTS_CREATE) ? <Link href="/contacts/new">Create contact</Link> : null;
  const filtered = Boolean(query.search || query.owner || query.company || query.industry || query.source);

  return (
    <main>
      <div className="card wide">
        <div className="toolbar">
          <div>
            <h1>Contacts</h1>
            <p>People in this organization.</p>
          </div>
          {createAction}
        </div>
        <FilterBar>
          <SearchInput value={query.search} onChange={(search) => updateQuery({ search })} placeholder="Search contacts…" loading={loading} />
          <label>
            <span className="sr-only">Industry</span>
            <input value={query.industry} placeholder="Industry" onChange={(event) => updateQuery({ industry: event.target.value })} />
          </label>
          <label>
            <span className="sr-only">Source</span>
            <select value={query.source} onChange={(event) => updateQuery({ source: event.target.value })}>
              <option value="">All sources</option>
              {CONTACT_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Sort</span>
            <select
              value={`${query.sortBy}:${query.sortOrder}`}
              onChange={(event) => {
                const [sortBy, sortOrder] = event.target.value.split(":");
                updateQuery({ sortBy: sortBy ?? "updatedAt", sortOrder: sortOrder ?? "desc" });
              }}
            >
              <option value="updatedAt:desc">Updated</option>
              <option value="firstName:asc">First name</option>
              <option value="lastName:asc">Last name</option>
              <option value="email:asc">Email</option>
              <option value="createdAt:desc">Created</option>
            </select>
          </label>
        </FilterBar>
        {error ? <ErrorState message={error} /> : null}
        <DataTable
          columns={[
            { key: "name", header: "Name", render: (row) => contactName(row) },
            { key: "company", header: "Company", render: (row) => row.company?.name ?? "—" },
            { key: "email", header: "Email", render: (row) => row.email ?? "—" },
            { key: "phone", header: "Phone", render: (row) => row.phone ?? "—" },
            { key: "owner", header: "Owner", render: (row) => row.owner?.fullName ?? "—" },
            { key: "updated", header: "Updated", render: (row) => formatUpdated(row.updatedAt) },
          ]}
          rows={data?.items ?? []}
          loading={loading}
          emptyTitle={filtered ? `No contacts found for "${query.search || "these filters"}"` : "No contacts yet."}
          emptyBody={filtered ? "No contacts match the selected filters." : "Add your first contact."}
          emptyAction={createAction}
          onRowClick={(row) => router.push(`/contacts/${row.id}`)}
        />
        <Pagination
          page={data?.pagination.page ?? 1}
          totalPages={data?.pagination.totalPages ?? 1}
          onPage={(page) => updateQuery({ page: String(page) })}
        />
      </div>
    </main>
  );
}
