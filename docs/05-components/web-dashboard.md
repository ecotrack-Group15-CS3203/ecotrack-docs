---
sidebar_position: 2
title: Web Dashboard
---

# Web Dashboard

The EcoTrack web dashboard is a **Next.js 14** (TypeScript) application serving as the primary interface for Organization Administrators. It uses the App Router with server-side rendering — public environmental campaign pages are fully SEO-indexable, and the admin UI renders with fresh data on every request without client-side loading spinners.

---

## Application Structure

The dashboard follows the Next.js App Router convention. Route groups separate the unauthenticated flow from the admin shell:

```
web/src/app/
├── (auth)/
│   └── login/page.tsx            → Asgardeo OAuth2 redirect initiation
├── (dashboard)/
│   ├── layout.tsx                → Admin shell: sidebar + server-side auth guard
│   ├── page.tsx                  → /dashboard — analytics overview
│   ├── incidents/
│   │   ├── page.tsx              → /incidents — paginated list with filters
│   │   └── [id]/
│   │       ├── page.tsx          → /incidents/:id — detail + verification
│   │       └── convert/page.tsx  → /incidents/:id/convert — task or event creation
│   ├── tasks/page.tsx            → /tasks — all org tasks with assignment status
│   ├── events/page.tsx           → /events — scheduled community events
│   ├── volunteers/
│   │   ├── page.tsx              → /volunteers — volunteer roster
│   │   └── join-requests/page.tsx → /volunteers/join-requests — approve or reject
│   ├── workflows/page.tsx        → /workflows — drag-and-drop stage editor
│   └── settings/page.tsx         → /settings — organization profile + invite links
└── api/
    └── auth/[...nextauth]/       → Asgardeo token exchange (server-side only)
```

---

## Key Pages

| Route | Purpose | Admin Action |
|---|---|---|
| `/dashboard` | Incident counts by status, volunteer activity, recent reports | Read-only analytics |
| `/incidents` | Paginated list filtered by status, urgency, and date range | Filter, search, open detail |
| `/incidents/:id` | Full incident detail with map pin, photos, status history | Verify, update status |
| `/incidents/:id/convert` | Convert verified incident to Task or Event | Select type, assign, submit |
| `/tasks` | All org tasks: assigned volunteer, due date, completion status | Reassign, cancel |
| `/events` | Upcoming and past cleanup events with RSVP counts | View attendees, cancel |
| `/volunteers` | Registered volunteer roster with task completion stats | Remove volunteer |
| `/volunteers/join-requests` | Pending membership requests from the public directory | Approve or reject |
| `/workflows` | Visual drag-and-drop workflow stage editor | Add, rename, reorder, delete stages |
| `/settings` | Organization profile, location, invite link generation | Update, generate invite |

---

## NFR: Incident-to-Task in 3 Clicks

The dashboard must allow an admin to convert a verified incident into an actionable volunteer task in **no more than 3 clicks** (Usability NFR). The `/incidents/:id/convert` page is designed to meet this requirement:

| Click | Action |
|---|---|
| **1** | Click an incident row in the list to open its detail page (`/incidents/:id`) |
| **2** | Click the **"Convert to Task"** button — navigates to `/incidents/:id/convert` with the task form pre-filled from the incident title, description, and location |
| **3** | Select an assigned volunteer from the dropdown and click **"Create Task"** |

The form is pre-populated from the incident record to eliminate manual re-entry. The volunteer dropdown is a filtered search showing only active volunteers in the organization.

---

## Authentication

The dashboard authenticates via WSO2 Asgardeo using the **Authorization Code Flow** (server-side). Access tokens are stored in **HttpOnly cookies** — never accessible to client-side JavaScript, preventing XSS-based token theft.

The `(dashboard)/layout.tsx` Server Component acts as an auth gate: it reads and validates the session cookie on every render and redirects unauthenticated requests to `/login` before any admin page content is returned.

---

## Server-Side Rendering and SEO

Next.js App Router Server Components handle all data fetching:

- The incident list and analytics pages are rendered server-side with fresh data on each request.
- Public organization profile pages are statically generated and indexable by search engines, enabling environmental campaigns to appear in search results.
- Auth tokens are injected server-side from the HttpOnly cookie — they are never passed through client-side JavaScript:

```typescript
// Server Component — token is read server-side, never sent to the browser
async function IncidentsPage({ searchParams }: Props) {
  const token = await getServerSideToken(); // reads HttpOnly cookie
  const incidents = await apiClient.incidents.list(searchParams, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return <IncidentTable data={incidents} />;
}
```

---

## Workflow Editor

The `/workflows` page renders the organization's current stage sequence as a draggable list. Admins can:

1. **Drag** a stage card to reorder — triggers `PATCH /v1/workflows/stages/reorder` on drop, which atomically reindexes all stages
2. **Click "Add Stage"** — opens an inline form to set the name, color badge, and `isFinal` flag
3. **Click a stage card** to rename it, change its color, or toggle it as the final resolved state
4. **Click "Delete"** on a stage — blocked with an inline error if any incidents currently hold that status slug

Changes take effect immediately; no backend restart or cache invalidation is required.
