"use client";

import { EmptyState } from "./ui";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  emptyTitle,
  emptyBody,
  emptyAction,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyTitle: string;
  emptyBody: string;
  emptyAction?: React.ReactNode;
  onRowClick?: (row: T) => void;
}) {
  if (loading) {
    return (
      <div className="skeleton-stack" role="status" aria-live="polite">
        <span className="sr-only">Loading table</span>
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} action={emptyAction} />;
  }

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                data-clickable={onRowClick ? "true" : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
              >
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-list">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            className="record-card"
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            {columns.slice(0, 4).map((column) => (
              <div key={column.key}>
                <span className="muted">{column.header}</span>
                <div>{column.render(row)}</div>
              </div>
            ))}
          </button>
        ))}
      </div>
    </>
  );
}
