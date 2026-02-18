"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import { CopyField } from "@/components/ui/copy-field";

type Props = {
  embedCode: string;
};

export function EmbedFormCard({ embedCode }: Props) {
  return (
    <SectionCard
      title="Website Form Embed"
      description="Embed un formular de contact pe site-ul tau."
      borderColor="orange"
      actions={<Badge variant="green">Disponibil</Badge>}
      contentClassName="space-y-3"
    >
      <p className="text-sm text-slate-600">
        Copiaza codul de mai jos si lipeste-l in HTML-ul site-ului tau.
      </p>
      <CopyField
        label="Cod embed"
        value={embedCode}
        toastMessage="Cod embed copiat in clipboard"
      />
    </SectionCard>
  );
}
