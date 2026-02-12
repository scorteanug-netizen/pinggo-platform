"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Calendar, TrendingUp, Users } from "lucide-react";
import { CreateScenarioDialog } from "@/components/autopilot/CreateScenarioDialog";

// DUMMY DATA pentru scenarii
const dummyScenarios = [
  {
    id: "1",
    name: "Programare Consultație Medicală",
    type: "booking",
    status: "active",
    leadsProcessed: 127,
    leadsBooked: 41,
    bookingRate: 32,
    lastUsed: "acum 2 ore",
    description: "Răspuns instant + programare pentru consultații medicale"
  },
  {
    id: "2",
    name: "Calificare Lead Imobiliare",
    type: "qualification",
    status: "active",
    leadsProcessed: 89,
    leadsBooked: 0,
    bookingRate: 0,
    lastUsed: "acum 5 ore",
    description: "Întrebări de calificare pentru agenți imobiliari"
  },
  {
    id: "3",
    name: "Demo Panouri Solare",
    type: "booking",
    status: "paused",
    leadsProcessed: 34,
    leadsBooked: 8,
    bookingRate: 24,
    lastUsed: "ieri",
    description: "Programare demo pentru consultanță panouri solare"
  }
];

export default function AutopilotPage() {
  const [dialogOpen, setDialogOpen] = useState(false);

  // DUMMY: hardcoded permissions pentru moment (Task #3 va adăuga auth check)
  const permissions = { canViewLeads: true };

  return (
    <>
      <div className="space-y-6">
        {/* Header cu styling Fraunces */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
                <Bot className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h1 className="text-3xl font-fraunces font-black text-slate-900">
                  Autopilot
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  Răspuns instant + programare automată
                </p>
              </div>
            </div>
          </div>

          <Button
            className="bg-orange-500 hover:bg-orange-600 text-white"
            onClick={() => setDialogOpen(true)}
          >
            + Scenariu nou
          </Button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-t-4 border-t-orange-500">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-orange-600" />
                <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
                  Scenarii Active
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-fraunces font-black text-slate-900">3</div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-orange-500">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-orange-600" />
                <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
                  Leaduri Azi
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-fraunces font-black text-slate-900">47</div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-orange-500">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-orange-600" />
                <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
                  Booking Rate
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-fraunces font-black text-slate-900">32%</div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-orange-500">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-orange-600" />
                <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
                  Handover Rate
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-fraunces font-black text-slate-900">12%</div>
            </CardContent>
          </Card>
        </div>

        {/* Scenarii List */}
        <div>
          <h2 className="text-lg font-fraunces font-bold text-slate-900 mb-4">
            Scenarii Configurate
          </h2>

          <div className="grid gap-4">
            {dummyScenarios.map((scenario) => (
              <Card key={scenario.id} className="border-t-4 border-t-orange-500 hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-lg font-fraunces font-bold text-slate-900">
                          {scenario.name}
                        </CardTitle>
                        <Badge variant={scenario.status === "active" ? "green" : "gray"}>
                          {scenario.status === "active" ? "Activ" : "Pausat"}
                        </Badge>
                        <Badge variant={scenario.type === "booking" ? "orange" : "gray"}>
                          {scenario.type === "booking" ? "Booking" : "Calificare"}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600">
                        {scenario.description}
                      </p>
                    </div>

                    <Button variant="outline" size="sm">
                      Configurează
                    </Button>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-slate-500 text-xs mb-1">Leaduri procesate</div>
                      <div className="font-semibold text-slate-900">{scenario.leadsProcessed}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-xs mb-1">Programate</div>
                      <div className="font-semibold text-slate-900">{scenario.leadsBooked}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-xs mb-1">Booking rate</div>
                      <div className="font-semibold text-slate-900">
                        {scenario.bookingRate > 0 ? `${scenario.bookingRate}%` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-xs mb-1">Ultima utilizare</div>
                      <div className="font-semibold text-slate-900">{scenario.lastUsed}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Empty State pentru future scenarios */}
        <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50">
          <CardContent className="py-12 text-center">
            <Bot className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <h3 className="font-fraunces font-bold text-slate-900 mb-1">
              Gata să creezi un scenariu nou?
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              Configurează răspunsuri automate și programări în câteva clickuri
            </p>
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => setDialogOpen(true)}
            >
              Creează primul scenariu
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Dialog component */}
      <CreateScenarioDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
