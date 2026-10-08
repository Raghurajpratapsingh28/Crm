"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AnalyticsFilterBar } from "../../../components/analytics/filter-bar";
import { FollowUpSummary } from "../../../components/analytics/follow-up-summary";
import { MetricCard } from "../../../components/analytics/metric-card";
import { PipelineChart } from "../../../components/analytics/pipeline-chart";
import { RecentActivityList } from "../../../components/analytics/recent-activity";
import { RevenueChart } from "../../../components/analytics/revenue-chart";
import { ErrorState, LoadingState } from "../../../components/crm/ui";
import { useAuth } from "../../../components/auth-provider";
import {
  analyticsSearch,
  filtersFromParams,
  formatMoneyMetric,
  formatTrend,
  formatWinRate,
  queryFromUrlFilters,
  type AnalyticsOverview,
  type AnalyticsPipeline,
  type AnalyticsRevenue,
} from "../../../lib/analytics";
import { defaultAnalyticsRange } from "../../../lib/analytics-dates";
import { apiFetch, ApiRequestError } from "../../../lib/api";
import { crmErrorMessage } from "../../../lib/crm-errors";
import { PERMISSIONS } from "../../../lib/permissions";

export default function DashboardPage() {
  return (
    <Suspense fallback={<main><div className="card wide dashboard"><LoadingState label="Loading dashboard" /></div></main>}>
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  const { session, user, organization, can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const token = session?.access_token;
  const timeZone = organization?.timezone ?? "UTC";
  const url = filtersFromParams(params);
  const range = url.from && url.to ? { from: url.from, to: url.to } : defaultAnalyticsRange(timeZone);
  const query = useMemo(
    () => queryFromUrlFilters({ ...url, from: range.from, to: range.to }),
    [url.from, url.to, url.owner, url.team, url.pipeline, range.from, range.to],
  );

  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [revenue, setRevenue] = useState<AnalyticsRevenue | null>(null);
  const [pipeline, setPipeline] = useState<AnalyticsPipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [revenueError, setRevenueError] = useState<string | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (url.from && url.to) return;
    const search = new URLSearchParams(params.toString());
    search.set("from", range.from);
    search.set("to", range.to);
    router.replace(`/dashboard?${search}`);
  }, [url.from, url.to, range.from, range.to, params, router]);

  const load = useCallback(async () => {
    if (!token || !can(PERMISSIONS.ANALYTICS_READ)) return;
    setLoading(true);
    setOverviewError(null);
    setRevenueError(null);
    setPipelineError(null);
    const search = analyticsSearch(query);
    const results = await Promise.allSettled([
      apiFetch<AnalyticsOverview>(`/api/v1/analytics/overview?${search}`, { token }),
      apiFetch<AnalyticsRevenue>(`/api/v1/analytics/revenue?${search}`, { token }),
      apiFetch<AnalyticsPipeline>(`/api/v1/analytics/pipeline?${search}`, { token }),
    ]);
    if (results[0].status === "fulfilled") setOverview(results[0].value);
    else {
      setOverview(null);
      const err = results[0].reason;
      setOverviewError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load dashboard.");
    }
    if (results[1].status === "fulfilled") setRevenue(results[1].value);
    else {
      setRevenue(null);
      const err = results[1].reason;
      setRevenueError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load revenue.");
    }
    if (results[2].status === "fulfilled") setPipeline(results[2].value);
    else {
      setPipeline(null);
      const err = results[2].reason;
      setPipelineError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load pipeline.");
    }
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
    router.replace(`/dashboard?${search}`);
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

  const periodLabel = `${range.from} → ${range.to}`;
  const metrics = overview?.metrics;

  return (
    <main>
      <div className="card wide dashboard">
        <div className="toolbar">
          <div>
            <h1>Dashboard</h1>
            <p>What is happening in the pipeline right now.</p>
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
          canListOwners={can(PERMISSIONS.USERS_READ)}
          canFilterTeam={can(PERMISSIONS.ANALYTICS_TEAM)}
          currentUser={{ id: user?.id ?? "", name: user?.user_metadata?.full_name ?? user?.email ?? "You" }}
          onChange={update}
          onRefresh={() => setTick((value) => value + 1)}
          loading={loading}
        />
        {overviewError ? <ErrorState message={overviewError} /> : null}
        <div className="kpi-grid">
          <MetricCard
            title="Revenue"
            value={formatMoneyMetric(metrics?.revenue)}
            subtitle={periodLabel}
            trend={formatTrend(metrics?.revenue.trend.percent ?? null, metrics?.revenue.trend.hasComparison ?? false)}
            loading={loading && !overview}
            error={overviewError}
          />
          <MetricCard title="Open deals" value={metrics ? String(metrics.openDeals) : undefined} subtitle="Current, not Won or Lost" loading={loading && !overview} error={overviewError} />
          <MetricCard
            title="Win rate"
            value={metrics ? formatWinRate(metrics.winRate.value, metrics.winRate.hasData) : undefined}
            subtitle={metrics?.winRate.hasData ? `${metrics.winRate.won} won · ${metrics.winRate.lost} lost` : "Won / (Won + Lost)"}
            trend={formatTrend(metrics?.winRate.trend.percent ?? null, metrics?.winRate.trend.hasComparison ?? false)}
            loading={loading && !overview}
            error={overviewError}
          />
          <MetricCard title="Pipeline value" value={formatMoneyMetric(metrics?.pipelineValue)} subtitle="Open deals expected to close in range" loading={loading && !overview} error={overviewError} />
          <MetricCard title="Leads" value={metrics ? String(metrics.leads) : undefined} subtitle="Currently in Lead" loading={loading && !overview} error={overviewError} />
          <MetricCard
            title="Follow-ups"
            value={metrics ? String(metrics.followUps.open) : undefined}
            subtitle={metrics ? `${metrics.followUps.overdue} overdue · ${metrics.followUps.dueToday} due today` : undefined}
            loading={loading && !overview}
            error={overviewError}
          />
        </div>
        <RevenueChart data={revenue} loading={loading && !revenue} error={revenueError} />
        <div className="dashboard-split">
          <PipelineChart data={pipeline} loading={loading && !pipeline} error={pipelineError} />
          <section>
            <h2>Follow-ups</h2>
            {loading && !overview ? <LoadingState label="Loading follow-ups" /> : <FollowUpSummary metrics={metrics?.followUps} />}
          </section>
        </div>
        <section>
          <h2>Recent activity</h2>
          {loading && !overview ? <LoadingState label="Loading activity" /> : <RecentActivityList items={overview?.recentActivity ?? []} />}
        </section>
      </div>
    </main>
  );
}
