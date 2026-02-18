"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Bot,
  BookOpen,
  Building2,
  Calendar,
  Lightbulb,
  MessageSquare,
  RotateCcw,
  Save,
  Sparkles,
  UserCheck,
  Wrench,
} from "lucide-react";
import { DEFAULT_AUTOPILOT_PROMPT_RO } from "@/server/services/autopilot/defaultPrompts";
import { ScenarioPlayground } from "./ScenarioPlayground";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScenarioData = {
  id: string;
  workspaceId: string;
  name: string;
  scenarioType: string;
  mode: string;
  aiPrompt: string | null;
  slaMinutes: number;
  maxQuestions: number;
  handoverUserId: string | null;
  bookingConfigJson: Record<string, unknown> | null;
  isDefault: boolean;
  agentName: string | null;
  companyName: string | null;
  companyDescription: string | null;
  offerSummary: string | null;
  calendarLinkRaw: string | null;
  language: string;
  tone: string | null;
  knowledgeBaseJson: Record<string, unknown> | null;
  qualificationCriteria: { requiredSlots: string[] } | null;
  createdAt: string;
  updatedAt: string;
};

type MemberOption = {
  id: string;
  name: string | null;
  email: string;
};

interface ScenarioEditorProps {
  scenario: ScenarioData;
  members: MemberOption[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NONE_VALUE = "__none__";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScenarioEditor({ scenario, members }: ScenarioEditorProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Core fields
  const [name, setName] = useState(scenario.name);
  const [scenarioType, setScenarioType] = useState(scenario.scenarioType);
  const [mode, setMode] = useState(scenario.mode);
  const [aiPrompt, setAiPrompt] = useState(
    scenario.aiPrompt?.trim() ? scenario.aiPrompt : DEFAULT_AUTOPILOT_PROMPT_RO,
  );
  const [slaMinutes, setSlaMinutes] = useState(scenario.slaMinutes);
  const [maxQuestions, setMaxQuestions] = useState(scenario.maxQuestions);
  const [handoverUserId, setHandoverUserId] = useState(scenario.handoverUserId ?? NONE_VALUE);

  // Company context fields
  const [agentName, setAgentName] = useState(scenario.agentName ?? "");
  const [companyName, setCompanyName] = useState(scenario.companyName ?? "");
  const [companyDescription, setCompanyDescription] = useState(scenario.companyDescription ?? "");
  const [offerSummary, setOfferSummary] = useState(scenario.offerSummary ?? "");
  const [calendarLinkRaw, setCalendarLinkRaw] = useState(scenario.calendarLinkRaw ?? "");
  const [tone, setTone] = useState(scenario.tone ?? "friendly");
  const [knowledgeBaseJson, setKnowledgeBaseJson] = useState(
    scenario.knowledgeBaseJson ? JSON.stringify(scenario.knowledgeBaseJson, null, 2) : "",
  );

  async function handleSave() {
    setSaving(true);
    setSaved(false);

    let parsedKb: Record<string, unknown> | null = null;
    if (knowledgeBaseJson.trim()) {
      try {
        parsedKb = JSON.parse(knowledgeBaseJson.trim());
      } catch {
        // leave null if invalid
      }
    }

    try {
      const res = await fetch(`/api/v1/autopilot/scenarios/${scenario.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          scenarioType,
          mode,
          aiPrompt: mode === "AI" ? aiPrompt || null : null,
          slaMinutes,
          maxQuestions,
          handoverUserId: handoverUserId === NONE_VALUE ? null : handoverUserId,
          agentName: agentName.trim() || null,
          companyName: companyName.trim() || null,
          companyDescription: companyDescription.trim() || null,
          offerSummary: offerSummary.trim() || null,
          calendarLinkRaw: calendarLinkRaw.trim() || null,
          tone: tone || null,
          knowledgeBaseJson: parsedKb,
        }),
      });

      if (res.ok) {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleResetTemplate() {
    if (aiPrompt.trim() && aiPrompt !== DEFAULT_AUTOPILOT_PROMPT_RO) {
      const ok = window.confirm(
        "Promptul AI nu este gol. Vrei sa il inlocuiesti cu template-ul default?",
      );
      if (!ok) return;
    }
    setAiPrompt(DEFAULT_AUTOPILOT_PROMPT_RO);
  }

  const [activeTab, setActiveTab] = useState<"config" | "playground">("config");
  const isAi = mode === "AI";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/autopilot")}
          className="gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          Inapoi
        </Button>

        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
              <Bot className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-2xl font-fraunces font-extrabold text-slate-900">
                {scenario.name}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                {scenario.isDefault && (
                  <Badge variant="green" className="text-xs">Default</Badge>
                )}
                <span className="text-xs text-slate-500">
                  Creat {new Date(scenario.createdAt).toLocaleDateString("ro-RO")}
                </span>
              </div>
            </div>
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5"
        >
          <Save className="h-4 w-4" />
          {saving ? "Se salveaza..." : saved ? "Salvat!" : "Salveaza"}
        </Button>
      </div>

      {/* Tabs: Configurare | Playground */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("config")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "config"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Wrench className="h-4 w-4" />
          Configurare
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("playground")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "playground"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Playground
        </button>
      </div>

      {activeTab === "playground" ? (
        <ScenarioPlayground scenarioId={scenario.id} />
      ) : (
        <>
      {/* Onboarding guidance */}
      <Card className="bg-gradient-to-r from-violet-50 to-orange-50 border-violet-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Lightbulb className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-2">
                Cum configurezi Autopilotul (2-5 minute)
              </h3>
              <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside">
                <li>Completeaza <span className="font-medium text-slate-700">informatiile companiei</span> (nume, descriere, oferta)</li>
                <li>Alege <span className="font-medium text-slate-700">tipul scenariului</span> (Calificare / Calificare + Booking)</li>
                <li>Selecteaza <span className="font-medium text-slate-700">modul AI</span> si genereaza promptul cu butonul de template</li>
                <li>Seteaza <span className="font-medium text-slate-700">SLA</span> (minute) si <span className="font-medium text-slate-700">nr. maxim intrebari</span></li>
                <li>Alege <span className="font-medium text-slate-700">agentul de handover</span> si optional <span className="font-medium text-slate-700">link-ul de calendar</span></li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left column: Main settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* General info */}
          <Card className="bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <CardHeader className="p-6 pb-4">
              <CardTitle className="text-sm font-semibold text-slate-700">
                Informatii generale
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 pt-0 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nume scenariu</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex: Calificare Lead Imobiliare"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="scenarioType">Tip scenariu</Label>
                <Select value={scenarioType} onValueChange={setScenarioType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QUALIFY_ONLY">
                      <div className="flex items-center gap-2">
                        <Badge variant="violet" className="text-xs">Calificare</Badge>
                        <span>Intrebari de calificare + handover</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="QUALIFY_AND_BOOK">
                      <div className="flex items-center gap-2">
                        <Badge variant="orange" className="text-xs">Booking</Badge>
                        <span>Calificare + programare automata</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Company context */}
          <Card className="bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <CardHeader className="p-6 pb-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-500" />
                <CardTitle className="text-sm font-semibold text-slate-700">
                  Context companie si agent
                </CardTitle>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Aceste informatii vor fi injectate automat in promptul AI.
              </p>
            </CardHeader>
            <CardContent className="px-6 pb-6 pt-0 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="agentName">Nume agent</Label>
                  <Input
                    id="agentName"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="ex: Andreea"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyName">Nume companie</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="ex: AcmeDental"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyDescription">Descriere companie</Label>
                <Textarea
                  id="companyDescription"
                  value={companyDescription}
                  onChange={(e) => setCompanyDescription(e.target.value)}
                  placeholder="1-3 paragrafe despre companie: ce face, pentru cine, ce o diferentiaza."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="offerSummary">Oferta pe scurt</Label>
                <Textarea
                  id="offerSummary"
                  value={offerSummary}
                  onChange={(e) => setOfferSummary(e.target.value)}
                  placeholder="1-2 propozitii: ce oferiti si de ce e relevant. ex: Consultatie stomatologica gratuita + plan de tratament."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="calendarLinkRaw">Link calendar</Label>
                  <Input
                    id="calendarLinkRaw"
                    value={calendarLinkRaw}
                    onChange={(e) => setCalendarLinkRaw(e.target.value)}
                    placeholder="https://calendly.com/..."
                  />
                  <p className="text-xs text-slate-500">Optional, pentru booking</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tone">Ton comunicare</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="friendly">Prietenos</SelectItem>
                      <SelectItem value="professional">Profesional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mode toggle */}
          <Card className="bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <CardHeader className="p-6 pb-4">
              <CardTitle className="text-sm font-semibold text-slate-700">
                Mod functionare
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 pt-0">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMode("RULES")}
                  className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                    !isAi
                      ? "border-violet-500 bg-violet-50/50 shadow-[0_0_0_1px_rgba(139,92,246,0.1)]"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    !isAi ? "bg-violet-100" : "bg-slate-100"
                  }`}>
                    <Wrench className={`w-5 h-5 ${!isAi ? "text-violet-600" : "text-slate-400"}`} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-slate-900">Reguli</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Intrebari predefinite, flux fix
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode("AI")}
                  className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                    isAi
                      ? "border-orange-500 bg-orange-50/50 shadow-[0_0_0_1px_rgba(249,115,22,0.1)]"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    isAi ? "bg-orange-100" : "bg-slate-100"
                  }`}>
                    <Sparkles className={`w-5 h-5 ${isAi ? "text-orange-600" : "text-slate-400"}`} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-slate-900">AI Script</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Prompt personalizat, raspuns inteligent
                    </div>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* AI Prompt (shown only in AI mode) */}
          {isAi && (
            <Card className="bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] border-orange-200">
              <CardHeader className="p-6 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-orange-500" />
                    <CardTitle className="text-sm font-semibold text-slate-700">
                      AI Script / Prompt
                    </CardTitle>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResetTemplate}
                    className="gap-1.5 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reseteaza la template
                  </Button>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Descrie cum ar trebui sa se comporte asistentul. Variabilele precum {"{company_name}"} sunt inlocuite automat la runtime.
                </p>
              </CardHeader>
              <CardContent className="px-6 pb-6 pt-0 space-y-3">
                <Textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder={`Apasa "Insereaza template" sau scrie manual.\n\nExemplu:\nEsti asistent virtual pentru AcmeDental.\nTonul este prietenos si profesional.\nColecteaza: ce serviciu il intereseaza, pentru cand ar dori programare.`}
                  rows={16}
                  className="font-mono text-sm"
                />
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <span>Variabile disponibile:</span>
                  <Badge variant="gray" className="font-mono text-xs">{"{agent_name}"}</Badge>
                  <Badge variant="gray" className="font-mono text-xs">{"{company_name}"}</Badge>
                  <Badge variant="gray" className="font-mono text-xs">{"{company_description}"}</Badge>
                  <Badge variant="gray" className="font-mono text-xs">{"{offer_summary}"}</Badge>
                  <Badge variant="gray" className="font-mono text-xs">{"{calendar_link_raw}"}</Badge>
                  <Badge variant="gray" className="font-mono text-xs">{"{lead_name}"}</Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Knowledge base */}
          {isAi && (
            <Card className="bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
              <CardHeader className="p-6 pb-4">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-slate-500" />
                  <CardTitle className="text-sm font-semibold text-slate-700">
                    Knowledge Base (Q&A)
                  </CardTitle>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Raspunsuri la intrebari frecvente, in format JSON. Autopilotul le va folosi cand prospectul intreaba ceva relevant.
                </p>
              </CardHeader>
              <CardContent className="px-6 pb-6 pt-0">
                <Textarea
                  value={knowledgeBaseJson}
                  onChange={(e) => setKnowledgeBaseJson(e.target.value)}
                  placeholder={`{\n  "qa": [\n    { "q": "Cat costa consultatia?", "a": "Prima consultatie este gratuita." },\n    { "q": "Unde sunteti?", "a": "Str. Exemplu 10, Bucuresti." }\n  ]\n}`}
                  rows={6}
                  className="font-mono text-sm"
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: Parameters */}
        <div className="space-y-6">
          <Card className="bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <CardHeader className="p-6 pb-4">
              <CardTitle className="text-sm font-semibold text-slate-700">
                Parametri
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 pt-0 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="maxQuestions">Nr. maxim intrebari</Label>
                <Input
                  id="maxQuestions"
                  type="number"
                  min={1}
                  max={10}
                  value={maxQuestions}
                  onChange={(e) => setMaxQuestions(parseInt(e.target.value) || 2)}
                />
                <p className="text-xs text-slate-500">
                  Cate intrebari pune autopilotul inainte de handover
                </p>
              </div>

              {scenario.qualificationCriteria?.requiredSlots?.length ? (
                <div className="space-y-2">
                  <Label>Campuri obligatorii</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {scenario.qualificationCriteria.requiredSlots.map((slot) => (
                      <Badge key={slot} variant="outline" className="text-xs font-mono">
                        {slot}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">
                    Handover-ul se declanseaza cand toate aceste campuri sunt colectate.
                  </p>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="slaMinutes">SLA raspuns (minute)</Label>
                <Input
                  id="slaMinutes"
                  type="number"
                  min={1}
                  max={1440}
                  value={slaMinutes}
                  onChange={(e) => setSlaMinutes(parseInt(e.target.value) || 15)}
                />
                <p className="text-xs text-slate-500">
                  Timp maxim de raspuns inainte de alerta
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="handoverUser">Handover catre</Label>
                <Select value={handoverUserId} onValueChange={setHandoverUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecteaza agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>
                      <span className="text-slate-500">Fara agent specificat</span>
                    </SelectItem>
                    {members.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                          <span>{member.name || member.email}</span>
                          {member.name && (
                            <span className="text-xs text-slate-400">{member.email}</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  Agentul care preia leadul dupa ce autopilotul termina
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Mode info card */}
          <Card className={`shadow-[0_2px_8px_rgba(0,0,0,0.08)] ${
            isAi ? "bg-orange-50/50 border-orange-200" : "bg-violet-50/50 border-violet-200"
          }`}>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-2">
                {isAi ? (
                  <Sparkles className="w-4 h-4 text-orange-500" />
                ) : (
                  <Wrench className="w-4 h-4 text-violet-500" />
                )}
                <span className="text-sm font-semibold text-slate-700">
                  {isAi ? "Mod AI activ" : "Mod Reguli activ"}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {isAi
                  ? "Autopilotul va folosi promptul AI pentru a genera raspunsuri personalizate. Numarul de intrebari ramane limitat la valoarea configurata."
                  : "Autopilotul foloseste intrebari predefinite (pret, programare, alte detalii). Fluxul este fix si predictibil."
                }
              </p>
            </CardContent>
          </Card>

          {/* Calendar hint (shown only when booking type) */}
          {scenarioType === "QUALIFY_AND_BOOK" && (
            <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-green-50/50 border-green-200">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-slate-700">Booking activ</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Adauga un link de calendar (Calendly, Cal.com, etc) in campul "Link calendar" de mai sus. Autopilotul il va trimite prospectilor.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
