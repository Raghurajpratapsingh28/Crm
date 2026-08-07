"use client";

import { useEffect, useId, useRef, useState } from "react";

export function SearchInput({
  value,
  onChange,
  placeholder,
  loading,
  label = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  loading?: boolean;
  label?: string;
}) {
  const [local, setLocal] = useState(value);
  const id = useId();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (local !== value) onChangeRef.current(local);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [local, value]);

  return (
    <label className="search-field" htmlFor={id}>
      <span className="sr-only">{label}</span>
      <input
        id={id}
        value={local}
        onChange={(event) => setLocal(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {local ? (
        <button type="button" className="ghost" onClick={() => { setLocal(""); onChange(""); }}>
          Clear
        </button>
      ) : null}
      {loading ? <span className="muted" aria-live="polite">Searching…</span> : null}
    </label>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="filters">{children}</div>;
}

export function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" className="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {totalPages}
      </span>
      <button type="button" className="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </nav>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="skeleton-stack" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton short" />
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <p className="error" role="alert">
      {message}
    </p>
  );
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  pending,
  disabled,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  disabled?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current?.querySelector<HTMLElement>("button, a, input, select, textarea");
    node?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="dialog-title">{title}</h2>
        {children}
        <div className="actions">
          {onConfirm ? (
            <button type="button" disabled={pending || disabled} onClick={onConfirm}>
              {pending ? "Working…" : confirmLabel}
            </button>
          ) : null}
          <button type="button" className="secondary" onClick={onClose}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
