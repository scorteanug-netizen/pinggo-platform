"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type WorkspaceOption = {
  id: string;
  name: string;
};

type WorkspaceSwitcherProps = {
  workspaces: WorkspaceOption[];
  currentWorkspaceId: string;
};

export function WorkspaceSwitcher({ workspaces, currentWorkspaceId }: WorkspaceSwitcherProps) {
  const router = useRouter();
  const [value, setValue] = useState(currentWorkspaceId);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleChange(nextValue: string) {
    setValue(nextValue);
    setError("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/workspace/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: nextValue }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            payload && typeof payload.error === "string"
              ? payload.error
              : "Nu am putut schimba compania.";
          setError(message);
          setValue(currentWorkspaceId);
          return;
        }
        router.refresh();
      } catch {
        setError("A aparut o eroare la schimbarea companiei.");
        setValue(currentWorkspaceId);
      }
    });
  }

  return (
    <div className="min-w-[220px]">
      <label className="flex items-center gap-2 text-xs text-slate-500">
        <span className="whitespace-nowrap">Companie</span>
        <select
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          disabled={isPending}
          className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200 disabled:cursor-wait disabled:opacity-70"
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
