"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Wrench } from "lucide-react";
import { DEFAULT_AUTOPILOT_PROMPT_RO } from "@/server/services/autopilot/defaultPrompts";

interface CreateScenarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}

export function CreateScenarioDialog({ open, onOpenChange, workspaceId }: CreateScenarioDialogProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [scenarioType, setScenarioType] = useState("QUALIFY_ONLY");
  const [mode, setMode] = useState("RULES");
  const [aiPrompt, setAiPrompt] = useState("");
  const [maxQuestions, setMaxQuestions] = useState(2);

  const isAi = mode === "AI";

  function resetForm() {
    setName("");
    setScenarioType("QUALIFY_ONLY");
    setMode("RULES");
    setAiPrompt("");
    setMaxQuestions(2);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/autopilot/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: name.trim(),
          scenarioType,
          mode,
          aiPrompt: isAi && aiPrompt.trim() ? aiPrompt.trim() : undefined,
          maxQuestions,
          isDefault: false,
        }),
      });

      if (res.ok) {
        const scenario = await res.json();
        resetForm();
        onOpenChange(false);
        router.push(`/autopilot/${scenario.id}`);
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-500" />
            Scenariu nou
          </DialogTitle>
          <DialogDescription>
            Configureaza un scenariu de raspuns automat
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="create-name">Nume scenariu *</Label>
            <Input
              id="create-name"
              placeholder="ex: Calificare Lead Imobiliare"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label htmlFor="create-type">Tip scenariu</Label>
            <Select value={scenarioType} onValueChange={setScenarioType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="QUALIFY_ONLY">
                  <div className="flex items-center gap-2">
                    <Badge variant="violet" className="text-xs">Calificare</Badge>
                    <span>Intrebari + handover</span>
                  </div>
                </SelectItem>
                <SelectItem value="QUALIFY_AND_BOOK">
                  <div className="flex items-center gap-2">
                    <Badge variant="orange" className="text-xs">Booking</Badge>
                    <span>Calificare + programare</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mode */}
          <div className="space-y-2">
            <Label>Mod functionare</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode("RULES")}
                className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                  !isAi
                    ? "border-violet-500 bg-violet-50/50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <Wrench className={`w-4 h-4 ${!isAi ? "text-violet-600" : "text-slate-400"}`} />
                <div>
                  <div className="font-semibold text-sm text-slate-900">Reguli</div>
                  <div className="text-xs text-slate-500">Flux predefinit</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode("AI");
                  if (!aiPrompt.trim()) setAiPrompt(DEFAULT_AUTOPILOT_PROMPT_RO);
                }}
                className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                  isAi
                    ? "border-orange-500 bg-orange-50/50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <Sparkles className={`w-4 h-4 ${isAi ? "text-orange-600" : "text-slate-400"}`} />
                <div>
                  <div className="font-semibold text-sm text-slate-900">AI Script</div>
                  <div className="text-xs text-slate-500">Prompt personalizat</div>
                </div>
              </button>
            </div>
          </div>

          {/* AI Prompt (only when AI mode) */}
          {isAi && (
            <div className="space-y-2">
              <Label htmlFor="create-aiPrompt">AI Script / Prompt</Label>
              <Textarea
                id="create-aiPrompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={`Esti asistent virtual pentru [Companie].\nTonul este prietenos.\nColecteaza: serviciu dorit, preferinta de zi.`}
                rows={5}
                className="font-mono text-sm"
              />
            </div>
          )}

          {/* Max questions */}
          <div className="space-y-2">
            <Label htmlFor="create-maxQuestions">Nr. maxim intrebari</Label>
            <Input
              id="create-maxQuestions"
              type="number"
              min={1}
              max={10}
              value={maxQuestions}
              onChange={(e) => setMaxQuestions(parseInt(e.target.value) || 2)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Anuleaza
            </Button>
            <Button
              type="submit"
              disabled={submitting || !name.trim()}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {submitting ? "Se creeaza..." : "Creeaza scenariu"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
