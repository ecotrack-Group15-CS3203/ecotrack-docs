---
sidebar_position: 4
title: Organizations
---

# Organizations

An Organization (Tenant) is an independent environmental group that manages its own incidents, volunteers, tasks, and events on the EcoTrack platform. Each organization operates in a fully isolated tenant workspace.

**Base path:** `/v1/organizations`

---

## Organization Object

```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "name": "Bolgoda Lake Conservation Society",
  "slug": "bolgoda-lake",
  "description": "A volunteer-driven group restoring the ecological health of Bolgoda Lake, Sri Lanka.",
  "location": {
    "lat": 6.8235,
    "lng": 80.0399
  },
  "memberCount": 34,
  "incidentCount": 127,
  "createdAt": "2026-01-15T09:00:00Z"
}
```

---

## Endpoints

### `POST /v1/organizations`

Register a new tenant organization on the platform. The authenticated user becomes the first Organization Admin of the new tenant.

**Auth:** Any authenticated user

**Request body:**

```json
{
  "name": "Bolgoda Lake Conservation Society",
  "slug": "bolgoda-lake",
  "description": "A volunteer-driven group restoring the ecological health of Bolgoda Lake, Sri Lanka.",
  "location": {
    "lat": 6.8235,
    "lng": 80.0399
  }
}
```

| Field | Required | Constraints |
|---|---|---|
| `name` | ✓ | 3–100 characters |
| `slug` | ✓ | 3–50 characters, lowercase, alphanumeric + hyphens only, globally unique |
| `description` | — | Max 500 characters |
| `location` | — | If provided, both `lat` and `lng` are required |

**Response `201`:**

```json
{
  "organization": { /* Organization Object */ },
  "adminUser": {
    "id": "3a1b2c4d-...",
    "email": "admin@bolgoda.org",
    "role": "org_admin"
  }
}
```

**Errors:**

| Status | Code | Cause |
|---|---|---|
| `409` | `SLUG_TAKEN` | The requested slug is already registered |

---

### `GET /v1/organizations`

List all public organizations on the platform. Used to power the volunteer enrollment directory.

**Auth:** Any authenticated user

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `q` | string | Text search on `name` and `description` |
| `lat` + `lng` + `radius` | number | Filter orgs within a geographic radius (metres) |
| `page` | number | Page number (default `1`) |
| `limit` | number | Results per page (default `20`, max `100`) |

**Response `200`:**

```json
{
  "data": [ /* array of Organization Objects */ ],
  "meta": { "total": 12, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### `GET /v1/organizations/:id`

Get full details of a single organization by ID or slug.

**Auth:** Any authenticated user

**Response `200`:** Full [Organization Object](#organization-object).

---

### `POST /v1/organizations/join-request`

Submit a request to join an organization as a volunteer. The request remains pending until an Organization Admin approves or rejects it.

**Auth:** `citizen`, `volunteer`

**Request body:**

```json
{
  "organizationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "message": "I am a local resident and want to help with lake cleanups."
}
```

**Response `201`:**

```json
{
  "id": "join-request-uuid",
  "status": "pending",
  "organizationId": "f47ac10b-...",
  "requestedAt": "2026-07-31T10:00:00Z"
}
```

**Errors:**

| Status | Code | Cause |
|---|---|---|
| `409` | `ALREADY_MEMBER` | The user is already a member of this organization |
| `409` | `REQUEST_PENDING` | A pending join request already exists for this user and org |

---

### `GET /v1/organizations/:id/join-requests`

List pending join requests for an organization.

**Auth:** `org_admin`

**Query parameters:** `status` (`pending` \| `approved` \| `rejected`), `page`, `limit`

**Response `200`:**

```json
{
  "data": [
    {
      "id": "join-request-uuid",
      "user": { "id": "...", "name": "Nimal P.", "email": "nimal@example.com" },
      "message": "I am a local resident...",
      "status": "pending",
      "requestedAt": "2026-07-31T10:00:00Z"
    }
  ],
  "meta": { "total": 3, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### `PATCH /v1/organizations/:id/join-requests/:requestId`

Approve or reject a pending join request.

**Auth:** `org_admin`

**Request body:**

```json
{
  "status": "approved"
}
```

On approval, the user's role is set to `volunteer` and their `organizationId` JWT claim is updated on next login.

**Response `200`:** Updated join request object.

---

### `POST /v1/organizations/:id/invites`

Generate a secure, cryptographic invite link. The link is time-limited (default 7 days) and can only be used once.

**Auth:** `org_admin`

**Request body:**

```json
{
  "role": "volunteer",
  "expiresInHours": 168
}
```

**Response `201`:**

```json
{
  "inviteToken": "eyJhbGciOiJIUzI1NiJ9...",
  "inviteUrl": "https://ecotrack.example.com/join?token=eyJhbGciOiJIUzI1NiJ9...",
  "expiresAt": "2026-08-07T10:00:00Z",
  "role": "volunteer"
}
```

The `inviteUrl` can be shared directly with the intended volunteer. Upon opening the URL, the invitee authenticates and is automatically added to the organization with the specified role, without requiring admin approval.

---

### `GET /v1/organizations/:id/volunteers`

List all approved volunteers in an organization.

**Auth:** `org_admin`

**Query parameters:** `q` (name/email search), `page`, `limit`

**Response `200`:**

```json
{
  "data": [
    {
      "id": "user-uuid",
      "name": "Nimal P.",
      "email": "nimal@example.com",
      "role": "volunteer",
      "joinedAt": "2026-02-01T09:00:00Z",
      "taskCount": 5,
      "completedTaskCount": 3
    }
  ],
  "meta": { "total": 34, "page": 1, "limit": 20, "totalPages": 2 }
}
```

---

### `DELETE /v1/organizations/:id/volunteers/:userId`

Remove a volunteer from the organization.

**Auth:** `org_admin`

**Response `204`:** No content.

**Errors:**

| Status | Code | Cause |
|---|---|---|
| `403` | `CANNOT_REMOVE_ADMIN` | Cannot remove the last admin of an organization |
| `404` | `MEMBER_NOT_FOUND` | The user is not a member of this organization |
