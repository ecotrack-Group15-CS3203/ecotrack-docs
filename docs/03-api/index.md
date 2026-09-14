---
sidebar_position: 1
title: API Reference
---

# API Reference

The EcoTrack REST API is built with **NestJS** and exposes endpoints for incident management, multi-tenant organization coordination, volunteer task tracking, and dynamic workflow configuration.

**Base URL:** `https://api.ecotrack.example.com/v1`

---

## In This Section

- [Authentication](./authentication) — WSO2 Asgardeo OAuth2 flow, RBAC roles, JWT format, account endpoints
- [Incidents](./incidents) — Report incidents into the Global Incident Pool, browse/claim by service area, reject or mark duplicate
- [Organisations](./organizations) — Register an organisation with a service area, generate invite links, review join requests, manage members
- [Tasks & Events](./tasks-events) — Convert claimed incidents into volunteer tasks or community cleanup events
- [Workflows](./workflows) — Configure per-organisation incident stages and the stage-advance/precondition rules that drive them

---

## Conventions

### Request Headers

All requests to protected endpoints must include:

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

### API Versioning

The API is versioned via the URL path prefix (`/v1`). Breaking changes will be introduced under a new version prefix (`/v2`) with a deprecation notice and migration period.

### Error Response Format

All API errors return a consistent JSON body:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "field": "location.lat", "constraint": "lat must be a number" }
  ]
}
```

| Field | Description |
|---|---|
| `statusCode` | HTTP status code |
| `error` | HTTP status text |
| `message` | Human-readable description |
| `code` | Machine-readable error code (use this for conditional handling) |
| `details` | Optional array of field-level validation errors |

### HTTP Status Codes

| Code | Meaning |
|---|---|
| `200 OK` | Request succeeded |
| `201 Created` | Resource successfully created |
| `204 No Content` | Successful deletion or update with no response body |
| `400 Bad Request` | Invalid input — see `details` for field-level errors |
| `401 Unauthorized` | Missing, expired, or invalid bearer token |
| `403 Forbidden` | Valid token but insufficient role or cross-tenant access attempt |
| `404 Not Found` | Resource does not exist in the user's tenant |
| `409 Conflict` | State conflict (e.g., slug already taken, resource in use) |
| `422 Unprocessable Entity` | Syntactically valid request rejected due to business rule violation |
| `500 Internal Server Error` | Unexpected server error — contact support |

### Pagination

Most list endpoints (incidents, tasks, events, join-requests, members, audit logs) return page-based results in this envelope:

```json
{
  "items": [ /* array of resource objects */ ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

Default `limit` is `20`. Maximum `limit` is `100`.

A few list endpoints are deliberately **unpaginated bare arrays** instead, because the underlying set is always small or the client always needs the whole thing at once: the incident pool listing (`GET /v1/incidents/pool`), workflow stages, workflow stage rules (a single object, not even an array), and invite links. Check each endpoint's own documentation for its exact response shape.

### Multi-Tenancy and Data Isolation

Most requests are scoped to a specific organisation, identified by an `:organisationId` path parameter (e.g. `/v1/organisations/:organisationId/tasks`) rather than derived silently from the token. A `TenantGuard` checks that path parameter against the caller's own `organisationId` — resolved fresh from the `users` table on every request, never trusted from the bearer token itself — and rejects a mismatch with `403` (platform admins are exempt). Underneath that, PostgreSQL Row-Level Security provides a second, database-enforced layer of isolation on top of the same session values. Some tables (`organisations`, `users`) are deliberately **not** RLS-protected, and incidents have a pool-visibility exception by design. See [Multi-Tenancy](../02-architecture/multi-tenancy) for the full model.
