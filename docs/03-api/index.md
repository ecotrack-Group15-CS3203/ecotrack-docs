---
sidebar_position: 1
title: API Reference
---

# API Reference

The EcoTrack REST API is built with **NestJS** and exposes endpoints for incident management, multi-tenant organization coordination, volunteer task tracking, and dynamic workflow configuration.

**Base URL:** `https://api.ecotrack.example.com/v1`

---

## In This Section

- [Authentication](./authentication) — WSO2 Asgardeo OAuth2 flow, RBAC roles, JWT format
- [Incidents](./incidents) — Submit, retrieve, verify, and update environmental incident reports
- [Organizations](./organizations) — Register tenants, generate invite links, manage volunteers
- [Tasks & Events](./tasks-events) — Convert incidents to tasks or community cleanup events
- [Workflows](./workflows) — Configure per-tenant incident status stages

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

List endpoints return paginated results using page-based pagination:

```json
{
  "data": [ /* array of resource objects */ ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

Default `limit` is `20`. Maximum `limit` is `100`.

### Multi-Tenancy and Data Isolation

All requests are scoped to the authenticated user's tenant. The `organizationId` from the JWT bearer token is automatically injected as a PostgreSQL RLS session variable before each query executes. It is **not possible** to retrieve resources belonging to a different organization — the database engine enforces this at the row level, not the application layer.

Endpoints that return organization-scoped data do not require an `organizationId` query parameter. The tenant is always derived from the authenticated token.
