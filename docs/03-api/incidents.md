---
sidebar_position: 3
title: Incidents
---

# Incidents

Incidents are the core entity of the EcoTrack platform. A citizen, volunteer, or org admin submits a geo-tagged, photo-documented environmental hazard report. The report starts life in the **Global Incident Pool** — it has no owning organisation yet. Any organisation whose configured **service area** covers the incident's location can browse the pool and **claim** it; claiming is itself the verification step, there is no separate "verify" action.

**Base path:** `/v1/incidents` (pool browsing/claim and org-scoped actions on already-claimed incidents live under their own paths — see below).

---

## The Global Incident Pool

A newly reported incident is inserted with `organisationId = NULL` and no `verificationStatus`. It sits in the pool, visible to every organisation, until an org admin claims it via `POST /v1/incidents/pool/:incidentId/claim`.

Claiming an incident, in one atomic update:

- assigns `organisationId` to the claiming organisation
- sets `claimedByUserId` and `claimedAt`
- sets `verificationStatus` to `approved` — claiming **is** verification, there is no separate verify step
- moves the incident into the organisation's default post-claim workflow stage (position `1`, "Claimed" by default)

The atomicity comes from a conditional `UPDATE ... WHERE id = :incidentId AND organisation_id IS NULL`. Whichever of two concurrent claim requests reaches Postgres first wins; the loser's `UPDATE` matches zero rows and receives a `409`. Row locking is not used for this — the `WHERE organisation_id IS NULL` predicate is what makes it atomic.

Once claimed, an incident can be:

- **Rejected** (`PATCH .../incidents/:incidentId/reject`) — terminal. The incident stays owned by the claiming org, marked `rejected`; it is not released back to the pool.
- **Marked duplicate** (`PATCH .../incidents/:incidentId/duplicate`) — terminal, points at another incident via `duplicateOfId`.
- **Moved between workflow stages** (`PATCH .../incidents/:incidentId/stage`) — see [Workflows](./workflows).

A rejected or duplicate incident is excluded from the public hazard map, but it is never returned to the pool for another organisation to claim.

---

## Incident Object

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "organisationId": null,
  "reportedByUserId": "3a1b2c4d-0000-0000-0000-abc123456789",
  "title": "Illegal construction waste dumping",
  "description": "Large pile of concrete rubble and debris on the eastern bank.",
  "category": "illegal_dumping",
  "severity": "high",
  "location": { "lat": 6.8235, "lng": 80.0399 },
  "address": null,
  "verificationStatus": null,
  "currentStageId": null,
  "rejectionReason": null,
  "duplicateOfId": null,
  "claimedByUserId": null,
  "claimedAt": null,
  "version": 0,
  "createdAt": "2026-07-31T08:15:00Z",
  "updatedAt": "2026-07-31T08:15:00Z"
}
```

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Unique identifier |
| `organisationId` | UUID \| null | `null` while pooled/unclaimed; set atomically on claim |
| `reportedByUserId` | UUID \| null | The citizen/volunteer/admin who filed the report |
| `title` | string | Short summary of the hazard |
| `description` | string | Full description (blank string if the reporter left it empty) |
| `category` | string | One of `illegal_dumping`, `water_pollution`, `air_pollution`, `deforestation`, `wildlife_hazard`, `other`. Defaults to `other` — the mobile wizard doesn't collect a category |
| `severity` | `low` \| `medium` \| `high` \| `critical` | Wire field is `urgency` on the way in; stored as `severity` |
| `location.lat` / `location.lng` | number | Decimal degrees |
| `verificationStatus` | `approved` \| `rejected` \| `duplicate` \| `null` | `null` means still pooled/unclaimed — there is no `pending` value; "pending" IS `organisationId IS NULL` |
| `currentStageId` | UUID \| null | The org's workflow stage this incident currently sits at (`null` while pooled) |
| `claimedByUserId` / `claimedAt` | UUID \| null, timestamp \| null | Set together with `organisationId` by the claim endpoint, never independently |
| `version` | integer | Optimistic-concurrency counter, incremented on every update. This is separate from the claim's own atomicity mechanism (the `WHERE organisation_id IS NULL` predicate) — `version` guards other concurrent writes, e.g. two admins racing a manual stage change |

Photos are a separate sub-resource (`incident_images`), returned as an `images: [{id, url}]` array alongside the incident on the detail endpoint.

---

## Upload Media (Pre-Step)

Photo uploads follow a two-step presigned URL pattern to avoid routing binary data through the API server.

### `POST /v1/media/upload-url`

Generates a presigned S3 `PUT` URL valid for 5 minutes. No `@Roles` restriction — any authenticated user may upload, since reporting an incident is open to every role.

**Request body:**

```json
{
  "filename": "photo-1.jpg",
  "contentType": "image/jpeg"
}
```

`contentType` must be one of `image/jpeg`, `image/png`, `image/webp`, `image/heic`.

**Response `201`:**

```json
{
  "uploadUrl": "https://ecotrack-media.s3.amazonaws.com/...?X-Amz-Signature=...",
  "mediaUrl": "https://ecotrack-media.s3.amazonaws.com/3f9c1e2a-....jpg",
  "objectKey": "3f9c1e2a-....jpg"
}
```

The client `PUT`s the file binary to `uploadUrl` with the **exact same** `Content-Type` — the signature covers that header, and a mismatch fails as an opaque S3 403. The returned `mediaUrl` is then passed in the `mediaUrls` array when creating the incident (or in the task-photo endpoints — see [Tasks & Events](./tasks-events)).

### `GET /v1/media/:objectKey`

Issues a short-lived presigned **GET** URL for a previously uploaded object. This is authorization-checked, not just an obscure-URL guess: the object key must belong to an `incident_images` or `task_photos` row the caller can already see (their own org's task evidence, their own reports, an incident their org has claimed), **or** to an incident that is also eligible for the public hazard map (unclaimed, or claimed and not rejected/duplicate). Otherwise this returns `404`.

**Response `200`:**

```json
{ "url": "https://ecotrack-media.s3.amazonaws.com/3f9c1e2a-....jpg?X-Amz-Signature=..." }
```

---

## Endpoints

### `POST /v1/incidents`

Submit a new environmental hazard report. It enters the Global Incident Pool immediately — unowned, unverified.

**Auth:** `citizen`, `volunteer`, `org_admin`

**Request body:**

```json
{
  "title": "Illegal construction waste dumping",
  "description": "Large pile of concrete rubble and debris on the eastern bank.",
  "urgency": "high",
  "category": "illegal_dumping",
  "location": { "lat": 6.8235, "lng": 80.0399 },
  "address": "Eastern Bank, Bolgoda Lake",
  "mediaUrls": ["https://ecotrack-media.s3.amazonaws.com/3f9c1e2a-....jpg"]
}
```

`description`, `category`, and `address` are optional. At least one entry in `mediaUrls` is required.

**Response `201`:** Full [Incident Object](#incident-object) (pooled, `organisationId: null`).

**Errors:**

| Status | Cause |
|---|---|
| `400` | Missing required field, invalid coordinates, or an empty `mediaUrls` array |

---

### `GET /v1/incidents/mine`

List the authenticated user's own reported incidents, claimed or not.

**Auth:** Any authenticated user

**Query parameters:** `page`, `limit` (standard [pagination](./index.md#pagination))

**Response `200`:** `{ items, total, page, limit }` — see [Pagination](./index.md#pagination).

---

### `GET /v1/incidents/nearby`

Return incidents within a given radius of a point. Powers the public hazard map and is deliberately **not** tenant-filtered — it shows the pool and claimed incidents alike, whoever (if anyone) has claimed them, using a reduced, cross-tenant-safe projection (no description, address, reporter, or organisation id).

**Auth:** Any authenticated user

**Query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `lat` | number | ✓ | Latitude of the centre point |
| `lng` | number | ✓ | Longitude of the centre point |
| `radius` | number | — | Search radius in metres, 100–50,000. Default `10000` |

**Response `200`:** a bare array of reduced incident rows:

```json
[
  {
    "id": "...",
    "title": "Illegal construction waste dumping",
    "category": "illegal_dumping",
    "severity": "high",
    "createdAt": "2026-07-31T08:15:00Z",
    "claimed": true,
    "lat": 6.8235,
    "lng": 80.0399,
    "distanceMeters": 234.5,
    "thumbnailUrl": "https://ecotrack-media.s3.amazonaws.com/....jpg"
  }
]
```

Dismissed reports (`verificationStatus` of `rejected` or `duplicate`) are excluded.

---

### `GET /v1/incidents/:incidentId`

Retrieve a single incident. Visibility is RLS-enforced: an `org_admin` sees their own org's claimed incidents plus the whole pool; a citizen sees their own reports (claimed or not) plus the pool; a platform admin sees everything. Tapping a map pin the caller's normal session can't otherwise see falls back to the same reduced, public-safe projection `GET /v1/incidents/nearby` uses.

**Auth:** Any authenticated user

**Response `200`:** either the full [Incident Object](#incident-object) plus `images` and `"visibility": "full"`, or a reduced `PublicIncidentDetail` plus `images` and `"visibility": "public"` (omits `reportedByUserId`, `organisationId`, `claimedByUserId`, `verificationStatus`, `rejectionReason`, `duplicateOfId`, `version`).

**Errors:**

| Status | Cause |
|---|---|
| `404` | No incident with this ID is visible to the caller, at all (not even the public projection) |

---

### `GET /v1/incidents/pool`

List unclaimed incidents within the calling admin's **own organisation's service area**, nearest first. There is no `:organisationId` path parameter — with one organisation per admin, "the calling admin's org" is unambiguous.

**Auth:** `org_admin`

**Response `200`:** a **bare array** (not the `{items,total,page,limit}` envelope — pool listing is unpaginated):

```json
[
  {
    "id": "...",
    "title": "Illegal construction waste dumping",
    "description": "...",
    "category": "illegal_dumping",
    "severity": "high",
    "address": "...",
    "createdAt": "2026-07-31T08:15:00Z",
    "lat": 6.8235,
    "lng": 80.0399,
    "distanceMeters": 812.3
  }
]
```

**Errors:**

| Status | Cause |
|---|---|
| `400` | The calling admin's organisation has no service area configured yet (`serviceAreaCenter`/`serviceAreaRadiusKm` both required at registration, but can theoretically be missing on old data) |

---

### `POST /v1/incidents/pool/:incidentId/claim`

Claim a pooled incident for the calling admin's organisation. This **is** verification — see [The Global Incident Pool](#the-global-incident-pool) above.

**Auth:** `org_admin`

**Response `200`:** the updated [Incident Object](#incident-object), now with `organisationId`, `claimedByUserId`, `claimedAt` set and `verificationStatus: "approved"`.

**Errors:**

| Status | Cause |
|---|---|
| `404` | Incident not found |
| `409` | Already claimed by another organisation (either at the pre-check, or lost the race on the atomic update) |
| `400` | The calling admin's organisation has no service area configured |
| `422` | The incident's location falls outside the calling organisation's service area |

---

### `GET /v1/organisations/:organisationId/incidents`

List incidents already claimed by this organisation.

**Auth:** `org_admin`, platform admin

**Query parameters:** `status` (`approved` \| `rejected` \| `duplicate`), `page`, `limit`

**Response `200`:** `{ items, total, page, limit }`.

---

### `PATCH /v1/organisations/:organisationId/incidents/:incidentId/reject`

Reject an already-claimed incident. Terminal — the incident is not released back to the pool.

**Auth:** `org_admin`

**Request body:**

```json
{ "reason": "Site visited, no hazard present." }
```

**Response `200`:** updated incident, `verificationStatus: "rejected"`, moved to the org's "Dismissed" workflow stage if one exists.

**Errors:**

| Status | Cause |
|---|---|
| `403` | The incident hasn't been claimed yet, or was already rejected/marked duplicate |

---

### `PATCH /v1/organisations/:organisationId/incidents/:incidentId/duplicate`

Mark an already-claimed incident as a duplicate of another incident claimed by the same organisation.

**Auth:** `org_admin`

**Request body:**

```json
{ "duplicateOfId": "another-incident-uuid" }
```

**Response `200`:** updated incident, `verificationStatus: "duplicate"`.

**Errors:**

| Status | Cause |
|---|---|
| `400` | `duplicateOfId` equals the incident's own id |
| `403` | The incident hasn't been claimed yet, or was already rejected/marked duplicate |
| `404` | Either incident is not claimed by this organisation |

---

### `PATCH /v1/organisations/:organisationId/incidents/:incidentId/stage`

Manually move a claimed incident to any of the organisation's configured workflow stages — forward, backward, or skipping, including reopening out of a final stage. See [Workflows](./workflows) for the stage model.

**Auth:** `org_admin`

**Request body:**

```json
{
  "stageId": "stage-uuid",
  "expectedVersion": 3
}
```

`expectedVersion` is optional — an optimistic-concurrency guard against `incidents.version`. Omitted, the change applies unconditionally.

**Response `200`:** updated incident. Moving to the stage it's already on is a no-op `200` with no audit entry and no version bump.

**Errors:**

| Status | Cause |
|---|---|
| `409` | The incident hasn't been claimed yet, or `expectedVersion` no longer matches (concurrent modification) |
| `422` | `stageId` is not a valid workflow stage for this organisation |
