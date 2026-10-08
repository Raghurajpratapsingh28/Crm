"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AnalyticsFilterBar } from "../../../components/analytics/filter-bar";
import { FollowUpSummary } from "../../../components/analytics/follow-up-summary";
import { Leaderboard } from "../../../components/analytics/leaderboard";
import { PipelineChart } from "../../../components/analytics/pipeline-chart";
import { RevenueChart } from "../../../components/analytics/revenue-chart";
import { WinRateChart } from "../../../components/analytics/win-rate-chart";
import { ErrorState, LoadingState } from "../../../components/crm/ui";
import { useAuth } from "../../../components/auth-provider";
import {
  analyticsSearch,
  filtersFromParams,
  queryFromUrlFilters,
  type AnalyticsLeaderboard,
  type AnalyticsOverview,
  type AnalyticsPipeline,
  type AnalyticsRevenue,
  type AnalyticsWinRate,
} from "../../../lib/analytics";
import { defaultAnalyticsRange } from "../../../lib/analytics-dates";
import { apiFetch, ApiRequestError } from "../../../lib/api";
import { crmErrorMessage } from "../../../lib/crm-errors";
import { PERMISSIONS } from "../../../lib/permissions";

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<main><div className="card wide dashboard"><LoadingState label="Loading analytics" /></div></main>}>
      <Analytics />
    </Suspense>
  );
}

function Analytics() {
  const { session, user, organization, can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const token = session?.access_token;
  const timeZone = organization?.timezone ?? "UTC";
  const url = filtersFromParams(params);
  const range = url.from && url.to ? { from: url.from, to: url.to } : defaultAnalyticsRange(timeZone);
  const query = useMemo(
    () => queryFromUrlFilters({ ...url, from: range.from, to: range.to }),
    [url.from, url.to, url.owner, url.team, url.pipeline, url.groupBy, url.sort, range.from, range.to],
  );

  const [revenue, setRevenue] = useState<AnalyticsRevenue | null>(null);
  const [pipeline, setPipeline] = useState<AnalyticsPipeline | null>(null);
  const [winRate, setWinRate] = useState<AnalyticsWinRate | null>(null);
  const [board, setBoard] = useState<AnalyticsLeaderboard | null>(null);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (url.from && url.to) return;
    const search = new URLSearchParams(params.toString());
    search.set("from", range.from);
    search.set("to", range.to);
    router.replace(`/analytics?${search}`);
  }, [url.from, url.to, range.from, range.to, params, router]);

  const load = useCallback(async () => {
    if (!token || !can(PERMISSIONS.ANALYTICS_READ)) return;
    setLoading(true);
    const search = analyticsSearch(query);
    const requests: Array<[string, Promise<unknown>]> = [
      ["revenue", apiFetch<AnalyticsRevenue>(`/api/v1/analytics/revenue?${search}`, { token })],
      ["pipeline", apiFetch<AnalyticsPipeline>(`/api/v1/analytics/pipeline?${search}`, { token })],
      ["winRate", apiFetch<AnalyticsWinRate>(`/api/v1/analytics/win-rate?${search}`, { token })],
      ["overview", apiFetch<AnalyticsOverview>(`/api/v1/analytics/overview?${search}`, { token })],
    ];
    if (can(PERMISSIONS.ANALYTICS_TEAM)) {
      requests.push(["leaderboard", apiFetch<AnalyticsLeaderboard>(`/api/v1/analytics/leaderboard?${search}`, { token })]);
    }
    const results = await Promise.allSettled(requests.map(([, promise]) => promise));
    const nextErrors: Record<string, string> = {};
    results.forEach((result, index) => {
      const key = requests[index]![0];
      if (result.status === "fulfilled") {
        if (key === "revenue") setRevenue(result.value as AnalyticsRevenue);
        if (key === "pipeline") setPipeline(result.value as AnalyticsPipeline);
        if (key === "winRate") setWinRate(result.value as AnalyticsWinRate);
        if (key === "leaderboard") setBoard(result.value as AnalyticsLeaderboard);
        if (key === "overview") setOverview(result.value as AnalyticsOverview);
      } else {
        const err = result.reason;
        nextErrors[key] = err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : `Unable to load ${key}.`;
        if (key === "revenue") setRevenue(null);
        if (key === "pipeline") setPipeline(null);
        if (key === "winRate") setWinRate(null);
        if (key === "leaderboard") setBoard(null);
        if (key === "overview") setOverview(null);
      }
    });
    setErrors(nextErrors);
    setLoading(false);
  }, [token, can, query, tick]);

  useEffect(() => {
    void load();
  }, [load]);

  function update(next: Record<string, string>) {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) search.set(key, value);
      else search.delete(key);
    }
    router.replace(`/analytics?${search}`);
  }

  if (!can(PERMISSIONS.ANALYTICS_READ)) {
    return (
      <main>
        <div className="card wide dashboard">
          <ErrorState message="You do not have permission to view analytics." />
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card wide dashboard">
        <div className="toolbar">
          <div>
            <h1>Analytics</h1>
            <p>Explore revenue, pipeline, win rate, and team performance.</p>
          </div>
        </div>
        <AnalyticsFilterBar
          token={token}
          timeZone={timeZone}
          from={range.from}
          to={range.to}
          owner={url.owner}
          team={url.team}
          pipeline={url.pipeline}
          groupBy={url.groupBy}
          canListOwners={can(PERMISSIONS.USERS_READ)}
          canFilterTeam={can(PERMISSIONS.ANALYTICS_TEAM)}
          showGroupBy
          currentUser={{ id: user?.id ?? "", name: user?.user_metadata?.full_name ?? user?.email ?? "You" }}
          onChange={update}
          onRefresh={() => setTick((value) => value + 1)}
          loading={loading}
        />
        <RevenueChart data={revenue} loading={loading && !revenue} error={errors.revenue} />
        <div className="dashboard-split">
          <PipelineChart data={pipeline} loading={loading && !pipeline} error={errors.pipeline} />
          <WinRateChart data={winRate} loading={loading && !winRate} error={errors.winRate} />
        </div>
        <section>
          <h2>Follow-ups</h2>
          {loading && !overview ? <LoadingState label="Loading follow-ups" /> : <FollowUpSummary metrics={overview?.metrics.followUps} />}
        </section>
        {can(PERMISSIONS.ANALYTICS_TEAM) ? (
          <Leaderboard
            data={board}
            loading={loading && !board}
            error={errors.leaderboard}
            sortBy={url.sort}
            onSort={(sort) => update({ sort })}
          />
        ) : null}
      </div>
    </main>
  );
}
