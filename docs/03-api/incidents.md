---
sidebar_position: 3
title: Incidents
---

# Incidents

Incidents are the core entity of the EcoTrack platform. A citizen or volunteer submits a geo-tagged, photo-verified environmental hazard report. An Organization Admin then verifies the report and converts it into a Task or Event.

**Base path:** `/v1/incidents`

---

## Incident Object

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "organizationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "title": "Illegal construction waste dumping",
  "description": "Large pile of concrete rubble and debris on the eastern bank.",
  "location": {
    "lat": 6.8235,
    "lng": 80.0399
  },
  "status": "reported",
  "urgency": "high",
  "reportedBy": {
    "id": "3a1b2c4d-0000-0000-0000-abc123456789",
    "name": "Rashmika S."
  },
  "mediaUrls": [
    "https://ecotrack-incident-media.s3.ap-southeast-1.amazonaws.com/incidents/550e8400/photo-1.jpg"
  ],
  "verifiedBy": null,
  "createdAt": "2026-07-31T08:15:00Z",
  "updatedAt": "2026-07-31T08:15:00Z"
}
```

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Unique identifier |
| `organizationId` | UUID | Owning tenant (set from JWT claim; enforced by RLS) |
| `title` | string | Short summary of the hazard |
| `description` | string | Full description |
| `location.lat` | number | Decimal degrees latitude |
| `location.lng` | number | Decimal degrees longitude |
| `status` | string | Current workflow stage slug (e.g., `reported`, `verified`, `resolved`) |
| `urgency` | `low` \| `medium` \| `high` \| `critical` | Community urgency indicator |
| `mediaUrls` | string[] | S3 URLs of uploaded photos |
| `verifiedBy` | object \| null | Admin who verified the report |

---

## Upload Media (Pre-Step)

Photo uploads follow a two-step presigned URL pattern to avoid routing binary data through the API server.

### `POST /v1/media/upload-url`

Generates a presigned S3 URL valid for 5 minutes.

**Auth:** Any authenticated user

**Request body:**

```json
{
  "filename": "photo-1.jpg",
  "contentType": "image/jpeg"
}
```

**Response `201`:**

```json
{
  "uploadUrl": "https://ecotrack-incident-media.s3.amazonaws.com/...?X-Amz-Signature=...",
  "mediaUrl": "https://ecotrack-incident-media.s3.ap-southeast-1.amazonaws.com/incidents/uuid/photo-1.jpg"
}
```

The client `PUT`s the file binary to `uploadUrl`. The returned `mediaUrl` is then passed in the `mediaUrls` array when creating the incident.

---

## Endpoints

### `POST /v1/incidents`

Submit a new environmental hazard report.

**Auth:** `citizen`, `volunteer`, `org_admin`

**Request body:**

```json
{
  "title": "Illegal construction waste dumping",
  "description": "Large pile of concrete rubble and debris on the eastern bank.",
  "location": {
    "lat": 6.8235,
    "lng": 80.0399
  },
  "urgency": "high",
  "mediaUrls": [
    "https://ecotrack-incident-media.s3.ap-southeast-1.amazonaws.com/incidents/uuid/photo-1.jpg"
  ]
}
```

**Response `201`:** Returns the full [Incident Object](#incident-object).

**Errors:**

| Status | Code | Cause |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Missing required field or invalid coordinates |
| `422` | `LOCATION_REQUIRED` | `location.lat` / `location.lng` not provided |

---

### `GET /v1/incidents`

List all incidents for the authenticated user's organization. Requires Organization Admin role.

**Auth:** `org_admin`

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `status` | string | — | Filter by workflow stage slug |
| `urgency` | string | — | Filter by urgency level |
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Results per page (max `100`) |

**Response `200`:**

```json
{
  "data": [ /* array of Incident Objects */ ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

---

### `GET /v1/incidents/nearby`

Return incidents within a given radius. Powers the mobile map and proximity alert system.

**Auth:** Any authenticated user (public incidents only for citizens without an org)

**Query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `lat` | number | ✓ | Latitude of the centre point |
| `lng` | number | ✓ | Longitude of the centre point |
| `radius` | number | ✓ | Search radius in metres (max `50000`) |
| `limit` | number | — | Max results (default `50`) |

**Example:**

```
GET /v1/incidents/nearby?lat=6.8235&lng=80.0399&radius=5000
```

**Response `200`:**

```json
{
  "data": [
    {
      "id": "...",
      "title": "Illegal construction waste dumping",
      "location": { "lat": 6.8235, "lng": 80.0399 },
      "status": "reported",
      "urgency": "high",
      "distanceMetres": 234.5,
      "createdAt": "2026-07-31T08:15:00Z"
    }
  ]
}
```

:::note Performance
This endpoint executes a PostGIS `ST_DWithin` query on a GiST-indexed `geography` column. It is designed to respond in under 500 ms at the 95th percentile under normal load.
:::

---

### `GET /v1/incidents/:id`

Retrieve a single incident by ID.

**Auth:** The requesting user must belong to the same organization as the incident (enforced by RLS).

**Response `200`:** Full [Incident Object](#incident-object).

**Errors:**

| Status | Code | Cause |
|---|---|---|
| `404` | `INCIDENT_NOT_FOUND` | No incident with this ID exists in the user's tenant |

---

### `POST /v1/incidents/:id/verify`

Mark an incident as verified. Moves the incident to the first non-`reported` workflow stage.

**Auth:** `org_admin`

**Request body:**

```json
{
  "notes": "Confirmed on site inspection. Coordinates verified."
}
```

**Response `200`:** Updated [Incident Object](#incident-object) with `status: "verified"` and `verifiedBy` populated.

---

### `PATCH /v1/incidents/:id/status`

Manually advance or update the workflow status of an incident.

**Auth:** `org_admin`

**Request body:**

```json
{
  "status": "cleanup_scheduled"
}
```

The `status` value must be a valid `slug` from the organization's configured [Workflow Stages](./workflows).

**Response `200`:** Updated [Incident Object](#incident-object).

**Errors:**

| Status | Code | Cause |
|---|---|---|
| `400` | `INVALID_STATUS` | The provided slug does not exist in this organization's workflow |
