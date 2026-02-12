"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

type ScheduleDay = {
  enabled: boolean;
  start: string;
  end: string;
};

type SettingsFormState = {
  workspaceId: string;
  workspaceName: string;
  businessHoursEnabled: boolean;
  timezone: string;
  defaultFlowId: string | null;
  schedule: Record<DayKey, ScheduleDay>;
  flows: Array<{
    id: string;
    name: string;
    isActive: boolean;
  }>;
};

type SettingsFormProps = {
  initialData: SettingsFormState;
};

const WEEKDAYS: Array<{ key: DayKey; label: string }> = [
  { key: "mon", label: "Luni" },
  { key: "tue", label: "Marti" },
  { key: "wed", label: "Miercuri" },
  { key: "thu", label: "Joi" },
  { key: "fri", label: "Vineri" },
];

export function SettingsForm({ initialData }: SettingsFormProps) {
  const [form, setForm] = useState<SettingsFormState>(initialData);
  const [result, setResult] = useState<{ type: "idle" | "success" | "error"; message: string }>({
    type: "idle",
    message: "",
  });
  const [isPending, startTransition] = useTransition();

  const selectedFlowLabel = useMemo(() => {
    if (!form.defaultFlowId) return "Niciun flux selectat";
    const flow = form.flows.find((item) => item.id === form.defaultFlowId);
    return flow ? flow.name : "Flux necunoscut";
  }, [form.defaultFlowId, form.flows]);

  function updateScheduleDay(day: DayKey, next: Partial<ScheduleDay>) {
    setForm((previous) => ({
      ...previous,
      schedule: {
        ...previous.schedule,
        [day]: {
          ...previous.schedule[day],
          ...next,
        },
      },
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult({ type: "idle", message: "" });

    const payload = {
      workspaceName: form.workspaceName,
      businessHoursEnabled: form.businessHoursEnabled,
      timezone: form.timezone,
      defaultFlowId: form.defaultFlowId,
      schedule: form.schedule,
    };

    startTransition(async () => {
      try {
        const response = await fetch("/api/settings/workspace", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) {
          const message = typeof data?.error === "string" ? data.error : "Nu am putut salva setarile.";
          setResult({ type: "error", message });
          return;
        }

        setForm((previous) => ({
          ...previous,
          workspaceName: data.workspaceName,
          businessHoursEnabled: data.businessHoursEnabled,
          timezone: data.timezone,
          defaultFlowId: data.defaultFlowId,
          schedule: data.schedule,
          flows: data.flows,
        }));
        setResult({ type: "success", message: "Setarile au fost salvate." });
      } catch {
        setResult({ type: "error", message: "A aparut o eroare la salvare." });
      }
    });
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <SectionCard
        title="Workspace"
        description="Setari generale pentru echipa curenta."
        borderColor="orange"
        contentClassName="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="workspaceName">Nume workspace</Label>
          <Input
            id="workspaceName"
            value={form.workspaceName}
            onChange={(event) => setForm((previous) => ({ ...previous, workspaceName: event.target.value }))}
            placeholder="Ex: Demo"
            className="h-10"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="defaultFlow">Flux implicit pentru leaduri noi</Label>
          <select
            id="defaultFlow"
            value={form.defaultFlowId ?? ""}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                defaultFlowId: event.target.value ? event.target.value : null,
              }))
            }
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
          >
            <option value="">Neselectat</option>
            {form.flows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.name}
                {flow.isActive ? " (activ)" : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500">Flux selectat: {selectedFlowLabel}</p>
        </div>
      </SectionCard>

      <SectionCard
        title="Program de lucru"
        description="Folosit pentru calculul termenelor cand business hours este activ."
        borderColor="orange"
        contentClassName="space-y-4"
      >
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.businessHoursEnabled}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, businessHoursEnabled: event.target.checked }))
            }
            className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
          />
          Activeaza business hours
        </label>

        <div className="space-y-2">
          <Label htmlFor="timezone">Timezone</Label>
          <Input
            id="timezone"
            value={form.timezone}
            onChange={(event) => setForm((previous) => ({ ...previous, timezone: event.target.value }))}
            placeholder="Europe/Bucharest"
            className="h-10"
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Zi</th>
                <th className="px-3 py-2">Activ</th>
                <th className="px-3 py-2">Inceput</th>
                <th className="px-3 py-2">Final</th>
              </tr>
            </thead>
            <tbody>
              {WEEKDAYS.map((weekday) => {
                const day = form.schedule[weekday.key];
                return (
                  <tr key={weekday.key} className="border-t border-slate-200">
                    <td className="px-3 py-2 font-medium text-slate-700">{weekday.label}</td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={day.enabled}
                        onChange={(event) =>
                          updateScheduleDay(weekday.key, {
                            enabled: event.target.checked,
                          })
                        }
                        className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="time"
                        value={day.start}
                        onChange={(event) =>
                          updateScheduleDay(weekday.key, {
                            start: event.target.value,
                          })
                        }
                        className="h-9 min-w-[130px]"
                        disabled={!day.enabled}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="time"
                        value={day.end}
                        onChange={(event) =>
                          updateScheduleDay(weekday.key, {
                            end: event.target.value,
                          })
                        }
                        className="h-9 min-w-[130px]"
                        disabled={!day.enabled}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          className="bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-70"
          disabled={isPending}
        >
          {isPending ? "Se salveaza..." : "Salveaza setari"}
        </Button>
        {result.type !== "idle" ? (
          <p className={result.type === "success" ? "text-sm text-emerald-600" : "text-sm text-rose-600"}>
            {result.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
