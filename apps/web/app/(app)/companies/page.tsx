"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { DataTable } from "../../../components/crm/data-table";
import { ErrorState, FilterBar, Pagination, SearchInput } from "../../../components/crm/ui";
import { useAuth } from "../../../components/auth-provider";
import { apiFetch, ApiRequestError } from "../../../lib/api";
import { formatEmployees, formatUpdated, type CompanyRecord, type Paginated } from "../../../lib/crm";
import { crmErrorMessage } from "../../../lib/crm-errors";
import { PERMISSIONS } from "../../../lib/permissions";

export default function CompaniesPage() {
  return (
    <Suspense fallback={<main><div className="card wide"><p>Loading companies…</p></div></main>}>
      <CompaniesList />
    </Suspense>
  );
}

function CompaniesList() {
  const { session, can, user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const token = session?.access_token;
  const [data, setData] = useState<Paginated<CompanyRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      search: params.get("search") ?? "",
      industry: params.get("industry") ?? "",
      owner: params.get("owner") ?? "",
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
    router.replace(`/companies?${search.toString()}`);
  }

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setLoading(true);
    const search = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value) search.set(key, value);
    });
    apiFetch<Paginated<CompanyRecord>>(`/api/v1/companies?${search}`, { token })
      .then((res) => {
        if (!controller.signal.aborted) {
          setData(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load companies.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token, query]);

  const createAction = can(PERMISSIONS.COMPANIES_CREATE) ? <Link href="/companies/new">Create company</Link> : null;
  const emptyTitle = query.search || query.industry || query.owner ? `No companies found for "${query.search || "these filters"}"` : "No companies yet.";
  const emptyBody =
    query.search || query.industry || query.owner
      ? "No companies match the selected filters."
      : "Create your first company to start building your CRM.";

  return (
    <main>
      <div className="card wide">
        <div className="toolbar">
          <div>
            <h1>Companies</h1>
            <p>Accounts owned by this organization.</p>
          </div>
          {createAction}
        </div>
        <FilterBar>
          <SearchInput value={query.search} onChange={(search) => updateQuery({ search })} placeholder="Search companies…" loading={loading} />
          <label>
            <span className="sr-only">Industry</span>
            <input
              value={query.industry}
              placeholder="Industry"
              onChange={(event) => updateQuery({ industry: event.target.value })}
            />
          </label>
          {can(PERMISSIONS.USERS_READ) ? (
            <label>
              <span className="sr-only">Owner</span>
              <input
                value={query.owner}
                placeholder="Owner id"
                onChange={(event) => updateQuery({ owner: event.target.value })}
              />
            </label>
          ) : null}
          <label>
            <span className="sr-only">Sort</span>
            <select value={`${query.sortBy}:${query.sortOrder}`} onChange={(event) => {
              const [sortBy, sortOrder] = event.target.value.split(":");
              updateQuery({ sortBy: sortBy ?? "updatedAt", sortOrder: sortOrder ?? "desc" });
            }}>
              <option value="updatedAt:desc">Updated</option>
              <option value="name:asc">Name</option>
              <option value="industry:asc">Industry</option>
              <option value="employeeCount:desc">Employees</option>
              <option value="createdAt:desc">Created</option>
            </select>
          </label>
        </FilterBar>
        {error ? <ErrorState message={error} /> : null}
        <DataTable
          columns={[
            { key: "name", header: "Company", render: (row) => row.name },
            { key: "industry", header: "Industry", render: (row) => row.industry ?? "—" },
            { key: "employees", header: "Employees", render: (row) => formatEmployees(row.employeeCount) },
            { key: "owner", header: "Owner", render: (row) => row.owner?.fullName ?? user?.email ?? "—" },
            { key: "updated", header: "Updated", render: (row) => formatUpdated(row.updatedAt) },
          ]}
          rows={data?.items ?? []}
          loading={loading}
          emptyTitle={emptyTitle}
          emptyBody={emptyBody}
          emptyAction={createAction}
          onRowClick={(row) => router.push(`/companies/${row.id}`)}
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
