"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import type { DealRecord } from "../../lib/deals";
import { CompanySelector } from "../crm/fields";
import { OwnerSelector } from "../crm/fields";
import { ErrorState } from "../crm/ui";
import { crmErrorMessage } from "../../lib/crm-errors";
import { ApiRequestError } from "../../lib/api";

interface PipelineOption {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string; probability: number }>;
}

export function DealForm({
  token,
  currentUser,
  canAssign,
  initial,
  submitLabel,
  onSaved,
}: {
  token: string;
  currentUser: { id: string; name: string };
  canAssign: boolean;
  initial?: Partial<DealRecord>;
  submitLabel: string;
  onSaved: (deal: DealRecord) => void;
}) {
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [companyId, setCompanyId] = useState(initial?.companyId ?? "");
  const [companyName, setCompanyName] = useState(initial?.company?.name ?? "");
  const [primaryContactId, setPrimaryContactId] = useState(initial?.primaryContactId ?? "");
  const [ownerId, setOwnerId] = useState(initial?.ownerId ?? currentUser.id);
  const [pipelineId, setPipelineId] = useState(initial?.pipelineId ?? "");
  const [stageId, setStageId] = useState(initial?.stageId ?? "");
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "USD");
  const [expectedCloseDate, setExpectedCloseDate] = useState(
    initial?.expectedCloseDate ? String(initial.expectedCloseDate).slice(0, 10) : "",
  );
  const [probability, setProbability] = useState(initial?.probability?.toString() ?? "");
  const [manualProbability, setManualProbability] = useState(initial?.probabilitySource === "MANUAL");
  const [contacts, setContacts] = useState<Array<{ id: string; label: string }>>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<PipelineOption[]>("/api/v1/pipelines", { token }).then((rows) => {
      setPipelines(rows);
      if (!pipelineId && rows[0]) {
        setPipelineId(rows[0].id);
        setStageId(rows[0].stages[0]?.id ?? "");
      }
    });
  }, [token]);

  useEffect(() => {
    if (!token || !companyId) {
      setContacts([]);
      return;
    }
    const query = new URLSearchParams({ company: companyId, limit: "50" });
    void apiFetch<{ items: Array<{ id: string; firstName: string; lastName: string; email: string | null }> }>(
      `/api/v1/contacts?${query}`,
      { token },
    ).then((res) => {
      setContacts(
        res.items.map((contact) => ({
          id: contact.id,
          label: `${contact.firstName} ${contact.lastName}${contact.email ? ` · ${contact.email}` : ""}`,
        })),
      );
    });
  }, [token, companyId]);

  const selectedPipeline = pipelines.find((row) => row.id === pipelineId);
  const selectedStage = selectedPipeline?.stages.find((row) => row.id === stageId);

  async function submit() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const payload = {
        name,
        description: description || null,
        companyId,
        primaryContactId,
        ownerId: canAssign ? ownerId : undefined,
        pipelineId,
        stageId: initial?.id ? undefined : stageId,
        amount: amount === "" ? null : Number(amount),
        currency,
        expectedCloseDate: expectedCloseDate || null,
        probability: probability === "" ? undefined : Number(probability),
      };
      const deal = initial?.id
        ? await apiFetch<DealRecord>(`/api/v1/deals/${initial.id}`, { method: "PATCH", token, body: JSON.stringify(payload) })
        : await apiFetch<DealRecord>("/api/v1/deals", { method: "POST", token, body: JSON.stringify(payload) });
      onSaved(deal);
    } catch (err) {
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to save deal.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label>
        Deal name *
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label>
        Description
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
      </label>
      <CompanySelector
        token={token}
        value={companyId}
        label={companyName}
        onChange={(id, label) => {
          setCompanyId(id);
          setCompanyName(label ?? "");
          setPrimaryContactId("");
        }}
      />
      <label>
        Primary contact *
        <select value={primaryContactId} onChange={(event) => setPrimaryContactId(event.target.value)} required>
          <option value="">Select contact</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.label}
            </option>
          ))}
        </select>
      </label>
      <OwnerSelector token={token} value={ownerId} onChange={setOwnerId} canList={canAssign} currentUser={currentUser} />
      {!initial?.id ? (
        <>
          <label>
            Pipeline *
            <select
              value={pipelineId}
              onChange={(event) => {
                setPipelineId(event.target.value);
                const pipeline = pipelines.find((row) => row.id === event.target.value);
                setStageId(pipeline?.stages[0]?.id ?? "");
              }}
            >
              {pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Stage *
            <select value={stageId} onChange={(event) => setStageId(event.target.value)}>
              {selectedPipeline?.stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
      <label>
        Amount
        <input type="number" min={0} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
      </label>
      <label>
        Currency
        <input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} />
      </label>
      <label>
        Expected close date
        <input type="date" value={expectedCloseDate} onChange={(event) => setExpectedCloseDate(event.target.value)} />
      </label>
      <label>
        Probability
        <input
          type="number"
          min={0}
          max={100}
          value={probability}
          onChange={(event) => {
            setProbability(event.target.value);
            setManualProbability(true);
          }}
        />
      </label>
      <p className="muted">
        {manualProbability
          ? `Custom probability: ${probability || "—"}%`
          : `Stage default: ${selectedStage?.probability ?? "—"}%`}
      </p>
      {initial?.id ? (
        <button
          type="button"
          className="secondary"
          onClick={() =>
            void apiFetch(`/api/v1/deals/${initial.id}/reset-probability`, { method: "POST", token }).then((deal) => {
              const row = deal as DealRecord;
              setProbability(String(row.probability ?? ""));
              setManualProbability(false);
            })
          }
        >
          Reset to stage default
        </button>
      ) : null}
      {error ? <ErrorState message={error} /> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
