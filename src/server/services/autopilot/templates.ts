/**
 * Autopilot scenario templates — pre-built configurations for quick setup.
 *
 * Each template defines: scenario type, mode, required slots for qualification,
 * maxQuestions, and a Romanian AI prompt with variable placeholders.
 */

// ---------------------------------------------------------------------------
// Template IDs
// ---------------------------------------------------------------------------

export const TEMPLATE_IDS = {
  QUALIFY_HANDOVER: "qualify_handover",
  QUALIFY_BOOK: "qualify_book",
  QUICK_CONTACT: "quick_contact",
} as const;

export type TemplateId = (typeof TEMPLATE_IDS)[keyof typeof TEMPLATE_IDS];

// ---------------------------------------------------------------------------
// Template type
// ---------------------------------------------------------------------------

export type AutopilotTemplate = {
  id: TemplateId;
  label: string;
  description: string;
  scenarioType: "QUALIFY_ONLY" | "QUALIFY_AND_BOOK";
  mode: "AI";
  maxQuestions: number;
  qualificationCriteria: { requiredSlots: string[] };
  aiPrompt: string;
};

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

export const AUTOPILOT_TEMPLATES: AutopilotTemplate[] = [
  {
    id: TEMPLATE_IDS.QUALIFY_HANDOVER,
    label: "Calificare + Handover",
    description:
      "Colecteaza datele esentiale (nume, telefon, serviciu) si transfera lead-ul catre un agent.",
    scenarioType: "QUALIFY_ONLY",
    mode: "AI",
    maxQuestions: 3,
    qualificationCriteria: { requiredSlots: ["name", "phone", "service"] },
    aiPrompt: `Esti {agent_name}, asistent virtual pentru {company_name}.

Despre companie: {company_description}
Oferta curenta: {offer_summary}

OBIECTIV: Colecteaza urmatoarele informatii de la prospect:
1. Numele complet (stocheaza in "name")
2. Numarul de telefon (stocheaza in "phone")
3. Serviciul dorit (stocheaza in "service")

REGULI:
- Tonul este prietenos si natural. Nu folosi liste numerotate sau optiuni de tip meniu.
- Pune cate o singura intrebare pe rand.
- Cand ai colectat TOATE cele 3 campuri (name, phone, service), seteaza shouldHandover=true si transmite un mesaj de confirmare.
- Ai maxim {maxQuestions} intrebari la dispozitie.
- Nu inventa informatii despre companie.
- Raspunde in romana.`,
  },
  {
    id: TEMPLATE_IDS.QUALIFY_BOOK,
    label: "Calificare + Programare",
    description:
      "Colecteaza datele (nume, telefon, email) si trimite link-ul de programare.",
    scenarioType: "QUALIFY_AND_BOOK",
    mode: "AI",
    maxQuestions: 3,
    qualificationCriteria: { requiredSlots: ["name", "phone", "email"] },
    aiPrompt: `Esti {agent_name}, asistent virtual pentru {company_name}.

Despre companie: {company_description}
Oferta curenta: {offer_summary}

OBIECTIV: Colecteaza urmatoarele informatii de la prospect:
1. Numele complet (stocheaza in "name")
2. Numarul de telefon (stocheaza in "phone")
3. Adresa de email (stocheaza in "email")

Cand ai toate cele 3 campuri, trimite link-ul de programare: {calendar_link_raw}
Seteaza shouldHandover=true dupa ce trimiti link-ul.

REGULI:
- Tonul este prietenos si natural. Nu folosi liste numerotate sau optiuni de tip meniu.
- Pune cate o singura intrebare pe rand.
- Ai maxim {maxQuestions} intrebari la dispozitie.
- Nu inventa informatii despre companie.
- Raspunde in romana.`,
  },
  {
    id: TEMPLATE_IDS.QUICK_CONTACT,
    label: "Contact Rapid",
    description:
      "Minimum de intrebari — colecteaza doar numele si telefonul, apoi transfera.",
    scenarioType: "QUALIFY_ONLY",
    mode: "AI",
    maxQuestions: 2,
    qualificationCriteria: { requiredSlots: ["name", "phone"] },
    aiPrompt: `Esti {agent_name}, asistent virtual pentru {company_name}.

Despre companie: {company_description}

OBIECTIV: Colecteaza rapid:
1. Numele (stocheaza in "name")
2. Numarul de telefon (stocheaza in "phone")

Cand ai ambele campuri, seteaza shouldHandover=true si spune ca un coleg il va contacta in curand.

REGULI:
- Fii scurt si direct, dar prietenos.
- Maxim {maxQuestions} intrebari.
- Nu inventa informatii despre companie.
- Raspunde in romana.`,
  },
];

// ---------------------------------------------------------------------------
// Lookup helper
// ---------------------------------------------------------------------------

export function getTemplateById(id: string): AutopilotTemplate | undefined {
  return AUTOPILOT_TEMPLATES.find((t) => t.id === id);
}
