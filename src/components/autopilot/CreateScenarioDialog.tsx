"use client";

import { useState } from "react";
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
import { Sparkles } from "lucide-react";

interface CreateScenarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateScenarioDialog({ open, onOpenChange }: CreateScenarioDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    type: "booking",
    description: "",
    welcomeMessage: "Bună {nume}! Văd că ești interesat de {sursa}. Te pot ajuta să programezi o consultație?",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // TODO: Task #3 va adăuga API call pentru salvare
    console.log("Scenariu nou (dummy):", formData);

    // Arată success feedback (dummy)
    alert(`✅ Scenariu "${formData.name}" creat cu succes!\n\n(Dummy - Task #3 va salva în DB)`);

    // Reset form și închide dialog
    setFormData({
      name: "",
      type: "booking",
      description: "",
      welcomeMessage: "Bună {nume}! Văd că ești interesat de {sursa}. Te pot ajuta să programezi o consultație?",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-500" />
            Scenariu nou
          </DialogTitle>
          <DialogDescription>
            Configurează un scenariu de răspuns automat și programare
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nume scenariu */}
          <div className="space-y-2">
            <Label htmlFor="name">Nume scenariu *</Label>
            <Input
              id="name"
              placeholder="ex: Programare Consultație Medicală"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          {/* Tip scenariu */}
          <div className="space-y-2">
            <Label htmlFor="type">Tip scenariu *</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="booking">
                  <div className="flex items-center gap-2">
                    <Badge variant="orange" className="text-xs">Booking</Badge>
                    <span>Programare automată cu calendar</span>
                  </div>
                </SelectItem>
                <SelectItem value="qualification">
                  <div className="flex items-center gap-2">
                    <Badge variant="violet" className="text-xs">Calificare</Badge>
                    <span>Întrebări de calificare + handover</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              {formData.type === "booking"
                ? "Leadul primește sloturi de calendar și poate programa direct"
                : "Leadul răspunde la întrebări, apoi e preluat de un agent"}
            </p>
          </div>

          {/* Descriere */}
          <div className="space-y-2">
            <Label htmlFor="description">Descriere (opțional)</Label>
            <Input
              id="description"
              placeholder="ex: Pentru consultații medicale noi pacienți"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          {/* Welcome Message */}
          <div className="space-y-2">
            <Label htmlFor="welcomeMessage">Mesaj de bun venit *</Label>
            <Textarea
              id="welcomeMessage"
              placeholder="Mesajul care va fi trimis automat când intră un lead nou"
              value={formData.welcomeMessage}
              onChange={(e) => setFormData({ ...formData, welcomeMessage: e.target.value })}
              rows={3}
              required
            />
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              <span>Variabile disponibile:</span>
              <Badge variant="gray" className="font-mono">{"{nume}"}</Badge>
              <Badge variant="gray" className="font-mono">{"{sursa}"}</Badge>
              <Badge variant="gray" className="font-mono">{"{telefon}"}</Badge>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Preview mesaj
            </div>
            <div className="bg-white rounded-lg p-3 text-sm text-slate-700 border border-slate-200">
              {formData.welcomeMessage
                .replace("{nume}", "Ion Popescu")
                .replace("{sursa}", "Facebook Lead Ads")
                .replace("{telefon}", "0723456789")}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Anulează
            </Button>
            <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white">
              Creează scenariu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
