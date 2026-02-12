# UI Consistency Audit Report

**Standard:** `/autopilot` page (Task #1 + #2)
**Audit Date:** 2026-02-12
**Audited By:** Claude Sonnet 4.5
**Total Pages:** 11 workspace pages

---

## Executive Summary

**Overall Status:** 🔴 **10/11 pages need UI updates** to match /autopilot standard

Only the `/autopilot` page (newly created in Task #1) follows the complete design system. All other pages use older component patterns that need upgrading.

### Key Findings

| Issue | Pages Affected | Priority |
|-------|----------------|----------|
| Headers don't use font-fraunces | 10/10 | 🔴 Critical |
| No header icons | 10/10 | 🔴 Critical |
| Cards missing border-t-4 colored | 10/10 | 🔴 Critical |
| Card titles not using Fraunces | 10/10 | 🟡 High |
| Inline badge styles vs Badge component | 7/10 | 🟡 High |
| Missing stat cards | 8/10 | 🟢 Medium |
| No hover states on cards | 9/10 | 🟢 Low |

---

## Page Status Overview

| Page | Overall Status | Priority | Estimated Work | Notes |
|------|---------------|----------|----------------|-------|
| `/autopilot` | 🟢 **Fully Compliant** | - | 0 min | **STANDARD** - All other pages should match this |
| `/dashboard` | 🔴 Major Rework | High | 45 min | Add icon header, stat cards, border-top |
| `/leads` | 🔴 Major Rework | High | 60 min | Add icon header, stat cards, Badge component |
| `/leads/[id]` | 🔴 Major Rework | High | 50 min | Add icon header, stat cards, Badge component |
| `/companies` | 🟡 Needs Updates | Medium | 30 min | Add icon header, border-top, Badge component |
| `/users` | 🟡 Needs Updates | Medium | 30 min | Add icon header, border-top, Badge component |
| `/flows` | 🟡 Needs Updates | Medium | 35 min | Add icon header, border-top, stat cards |
| `/flows/[id]` | ⚪ N/A | Low | 15 min | Minimal page - audit FlowWizardBuilder component |
| `/reports` | 🟡 Needs Updates | Medium | 40 min | Add icon header, upgrade StatCard component |
| `/settings` | 🟡 Needs Updates | Low | 35 min | Add icon header, audit child components |
| `/integrations` | 🟡 Needs Updates | Low | 35 min | Add icon header, border-top, stat cards |
| `/notifications` | 🟡 Needs Updates | Low | 30 min | Add icon header, border-top, Badge component |

**Total Estimated Work:** ~400 minutes (6-7 hours)

### Legend
- 🟢 Fully compliant - matches /autopilot standard
- 🟡 Needs updates - partial compliance, moderate changes
- 🔴 Major rework - significant changes needed
- ⚪ N/A - special case

---

## AUTOPILOT STANDARD (Baseline)

This is the reference standard that ALL pages should match:

### ✅ Header Section
```tsx
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
  <Button className="bg-orange-500 hover:bg-orange-600 text-white">
    + Scenariu nou
  </Button>
</div>
```

**Key Elements:**
- Icon in orange-100 background circle (w-12 h-12 rounded-xl)
- Heading: `text-3xl font-fraunces font-black text-slate-900`
- Subtitle: `text-sm text-slate-600 mt-0.5`
- Action button (optional): orange primary

### ✅ Stat Cards
```tsx
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
```

**Key Elements:**
- Colored top border: `border-t-4 border-t-{color}-500` (orange, blue, green, violet)
- Icon with matching color
- Label: `text-xs uppercase tracking-wide text-slate-500 font-medium`
- Value: `text-3xl font-fraunces font-black text-slate-900`

### ✅ Content Cards
```tsx
<Card className="border-t-4 border-t-orange-500 hover:shadow-lg transition-shadow">
  <CardHeader>
    <CardTitle className="text-lg font-fraunces font-bold text-slate-900">
      Scenarii Configurate
    </CardTitle>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

**Key Elements:**
- Colored top border: `border-t-4 border-t-orange-500`
- Hover effect: `hover:shadow-lg transition-shadow`
- Title: `text-lg font-fraunces font-bold text-slate-900`

### ✅ Badge Component
```tsx
<Badge variant="green">Activ</Badge>
<Badge variant="gray">Pausat</Badge>
<Badge variant="blue">Booking</Badge>
<Badge variant="violet">Calificare</Badge>
```

**Variants:** orange (default), blue, green, violet, red, gray

### ✅ Empty State
```tsx
<Card className="border-2 border-dashed border-slate-200 bg-slate-50/50">
  <CardContent className="py-12 text-center">
    <Bot className="w-12 h-12 text-slate-400 mx-auto mb-3" />
    <h3 className="font-fraunces font-bold text-slate-900 mb-1">
      Gata să creezi un scenariu nou?
    </h3>
    <p className="text-sm text-slate-600 mb-4">
      Configurează răspunsuri automate și programări în câteva clickuri
    </p>
    <Button className="bg-orange-500 hover:bg-orange-600 text-white">
      Creează primul scenariu
    </Button>
  </CardContent>
</Card>
```

---

## Page-by-Page Analysis

### 1. 🔴 Dashboard (`/dashboard`)

**File:** `src/app/(workspace)/dashboard/page.tsx`

**Current State:**
- Uses `PageHeader` component (text-2xl font-semibold)
- NO icon in header
- Uses `SectionCard` for 2 navigation cards (Leaduri, Fluxuri)
- NO stat cards
- Buttons have correct orange color

**Issues Found:**
- ❌ Header doesn't use font-fraunces
- ❌ No icon in header section
- ❌ SectionCard has no border-top colored
- ❌ No stat cards (should show: total leads, open leads, new today, response time avg)
- ❌ CardTitle not using font-fraunces

**Required Changes:**

#### 1. Replace PageHeader with Icon Header
```tsx
// BEFORE (lines 17-20)
<PageHeader
  title="Dashboard"
  subtitle="Control tower pentru monitorizare si executie."
/>

// AFTER
<div className="flex items-start justify-between">
  <div>
    <div className="flex items-center gap-3 mb-2">
      <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
        <LayoutDashboard className="w-6 h-6 text-orange-600" />
      </div>
      <div>
        <h1 className="text-3xl font-fraunces font-black text-slate-900">
          Dashboard
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Control tower pentru monitorizare si executie.
        </p>
      </div>
    </div>
  </div>
</div>
```

#### 2. Add Stat Cards Section
```tsx
// ADD AFTER HEADER (before navigation cards)
<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
  <Card className="border-t-4 border-t-orange-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-orange-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Total Leaduri
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{totalLeads}</div>
    </CardContent>
  </Card>

  <Card className="border-t-4 border-t-blue-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-blue-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Leaduri Noi Azi
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{newToday}</div>
    </CardContent>
  </Card>

  <Card className="border-t-4 border-t-green-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-green-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Calificate
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{qualified}</div>
    </CardContent>
  </Card>

  <Card className="border-t-4 border-t-violet-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-violet-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Timp Mediu Răspuns
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{avgResponseTime}</div>
    </CardContent>
  </Card>
</div>
```

#### 3. Update SectionCard to have Border-Top
```tsx
// Replace SectionCard with Card + border-top
<Card className="border-t-4 border-t-orange-500 rounded-2xl shadow-sm hover:shadow-lg transition-shadow">
  <CardHeader className="pb-3">
    <CardTitle className="text-lg font-fraunces font-bold text-slate-900">
      Leaduri
    </CardTitle>
    <p className="text-sm text-slate-600">
      Vezi lista de leaduri si statusul operational.
    </p>
  </CardHeader>
  <CardContent>
    <Button asChild className="bg-orange-500 text-white hover:bg-orange-600">
      <Link href="/leads">Deschide leaduri</Link>
    </Button>
  </CardContent>
</Card>
```

**Files to Modify:**
- `src/app/(workspace)/dashboard/page.tsx` (main changes)
- Add DB queries for stat card data (total leads, new today, qualified, avg response time)

**Estimated Time:** 45 minutes

---

### 2. 🔴 Leads (`/leads`)

**File:** `src/app/(workspace)/leads/page.tsx`

**Current State:**
- Uses `PageHeader` component
- NO icon in header
- Uses `SectionCard` for filters and table
- NO stat cards
- Has complex table with filtering/pagination
- Status displayed as inline spans, not Badge component
- Pagination current page has orange styling but no border-top

**Issues Found:**
- ❌ Header doesn't use font-fraunces
- ❌ No icon in header
- ❌ Missing stat cards
- ❌ SectionCard has no border-top colored
- ❌ Inline badge styles for status (line 475)
- ❌ No hover effect on table rows

**Required Changes:**

#### 1. Replace PageHeader with Icon Header
```tsx
// BEFORE (lines 309-312)
<PageHeader
  title="Leaduri"
  subtitle="Tabel operational cu cautare globala, filtre, paginare si export CSV."
/>

// AFTER
<div className="flex items-start justify-between">
  <div>
    <div className="flex items-center gap-3 mb-2">
      <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
        <Users className="w-6 h-6 text-orange-600" />
      </div>
      <div>
        <h1 className="text-3xl font-fraunces font-black text-slate-900">
          Leaduri
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Tabel operational cu cautare globala, filtre, paginare si export CSV.
        </p>
      </div>
    </div>
  </div>
</div>
```

#### 2. Add Stat Cards
```tsx
// ADD AFTER HEADER (before filters)
<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
  <Card className="border-t-4 border-t-orange-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-orange-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Total Leaduri
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{leadsResult.totalCount}</div>
    </CardContent>
  </Card>

  <Card className="border-t-4 border-t-blue-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 text-blue-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Deschise
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{openCount}</div>
    </CardContent>
  </Card>

  <Card className="border-t-4 border-t-green-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-green-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Calificate
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{qualifiedCount}</div>
    </CardContent>
  </Card>

  <Card className="border-t-4 border-t-red-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          SLA Breach
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{breachedCount}</div>
    </CardContent>
  </Card>
</div>
```

#### 3. Update SectionCard to Card with Border-Top
```tsx
// Replace SectionCard (lines 314, 444)
<Card className="border-t-4 border-t-orange-500 rounded-2xl shadow-sm hover:shadow-lg transition-shadow">
  <CardHeader className="pb-3">
    <CardTitle className="text-lg font-fraunces font-bold text-slate-900">
      Filtre
    </CardTitle>
    <p className="text-sm text-slate-600">
      Ajusteaza criteriile si aplica pentru a rafina lista de leaduri.
    </p>
  </CardHeader>
  <CardContent>
    {/* Form content */}
  </CardContent>
</Card>
```

#### 4. Use Badge Component in LeadsTable
```tsx
// In LeadsTable component - replace inline status spans with Badge
<Badge variant={
  row.status === "NEW" ? "orange" :
  row.status === "OPEN" ? "blue" :
  row.status === "QUALIFIED" ? "green" :
  row.status === "NOT_QUALIFIED" ? "red" :
  "gray"
}>
  {row.status}
</Badge>
```

**Files to Modify:**
- `src/app/(workspace)/leads/page.tsx` (header, stat cards, card styling)
- `src/app/(workspace)/leads/LeadsTable.tsx` (Badge component usage)
- Add DB aggregations for stat cards (open count, qualified count, breached count)

**Estimated Time:** 60 minutes

---

### 3. 🔴 Lead Detail (`/leads/[id]`)

**File:** `src/app/(workspace)/leads/[id]/page.tsx`

**Current State:**
- Regular heading (text-2xl font-semibold)
- NO icon
- Has info boxes (border-slate-200 bg-slate-50) instead of stat cards
- Multiple cards for Info, Timeline, Actions, Autopilot
- Inline badge styles for stage status
- Timeline uses inline styled chips

**Issues Found:**
- ❌ Header doesn't use font-fraunces
- ❌ No icon in header
- ❌ Info boxes should be stat cards with colored border-top
- ❌ Card titles not using font-fraunces
- ❌ Cards missing border-t-4 colored
- ❌ Inline badge styles instead of Badge component

**Required Changes:**

#### 1. Replace Header
```tsx
// BEFORE (lines 693-696)
<div className="space-y-1">
  <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Detalii lead</h1>
  <p className="text-sm text-slate-600">Vizualizare SLA, timeline si actiuni rapide.</p>
</div>

// AFTER
<div className="flex items-center gap-3 mb-2">
  <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
    <FileText className="w-6 h-6 text-orange-600" />
  </div>
  <div>
    <h1 className="text-3xl font-fraunces font-black text-slate-900">
      Detalii Lead
    </h1>
    <p className="text-sm text-slate-600 mt-0.5">
      Vizualizare SLA, timeline si actiuni rapide.
    </p>
  </div>
</div>
```

#### 2. Convert Info Boxes to Stat Cards
```tsx
// Replace info boxes with stat cards
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <Card className="border-t-4 border-t-orange-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <Circle className="w-4 h-4 text-orange-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Status
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{STATUS_LABEL[lead.status]}</div>
    </CardContent>
  </Card>

  <Card className="border-t-4 border-t-blue-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <Tag className="w-4 h-4 text-blue-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Sursa
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{SOURCE_LABEL[lead.sourceType]}</div>
    </CardContent>
  </Card>

  <Card className="border-t-4 border-t-green-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <User className="w-4 h-4 text-green-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Owner
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{ownerName || "—"}</div>
    </CardContent>
  </Card>
</div>
```

#### 3. Add Border-Top to All Cards
```tsx
// Update all Card instances (lines 702, 719, 731, 748, 849)
<Card className="border-t-4 border-t-orange-500 rounded-2xl shadow-sm hover:shadow-lg transition-shadow">
  <CardHeader className="pb-3">
    <CardTitle className="text-lg font-fraunces font-bold text-slate-900">
      {title}
    </CardTitle>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

#### 4. Replace Inline Badges
```tsx
// Replace inline stage status (line 803)
<Badge variant={
  stage.status === "RUNNING" ? "orange" :
  stage.status === "STOPPED" ? "green" :
  "red"
}>
  {STAGE_STATUS_LABEL[stage.status]}
</Badge>

// Replace timeline event types (lines 893-899)
<Badge variant="blue">{event.type}</Badge>
```

**Files to Modify:**
- `src/app/(workspace)/leads/[id]/page.tsx` (header, stat cards, card styling, badges)

**Estimated Time:** 50 minutes

---

### 4. 🟡 Companies (`/companies`)

**File:** `src/app/(workspace)/companies/page.tsx`

**Current State:**
- Uses `PageHeader` component
- NO icon
- Uses `SectionCard` for form and table
- Table has inline badge styles for status (Active/Dezactivata)
- Good table structure

**Issues Found:**
- ❌ Header doesn't use font-fraunces
- ❌ No icon in header
- ❌ SectionCard missing border-top colored
- ❌ Inline badge styles instead of Badge component

**Required Changes:**

#### 1. Replace PageHeader
```tsx
// BEFORE (lines 99-111)
<PageHeader
  title="Companii"
  subtitle="Creeaza compania prima data, apoi invita userii in compania potrivita."
  actions={...}
/>

// AFTER
<div className="flex items-start justify-between">
  <div>
    <div className="flex items-center gap-3 mb-2">
      <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
        <Building2 className="w-6 h-6 text-orange-600" />
      </div>
      <div>
        <h1 className="text-3xl font-fraunces font-black text-slate-900">
          Companii
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Creeaza compania prima data, apoi invita userii in compania potrivita.
        </p>
      </div>
    </div>
  </div>
  {canManageCompanyStatus && (
    <Button asChild variant={showDisabled ? "default" : "outline"} size="sm">
      <Link href={showDisabled ? "/companies" : "/companies?showDisabled=1"}>
        {showDisabled ? "Ascunde dezactivate" : "Arata dezactivate"}
      </Link>
    </Button>
  )}
</div>
```

#### 2. Update SectionCard to Card with Border-Top
```tsx
// Replace SectionCard (lines 113, 117)
<Card className="border-t-4 border-t-orange-500 rounded-2xl shadow-sm hover:shadow-lg transition-shadow">
  <CardHeader className="pb-3">
    <CardTitle className="text-lg font-fraunces font-bold text-slate-900">
      Creeaza companie
    </CardTitle>
    <p className="text-sm text-slate-600">
      Doar SUPER_ADMIN poate crea companii noi.
    </p>
  </CardHeader>
  <CardContent>
    <CreateCompanyForm />
  </CardContent>
</Card>
```

#### 3. Replace Inline Badges
```tsx
// Replace inline status badges (lines 157-165)
<Badge variant={isDisabled ? "gray" : "green"}>
  {isDisabled ? "Dezactivata" : "Activa"}
</Badge>
```

**Files to Modify:**
- `src/app/(workspace)/companies/page.tsx` (header, card styling, badges)

**Estimated Time:** 30 minutes

---

### 5. 🟡 Users (`/users`)

**File:** `src/app/(workspace)/users/page.tsx`

**Current State:**
- Uses `PageHeader` component
- NO icon
- Uses `SectionCard` for form and table
- Inline badge styles for status (Active/Invited/Disabled)
- Table structure similar to Companies page

**Issues Found:**
- ❌ Header doesn't use font-fraunces
- ❌ No icon in header
- ❌ SectionCard missing border-top colored
- ❌ Inline badge styles instead of Badge component

**Required Changes:**

#### 1. Replace PageHeader
```tsx
// BEFORE (lines 103-106)
<PageHeader
  title="Useri"
  subtitle="Creeaza compania prima data, apoi invita userul si alege compania lui."
/>

// AFTER
<div className="flex items-center gap-3 mb-2">
  <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
    <Users className="w-6 h-6 text-orange-600" />
  </div>
  <div>
    <h1 className="text-3xl font-fraunces font-black text-slate-900">
      Useri
    </h1>
    <p className="text-sm text-slate-600 mt-0.5">
      Creeaza compania prima data, apoi invita userul si alege compania lui.
    </p>
  </div>
</div>
```

#### 2. Update SectionCard to Card
```tsx
// Replace SectionCard (lines 108, 115)
<Card className="border-t-4 border-t-orange-500 rounded-2xl shadow-sm hover:shadow-lg transition-shadow">
  <CardHeader className="pb-3">
    <CardTitle className="text-lg font-fraunces font-bold text-slate-900">
      Invita user
    </CardTitle>
    <p className="text-sm text-slate-600">
      Email devine login. Doar SUPER_ADMIN poate invita in alte companii.
    </p>
  </CardHeader>
  <CardContent>
    <InviteUserForm workspaces={workspaces} />
  </CardContent>
</Card>
```

#### 3. Replace Inline Badges
```tsx
// Replace inline status badges (lines 146-155)
<Badge variant={
  row.status === "ACTIVE" ? "green" :
  row.status === "INVITED" ? "orange" :
  "gray"
}>
  {STATUS_LABEL[row.status]}
</Badge>
```

**Files to Modify:**
- `src/app/(workspace)/users/page.tsx` (header, card styling, badges)

**Estimated Time:** 30 minutes

---

### 6. 🟡 Flows (`/flows`)

**File:** `src/app/(workspace)/flows/page.tsx`

**Current State:**
- Uses `PageHeader` component
- NO icon
- Uses `SectionCard` for flow list
- Minimal styling, shows list of flows with links

**Issues Found:**
- ❌ Header doesn't use font-fraunces
- ❌ No icon in header
- ❌ SectionCard missing border-top colored
- ❌ Could benefit from stat cards (total flows, active flows, etc.)

**Required Changes:**

#### 1. Replace PageHeader
```tsx
// BEFORE (lines 57-61)
<PageHeader
  title="Fluxuri"
  subtitle="Configureaza pasii de intrare, repartizare si SLA pentru compania activa."
  activeCompanyName={currentWorkspace?.name}
/>

// AFTER
<div className="flex items-start justify-between">
  <div>
    <div className="flex items-center gap-3 mb-2">
      <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
        <Workflow className="w-6 h-6 text-orange-600" />
      </div>
      <div>
        <h1 className="text-3xl font-fraunces font-black text-slate-900">
          Fluxuri
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Configureaza pasii de intrare, repartizare si SLA pentru compania activa.
        </p>
        {currentWorkspace?.name && (
          <Badge variant="orange" className="mt-1">{currentWorkspace.name}</Badge>
        )}
      </div>
    </div>
  </div>
</div>
```

#### 2. Add Stat Cards
```tsx
// ADD AFTER HEADER
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <Card className="border-t-4 border-t-orange-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <Workflow className="w-4 h-4 text-orange-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Total Fluxuri
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{flows.length}</div>
    </CardContent>
  </Card>

  <Card className="border-t-4 border-t-green-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-green-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Active
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{activeCount}</div>
    </CardContent>
  </Card>

  <Card className="border-t-4 border-t-blue-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-blue-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Ultima Modificare
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{lastModified}</div>
    </CardContent>
  </Card>
</div>
```

#### 3. Update SectionCard
```tsx
// Replace SectionCard (line 63)
<Card className="border-t-4 border-t-orange-500 rounded-2xl shadow-sm hover:shadow-lg transition-shadow">
  <CardHeader className="pb-3">
    <CardTitle className="text-lg font-fraunces font-bold text-slate-900">
      Lista fluxuri
    </CardTitle>
    <p className="text-sm text-slate-600">
      Click pentru a edita un flux existent.
    </p>
  </CardHeader>
  <CardContent>
    {/* Flow list */}
  </CardContent>
</Card>
```

**Files to Modify:**
- `src/app/(workspace)/flows/page.tsx` (header, stat cards, card styling)

**Estimated Time:** 35 minutes

---

### 7. ⚪ Flows Detail (`/flows/[id]`)

**File:** `src/app/(workspace)/flows/[id]/page.tsx`

**Status:** Minimal page - renders `<FlowWizardBuilder>` component

**Note:** This page is a simple wrapper. The FlowWizardBuilder component would need separate audit. Estimated 15 minutes to add consistent header if needed.

---

### 8. 🟡 Reports (`/reports`)

**File:** `src/app/(workspace)/reports/page.tsx`

**Current State:**
- Uses `PageHeader` component
- NO icon
- HAS `StatCard` components BUT they need upgrading
- Uses `SectionCard` for filters and tables

**Issues Found:**
- ❌ Header doesn't use font-fraunces
- ❌ No icon in header
- ❌ StatCard component doesn't match standard (no border-top, no icons, wrong font)
- ❌ SectionCard missing border-top colored

**Required Changes:**

#### 1. Replace PageHeader
```tsx
// BEFORE (lines 61-64)
<PageHeader
  title="Rapoarte"
  subtitle="KPI operationale pentru intervalul selectat."
/>

// AFTER
<div className="flex items-center gap-3 mb-2">
  <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
    <BarChart3 className="w-6 h-6 text-orange-600" />
  </div>
  <div>
    <h1 className="text-3xl font-fraunces font-black text-slate-900">
      Rapoarte
    </h1>
    <p className="text-sm text-slate-600 mt-0.5">
      KPI operationale pentru intervalul selectat.
    </p>
  </div>
</div>
```

#### 2. Upgrade StatCard Component
```tsx
// src/components/ui/stat-card.tsx needs complete rewrite
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  icon?: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
  helper?: React.ReactNode;
  borderColor?: "orange" | "blue" | "green" | "violet" | "red";
  className?: string;
};

export function StatCard({
  icon,
  label,
  value,
  helper,
  borderColor = "orange",
  className
}: StatCardProps) {
  return (
    <Card className={cn(`border-t-4 border-t-${borderColor}-500 rounded-2xl shadow-sm`, className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            {label}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-fraunces font-black text-slate-900">{value}</div>
        {helper && <p className="text-xs text-slate-500 mt-1">{helper}</p>}
      </CardContent>
    </Card>
  );
}
```

#### 3. Update StatCard Usage
```tsx
// Update stat cards (lines 96-116) to include icons and borderColor
<StatCard
  icon={<TrendingUp className="w-4 h-4 text-orange-600" />}
  borderColor="orange"
  label="Leaduri procesate"
  value={summary.leadsProcessed}
/>

<StatCard
  icon={<CheckCircle className="w-4 h-4 text-green-600" />}
  borderColor="green"
  label="Calificat"
  value={summary.qualified}
/>
```

#### 4. Update SectionCard to Card
```tsx
// Replace SectionCard (lines 66, 118)
<Card className="border-t-4 border-t-orange-500 rounded-2xl shadow-sm hover:shadow-lg transition-shadow">
  <CardHeader className="pb-3">
    <CardTitle className="text-lg font-fraunces font-bold text-slate-900">
      Selecteaza interval
    </CardTitle>
    ...
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

**Files to Modify:**
- `src/app/(workspace)/reports/page.tsx` (header, card styling, StatCard usage)
- `src/components/ui/stat-card.tsx` (COMPLETE REWRITE to match standard)

**Estimated Time:** 40 minutes

---

### 9. 🟡 Settings (`/settings`)

**File:** `src/app/(workspace)/settings/page.tsx`

**Current State:**
- Uses `PageHeader` component
- NO icon
- Renders `SettingsForm` and `CompanyMembersCard` components

**Issues Found:**
- ❌ Header doesn't use font-fraunces
- ❌ No icon in header
- Need to audit child components: SettingsForm, CompanyMembersCard, CompanyAdminCard

**Required Changes:**

#### 1. Replace PageHeader
```tsx
// BEFORE (lines 42-46)
<PageHeader
  title="Setari"
  subtitle="Configureaza workspace-ul, programul de lucru si fluxul implicit pentru leaduri noi."
  activeCompanyName={settings.workspaceName}
/>

// AFTER
<div className="flex items-start justify-between">
  <div>
    <div className="flex items-center gap-3 mb-2">
      <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
        <Settings className="w-6 h-6 text-orange-600" />
      </div>
      <div>
        <h1 className="text-3xl font-fraunces font-black text-slate-900">
          Setari
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Configureaza workspace-ul, programul de lucru si fluxul implicit pentru leaduri noi.
        </p>
        {settings.workspaceName && (
          <Badge variant="orange" className="mt-1">{settings.workspaceName}</Badge>
        )}
      </div>
    </div>
  </div>
</div>
```

#### 2. Audit Child Components
Need to check and update:
- `SettingsForm.tsx` - add border-t-4, Fraunces titles
- `CompanyMembersCard.tsx` - add border-t-4, Badge components
- `CompanyAdminCard.tsx` - add border-t-4, Fraunces titles

**Files to Modify:**
- `src/app/(workspace)/settings/page.tsx` (header)
- `src/app/(workspace)/settings/SettingsForm.tsx` (card styling)
- `src/app/(workspace)/settings/CompanyMembersCard.tsx` (card styling, badges)
- `src/app/(workspace)/settings/CompanyAdminCard.tsx` (card styling)

**Estimated Time:** 35 minutes

---

### 10. 🟡 Integrations (`/integrations`)

**File:** `src/app/(workspace)/integrations/page.tsx`

**Current State:**
- Uses `PageHeader` component
- NO icon
- Uses `SectionCard` for integration cards
- Custom StatusBadge component (could use Badge)
- Grid layout for integration options

**Issues Found:**
- ❌ Header doesn't use font-fraunces
- ❌ No icon in header
- ❌ SectionCard missing border-top colored
- ❌ Could add stat cards (active integrations, webhooks received today, etc.)
- ❌ StatusBadge could be replaced with Badge component

**Required Changes:**

#### 1. Replace PageHeader
```tsx
// BEFORE (lines 74-77)
<PageHeader
  title="Integrari"
  subtitle="Configureaza canalele de ingestie si conexiunile externe pentru workspace."
/>

// AFTER
<div className="flex items-center gap-3 mb-2">
  <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
    <Plug className="w-6 h-6 text-orange-600" />
  </div>
  <div>
    <h1 className="text-3xl font-fraunces font-black text-slate-900">
      Integrari
    </h1>
    <p className="text-sm text-slate-600 mt-0.5">
      Configureaza canalele de ingestie si conexiunile externe pentru workspace.
    </p>
  </div>
</div>
```

#### 2. Add Stat Cards
```tsx
// ADD AFTER HEADER
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <Card className="border-t-4 border-t-orange-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <Plug className="w-4 h-4 text-orange-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Integrări Active
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{activeIntegrations}</div>
    </CardContent>
  </Card>

  <Card className="border-t-4 border-t-blue-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <Webhook className="w-4 h-4 text-blue-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Webhooks Azi
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{webhooksToday}</div>
    </CardContent>
  </Card>

  <Card className="border-t-4 border-t-green-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-green-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Ultima Sincronizare
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{lastSync}</div>
    </CardContent>
  </Card>
</div>
```

#### 3. Update Integration Cards
```tsx
// Replace SectionCard with Card + border-top (lines 80, 123)
<Card className="border-t-4 border-t-orange-500 rounded-2xl shadow-sm hover:shadow-lg transition-shadow">
  <CardHeader className="pb-3">
    <div className="flex items-start justify-between">
      <div>
        <CardTitle className="text-lg font-fraunces font-bold text-slate-900">
          {card.title}
        </CardTitle>
        <p className="text-sm text-slate-600 mt-1">
          {card.description}
        </p>
      </div>
      <Badge variant={card.active ? "green" : "gray"}>
        {card.active ? "Activ" : "Neconfigurat"}
      </Badge>
    </div>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

**Files to Modify:**
- `src/app/(workspace)/integrations/page.tsx` (header, stat cards, card styling, badges)

**Estimated Time:** 35 minutes

---

### 11. 🟡 Notifications (`/notifications`)

**File:** `src/app/(workspace)/notifications/page.tsx`

**Current State:**
- Regular heading (text-2xl font-semibold)
- NO icon
- Uses Card directly for notifications list
- Custom NotificationBadge component
- Simple "Nu exista notificari" text (not proper empty state)

**Issues Found:**
- ❌ Header doesn't use font-fraunces
- ❌ No icon in header
- ❌ Card missing border-t-4 colored
- ❌ NotificationBadge should use Badge component
- ❌ Empty state not using dashed border pattern
- ❌ Could add stat cards (total notifications, unread, today's count)

**Required Changes:**

#### 1. Replace Header
```tsx
// BEFORE (lines 43-46)
<div className="space-y-1">
  <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Notificari</h1>
  <p className="text-sm text-slate-600">Alerte in-app pentru reminder, reasignare si manager alert.</p>
</div>

// AFTER
<div className="flex items-center gap-3 mb-2">
  <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
    <Bell className="w-6 h-6 text-orange-600" />
  </div>
  <div>
    <h1 className="text-3xl font-fraunces font-black text-slate-900">
      Notificari
    </h1>
    <p className="text-sm text-slate-600 mt-0.5">
      Alerte in-app pentru reminder, reasignare si manager alert.
    </p>
  </div>
</div>
```

#### 2. Add Stat Cards
```tsx
// ADD AFTER HEADER
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <Card className="border-t-4 border-t-orange-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4 text-orange-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Total Notificări
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{notifications.length}</div>
    </CardContent>
  </Card>

  <Card className="border-t-4 border-t-red-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-red-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Necitite
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{unreadCount}</div>
    </CardContent>
  </Card>

  <Card className="border-t-4 border-t-blue-500">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-blue-600" />
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Astăzi
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-fraunces font-black text-slate-900">{todayCount}</div>
    </CardContent>
  </Card>
</div>
```

#### 3. Update Notifications Card
```tsx
// Add border-top to card (line 54)
<Card className="border-t-4 border-t-orange-500 rounded-2xl shadow-sm hover:shadow-lg transition-shadow">
  <CardHeader className="pb-3">
    <CardTitle className="text-lg font-fraunces font-bold text-slate-900">
      Flux notificari
    </CardTitle>
    <p className="text-sm text-slate-600">
      Cele mai recente alerte si notificari pentru echipa ta.
    </p>
  </CardHeader>
  <CardContent>
    {/* Notifications list */}
  </CardContent>
</Card>
```

#### 4. Replace NotificationBadge
```tsx
// Replace NotificationBadge with Badge (line 80)
<Badge variant={notification.readAt ? "gray" : "orange"}>
  {notification.readAt ? "Citita" : "Necitita"}
</Badge>
```

#### 5. Add Proper Empty State
```tsx
// Replace simple text (lines 62-63) with proper empty state
{notifications.length === 0 ? (
  <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50">
    <CardContent className="py-12 text-center">
      <Bell className="w-12 h-12 text-slate-400 mx-auto mb-3" />
      <h3 className="font-fraunces font-bold text-slate-900 mb-1">
        Nicio notificare
      </h3>
      <p className="text-sm text-slate-600">
        Vei primi alerte aici cand apar evenimente importante
      </p>
    </CardContent>
  </Card>
) : (
  // ... existing notification list
)}
```

**Files to Modify:**
- `src/app/(workspace)/notifications/page.tsx` (header, stat cards, card styling, badges, empty state)

**Estimated Time:** 30 minutes

---

## Component Upgrade Requirements

### 1. 🔴 PageHeader Component (`src/components/ui/page-header.tsx`)

**Status:** NEEDS COMPLETE REWORK or DEPRECATION

**Current Issues:**
- Uses `text-2xl font-semibold` instead of `text-3xl font-fraunces font-black`
- No icon support
- No orange background circle

**Recommendation:** **DEPRECATE** and build headers manually like /autopilot

Alternatively, upgrade to support icons:
```tsx
type PageHeaderProps = {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  activeCompanyName?: string;
};

export function PageHeader({ icon, title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <div className="flex items-center gap-3 mb-2">
          {icon && (
            <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
              {icon}
            </div>
          )}
          <div>
            <h1 className="text-3xl font-fraunces font-black text-slate-900">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-slate-600 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </div>
      {actions && <div>{actions}</div>}
    </div>
  );
}
```

**Estimated Time:** 20 minutes

---

### 2. 🔴 SectionCard Component (`src/components/ui/section-card.tsx`)

**Status:** NEEDS UPGRADE

**Current Issues:**
- No `border-t-4 border-t-{color}-500`
- CardTitle uses `text-lg` instead of `text-lg font-fraunces font-bold`
- No hover states

**Proposed Changes:**
```tsx
type SectionCardProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  borderColor?: "orange" | "blue" | "green" | "violet" | "red";
  children?: React.ReactNode;
  className?: string;
};

export function SectionCard({
  title,
  description,
  borderColor = "orange",
  children,
  className
}: SectionCardProps) {
  return (
    <Card className={cn(
      `border-t-4 border-t-${borderColor}-500 rounded-2xl shadow-sm hover:shadow-lg transition-shadow`,
      className
    )}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-fraunces font-bold text-slate-900">
          {title}
        </CardTitle>
        {description && (
          <p className="text-sm text-slate-600">{description}</p>
        )}
      </CardHeader>
      {children && <CardContent>{children}</CardContent>}
    </Card>
  );
}
```

**Estimated Time:** 15 minutes

---

### 3. 🔴 StatCard Component (`src/components/ui/stat-card.tsx`)

**Status:** NEEDS COMPLETE REWRITE

**Current Issues:**
- No border-t-4 colored top border
- No icon support
- Label NOT uppercase
- Value uses `text-2xl font-semibold` instead of `text-3xl font-fraunces font-black`

**Complete Rewrite:**
```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  icon?: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
  helper?: React.ReactNode;
  borderColor?: "orange" | "blue" | "green" | "violet" | "red";
  className?: string;
};

export function StatCard({
  icon,
  label,
  value,
  helper,
  borderColor = "orange",
  className
}: StatCardProps) {
  const borderClass = `border-t-${borderColor}-500`;

  return (
    <Card className={cn(`border-t-4 ${borderClass} rounded-2xl shadow-sm`, className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            {label}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-fraunces font-black text-slate-900">{value}</div>
        {helper && <p className="text-xs text-slate-500 mt-1">{helper}</p>}
      </CardContent>
    </Card>
  );
}
```

**Estimated Time:** 20 minutes

---

### 4. ✅ Badge Component (`src/components/ui/badge.tsx`)

**Status:** ALREADY COMPLIANT

The Badge component matches the /autopilot standard. Pages just need to USE it instead of inline styles.

**No changes needed.**

---

## Design Tokens: Current vs Target

| Token | Current | Target | Status |
|-------|---------|--------|--------|
| **Primary Color** | #ff5621 (orange-500) | #ff5621 | ✅ Correct |
| **Heading Font** | Inter (font-semibold) | Fraunces (font-black/bold) | ❌ Wrong |
| **Heading Size** | text-2xl | text-3xl | ❌ Wrong |
| **Card Border** | rounded-2xl shadow | border-t-4 border-t-{color}-500 + rounded-2xl shadow | ❌ Missing |
| **Card Title** | text-lg font-medium | text-lg font-fraunces font-bold | ❌ Wrong |
| **Stat Label** | text-sm | text-xs uppercase tracking-wide font-medium | ❌ Wrong |
| **Stat Value** | text-2xl font-semibold | text-3xl font-fraunces font-black | ❌ Wrong |
| **Badge** | Inline styles | Badge component with variants | ❌ Missing |
| **Icon Background** | None | w-12 h-12 rounded-xl bg-orange-100 | ❌ Missing |
| **Empty State** | Simple text | border-2 border-dashed + centered + icon | ❌ Missing |
| **Spacing** | space-y-4 | space-y-6 | ⚠️ Inconsistent |

---

## Recommended Update Order

### 🔴 Phase 1 - Critical (High Traffic Pages)
**Priority:** Must update first - these are the most visible pages

1. **Dashboard** (45 min) - Landing page, highest visibility
2. **Leads** (60 min) - Primary workflow page
3. **Lead Detail** (50 min) - Frequently accessed

**Subtotal:** 155 minutes (~2.5 hours)

---

### 🟡 Phase 2 - Secondary (Management Pages)
**Priority:** Important but lower traffic

4. **Companies** (30 min) - Admin function
5. **Users** (30 min) - Team management
6. **Settings** (35 min) - Configuration

**Subtotal:** 95 minutes (~1.5 hours)

---

### 🟢 Phase 3 - Supporting (Lower Priority)
**Priority:** Nice to have, can be done last

7. **Reports** (40 min) - Analytics page
8. **Integrations** (35 min) - Setup page
9. **Flows** (35 min) - SLA configuration
10. **Notifications** (30 min) - Alerts page

**Subtotal:** 140 minutes (~2.5 hours)

---

### 🔧 Phase 4 - Component Upgrades
**Priority:** Do BEFORE or DURING Phase 1-3

- **PageHeader** (20 min) - Upgrade or deprecate
- **SectionCard** (15 min) - Add border-top support
- **StatCard** (20 min) - Complete rewrite

**Subtotal:** 55 minutes (~1 hour)

---

**TOTAL ESTIMATED TIME:** 445 minutes (~7.5 hours of development work)

---

## Quick Wins (Do First)

These changes provide maximum visual impact with minimal effort:

### 1. Upgrade Shared Components (55 min)
- Update PageHeader to support icons + Fraunces
- Update SectionCard to add border-top
- Rewrite StatCard to match standard

**Result:** After this, all pages using these components will partially update automatically

### 2. Replace All Inline Badges (30 min)
- Search for inline badge patterns across all pages
- Replace with `<Badge variant={...}>` component

**Result:** Consistent status indicators across entire platform

### 3. Add Icons to All Headers (60 min)
- Add icon imports to each page
- Replace PageHeader with manual header + icon

**Result:** Immediate visual consistency across all pages

---

## Common Patterns to Find & Replace

### Pattern 1: Inline Status Badges
```tsx
// FIND
<span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
  Activa
</span>

// REPLACE WITH
<Badge variant="green">Activa</Badge>
```

### Pattern 2: PageHeader Usage
```tsx
// FIND
<PageHeader
  title="Dashboard"
  subtitle="Control tower pentru monitorizare si executie."
/>

// REPLACE WITH
<div className="flex items-center gap-3 mb-2">
  <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
    <LayoutDashboard className="w-6 h-6 text-orange-600" />
  </div>
  <div>
    <h1 className="text-3xl font-fraunces font-black text-slate-900">
      Dashboard
    </h1>
    <p className="text-sm text-slate-600 mt-0.5">
      Control tower pentru monitorizare si executie.
    </p>
  </div>
</div>
```

### Pattern 3: SectionCard to Bordered Card
```tsx
// FIND
<SectionCard
  title="Filtre"
  description="Ajusteaza criteriile..."
>
  {children}
</SectionCard>

// REPLACE WITH
<Card className="border-t-4 border-t-orange-500 rounded-2xl shadow-sm hover:shadow-lg transition-shadow">
  <CardHeader className="pb-3">
    <CardTitle className="text-lg font-fraunces font-bold text-slate-900">
      Filtre
    </CardTitle>
    <p className="text-sm text-slate-600">
      Ajusteaza criteriile...
    </p>
  </CardHeader>
  <CardContent>
    {children}
  </CardContent>
</Card>
```

---

## Testing Checklist

After making updates, verify:

- [ ] All headers use font-fraunces font-black
- [ ] All headers have icon in orange-100 background
- [ ] All cards have border-t-4 border-t-{color}-500
- [ ] All card titles use font-fraunces font-bold
- [ ] All stat cards show icons + uppercase labels + Fraunces numbers
- [ ] All status indicators use Badge component
- [ ] All empty states use dashed border pattern
- [ ] No console errors from Tailwind (check border-t-{color}-500 works)
- [ ] Responsive layout works (mobile + desktop)
- [ ] Hover states work on cards

---

## Next Steps

### Immediate Action Items

1. ✅ Review this audit report
2. ⬜ Upgrade shared components (PageHeader, SectionCard, StatCard)
3. ⬜ Start Phase 1: Update Dashboard, Leads, Lead Detail
4. ⬜ Continue with Phase 2 and 3
5. ⬜ Run final testing checklist

### Future Considerations

- Create comprehensive design system documentation
- Add Storybook for component library
- Create reusable patterns library
- Implement design system linting rules
- Add visual regression testing

---

**End of Audit Report**

Generated on: 2026-02-12
Total Pages Audited: 11
Total Work Required: ~7.5 hours
