"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  Settings,
  Users,
  MessageSquare,
  Zap,
  FlaskConical,
  PartyPopper,
  ExternalLink,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OnboardingState, OnboardingStep } from "@/server/services/onboardingService";

type Props = {
  initialState: OnboardingState;
  initialStep?: string;
  workspaceId: string;
  userName?: string;
};

type StepKey = OnboardingStep | "done";

type StepConfig = {
  key: StepKey;
  label: string;
  icon: React.ElementType;
};

const STEPS: StepConfig[] = [
  { key: "workspace", label: "Configurează workspace-ul", icon: Settings },
  { key: "team", label: "Invită echipa", icon: Users },
  { key: "whatsapp", label: "Conectează WhatsApp", icon: MessageSquare },
  { key: "autopilot", label: "Configurează Autopilot", icon: Zap },
  { key: "testLead", label: "Trimite lead test", icon: FlaskConical },
  { key: "done", label: "Gata!", icon: PartyPopper },
];

const STEP_ORDER: StepKey[] = ["workspace", "team", "whatsapp", "autopilot", "testLead", "done"];

function resolveInitialStep(param: string | undefined, state: OnboardingState): StepKey {
  if (param && STEP_ORDER.includes(param as StepKey)) {
    return param as StepKey;
  }
  if (state.completedAt) return "done";
  const first = (["workspace", "team", "whatsapp", "autopilot", "testLead"] as OnboardingStep[]).find(
    (s) => !state.steps[s]
  );
  return first ?? "done";
}

async function patchStep(step: OnboardingStep): Promise<OnboardingState | null> {
  const res = await fetch("/api/v1/onboarding/steps", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.state as OnboardingState;
}

// ─── Step panels ────────────────────────────────────────────────────────────

function WorkspaceStep({ onDone }: { onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [tz, setTz] = useState("Europe/Bucharest");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/settings/workspace", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() || undefined, timezone: tz }),
        });
        if (!res.ok) {
          setError("Eroare la salvare. Încearcă din nou.");
          return;
        }
        await patchStep("workspace");
        onDone();
      } catch {
        setError("Eroare de rețea.");
      }
    });
  }

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Configurează workspace-ul</h2>
        <p className="text-sm text-slate-500 mt-1">Setează numele și fusul orar al organizației tale.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ws-name">Nume workspace</Label>
          <Input
            id="ws-name"
            placeholder="Ex: Firma SRL"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ws-tz">Fus orar</Label>
          <select
            id="ws-tz"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="Europe/Bucharest">Europe/Bucharest (GMT+2)</option>
            <option value="Europe/London">Europe/London (GMT+0)</option>
            <option value="Europe/Paris">Europe/Paris (GMT+1)</option>
            <option value="America/New_York">America/New_York (GMT-5)</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvează și continuă
          </Button>
          <Button type="button" variant="ghost" onClick={() => { startTransition(async () => { await patchStep("workspace"); onDone(); }); }}>
            Skip
          </Button>
        </div>
      </form>
    </div>
  );
}

function TeamStep({ onDone }: { onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MANAGER" | "AGENT">("AGENT");
  const [sent, setSent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/invite-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), role }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data?.error ?? "Eroare la invitație.");
          return;
        }
        setSent((prev) => [...prev, email.trim()]);
        setEmail("");
      } catch {
        setError("Eroare de rețea.");
      }
    });
  }

  function handleSkip() {
    startTransition(async () => {
      await patchStep("team");
      onDone();
    });
  }

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Invită echipa</h2>
        <p className="text-sm text-slate-500 mt-1">Adaugă colegii care vor lucra cu lead-urile.</p>
      </div>

      <form onSubmit={handleInvite} className="space-y-3">
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="coleg@firma.ro"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="ADMIN">Admin</option>
            <option value="MANAGER">Manager</option>
            <option value="AGENT">Agent</option>
          </select>
          <Button type="submit" disabled={isPending || !email.trim()}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invită"}
          </Button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {sent.length > 0 && (
        <ul className="space-y-1">
          {sent.map((e) => (
            <li key={e} className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              {e}
            </li>
          ))}
        </ul>
      )}

      <Button variant="outline" onClick={handleSkip} disabled={isPending}>
        {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        {sent.length > 0 ? "Am invitat toată echipa →" : "Fac asta mai târziu →"}
      </Button>
    </div>
  );
}

function WhatsAppStep({ onDone }: { onDone: () => void }) {
  const [isPending, startTransition] = useTransition();

  const subSteps = [
    "Intră pe business.facebook.com → WhatsApp Manager",
    "Adaugă număr telefon dedicat (SIM sau număr virtual)",
    "Verifică numărul (SMS sau apel Meta)",
    "Notează numărul — îl vei folosi în Pinggo",
    "Revino și apasă \"Am configurat\"",
  ];

  function handleDone(skip = false) {
    startTransition(async () => {
      await patchStep("whatsapp");
      onDone();
    });
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Conectează WhatsApp</h2>
        <p className="text-sm text-slate-500 mt-1">
          Urmează pașii de mai jos pentru a conecta un număr WhatsApp Business la Pinggo.
        </p>
      </div>

      <ol className="space-y-3">
        {subSteps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
              {i + 1}
            </span>
            <span className="text-sm text-slate-700 pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

      <a
        href="https://business.facebook.com/wa/manage/phone-numbers/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline transition-colors"
      >
        Deschide WhatsApp Manager
        <ExternalLink className="h-3.5 w-3.5" />
      </a>

      <div className="flex gap-3">
        <Button onClick={() => handleDone()} disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Am configurat WhatsApp
        </Button>
        <Button variant="ghost" onClick={() => handleDone(true)} disabled={isPending}>
          Fac asta mai târziu
        </Button>
      </div>
    </div>
  );
}

function AutopilotStep({ onDone }: { onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [scenarios, setScenarios] = useState<{ id: string; name: string }[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/autopilot/scenarios")
      .then((r) => r.json())
      .then((data) => {
        setScenarios(Array.isArray(data) ? data : data.scenarios ?? []);
      })
      .catch(() => setScenarios([]))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSkip() {
    startTransition(async () => {
      await patchStep("autopilot");
      onDone();
    });
  }

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Configurează Autopilot</h2>
        <p className="text-sm text-slate-500 mt-1">
          Autopilot-ul gestionează automat conversațiile cu lead-urile pe WhatsApp.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Se încarcă scenariile...
        </div>
      ) : scenarios && scenarios.length > 0 ? (
        <div className="space-y-2">
          {scenarios.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3"
            >
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <span className="text-sm font-medium text-green-900">{s.name}</span>
              <span className="ml-auto text-xs text-green-600">Configurat ✓</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 space-y-3">
          <p className="text-sm text-orange-800">Nu ai niciun scenariu configurat încă.</p>
          <Link
            href="/autopilot"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-700 hover:text-orange-900 transition-colors"
          >
            Creează scenariu
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      <Button variant="outline" onClick={handleSkip} disabled={isPending}>
        {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        {scenarios && scenarios.length > 0 ? "Am configurat / Continuă →" : "Fac asta mai târziu →"}
      </Button>
    </div>
  );
}

function TestLeadStep({ onDone }: { onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<{ leadId: string; autopilotStarted: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSend() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/v1/onboarding/test-lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: phone.trim() || undefined }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error ?? "Eroare la creare lead.");
          return;
        }
        setResult({ leadId: data.leadId, autopilotStarted: data.autopilotStarted });
      } catch {
        setError("Eroare de rețea.");
      }
    });
  }

  function handleSkip() {
    startTransition(async () => {
      await patchStep("testLead");
      onDone();
    });
  }

  if (result) {
    return (
      <div className="max-w-md space-y-6">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
          <div>
            <h2 className="text-xl font-bold text-slate-900">Lead creat!</h2>
            <p className="text-sm text-slate-500">Verifică WhatsApp-ul pentru mesajul de bun venit.</p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
          <p className="text-xs text-slate-500">Lead ID</p>
          <p className="font-mono text-sm text-slate-800">{result.leadId}</p>
          <Link
            href={`/leads/${result.leadId}`}
            className="inline-flex items-center gap-1 text-sm text-orange-600 hover:text-orange-800 hover:underline"
          >
            Deschide lead →
          </Link>
        </div>

        {!result.autopilotStarted && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            WhatsApp nu e conectat — autopilotul va porni după conectare.
          </div>
        )}

        <Button onClick={onDone}>Continuă →</Button>
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Trimite lead test</h2>
        <p className="text-sm text-slate-500 mt-1">
          Creează un lead de test ca să verifici că totul funcționează end-to-end.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="test-phone">Număr de telefon (opțional)</Label>
        <Input
          id="test-phone"
          placeholder="+40712345678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <p className="text-xs text-slate-500">Numărul tău personal — vei primi mesajul WhatsApp pe el.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <Button onClick={handleSend} disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Trimite lead test
        </Button>
        <Button variant="ghost" onClick={handleSkip} disabled={isPending}>
          Skip
        </Button>
      </div>
    </div>
  );
}

function DoneStep({ state }: { state: OnboardingState }) {
  const router = useRouter();
  const allStepKeys: OnboardingStep[] = ["workspace", "team", "whatsapp", "autopilot", "testLead"];
  const labels: Record<OnboardingStep, string> = {
    workspace: "Workspace configurat",
    team: "Echipă invitată",
    whatsapp: "WhatsApp conectat",
    autopilot: "Autopilot configurat",
    testLead: "Lead test trimis",
  };

  const configured = allStepKeys.filter((k) => state.steps[k]);
  const missing = allStepKeys.filter((k) => !state.steps[k]);

  return (
    <div className="max-w-md space-y-6">
      <div className="flex items-center gap-3">
        <PartyPopper className="h-8 w-8 text-orange-500" />
        <div>
          <h2 className="text-xl font-bold text-slate-900">Ești gata!</h2>
          <p className="text-sm text-slate-500">Iată un rezumat al setup-ului tău.</p>
        </div>
      </div>

      {configured.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Configurat</p>
          {configured.map((k) => (
            <div key={k} className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              {labels[k]}
            </div>
          ))}
        </div>
      )}

      {missing.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Lipsă</p>
          {missing.map((k) => (
            <div key={k} className="flex items-center gap-2 text-sm text-slate-500">
              <Circle className="h-4 w-4" />
              {labels[k]}
            </div>
          ))}
        </div>
      )}

      <Button onClick={() => router.push("/dashboard")}>Mergi la Dashboard →</Button>
    </div>
  );
}

// ─── Main wizard ─────────────────────────────────────────────────────────────

export function OnboardingWizard({ initialState, initialStep, workspaceId: _workspaceId, userName }: Props) {
  const [state, setState] = useState<OnboardingState>(initialState);
  const [currentStep, setCurrentStep] = useState<StepKey>(() =>
    resolveInitialStep(initialStep, initialState)
  );

  const currentIndex = STEP_ORDER.indexOf(currentStep);

  function goTo(step: StepKey) {
    setCurrentStep(step);
  }

  function handleStepDone(updatedState?: OnboardingState) {
    if (updatedState) setState(updatedState);
    const nextIdx = currentIndex + 1;
    if (nextIdx < STEP_ORDER.length) {
      setCurrentStep(STEP_ORDER[nextIdx]);
    }
  }

  async function onStepComplete(step: OnboardingStep) {
    const updated = await patchStep(step);
    if (updated) setState(updated);
    const nextIdx = STEP_ORDER.indexOf(step) + 1;
    if (nextIdx < STEP_ORDER.length) {
      setCurrentStep(STEP_ORDER[nextIdx]);
    }
  }

  function renderStepContent() {
    switch (currentStep) {
      case "workspace":
        return <WorkspaceStep onDone={() => onStepComplete("workspace")} />;
      case "team":
        return <TeamStep onDone={() => onStepComplete("team")} />;
      case "whatsapp":
        return <WhatsAppStep onDone={() => onStepComplete("whatsapp")} />;
      case "autopilot":
        return <AutopilotStep onDone={() => onStepComplete("autopilot")} />;
      case "testLead":
        return <TestLeadStep onDone={() => onStepComplete("testLead")} />;
      case "done":
        return <DoneStep state={state} />;
      default:
        return null;
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-6rem)] gap-0">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white py-8 px-4">
        {userName && (
          <p className="text-xs text-slate-500 mb-6 px-2">
            Bun venit, <span className="font-semibold text-slate-700">{userName}</span>!
          </p>
        )}
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-2 mb-3">
          Setup workspace
        </p>
        <nav className="space-y-1">
          {STEPS.map((step, idx) => {
            const isActive = currentStep === step.key;
            const isDone =
              step.key !== "done" && state.steps[step.key as OnboardingStep];
            const Icon = step.icon;
            return (
              <button
                key={step.key}
                onClick={() => goTo(step.key)}
                className={[
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-orange-50 text-orange-700 font-semibold"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                ].join(" ")}
              >
                <span className="relative shrink-0">
                  <Icon className="h-4 w-4" />
                  {isDone && (
                    <CheckCircle2 className="absolute -right-1.5 -top-1.5 h-3 w-3 text-green-500 bg-white rounded-full" />
                  )}
                </span>
                <span className="truncate">{step.label}</span>
                {idx < STEP_ORDER.length - 1 && (
                  <span className="ml-auto text-xs text-slate-400 tabular-nums">
                    {idx + 1}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 py-8 px-8 bg-slate-50">
        {renderStepContent()}
      </main>
    </div>
  );
}
