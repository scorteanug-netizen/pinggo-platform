"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type FlowListItem = {
  id: string;
  name: string;
  isActive: boolean;
  isDraft: boolean;
  publishedAt: string | null;
  updatedAt: string;
  lastEditedByName: string | null;
  lastEditedByEmail: string | null;
};

type WorkspaceOption = {
  id: string;
  name: string;
};

type FlowsManagerProps = {
  initialFlows: FlowListItem[];
  canEditFlows: boolean;
  isSuperAdmin: boolean;
  currentWorkspaceId: string;
  workspaceOptions: WorkspaceOption[];
};

type ResultState = {
  type: "idle" | "success" | "error";
  message: string;
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const year = date.getFullYear();
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${day}.${month}.${year} ${hour}:${minute}`;
}

function getStatusMeta(flow: FlowListItem) {
  if (flow.isActive) {
    return {
      label: "Activ",
      className: "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700",
    };
  }

  if (!flow.isDraft && flow.publishedAt) {
    return {
      label: "Publicat",
      className: "rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-700",
    };
  }

  return {
    label: "Draft",
    className: "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700",
  };
}

export function FlowsManager({
  initialFlows,
  canEditFlows,
  isSuperAdmin,
  currentWorkspaceId,
  workspaceOptions,
}: FlowsManagerProps) {
  const router = useRouter();
  const [flows, setFlows] = useState(initialFlows);
  const [newFlowName, setNewFlowName] = useState("");
  const [targetWorkspaceId, setTargetWorkspaceId] = useState(currentWorkspaceId);
  const [result, setResult] = useState<ResultState>({ type: "idle", message: "" });
  const [isPending, startTransition] = useTransition();

  function handleCreateFlow() {
    setResult({ type: "idle", message: "" });
    const trimmedName = newFlowName.trim();
    if (!trimmedName) {
      setResult({ type: "error", message: "Introdu numele fluxului." });
      return;
    }

    startTransition(async () => {
      try {
        const createBody: { name: string; workspaceId?: string } = {
          name: trimmedName,
        };
        if (isSuperAdmin) {
          createBody.workspaceId = targetWorkspaceId;
        }

        const response = await fetch("/api/flows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createBody),
        });
        const payload = await response.json();
        if (!response.ok) {
          const errorMessage = typeof payload?.error === "string" ? payload.error : "Nu am putut crea fluxul.";
          setResult({ type: "error", message: errorMessage });
          return;
        }

        if (
          isSuperAdmin &&
          targetWorkspaceId &&
          targetWorkspaceId !== currentWorkspaceId
        ) {
          const switchResponse = await fetch("/api/workspace/select", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspaceId: targetWorkspaceId }),
          });
          if (!switchResponse.ok) {
            const switchPayload = await switchResponse.json().catch(() => null);
            const switchError =
              switchPayload && typeof switchPayload.error === "string"
                ? switchPayload.error
                : "Fluxul a fost creat, dar nu am putut schimba compania activa.";
            setResult({ type: "error", message: switchError });
            return;
          }
        }

        const targetWorkspaceName =
          workspaceOptions.find((workspace) => workspace.id === targetWorkspaceId)?.name ??
          "compania selectata";

        const successMessage = isSuperAdmin
          ? `Flux creat pentru ${targetWorkspaceName}. Se deschide configurarea...`
          : "Flux creat. Se deschide configurarea...";
        setResult({ type: "success", message: successMessage });
        setNewFlowName("");
        router.push(`/flows/${payload.id}`);
        router.refresh();
      } catch {
        setResult({ type: "error", message: "A aparut o eroare la creare." });
      }
    });
  }

  function handleToggleState(flowId: string, nextActive: boolean) {
    setResult({ type: "idle", message: "" });
    startTransition(async () => {
      try {
        const response = await fetch(`/api/flows/${flowId}/state`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: nextActive }),
        });
        const payload = await response.json();
        if (!response.ok) {
          const errorMessage = typeof payload?.error === "string" ? payload.error : "Nu am putut actualiza statusul.";
          setResult({ type: "error", message: errorMessage });
          return;
        }

        setFlows((current) =>
          current.map((flow) =>
            flow.id === flowId
              ? {
                  ...flow,
                  isActive: nextActive,
                  isDraft:
                    typeof payload?.publishedAt === "string"
                      ? false
                      : flow.isDraft,
                  publishedAt:
                    typeof payload?.publishedAt === "string"
                      ? payload.publishedAt
                      : flow.publishedAt,
                  updatedAt:
                    typeof payload?.updatedAt === "string"
                      ? payload.updatedAt
                      : flow.updatedAt,
                  lastEditedByName:
                    payload?.lastEditedByUser && typeof payload.lastEditedByUser.name === "string"
                      ? payload.lastEditedByUser.name
                      : flow.lastEditedByName,
                  lastEditedByEmail:
                    payload?.lastEditedByUser && typeof payload.lastEditedByUser.email === "string"
                      ? payload.lastEditedByUser.email
                      : flow.lastEditedByEmail,
                }
              : nextActive
                ? { ...flow, isActive: false }
                : flow
          )
        );
        setResult({
          type: "success",
          message: nextActive ? "Flux activat." : "Flux dezactivat.",
        });
      } catch {
        setResult({ type: "error", message: "A aparut o eroare la actualizare." });
      }
    });
  }

  function handleDuplicateFlow(flowId: string) {
    setResult({ type: "idle", message: "" });
    startTransition(async () => {
      try {
        const response = await fetch(`/api/flows/${flowId}/duplicate`, {
          method: "POST",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const errorMessage =
            payload && typeof payload.error === "string"
              ? payload.error
              : "Nu am putut duplica fluxul.";
          setResult({ type: "error", message: errorMessage });
          return;
        }

        setResult({
          type: "success",
          message: "Flux duplicat. Se deschide draftul nou...",
        });
        if (payload && typeof payload.id === "string") {
          router.push(`/flows/${payload.id}`);
          router.refresh();
        }
      } catch {
        setResult({ type: "error", message: "A aparut o eroare la duplicare." });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-end gap-2">
          {isSuperAdmin ? (
            <label className="min-w-[220px] space-y-1 text-xs text-slate-600">
              <span>Companie</span>
              <select
                value={targetWorkspaceId}
                onChange={(event) => setTargetWorkspaceId(event.target.value)}
                disabled={!canEditFlows || isPending}
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              >
                {workspaceOptions.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="min-w-[220px] flex-1 space-y-1 text-xs text-slate-600">
            <span>Nume flux nou</span>
            <input
              value={newFlowName}
              onChange={(event) => setNewFlowName(event.target.value)}
              placeholder="Ex: Inbound standard"
              disabled={!canEditFlows}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            />
          </label>
          <Button
            type="button"
            disabled={!canEditFlows || isPending}
            className="bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-70"
            onClick={handleCreateFlow}
          >
            {isPending ? "Se creeaza..." : "Creeaza flux"}
          </Button>
        </div>
        {!canEditFlows ? (
          <p className="mt-2 text-sm text-slate-600">
            Ai acces doar de vizualizare pentru fluxuri.
          </p>
        ) : null}
        {result.type === "success" ? <p className="mt-2 text-sm text-emerald-600">{result.message}</p> : null}
        {result.type === "error" ? <p className="mt-2 text-sm text-rose-600">{result.message}</p> : null}
      </div>

      {flows.length === 0 ? (
        <p className="text-sm text-slate-600">Nu exista fluxuri in acest workspace.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Flux</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Ultima publicare</th>
                <th className="px-3 py-2 text-left font-medium">Ultima modificare</th>
                <th className="px-3 py-2 text-right font-medium">Actiuni</th>
              </tr>
            </thead>
            <tbody>
              {flows.map((flow) => {
                const status = getStatusMeta(flow);
                return (
                  <tr key={flow.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-2 align-top">
                      <p className="font-medium text-slate-900">{flow.name}</p>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className={status.className}>{status.label}</span>
                    </td>
                    <td className="px-3 py-2 align-top text-slate-700">
                      {formatDateTime(flow.publishedAt)}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <p className="text-slate-700">{formatDateTime(flow.updatedAt)}</p>
                      <p className="text-xs text-slate-500">
                        {flow.lastEditedByName ?? flow.lastEditedByEmail ?? "-"}
                      </p>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/flows/${flow.id}`}>Configureaza</Link>
                        </Button>
                        {canEditFlows ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isPending}
                              onClick={() => handleDuplicateFlow(flow.id)}
                            >
                              Duplica
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={flow.isActive ? "outline" : "default"}
                              disabled={isPending}
                              className={
                                flow.isActive
                                  ? "border-slate-200 text-slate-700 hover:bg-slate-100"
                                  : "bg-orange-500 text-white hover:bg-orange-600"
                              }
                              onClick={() => handleToggleState(flow.id, !flow.isActive)}
                            >
                              {flow.isActive ? "Dezactiveaza" : "Activeaza"}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
