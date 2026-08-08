import { dueLabel, type TaskRecord } from "../../lib/followups";

export function TaskStatusBadge({ task }: { task: Pick<TaskRecord, "status" | "dueDate" | "isOverdue"> }) {
  const overdue = task.status === "OPEN" && task.isOverdue;
  return (
    <span className={`task-status${overdue ? " overdue" : task.status === "DONE" ? " done" : ""}`}>
      {overdue ? "Overdue" : task.status === "DONE" ? "Done" : "Open"}
    </span>
  );
}

export function TaskDueDate({ task }: { task: Pick<TaskRecord, "status" | "dueDate" | "isOverdue"> }) {
  return <span className={task.status === "OPEN" && task.isOverdue ? "overdue-text" : undefined}>{dueLabel(task)}</span>;
}
