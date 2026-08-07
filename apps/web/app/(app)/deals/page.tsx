"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { DataTable } from "../../../components/crm/data-table";
import { ErrorState, FilterBar, Pagination, SearchInput } from "../../../components/crm/ui";
import { useAuth } from "../../../components/auth-provider";
import { apiFetch, ApiRequestError } from "../../../lib/api";
import { formatMoney, type DealRecord } from "../../../lib/deals";
import { crmErrorMessage } from "../../../lib/crm-errors";
import { PERMISSIONS } from "../../../lib/permissions";

interface PaginatedDeals {
  items: DealRecord[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export default function DealsPage() {
  return (
    <Suspense fallback={<main><div className="card wide"><p>Loading deals…</p></div></main>}>
      <DealsList />
    </Suspense>
  );
}

function DealsList() {
  const { session, can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const token = session?.access_token;
  const [data, setData] = useState<PaginatedDeals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      search: params.get("search") ?? "",
      page: params.get("page") ?? "1",
      sortBy: params.get("sortBy") ?? "updatedAt",
      sortOrder: params.get("sortOrder") ?? "desc",
    }),
    [params],
  );

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const search = new URLSearchParams(Object.entries(query));
    apiFetch<PaginatedDeals>(`/api/v1/deals?${search}`, { token })
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load deals.");
      })
      .finally(() => setLoading(false));
  }, [token, query]);

  const createAction = can(PERMISSIONS.DEALS_CREATE) ? <Link href="/deals/new">Create deal</Link> : null;

  return (
    <main>
      <div className="card wide">
        <div className="toolbar">
          <div>
            <h1>Deals</h1>
            <p>All opportunities in this organization.</p>
          </div>
          <div className="actions">
            <Link href="/pipeline">Open pipeline</Link>
            {createAction}
          </div>
        </div>
        <FilterBar>
          <SearchInput value={query.search} onChange={(search) => router.replace(`/deals?search=${encodeURIComponent(search)}`)} placeholder="Search deals…" />
        </FilterBar>
        {error ? <ErrorState message={error} /> : null}
        <DataTable
          columns={[
            { key: "name", header: "Deal", render: (row) => row.name },
            { key: "company", header: "Company", render: (row) => row.company.name },
            { key: "stage", header: "Stage", render: (row) => row.stage?.name ?? "—" },
            { key: "amount", header: "Amount", render: (row) => formatMoney(row.amount, row.currency) },
            { key: "owner", header: "Owner", render: (row) => row.owner.fullName },
          ]}
          rows={data?.items ?? []}
          loading={loading}
          emptyTitle="No deals yet"
          emptyBody="Create your first deal to start tracking your sales pipeline."
          emptyAction={createAction}
          onRowClick={(row) => router.push(`/deals/${row.id}`)}
        />
        <Pagination
          page={data?.pagination.page ?? 1}
          totalPages={data?.pagination.totalPages ?? 1}
          onPage={(page) => router.replace(`/deals?page=${page}`)}
        />
      </div>
    </main>
  );
}
