# BUILD PLAN - Pinggo Backend (MVP)

## Context
- Repo analizat: `apps/platform`
- Scope solicitat: PRD v3 - `Control Tower + Scheduler Autopilot`
- Observatie: nu exista un fisier PRD v3 explicit in repo; checklist-ul de mai jos este aliniat la codul curent + directia mentionata.

## MVP Scope Checklist (PRD v3)

### Control Tower
- [ ] Dashboard operational cu KPI-uri: leaduri noi, leaduri in risc SLA, breach-uri, escaladari active.
- [ ] Lista leaduri orientata pe executie: filtrare dupa status, breach, interval, owner.
- [ ] Lead detail unificat: identitate, cronometre SLA, timeline dovezi/escaladari, assignment.
- [ ] Vizibilitate pe fluxuri active/inactive + status publicare flow.
- [ ] Audit trail pentru actiuni cheie (create lead, proof, escalare, publish flow, schimbari assignment).

### Scheduler Autopilot
- [ ] Job periodic pentru evaluare SLA clocks `RUNNING` (tick la 1 minut).
- [ ] Tranzitie automata `RUNNING -> BREACHED` cand deadline-ul este depasit.
- [ ] Generare automata `EscalationEvent` pe politici (REMINDER, REASSIGN, MANAGER_ALERT).
- [ ] Oprire corecta a cronometrului la dovezi valide (`WHATSAPP_SENT`, `EMAIL_SENT`, `CALL_LOGGED`, `MEETING_BOOKED`).
- [ ] Idempotenta joburilor (fara dubluri la rerun/retry).
- [ ] Logging operational pentru joburi (inceput, rezultat, erori, numar entitati procesate).
- [ ] Mecanism de retry controlat pentru erori tranzitorii.

### API + Security + Multi-tenant
- [ ] Enforcement `orgId` pe toate read/write-urile.
- [ ] Endpoint-uri Control Tower pentru sumar si lista operationala (fara ruperea contractelor existente).
- [ ] Hardening pe endpoint-urile existente (validare input, coduri status coerente, mesaje de eroare predictibile).
- [ ] Verificare autentificare/autorizare consistenta pe toate endpoint-urile sensibile.

### Quality Gates
- [ ] Teste pentru servicii critice (`intake`, `lead`, `flow`, `scheduler`).
- [ ] Contract tests pentru endpoint-uri existente (`/api/leads`, `/api/leads/:id`, `/api/intake/webhook`, `/api/flows/*`).
- [ ] Seed minim pentru scenarii de demo + scenarii de breach.
- [ ] Observabilitate minima (logs structurate pe API si jobs).

## Folder Structure (target)

```text
apps/platform/
  src/
    app/
      app/                 # UI routes (Control Tower)
      api/                 # Route handlers (HTTP API)
      layout.tsx
    components/
      ui/                  # Primitive UI (shadcn-style)
      layout/              # Shell components
    server/
      services/            # Domain/business logic
      auth.ts
      authMode.ts
      db.ts
    jobs/                  # Scheduler Autopilot (new)
      scheduler.ts
      runners/
      policies/
      locks/
      telemetry/
    lib/
      validations/         # zod schemas
      utils.ts
  prisma/
    schema.prisma
    seed.ts
  docs/
    BUILD_PLAN.md
```

## Decision: DB + Auth (aligned with existing repo)

- DB: pastram `PostgreSQL + Prisma` (schema existent in `prisma/schema.prisma`).
- Auth: pastram `NextAuth` cu `PrismaAdapter` si email magic link (`next-auth/providers/email`).
- Dev mode: pastram `PINGGO_BYPASS_AUTH` pentru demo/local workflow.
- Nu introducem stack nou de DB/Auth (ex: Supabase/Firebase/Auth0) deoarece repo-ul are deja infrastructura functionala.
- Scheduler Autopilot va folosi acelasi DB si acelasi model de tenancy (`orgId`) pentru consistenta datelor.
