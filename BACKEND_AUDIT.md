# BACKEND AUDIT - Pinggo Platform

**Audit Date:** 2026-02-12
**Platform Location:** `/Users/gabrielscorteanu/Documents/Personal/SaaS/apps/platform`

---

## 1. Tech Stack

| Component | Technology | Version/Details |
|-----------|-----------|-----------------|
| **Framework** | Next.js | 14.2.18 (App Router) |
| **React** | React | 18.3.1 |
| **Database** | PostgreSQL | via Prisma ORM 5.22.0 |
| **Auth** | NextAuth.js + Supabase | 4.24.10 / 2.95.3 |
| **Styling** | Tailwind CSS | 3.4.15 + tailwindcss-animate |
| **UI Components** | Radix UI + Custom | @radix-ui/react-* |
| **Icons** | Lucide React | 0.462.0 |
| **Validation** | Zod | 3.23.8 |
| **Email** | Resend | 4.0.1 |
| **State Management** | React Server Components + Client State | Built-in hooks |
| **TypeScript** | TypeScript | 5.6.3 |

---

## 2. Structură Foldere

```
apps/platform/
├── prisma/
│   ├── schema.prisma          # DB schema: User, Lead, Flow, SLA, etc.
│   └── seed.ts
├── public/
│   └── PINGGO_LOGO.png
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── (workspace)/       # Protected workspace routes
│   │   │   ├── dashboard/
│   │   │   ├── leads/         # ✅ Lead management + Autopilot
│   │   │   ├── companies/     # ✅ Company management
│   │   │   ├── users/         # ✅ User management
│   │   │   ├── flows/         # ✅ Flow wizard builder
│   │   │   ├── reports/       # ✅ Reports
│   │   │   ├── settings/      # ✅ Workspace settings
│   │   │   ├── integrations/  # ✅ Webhooks & integrations
│   │   │   ├── notifications/ # ✅ Notifications
│   │   │   └── layout.tsx     # Workspace layout wrapper
│   │   ├── api/               # API routes
│   │   │   ├── v1/
│   │   │   │   ├── leads/
│   │   │   │   ├── autopilot/ # ✅ Autopilot API exists
│   │   │   │   └── reports/
│   │   │   ├── auth/
│   │   │   ├── settings/
│   │   │   └── workspace/
│   │   ├── auth/              # Auth pages
│   │   ├── layout.tsx         # Root layout
│   │   └── globals.css
│   ├── components/
│   │   ├── layout/
│   │   │   ├── WorkspaceLayout.tsx
│   │   │   ├── WorkspaceSidebar.tsx  # Navigation
│   │   │   └── WorkspaceTopbar.tsx
│   │   └── ui/                # Reusable UI components
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       ├── page-header.tsx
│   │       ├── section-card.tsx
│   │       ├── stat-card.tsx
│   │       ├── confirm-dialog.tsx
│   │       └── copy-field.tsx
│   ├── lib/
│   │   ├── rbac.ts            # Role-based access control
│   │   └── utils.ts
│   ├── server/                # Server-side utilities
│   └── types/
│       └── next-auth.d.ts
├── middleware.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. Pagini Existente vs Target

| Pagină | Status | Path | Note |
|--------|--------|------|------|
| **Dashboard** | ✅ | `/dashboard` | Cards cu links către Leaduri și Fluxuri |
| **Leaduri** | ✅ | `/leads` | LeadsTable + lead detail pages |
| **Lead Detail** | ✅ | `/leads/[id]` | Include AutopilotSection component |
| **Autopilot (standalone page)** | ❌ | - | **MISSING** - doar section în lead detail |
| **Companii** | ✅ | `/companies` | Create/Delete company functionality |
| **Useri** | ✅ | `/users` | Invite users, delete users |
| **Integrări** | ✅ | `/integrations` | Webhook management, test buttons |
| **SLA Rules** | ⚠️ | - | **Implemented as "Flows"** - `/flows` |
| **Rapoarte** | ✅ | `/reports` | Reports page exists |
| **Setări** | ✅ | `/settings` | Workspace settings + members |
| **Fluxuri** | ✅ | `/flows` | Flow wizard builder with SLA stages |
| **Notificări** | ✅ | `/notifications` | Notifications page |

### Missing/Gaps:
1. **No dedicated Autopilot dashboard page** - Autopilot functionality exists only as a section within individual lead detail pages (`/leads/[id]`)
2. **No bulk autopilot management** - Can't see all autopilot states across leads
3. **SLA Rules are called "Flows"** - Rebranding may be needed for clarity

---

## 4. Design System

### Colors
**Primary Brand:** Orange (`#ff5621` / orange-500)

```typescript
// Custom orange palette (tailwind.config.ts)
orange: {
  50: "#fff4ef",
  100: "#ffe8dd",
  200: "#ffd0bb",
  300: "#ffb092",
  400: "#ff885f",
  500: "#ff5621",  // PRIMARY
  600: "#f04c1a",
  700: "#c93d13",
  800: "#a43615",
  900: "#872f16",
}

// CSS Variables (globals.css)
--radius: 0.875rem (14px)
--background: white
--foreground: slate-900
--border: slate-200
```

### Typography
- **Primary Font:** Inter (Google Fonts)
- **No Fraunces detected** - only Inter is used

### Background Style
```css
/* Signature gradient background */
background-image:
  radial-gradient(circle at 8% 12%, rgba(255, 86, 33, 0.08), transparent 34%),
  radial-gradient(circle at 92% -10%, rgba(255, 86, 33, 0.05), transparent 30%),
  linear-gradient(180deg, #f8fafc 0%, #f2f5f9 100%);
```

### UI Components Available

| Component | Location | Purpose |
|-----------|----------|---------|
| `Button` | `ui/button.tsx` | Primary CTA, variants (outline, ghost, etc.) |
| `Card` | `ui/card.tsx` | Container with header/content/footer |
| `Input` | `ui/input.tsx` | Form input field |
| `Label` | `ui/label.tsx` | Form label |
| `PageHeader` | `ui/page-header.tsx` | Page title + subtitle |
| `SectionCard` | `ui/section-card.tsx` | Dashboard section cards |
| `StatCard` | `ui/stat-card.tsx` | Statistics display |
| `ConfirmDialog` | `ui/confirm-dialog.tsx` | Confirmation modal |
| `CopyField` | `ui/copy-field.tsx` | Copyable text field |

**Missing Components:**
- Badge component (inline badges exist but no reusable component)
- Select/Dropdown (Radix Select is installed but no wrapper)
- Dialog/Modal wrapper (confirm-dialog exists but generic modal missing)
- Table component (tables are built inline, no reusable component)
- Tabs component
- Toast/notification system

---

## 5. Pattern-uri de Cod

### 5.1 Page Pattern (Server Component)
```tsx
// src/app/(workspace)/dashboard/page.tsx
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { getCurrentUserAndWorkspace } from "@/server/authMode";

export default async function DashboardPage() {
  const context = await getCurrentUserAndWorkspace().catch(() => null);
  if (!context) redirect("/login");

  const permissions = context.permissions;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        subtitle="Control tower pentru monitorizare si executie."
      />

      <div className="grid gap-3 lg:grid-cols-2">
        {permissions?.canViewLeads && (
          <SectionCard
            title="Leaduri"
            description="Vezi lista de leaduri si statusul operational."
          >
            <Button asChild className="bg-orange-500 text-white hover:bg-orange-600">
              <Link href="/leads">Deschide leaduri</Link>
            </Button>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
```

### 5.2 API Route Pattern
```tsx
// src/app/api/v1/autopilot/start/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { leadId } = body;

  // Validation
  // Business logic
  // Database operations

  return NextResponse.json({ snapshot, timeline });
}
```

### 5.3 Client Component Pattern
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AutopilotSection({ leadId, initialSnapshot }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [isPending, startTransition] = useTransition();

  function runAction(request, successMessage) {
    startTransition(async () => {
      const response = await request();
      const payload = await response.json();
      setSnapshot(payload.snapshot);
      router.refresh();
    });
  }

  return (
    <div>
      <Button onClick={() => runAction(/* ... */)}>
        Porneste autopilot
      </Button>
    </div>
  );
}
```

### 5.4 Sidebar Navigation
```tsx
// src/components/layout/WorkspaceSidebar.tsx
const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "canViewDashboard" },
  { href: "/leads", label: "Leaduri", icon: Users, permission: "canViewLeads" },
  { href: "/companies", label: "Companii", icon: Building2, permission: "canViewCompanies" },
  { href: "/users", label: "Useri", icon: UserCog, permission: "canViewUsers" },
  { href: "/flows", label: "Fluxuri", icon: Workflow, permission: "canViewFlows" },
  { href: "/settings", label: "Setari", icon: Settings, permission: "canViewSettings" },
  { href: "/reports", label: "Rapoarte", icon: BarChart3, permission: "canViewReports" },
  { href: "/integrations", label: "Integrari", icon: PlugZap, permission: "canViewIntegrations" },
];
```

---

## 6. RBAC System (Role-Based Access Control)

### Roles Hierarchy
```
SUPER_ADMIN > OWNER/ADMIN > MANAGER > AGENT
```

### Permission Matrix (`src/lib/rbac.ts`)

| Permission | SUPER_ADMIN | ADMIN | MANAGER | AGENT |
|------------|-------------|-------|---------|-------|
| `canViewDashboard` | ✅ | ✅ | ✅ | ✅ |
| `canViewLeads` | ✅ | ✅ | ✅ | ✅ |
| `canManageLeadActions` | ✅ | ✅ | ✅ | ✅ |
| `canReassignLeads` | ✅ | ✅ | ✅ | ❌ |
| `canViewCompanies` | ✅ | ❌ | ❌ | ❌ |
| `canViewUsers` | ✅ | ❌ | ❌ | ❌ |
| `canViewFlows` | ✅ | ✅ | ✅ | ❌ |
| `canEditFlows` | ✅ | ✅ | ❌ | ❌ |
| `canViewReports` | ✅ | ✅ | ✅ | ❌ |
| `canViewSettings` | ✅ | ✅ | ❌ | ❌ |
| `canEditSettings` | ✅ | ✅ | ❌ | ❌ |
| `canViewIntegrations` | ✅ | ✅ | ❌ | ❌ |
| `canEditIntegrations` | ✅ | ✅ | ❌ | ❌ |
| `canViewMembers` | ✅ | ✅ | ❌ | ❌ |
| `canInviteUsers` | ✅ | ❌ | ❌ | ❌ |
| `canViewNotifications` | ✅ | ✅ | ✅ | ✅ |

---

## 7. Database Schema Highlights

### Key Models (Prisma)

**User** → has many Memberships → belongs to Workspaces
**Lead** → belongs to Workspace, has LeadIdentity, LeadEvents, SLAStageInstances
**Flow** → contains SLAStageDefinitions + EscalationRules
**SLAStageInstance** → tracks individual SLA stages per lead

### Enums
- `MembershipRole`: OWNER, ADMIN, MANAGER, AGENT
- `LeadStatus`: NEW, OPEN, QUALIFIED, NOT_QUALIFIED, SPAM, ARCHIVED
- `LeadSourceType`: WEBHOOK, FORM, CRM, WHATSAPP, API, MANUAL, IMPORT, EMAIL
- `SLAStageInstanceStatus`: RUNNING, STOPPED, BREACHED

---

## 8. Recomandări pentru Update

### Ce lipsește din arhitectura țintă?

1. **Autopilot Dashboard Page** (❌)
   - Currently: Autopilot UI exists only in `/leads/[id]` as `AutopilotSection`
   - Needed: `/autopilot` page showing all leads with autopilot status
   - API already exists: `/api/v1/autopilot/start`, `/api/v1/autopilot/event`

2. **Reusable UI Components** (⚠️)
   - Missing: Badge, Select, Modal, Table, Tabs, Toast
   - Radix UI is installed but not fully wrapped

3. **Fraunces Font** (❌)
   - Target design uses Fraunces for headings
   - Currently only Inter is loaded

4. **Enhanced Design System** (⚠️)
   - Need centralized color palette beyond orange
   - Need status color system (success, warning, error, info)
   - Need spacing/sizing tokens

5. **State Management** (✅ OK for now)
   - Currently using React Server Components + client state
   - Works well for current scope
   - Consider React Query/TanStack Query if data fetching becomes complex

---

## 9. First Task Suggestion

### **Task #1: Create Dedicated Autopilot Dashboard Page**

**Why?** Autopilot functionality exists but is hidden within individual lead pages. Users can't see autopilot status across all leads.

**What to build:**

#### Page: `/autopilot`
**Path:** `src/app/(workspace)/autopilot/page.tsx`

**Features:**
- Table showing all leads with autopilot enabled
- Columns: Lead name, Status, Questions asked, Last action, Time in state
- Filter by autopilot state (IDLE, ACK_SENT, QUESTION_1_SENT, etc.)
- Bulk actions: Start autopilot, Stop autopilot
- Click row → navigate to `/leads/[id]`

**API Endpoint:** Create `src/app/api/v1/autopilot/overview/route.ts`
- Returns: All leads + their autopilot snapshots
- Filter support
- Pagination

**Sidebar Update:** Add to `WorkspaceSidebar.tsx`
```tsx
{
  href: "/autopilot",
  label: "Autopilot",
  icon: Bot, // or Zap
  permission: "canViewLeads"
}
```

**Estimated Files:**
- `src/app/(workspace)/autopilot/page.tsx` (new)
- `src/app/api/v1/autopilot/overview/route.ts` (new)
- `src/components/layout/WorkspaceSidebar.tsx` (edit - add nav item)
- `src/components/ui/badge.tsx` (new - for status badges)

---

## 10. Component Inventory

### Layout Components
- ✅ `WorkspaceLayout` - Main workspace wrapper
- ✅ `WorkspaceSidebar` - Navigation sidebar
- ✅ `WorkspaceTopbar` - Top navigation bar
- ✅ `WorkspaceMobileNav` - Mobile navigation

### UI Components (Reusable)
- ✅ `Button` - Primary button component
- ✅ `Card` - Generic card container
- ✅ `Input` - Text input
- ✅ `Label` - Form label
- ✅ `PageHeader` - Page title component
- ✅ `SectionCard` - Dashboard section cards
- ✅ `StatCard` - Statistics display
- ✅ `ConfirmDialog` - Confirmation dialog
- ✅ `CopyField` - Copyable text field
- ❌ `Badge` - Status badges (MISSING)
- ❌ `Select` - Dropdown select (MISSING)
- ❌ `Modal` - Generic modal (MISSING)
- ❌ `Table` - Reusable table (MISSING)
- ❌ `Tabs` - Tab navigation (MISSING)
- ❌ `Toast` - Notifications (MISSING)

### Feature Components
- ✅ `AutopilotSection` - Lead autopilot UI
- ✅ `LeadsTable` - Leads listing table
- ✅ `FlowWizardBuilder` - Flow configuration wizard
- ✅ `InviteUserForm` - User invitation form
- ✅ `CreateCompanyForm` - Company creation
- ✅ `DeleteUserButton` - User deletion
- ✅ `DeleteCompanyButton` - Company deletion
- ✅ `WebhookTestButton` - Integration testing
- ✅ `WebhookRotateTokenButton` - Token rotation

---

## 11. Code Quality Notes

### ✅ Strengths
- Clean App Router structure
- Consistent naming conventions
- RBAC system well-implemented
- Type-safe with TypeScript
- Server components for auth checks
- Prisma schema is well-designed

### ⚠️ Areas for Improvement
- No centralized error handling
- Tables built inline (no reusable Table component)
- Badge styling duplicated across files
- No loading states/skeletons
- No error boundaries
- Limited form validation (Zod installed but not extensively used)

---

## Summary

**Platform is 80% complete** with solid foundations:
- ✅ Auth + RBAC system
- ✅ Core pages (Dashboard, Leads, Companies, Users, Settings, Reports, Integrations)
- ✅ Autopilot functionality (embedded in lead detail)
- ✅ SLA tracking via Flows
- ✅ Database schema

**Key Gaps:**
1. Autopilot dashboard page (highest priority)
2. Missing UI components (Badge, Select, Modal, Table, Tabs)
3. Design system refinement (Fraunces font, status colors)
4. Bulk operations UI

**Next Steps:**
1. Build `/autopilot` dashboard page (Task #1)
2. Create missing UI components
3. Add Fraunces font for headings
4. Implement bulk lead actions
5. Add loading/error states
