import { activityLabel } from "../../lib/followups";

export function ActivityTypeIcon({ type }: { type: string }) {
  const symbols: Record<string, string> = {
    CALL: "☎",
    EMAIL: "✉",
    MEETING: "◎",
    NOTE: "✎",
    STATUS_CHANGE: "↦",
  };
  return (
    <span className={`activity-type activity-${type.toLowerCase()}`} aria-label={activityLabel(type)}>
      <span aria-hidden="true">{symbols[type] ?? "•"}</span> {activityLabel(type)}
    </span>
  );
}
