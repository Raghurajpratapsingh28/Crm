"use client";

import { formatMoney } from "../../lib/deals";
import type { AnalyticsLeaderboard } from "../../lib/analytics";
import { EmptyState, ErrorState, LoadingState } from "../crm/ui";

export function Leaderboard({
  data,
  loading,
  error,
  sortBy,
  onSort,
}: {
  data?: AnalyticsLeaderboard | null;
  loading?: boolean;
  error?: string | null;
  sortBy: string;
  onSort: (sort: string) => void;
}) {
  if (loading) return <LoadingState label="Loading team performance" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;
  if (data.members.length === 0) {
    return <EmptyState title="No team members to measure." body="Active members appear here with won deals and open pipeline." />;
  }

  return (
    <section className="chart-block" aria-labelledby="leaderboard-title">
      <div className="toolbar">
        <div>
          <h2 id="leaderboard-title">Team performance</h2>
          <p>Descriptive totals by current deal owner. Sort to compare metrics, not people.</p>
        </div>
        <label>
          Sort by
          <select aria-label="Sort leaderboard" value={sortBy} onChange={(event) => onSort(event.target.value)}>
            <option value="revenue">Revenue</option>
            <option value="dealsWon">Deals won</option>
            <option value="openPipeline">Open pipeline</option>
          </select>
        </label>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Representative</th>
            <th>Deals won</th>
            <th>Revenue</th>
            <th>Open pipeline</th>
          </tr>
        </thead>
        <tbody>
          {data.members.map((member) => (
            <tr key={member.userId}>
              <td>{member.name}</td>
              <td>{member.dealsWon}</td>
              <td>
                {member.mixed ? "Multiple currencies" : formatMoney(member.revenue, member.currency)}
              </td>
              <td>
                {member.mixed ? "Multiple currencies" : formatMoney(member.openPipeline, member.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
