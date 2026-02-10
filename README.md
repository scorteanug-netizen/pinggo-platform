# Pinggo Platform

Dashboard si API pentru managementul leadurilor, fluxuri (flow) si SLA.

## Cum rulezi platforma local

1. **Postgres (Docker) sau Supabase**
   Din radacina monorepo:
   ```bash
   docker-compose up -d
   ```
   Conecteaza la `localhost:5432`, user `pinggo`, parola `pinggo_local`, baza `pinggo_platform`.
   Pentru Supabase, creeaza `apps/platform/.env.local` pe baza `apps/platform/.env.local.example`.

2. **Variabile de mediu**  
   Copiaza `.env.example` in `.env` in `apps/platform`:
   ```bash
   cp apps/platform/.env.example apps/platform/.env
   ```
   Pentru autentificare Supabase, seteaza si in `apps/platform/.env.local`:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
   - `PINGGO_SUPER_ADMIN_EMAILS`

3. **Baza de date**
   Din radacina monorepo:
   ```bash
   pnpm db:push
   pnpm db:seed
   ```
   Sau din `apps/platform` (incarca automat `.env.local` daca exista):
   ```bash
   npm run db:push
   npm run db:seed
   ```

4. **Aplicatia**  
   Din radacina monorepo:
   ```bash
   pnpm dev:platform
   ```
   Sau din `apps/platform`: `pnpm dev`.  
   Platforma ruleaza pe **http://localhost:3001**.

   Pentru a porni marketing site + platforma dintr-un singur command:
   ```bash
   npm run dev:all
   ```
   La prima rulare, scriptul instaleaza automat dependentele lipsa pentru ambele aplicatii.
   Marketing site ruleaza pe **http://localhost:8080**, iar butonul `Conectare` trimite spre platforma.

5. **Login (Supabase Auth)**
   Mergi la http://localhost:3001/login si autentifica-te cu email + parola.
   Pentru utilizatori noi, foloseste endpoint-ul admin `POST /api/admin/invite-user` (doar SUPER_ADMIN).

---

## Variabile de mediu (platform)

| Variabila | Obligatoriu | Descriere |
|-----------|-------------|-----------|
| `DATABASE_URL` | Da | URL Postgres (ex: `postgresql://pinggo:pinggo_local@localhost:5432/pinggo_platform`) |
| `.env.local` | Recomandat | Override local pentru `DATABASE_URL` (ex: Supabase) fara sa modifici `.env` |
| `SUPABASE_URL` | Da | URL proiect Supabase (ex: `https://<project-ref>.supabase.co`) |
| `SUPABASE_ANON_KEY` | Da | Cheie anon pentru client/browser auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Da | Cheie admin pentru invite (folosita doar server-side) |
| `PINGGO_SUPER_ADMIN_EMAILS` | Da | Lista emailuri SUPER_ADMIN (comma-separated) |
| `NEXTAUTH_URL` | Da | URL-ul aplicatiei (ex: `http://localhost:3001`) |
| `NEXTAUTH_SECRET` | Da | Secret pentru JWT/sesiuni (genereaza cu `openssl rand -base64 32`) |
| `RESEND_API_KEY` | Optional | Pentru trimitere email magic link; fara el linkul se logheaza in consola |
| `EMAIL_FROM` | Optional | Adresa expeditor pentru email (ex: `Pinggo <onboarding@resend.dev>`) |
| `PINGGO_BYPASS_AUTH` | Optional | `true/false`. Cand e activ, platforma foloseste user demo fara login |
| `PINGGO_DEMO_USER_EMAIL` | Optional | Email-ul userului demo folosit cand auth bypass e activ |

---

## Endpoint-uri API principale

- **POST** `/api/intake/webhook` – creare lead + start flow + start cronometru SLA  
  Headers sau query: `x-org-id`, `x-flow-id` (sau `orgId`, `flowId`). Body: `externalId?`, `name?`, `email?`, `phone?`, `company?`, `meta?`.

- **POST** `/api/leads/:id/proof` – inregistrare dovada (opreste cronometrul daca tipul califica)  
  Body: `{ "type": "WHATSAPP_SENT" | "EMAIL_SENT" | "CALL_LOGGED" | "MEETING_BOOKED", "payload?": {} }`.

- **POST** `/api/leads/:id/escalate` – escaladare manuala  
  Body: `{ "level": "REMINDER" | "REASSIGN" | "MANAGER_ALERT", "payload?": {} }`.

- **GET** `/api/leads` – lista leaduri (filtrari: `status`, `breached`, `from`, `to`). Necesita autentificare (exceptie: demo mode cu `PINGGO_BYPASS_AUTH=true`).

- **GET** `/api/leads/:id` – detalii lead (timeline, cronometre, dovezi, escaladari). Necesita autentificare (exceptie: demo mode cu `PINGGO_BYPASS_AUTH=true`).

- **POST** `/api/flows` – creare flux. Body: `{ "name": "..." }`. Necesita autentificare (exceptie: demo mode cu `PINGGO_BYPASS_AUTH=true`).

- **POST** `/api/flows/:id/publish` – validare DAG si activare flux. Necesita autentificare (exceptie: demo mode cu `PINGGO_BYPASS_AUTH=true`).

- **GET** `/api/health/db` – verifica conectivitatea DB (`SELECT 1`), raspuns `{ "ok": true }` pe succes.

- **POST** `/api/admin/invite-user` – invite user prin Supabase + creeaza membership local (doar SUPER_ADMIN).

---

## Urmatorii pasi (ce nu e inca implementat)

- [ ] **Flow builder** – editor vizual drag-and-drop pentru noduri si muchii (creare/editare FlowNode, FlowEdge din UI).
- [ ] **Integrari** – webhook-uri externe, email inbound (parsare + creare lead), API key per organizatie pentru intake.
- [ ] **Roluri si permisiuni** – restrictii pe endpoint-uri in functie de rol (OWNER, ADMIN, MANAGER, AGENT).
- [ ] **Raportare** – TTFC, intarzieri, export CSV/Excel.
- [ ] **Notificari** – alerta la breach SLA, reminder-uri.

---

## Checklist rapid

- [ ] Docker Postgres pornit
- [ ] Sau `.env.local` setat cu Supabase `DATABASE_URL`
- [ ] `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` setate in `.env.local`
- [ ] `PINGGO_SUPER_ADMIN_EMAILS` setat cu emailul admin
- [ ] `.env` completat in `apps/platform`
- [ ] `pnpm db:push` si `pnpm db:seed` rulat
- [ ] `pnpm dev:platform` rulat
- [ ] Login cu `demo@pinggo.io` (verifica consola pentru magic link daca nu e configurat Resend)
