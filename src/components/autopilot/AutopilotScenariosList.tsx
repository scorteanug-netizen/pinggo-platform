"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Sparkles, Users, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CreateScenarioDialog } from "@/components/autopilot/CreateScenarioDialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScenarioSummary = {
  id: string;
  name: string;
  scenarioType: string;
  mode: string;
  isDefault: boolean;
  maxQuestions: number;
  createdAt: string;
  runsCount: number;
};

interface AutopilotScenariosListProps {
  workspaceId: string;
  scenarios: ScenarioSummary[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AutopilotScenariosList({ workspaceId, scenarios }: AutopilotScenariosListProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleDelete(scenarioId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Sigur vrei sa stergi acest scenariu? Actiunea nu poate fi anulata.")) return;

    setMessage(null);
    try {
      const res = await fetch(`/api/v1/autopilot/scenarios/${scenarioId}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;

      if (res.ok) {
        setMessage({ type: "success", text: "Scenariu sters." });
        router.refresh();
        return;
      }

      if (res.status === 409) {
        if (data?.error === "SCENARIO_IN_USE") {
          setMessage({
            type: "error",
            text: "Nu poti sterge scenariul: este folosit de lead-uri existente.",
          });
          return;
        }
        if (data?.error === "WORKSPACE_MUST_HAVE_ONE_SCENARIO") {
          setMessage({
            type: "error",
            text: "Trebuie sa existe cel putin un scenariu pentru companie.",
          });
          return;
        }
      }

      setMessage({ type: "error", text: data?.error ?? "Nu am putut sterge scenariul." });
    } catch {
      setMessage({ type: "error", text: "Nu am putut sterge scenariul." });
    }
  }

  return (
    <>
      <div className="space-y-12">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center">
              <Bot className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <h1 className="text-3xl font-fraunces font-extrabold text-slate-900">
                Autopilot
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Scenarii de raspuns automat si calificare
              </p>
            </div>
          </div>

          <Button
            className="bg-orange-500 hover:bg-orange-600 text-white"
            onClick={() => setDialogOpen(true)}
          >
            + Scenariu nou
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card className="bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <CardHeader className="p-6 pb-3">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-violet-500" />
                <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
                  Total scenarii
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6 pt-0">
              <div className="text-4xl font-fraunces font-bold leading-none text-slate-900">
                {scenarios.length}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <CardHeader className="p-6 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-orange-500" />
                <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
                  AI mode
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6 pt-0">
              <div className="text-4xl font-fraunces font-bold leading-none text-slate-900">
                {scenarios.filter((s) => s.mode === "AI").length}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <CardHeader className="p-6 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-green-500" />
                <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
                  Total leaduri procesate
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6 pt-0">
              <div className="text-4xl font-fraunces font-bold leading-none text-slate-900">
                {scenarios.reduce((sum, s) => sum + s.runsCount, 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Message */}
        {message && (
          <p
            className={cn(
              "text-sm mb-4",
              message.type === "success" ? "text-emerald-600" : "text-rose-600"
            )}
          >
            {message.text}
          </p>
        )}

        {/* Scenario list */}
        {scenarios.length > 0 ? (
          <div>
            <h2 className="text-lg font-fraunces font-bold text-slate-900 mb-4">
              Scenarii configurate
            </h2>

            <div className="grid gap-4">
              {scenarios.map((scenario) => (
                <Link key={scenario.id} href={`/autopilot/${scenario.id}`}>
                  <Card
                    className={cn(
                      "bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all duration-200 hover:-translate-y-0.5 cursor-pointer",
                      scenario.mode === "AI"
                        ? "hover:border-orange-500 hover:shadow-[0_8px_20px_rgba(249,115,22,0.2)]"
                        : "hover:border-violet-500 hover:shadow-[0_8px_20px_rgba(139,92,246,0.2)]"
                    )}
                  >
                    <CardHeader className="p-6 pb-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <CardTitle className="text-lg font-fraunces font-bold text-slate-900">
                              {scenario.name}
                            </CardTitle>
                            {scenario.isDefault && (
                              <Badge variant="green" className="text-xs">Default</Badge>
                            )}
                            <Badge
                              variant={scenario.mode === "AI" ? "orange" : "violet"}
                              className="text-xs"
                            >
                              {scenario.mode === "AI" ? "AI" : "Reguli"}
                            </Badge>
                            <Badge
                              variant={scenario.scenarioType === "QUALIFY_AND_BOOK" ? "orange" : "gray"}
                              className="text-xs"
                            >
                              {scenario.scenarioType === "QUALIFY_AND_BOOK" ? "Booking" : "Calificare"}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300"
                            onClick={(e) => handleDelete(scenario.id, e)}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Sterge
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <span>Configureaza</span>
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="px-6 pb-6 pt-0">
                      <div className="grid grid-cols-3 gap-6 text-sm">
                        <div>
                          <div className="text-slate-500 text-xs mb-1">Leaduri procesate</div>
                          <div className="font-semibold text-slate-900">{scenario.runsCount}</div>
                        </div>
                        <div>
                          <div className="text-slate-500 text-xs mb-1">Max intrebari</div>
                          <div className="font-semibold text-slate-900">{scenario.maxQuestions}</div>
                        </div>
                        <div>
                          <div className="text-slate-500 text-xs mb-1">Creat</div>
                          <div className="font-semibold text-slate-900">
                            {new Date(scenario.createdAt).toLocaleDateString("ro-RO")}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50">
            <CardContent className="py-12 text-center">
              <Bot className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <h3 className="font-fraunces font-bold text-slate-900 mb-1">
                Niciun scenariu configurat
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                Creeaza primul scenariu de raspuns automat
              </p>
              <Button
                className="bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => setDialogOpen(true)}
              >
                Creeaza primul scenariu
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <CreateScenarioDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaceId={workspaceId}
      />
    </>
  );
}
