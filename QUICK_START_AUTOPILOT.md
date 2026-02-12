# 🚀 Quick Start - Autopilot Page

## Acces Rapid

```bash
cd /Users/gabrielscorteanu/Documents/Personal/SaaS/apps/platform
npm run dev
# Navigate to: http://localhost:3001/autopilot
```

## Componente Noi Disponibile

### Badge Component
```tsx
import { Badge } from "@/components/ui/badge";

// Variante disponibile
<Badge variant="orange">Default</Badge>
<Badge variant="blue">Info</Badge>
<Badge variant="green">Success</Badge>
<Badge variant="violet">Special</Badge>
<Badge variant="red">Error</Badge>
<Badge variant="gray">Inactive</Badge>
```

### Fraunces Font
```tsx
// Pentru headings bold
<h1 className="font-fraunces font-black">Title</h1>

// Pentru headings semi-bold
<h2 className="font-fraunces font-bold">Subtitle</h2>
```

## Structura Pagină

```
/autopilot
├── Header (Bot icon + title + CTA)
├── Stats Grid (4 cards)
│   ├── Scenarii Active
│   ├── Leaduri Azi
│   ├── Booking Rate
│   └── Handover Rate
├── Scenarii List (3 dummy cards)
│   ├── Programare Consultație Medicală
│   ├── Calificare Lead Imobiliare
│   └── Demo Panouri Solare
└── Empty State (CTA pentru scenariu nou)
```

## Files Modified

1. `src/app/layout.tsx` - Fraunces font
2. `tailwind.config.ts` - font-fraunces utility
3. `src/components/layout/WorkspaceSidebar.tsx` - Autopilot menu item
4. `src/components/ui/badge.tsx` - NEW Badge component
5. `src/app/(workspace)/autopilot/page.tsx` - NEW Autopilot page

## Permissions

- Requires: `canViewLeads`
- Roles: SUPER_ADMIN, ADMIN, MANAGER, AGENT
- Redirects to /dashboard if no permission

## Design Tokens

```tsx
// Colors
primary: orange-500 (#ff5621)
stats-borders: orange-500, blue-500, green-500, violet-500

// Typography
headings: font-fraunces (700, 800, 900)
body: font-sans (Inter)

// Spacing
container: max-w-6xl
gaps: space-y-6, gap-4
```

## Next: Add Real Data

1. Create API endpoint: `/api/v1/autopilot/overview`
2. Replace dummy data with Prisma queries
3. Add real-time stats calculation
4. Connect to existing autopilot events

See `AUTOPILOT_IMPLEMENTATION.md` for full details.
