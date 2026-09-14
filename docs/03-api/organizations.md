---
sidebar_position: 4
title: Organisations
---

# Organisations

An Organisation is an independent environmental group that manages its own claimed incidents, volunteers, tasks, and events on the EcoTrack platform. Every organisation, table, and route in this codebase uses the British spelling — **organisation** / `organisations`, never "organization".

Every user belongs to at most one organisation at a time (single-org-per-user); `role` and `organisationId` live directly on the `users` row.

**Base path:** `/v1/organisations`

---

## Organisation Object

```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "name": "Bolgoda Lake Conservation Society",
  "slug": "bolgoda-lake-conservation-society",
  "description": "A volunteer-driven group restoring the ecological health of Bolgoda Lake, Sri Lanka.",
  "contactEmail": "admin@bolgoda.org",
  "isActive": true,
  "serviceAreaCenter": { "lat": 6.8235, "lng": 80.0399 },
  "serviceAreaRadiusKm": 10,
  "createdAt": "2026-01-15T09:00:00Z",
  "updatedAt": "2026-01-15T09:00:00Z"
}
```

| Field | Description |
|---|---|
| `slug` | Auto-generated from `name` at registration (lowercased, non-alphanumerics collapsed to `-`), unique. Collisions get a numeric suffix: `name`, `name-2`, `name-3`, ... Backs the public `/orgs/[slug]` page on `ecotrack-web`. |
| `serviceAreaCenter` / `serviceAreaRadiusKm` | **Required at registration.** Governs which pooled incidents this org can claim (`GET /v1/incidents/pool`), and gates join-request/invite-link eligibility for prospective volunteers |
| `serviceAreaRadiusKm` | Must be one of `1`, `5`, `10`, `25`, `50` |
| `isActive` | Set by a platform admin via activate/deactivate; inactive organisations cannot accept invitation/join-request/invite-link redemptions |

`organisations` is deliberately **not** row-level-security protected — it's tenant-agnostic by design, readable by any authenticated user for directory/search purposes. See [Multi-Tenancy](../02-architecture/multi-tenancy.md) for how that differs from every other table.

---

## Endpoints

### `POST /v1/organisations`

Register a new organisation. The authenticated user becomes its first `org_admin`, unless `initialAdminEmail` names someone else. Rate-limited (10 requests/minute) — new-tenant registration is brute-force/enumeration sensitive.

**Auth:** Any authenticated user

**Request body:**

```json
{
  "name": "Bolgoda Lake Conservation Society",
  "description": "A volunteer-driven group restoring the ecological health of Bolgoda Lake, Sri Lanka.",
  "contactEmail": "admin@bolgoda.org",
  "serviceAreaCenter": { "lat": 6.8235, "lng": 80.0399 },
  "serviceAreaRadiusKm": 10,
  "initialAdminEmail": "someone-else@example.com"
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | ✓ | Non-empty |
| `contactEmail` | ✓ | Valid email |
| `description` | — | |
| `serviceAreaCenter` | ✓ | `{lat, lng}` |
| `serviceAreaRadiusKm` | ✓ | One of `1`/`5`/`10`/`25`/`50` |
| `initialAdminEmail` | — | Omitted: the caller becomes admin. Supplied with a different address: that account is promoted directly if it already exists, or sent an admin invitation (72h TTL) if not |

A user who already belongs to an organisation cannot register another for themselves (they can still stand one up for someone else via `initialAdminEmail`).

**Response `201`:**

```json
{
  "organisation": { /* Organisation Object */ },
  "adminInvitation": null,
  "adminAlreadyExisted": true
}
```

Registration also seeds the organisation's five default [workflow stages](./workflows) and its default [workflow stage rules](./workflows#workflow-stage-rules) row.

**Errors:**

| Status | Cause |
|---|---|
| `409` | The caller already belongs to an organisation and did not name someone else via `initialAdminEmail` |

---

### `GET /v1/organisations`

List **every** organisation on the platform, active or not. This is a platform-admin operation, not the public directory — see `GET /v1/organisations/public` below for that.

**Auth:** platform admin

**Response `200`:** a bare array of full [Organisation Objects](#organisation-object).

---

### `GET /v1/organisations/public`

The public organisation directory — an unauthenticated org picker used by the mobile registration flow and the volunteer-enrollment directory.

**Auth:** none (public)

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `q` | string | Case-insensitive substring match on `name` |
| `lat` + `lng` | number | Both-or-neither. When supplied, each result carries `distanceMeters` and `eligible` |
| `radius` | number | Optional extra ceiling (metres, 100–50,000) on how far an organisation's centre may be. Without a point, ignored |
| `page` / `limit` | number | Standard pagination |

The `eligible` flag tests **coverage, not proximity** — whether the organisation's own service area reaches the given point — the same predicate a join request or invite-link redemption is checked against, so the client can grey out a Join button before the citizen wastes a request.

**Response `200`:**

```json
{
  "items": [
    {
      "id": "f47ac10b-...",
      "name": "Bolgoda Lake Conservation Society",
      "slug": "bolgoda-lake-conservation-society",
      "description": "...",
      "contactEmail": "admin@bolgoda.org",
      "serviceAreaRadiusKm": 10,
      "distanceMeters": 812.4,
      "eligible": true
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20
}
```

`distanceMeters`/`eligible` are `null` when no point was supplied — distinguishing "we didn't check" from "checked and out of range". Only active (`isActive: true`) organisations are returned.

---

### `GET /v1/organisations/by-slug/:slug`

Public lookup by slug, backing the `ecotrack-web` `/orgs/[slug]` server-rendered page.

**Auth:** none (public)

**Response `200`:** `{ id, name, slug, description, contactEmail, serviceAreaRadiusKm }` — the same reduced projection as the directory, minus `distanceMeters`/`eligible` (there's no caller point to measure from on an anonymous page view).

**Errors:**

| Status | Cause |
|---|---|
| `404` | No organisation with this slug |

---

### `GET /v1/organisations/:organisationId`

Full organisation details by ID.

**Auth:** `org_admin` (own org), platform admin

**Response `200`:** Full [Organisation Object](#organisation-object).

---

### `PATCH /v1/organisations/:organisationId`

Update an organisation's profile, including its service area. Changing the service area only affects future pool queries — it does not retroactively touch already-claimed incidents.

**Auth:** `org_admin` (own org), platform admin

**Request body (all fields optional):**

```json
{
  "name": "Updated name",
  "description": "Updated description",
  "contactEmail": "new-contact@bolgoda.org",
  "serviceAreaCenter": { "lat": 6.83, "lng": 80.04 },
  "serviceAreaRadiusKm": 25
}
```

`serviceAreaCenter` and `serviceAreaRadiusKm` must be supplied together or not at all.

**Response `200`:** Updated [Organisation Object](#organisation-object).

---

### `PATCH /v1/organisations/:organisationId/activate` / `PATCH /v1/organisations/:organisationId/deactivate`

Platform-admin controls over whether an organisation can accept new members. An inactive organisation's invitations/join-requests/invite-links are refused.

**Auth:** platform admin

**Response `200`:** Updated [Organisation Object](#organisation-object).

---

### `GET /v1/organisations/:organisationId/members`

List this organisation's members (volunteers and admins — a pending join requester is not yet a member and does not appear here).

**Auth:** `org_admin` (own org), platform admin

**Query parameters:** `role` (`citizen`\|`volunteer`\|`org_admin`), `page`, `limit`

**Response `200`:** `{ items, total, page, limit }`, each item `{ id, email, fullName, role, isActive, createdAt }`.

---

### `DELETE /v1/organisations/:organisationId/volunteers/:userId`

Remove a volunteer from the organisation. They remain a `citizen` account and may join elsewhere later; they are not deleted. Any active task assignment is cancelled and its task returned to `pending` (there is no `unassigned` task status); future event RSVPs are withdrawn.

**Auth:** `org_admin`

**Response `204`:** No content.

**Errors:**

| Status | Cause |
|---|---|
| `400` | Target is not a `volunteer` (an admin must transfer or step down first), or the caller tried to remove themselves this way |
| `404` | The user is not a member of this organisation |

---

## Invitations (email-bound, single-use)

### `POST /v1/organisations/:organisationId/invitations`

Send a single-use, email-bound invitation. Distinct from the shareable invite links below.

**Auth:** `org_admin`

**Request body:** `{ "email": "nimal@example.com", "fullName": "Nimal P." }`

**Response `201`:** the invitation row, including its opaque `token`.

The invitee looks it up via `GET /v1/auth/invitations/:token` (public, rate-limited) and accepts via `POST /v1/auth/invitations/:token/accept` (authenticated) — see [Authentication](./authentication#account--profile). Volunteer invitations expire after 7 days, admin invitations after 72 hours.

---

## Shareable Invite Links

Separate from email invitations: an org admin generates a link that can be shared and redeemed by anyone within the service area, optionally with a use-count cap.

### `POST /v1/organisations/:organisationId/invites`

**Auth:** `org_admin`

**Request body:** `{ "maxUses": 20, "expiresInDays": 7 }` — both optional; omitted `maxUses` means unlimited, omitted `expiresInDays` defaults to 7.

**Response `201`:**

```json
{
  "inviteLink": { "id": "...", "organisationId": "...", "maxUses": 20, "usesCount": 0, "expiresAt": "2026-08-07T10:00:00Z", "revokedAt": null },
  "token": "OeF3n1x9k2m..."
}
```

Only the token's SHA-256 hash is persisted; the plaintext `token` is returned exactly once.

### `GET /v1/organisations/:organisationId/invites`

**Auth:** `org_admin` — bare array of the org's invite links.

### `DELETE /v1/organisations/:organisationId/invites/:inviteId`

Revoke an invite link. **Auth:** `org_admin`. Response `200`.

### `GET /v1/invites/:token`

Public lookup for the accept screen — org name and validity, nothing enumerable. Rate-limited.

**Response `200`:** `{ organisationName, expired, revoked, exhausted }`

### `POST /v1/organisations/invites/accept`

Redeem an invite link. Rate-limited.

**Auth:** any authenticated user

**Request body:** `{ "token": "...", "lat": 6.8235, "lng": 80.0399 }` — `lat`/`lng` is the caller's **current** position, checked fresh against the organisation's service area, the same way a join request is.

**Response `200`:** `{ "organisationId": "...", "role": "volunteer" }`

**Errors:**

| Status | Cause |
|---|---|
| `400` | Link revoked, expired, at its use limit, or the org's service area isn't configured |
| `409` | Caller already belongs to another organisation |
| `422` | The submitted location is outside the organisation's service area |

---

## Join Requests

A citizen with no organisation submits a request to join one; an admin approves or rejects it.

### `POST /v1/organisations/join-request`

Rate-limited. No `@Roles` restriction — a citizen with no membership is the expected caller.

**Auth:** any authenticated user

**Request body:**

```json
{
  "organisationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "lat": 6.8235,
  "lng": 80.0399,
  "message": "I am a local resident and want to help with lake cleanups."
}
```

`lat`/`lng` is the caller's current position, checked against the target organisation's service area. On success this also records the coordinates as the user's `homeLocation` (SRS 3.11.1 — used only for join/invite eligibility, never for incident proximity matching; see [Multi-Tenancy](../02-architecture/multi-tenancy.md) and the [Authentication](./authentication) page's note on `homeLocation` vs `alertCenter`).

**Response `201`:** the join request row, `status: "pending"`.

**Errors:**

| Status | Cause |
|---|---|
| `409` | Already a member of another organisation, or a pending/approved request to this org already exists |
| `422` | The submitted location is outside the organisation's service area |

---

### `GET /v1/organisations/:organisationId/join-requests`

**Auth:** `org_admin`

**Query parameters:** `status` (`pending`\|`approved`\|`rejected`), `page`, `limit`

**Response `200`:** `{ items, total, page, limit }`, each item including a `requester: { id, fullName, email }` summary.

---

### `PATCH /v1/organisations/:organisationId/join-requests/:requestId`

Approve or reject a pending request.

**Auth:** `org_admin`

**Request body:** `{ "status": "approved" }` — only `approved` or `rejected`; `pending` is never a settable target.

On approval the requester's role becomes `volunteer` and `organisationId` is set immediately (no separate "next login" propagation — the DB row is the source of truth, re-read on every request).

**Response `200`:** Updated join request row.

**Errors:**

| Status | Cause |
|---|---|
| `400` | This request has already been resolved |
| `409` | On approval: the requester joined a different organisation in the meantime |
