---
sidebar_position: 2
title: Authentication
---

# Authentication

EcoTrack uses **WSO2 Asgardeo** for identity and OAuth2 token issuance only — Asgardeo verifies *who* the user is, nothing more. All protected API endpoints require a valid JWT bearer token issued by Asgardeo. Role-Based Access Control (RBAC) is enforced at the NestJS Guard layer, but using a `role`/`organisationId` freshly resolved from EcoTrack's own `users` table on every request — **not** a claim embedded in the token. See [Token Format](#token-format) below.

---

## OAuth2 Authorization Flows

### Web Dashboard — Authorization Code Flow

```
1. User clicks "Sign In" on the web dashboard
2. Browser redirects to Asgardeo authorization endpoint
3. User authenticates (email/password, social login, or MFA)
4. Asgardeo redirects back to the dashboard with ?code=AUTH_CODE
5. Dashboard backend exchanges the code for tokens (server-side)
6. Access token is stored in an HttpOnly cookie
```

### Mobile App — Authorization Code + PKCE Flow

The mobile app uses PKCE (Proof Key for Code Exchange) because native apps cannot securely store a client secret.

```
1. App generates a random code_verifier and computes code_challenge = SHA-256(code_verifier)
2. App opens the Asgardeo login URL with code_challenge and method=S256
3. User authenticates in the in-app browser (ASWebAuthenticationSession / Chrome Custom Tab)
4. Asgardeo redirects back to the app deep link with ?code=AUTH_CODE
5. App exchanges the code + code_verifier for tokens (no client secret required)
6. Access token is stored in the device Secure Enclave / Keychain
```

---

## Token Format

Asgardeo issues standard RS256 JWT access tokens, verified on every request against Asgardeo's live JWKS endpoint (no locally-held secret — EcoTrack does not sign its own tokens). The access token carries only Asgardeo's own claims:

```json
{
  "iss": "https://api.asgardeo.io/t/your-org/oauth2/token",
  "sub": "3a1b2c4d-0000-0000-0000-abc123456789",
  "aud": "your-client-id",
  "exp": 1753963800,
  "iat": 1753960200,
  "email": "admin@bolgoda.org",
  "name": "Rashmika S.",
  "given_name": "Rashmika",
  "family_name": "S."
}
```

| Claim | Type | Description |
|---|---|---|
| `sub` | string | Unique user ID (Asgardeo's `authSubject`) |
| `email` | string | **Required.** Must be added to the application's *Access Token Attributes* in the Asgardeo console — Asgardeo omits it by default. Requests with no `email` claim are rejected with a `401` naming this fix |
| `name` / `given_name` / `family_name` | string | Optional, used only to seed a brand-new user's `fullName` on first sight |

:::important
There is **no `role` or `organizationId` claim**, trusted or otherwise. EcoTrack's own `users` table is the sole source of truth for both. On the first request bearing a validated token for a never-seen `sub`, a `users` row is **just-in-time provisioned** — `role: citizen`, `organisationId: null`. Every subsequent request re-resolves `role`/`organisationId` fresh from that row (not from any token claim), so a role or org-membership change takes effect on the user's very next request, with no re-login required.
:::

---

## Making Authenticated Requests

Include the access token in the `Authorization` header of every API request:

```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

---

## Token Refresh

Access tokens expire after **1 hour**. Use the refresh token to obtain a new access token without requiring re-authentication:

```http
POST https://api.asgardeo.io/t/{org}/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=REFRESH_TOKEN
&client_id=YOUR_CLIENT_ID
```

---

## Role-Based Access Control

EcoTrack checks against four role values, not three: the `role` column's three values, plus a platform-wide flag that isn't tied to any organisation at all.

| Role | Scope | Key Permissions |
|---|---|---|
| `citizen` | No organisation | Report incidents, view the public hazard map, browse the organisation directory, submit join requests / redeem invite links |
| `volunteer` | One organisation | Everything a `citizen` can, plus: view and respond to own task assignments, upload progress evidence, RSVP to events |
| `org_admin` | One organisation | Everything a `volunteer` can, plus: browse and claim the incident pool, reject/mark-duplicate claimed incidents, create tasks and events, configure workflow stages and stage rules, manage members/invitations/invite links, view the org's audit log |
| `platform_admin` | Every organisation | Not a `role` value — a separate `users.isPlatformAdmin` boolean. Activate/deactivate any organisation, list all organisations, view platform-wide stats and audit logs |

Roles do not literally "inherit" one another in code (`org_admin` is not automatically granted every `volunteer`-gated route) — in practice most organisation-scoped read routes are guarded with `@Roles(UserRole.ORG_ADMIN, UserRole.VOLUNTEER, PLATFORM_ADMIN)` explicitly, rather than a hierarchy check.

### Endpoint Authorization Matrix

A representative sample — see [Incidents](./incidents), [Organisations](./organizations), [Tasks & Events](./tasks-events), and [Workflows](./workflows) for the exhaustive, per-endpoint auth requirements.

| Endpoint | `citizen` | `volunteer` | `org_admin` | `platform_admin` |
|---|:---:|:---:|:---:|:---:|
| `POST /v1/incidents` | ✓ | ✓ | ✓ | — |
| `GET /v1/incidents/nearby` | ✓ | ✓ | ✓ | ✓ |
| `GET /v1/incidents/pool` | — | — | ✓ | — |
| `POST /v1/incidents/pool/:id/claim` | — | — | ✓ | — |
| `GET /v1/organisations/:id/incidents` | — | — | ✓ | ✓ |
| `PATCH /v1/organisations/:id/incidents/:id/reject` | — | — | ✓ | — |
| `GET /v1/organisations/:id/tasks/mine` | — | ✓ | — | — |
| `POST /v1/organisations/:id/tasks` | — | — | ✓ | — |
| `PATCH /v1/organisations/:id/tasks/:id/progress/complete` | — | ✓ | — | — |
| `POST /v1/organisations/:id/events` | — | — | ✓ | — |
| `POST /v1/organisations/:id/events/:id/rsvp` | — | ✓ | — | — |
| `GET /v1/organisations/:id/workflow-stages` | — | — | ✓ | ✓ |
| `PATCH /v1/organisations/:id/workflow-stage-rules` | — | — | ✓ | ✓ |
| `GET /v1/organisations/public` | ✓ | ✓ | ✓ | ✓ (unauthenticated too) |
| `POST /v1/organisations` | ✓ | ✓ | ✓ | ✓ |
| `POST /v1/organisations/:id/invites` | — | — | ✓ | — |
| `PATCH /v1/organisations/:id/activate` | — | — | — | ✓ |

Routes taking an `:organisationId` path parameter are additionally guarded by `TenantGuard`: the caller's own `organisationId` (resolved from the `users` table, never trusted from the token) must match the path parameter, or the request is rejected with `403` — a platform admin is exempt from this check. See [Multi-Tenancy](../02-architecture/multi-tenancy).

---

## Account & Profile

Beyond the OAuth flow itself, a handful of routes live under `/v1/auth` for profile and account-lifecycle actions:

| Endpoint | Auth | Description |
|---|---|---|
| `GET /v1/auth/me` | any authenticated user | Current profile: `id`, `fullName`, `email`, `role`, `isPlatformAdmin`, notification preferences, `alertCenterSet` (boolean — never the coordinates themselves), and the user's `organisation` summary if any |
| `PATCH /v1/auth/me` | any authenticated user | Update `fullName`, notification preferences, `notificationRadiusMeters`, `notificationMinUrgency`, or `alertCenter` (see below) |
| `PATCH /v1/auth/push-token` | any authenticated user | Register the device's Expo push token |
| `DELETE /v1/auth/me` | any authenticated user | Right-to-erasure account deletion. `204` on success. Database-local only — it does **not** delete the identity from Asgardeo, so the same person signing in again afterwards is provisioned a fresh, empty `citizen` account for the same `sub`. Returns `409` if the caller is the last active `org_admin` of an active organisation |
| `GET /v1/auth/invitations/:token` | public, rate-limited | Look up an email invitation before accepting it |
| `POST /v1/auth/invitations/:token/accept` | any authenticated user, rate-limited | Accept an email invitation — see [Organisations](./organizations#invitations-email-bound-single-use) |

### Two distinct location fields — do not conflate them

`users` carries two separate geography points, each with its own consent moment and its own single purpose:

| Field | Set when | Used for |
|---|---|---|
| `homeLocation` | A join request is submitted, or an invite link is redeemed | **Only** join/invite service-area eligibility checks |
| `alertCenter` | The user explicitly configures/updates their proximity-alert radius on mobile (via `PATCH /v1/auth/me`) | **Only** matching new incidents against the proximity-alert notification job |

Neither is captured at registration, and neither is ever substituted for the other — `alertCenter` is never read for join eligibility, and `homeLocation` is never matched against new incidents.

## Authentication Error Responses

| Status Code | Error Code | Cause |
|---|---|---|
| `401 Unauthorized` | `TOKEN_MISSING` | No `Authorization` header provided |
| `401 Unauthorized` | `TOKEN_EXPIRED` | JWT has passed its `exp` claim |
| `401 Unauthorized` | `TOKEN_INVALID` | JWT signature verification failed against Asgardeo JWKS |
| `403 Forbidden` | — | Authenticated user's DB-resolved role does not have permission for this endpoint (`RolesGuard`). No machine-readable `code` is attached to this one — it's a plain Nest `ForbiddenException` |
| `403 Forbidden` | — | The `:organisationId` path parameter doesn't match the caller's own DB-resolved organisation, and the caller isn't a platform admin (`TenantGuard`). Also a plain `ForbiddenException`, no `code` |

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "JWT token has expired",
  "code": "TOKEN_EXPIRED"
}
```
