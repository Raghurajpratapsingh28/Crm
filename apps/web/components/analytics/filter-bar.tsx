"use client";

import { useEffect, useState } from "react";
import { FilterBar } from "../crm/ui";
import { apiFetch } from "../../lib/api";
import { DATE_PRESETS, matchPreset, rangeForPreset, type DatePreset } from "../../lib/analytics-dates";

const DEPARTMENTS = [
  { id: "", label: "All departments" },
  { id: "SALES", label: "Sales" },
  { id: "MARKETING", label: "Marketing" },
  { id: "MANAGEMENT", label: "Management" },
  { id: "OTHER", label: "Other" },
];

export function AnalyticsFilterBar({
  token,
  timeZone,
  from,
  to,
  owner,
  team,
  pipeline,
  groupBy,
  canListOwners,
  canFilterTeam,
  showGroupBy,
  currentUser,
  onChange,
  onRefresh,
  loading,
}: {
  token?: string;
  timeZone: string;
  from: string;
  to: string;
  owner: string;
  team: string;
  pipeline: string;
  groupBy?: string;
  canListOwners: boolean;
  canFilterTeam: boolean;
  showGroupBy?: boolean;
  currentUser: { id: string; name: string };
  onChange: (next: Record<string, string>) => void;
  onRefresh?: () => void;
  loading?: boolean;
}) {
  const preset = matchPreset(from, to, timeZone);
  const [owners, setOwners] = useState<Array<{ userId: string; fullName: string }>>([]);
  const [pipelines, setPipelines] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!token) return;
    if (canListOwners) {
      void apiFetch<{ items: Array<{ userId: string; fullName: string }> }>("/api/v1/team?status=ACTIVE&limit=100", {
        token,
      })
        .then((res) => setOwners(res.items))
        .catch(() => setOwners([]));
    }
    void apiFetch<Array<{ id: string; name: string }>>("/api/v1/pipelines", { token })
      .then((rows) => setPipelines(Array.isArray(rows) ? rows : []))
      .catch(() => setPipelines([]));
  }, [token, canListOwners]);

  function applyPreset(next: DatePreset) {
    if (next === "custom") return;
    const range = rangeForPreset(next, timeZone);
    onChange({ from: range.from, to: range.to });
  }

  return (
    <FilterBar>
      <label>
        Date range
        <select
          aria-label="Date range"
          value={preset}
          onChange={(event) => applyPreset(event.target.value as DatePreset)}
        >
          {DATE_PRESETS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        From
        <input type="date" aria-label="From date" value={from} onChange={(event) => onChange({ from: event.target.value })} />
      </label>
      <label>
        To
        <input type="date" aria-label="To date" value={to} onChange={(event) => onChange({ to: event.target.value })} />
      </label>
      {canListOwners ? (
        <label>
          Owner
          <select aria-label="Owner" value={owner} onChange={(event) => onChange({ owner: event.target.value })}>
            <option value="">All owners</option>
            <option value={currentUser.id}>{currentUser.name}</option>
            {owners
              .filter((member) => member.userId !== currentUser.id)
              .map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.fullName}
                </option>
              ))}
          </select>
        </label>
      ) : null}
      {canFilterTeam ? (
        <label>
          Department
          <select aria-label="Department" value={team} onChange={(event) => onChange({ team: event.target.value })}>
            {DEPARTMENTS.map((item) => (
              <option key={item.id || "all"} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Pipeline
        <select aria-label="Pipeline" value={pipeline} onChange={(event) => onChange({ pipeline: event.target.value })}>
          <option value="">Default pipeline</option>
          {pipelines.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      {showGroupBy ? (
        <label>
          Group by
          <select aria-label="Group by" value={groupBy ?? "month"} onChange={(event) => onChange({ groupBy: event.target.value })}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </label>
      ) : null}
      {onRefresh ? (
        <button type="button" className="secondary" onClick={onRefresh} disabled={loading}>
          Refresh
        </button>
      ) : null}
    </FilterBar>
  );
}
