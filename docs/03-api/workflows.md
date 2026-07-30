---
sidebar_position: 6
title: Workflows
---

# Workflows

Each tenant organization can configure a custom set of **workflow stages** that define the status flow for incidents in their workspace. Stages are ordered by an `orderIndex` and identified by a unique `slug`. No backend code changes are required to add, rename, reorder, or remove stages.

**Base path:** `/v1/workflows`

---

## Workflow Stage Object

```json
{
  "id": "stage-uuid",
  "organizationId": "org-uuid",
  "name": "Cleanup Scheduled",
  "slug": "cleanup_scheduled",
  "description": "A cleanup task or event has been created and scheduled.",
  "color": "#F59E0B",
  "orderIndex": 3,
  "isFinal": false,
  "createdAt": "2026-01-15T09:00:00Z",
  "updatedAt": "2026-01-15T09:00:00Z"
}
```

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name shown in the dashboard UI |
| `slug` | string | URL-safe identifier used in API calls (e.g., `PATCH /incidents/:id/status`) |
| `color` | string | Hex color for UI badges. Optional. |
| `orderIndex` | integer | Zero-based position in the stage sequence. Stages are displayed in ascending order. |
| `isFinal` | boolean | If `true`, an incident in this stage is considered resolved. The platform may use this to exclude it from active incident queries. |

---

## Default Workflow

When a new organization is created, the following default stages are provisioned automatically:

| Order | Name | Slug | Final |
|---|---|---|---|
| 0 | Reported | `reported` | No |
| 1 | Verified | `verified` | No |
| 2 | Cleanup Scheduled | `cleanup_scheduled` | No |
| 3 | Resolved | `resolved` | Yes |

Organizations can modify this default workflow at any time.

---

## Endpoints

### `GET /v1/workflows/stages`

Return all workflow stages for the authenticated admin's organization, ordered by `orderIndex`.

**Auth:** `org_admin`

**Response `200`:**

```json
{
  "data": [
    {
      "id": "stage-uuid-1",
      "name": "Reported",
      "slug": "reported",
      "color": "#6B7280",
      "orderIndex": 0,
      "isFinal": false
    },
    {
      "id": "stage-uuid-2",
      "name": "Verified",
      "slug": "verified",
      "color": "#3B82F6",
      "orderIndex": 1,
      "isFinal": false
    },
    {
      "id": "stage-uuid-3",
      "name": "Cleanup Scheduled",
      "slug": "cleanup_scheduled",
      "color": "#F59E0B",
      "orderIndex": 2,
      "isFinal": false
    },
    {
      "id": "stage-uuid-4",
      "name": "Resolved",
      "slug": "resolved",
      "color": "#10B981",
      "orderIndex": 3,
      "isFinal": true
    }
  ]
}
```

---

### `POST /v1/workflows/stages`

Create a new workflow stage. The new stage is appended after the current last stage unless `orderIndex` is specified.

**Auth:** `org_admin`

**Request body:**

```json
{
  "name": "Evidence Under Review",
  "slug": "evidence_review",
  "description": "Cleanup evidence has been uploaded and is being reviewed by an admin.",
  "color": "#8B5CF6",
  "orderIndex": 3,
  "isFinal": false
}
```

If `orderIndex` conflicts with an existing stage, all subsequent stages are automatically shifted up by 1.

**Response `201`:** Full [Workflow Stage Object](#workflow-stage-object).

**Errors:**

| Status | Code | Cause |
|---|---|---|
| `409` | `SLUG_TAKEN` | A stage with this slug already exists in the organization |
| `400` | `SLUG_INVALID` | Slug contains characters other than lowercase alphanumeric and underscores |

---

### `PATCH /v1/workflows/stages/:id`

Update a workflow stage's display properties.

**Auth:** `org_admin`

**Request body (all fields optional):**

```json
{
  "name": "Evidence Under Review",
  "description": "Updated description.",
  "color": "#7C3AED",
  "isFinal": false
}
```

:::note
The `slug` cannot be changed after creation because existing incidents reference it. The `orderIndex` must be changed via the [reorder endpoint](#patch-v1workflowsstagesreorder) to keep the sequence consistent.
:::

**Response `200`:** Updated [Workflow Stage Object](#workflow-stage-object).

---

### `PATCH /v1/workflows/stages/reorder`

Update the `orderIndex` of multiple stages in a single atomic operation. All stages in the organization must be included in the request body.

**Auth:** `org_admin`

**Request body:**

```json
{
  "stages": [
    { "id": "stage-uuid-1", "orderIndex": 0 },
    { "id": "stage-uuid-2", "orderIndex": 1 },
    { "id": "stage-uuid-5", "orderIndex": 2 },
    { "id": "stage-uuid-3", "orderIndex": 3 },
    { "id": "stage-uuid-4", "orderIndex": 4 }
  ]
}
```

The operation validates that all IDs belong to the requesting organization and that `orderIndex` values are unique and contiguous starting from `0`.

**Response `200`:**

```json
{
  "stages": [ /* full ordered array of Workflow Stage Objects */ ]
}
```

**Errors:**

| Status | Code | Cause |
|---|---|---|
| `400` | `INCOMPLETE_STAGE_LIST` | Not all stages for the organization are included in the request |
| `400` | `DUPLICATE_ORDER_INDEX` | Two or more stages share the same `orderIndex` |

---

### `DELETE /v1/workflows/stages/:id`

Delete a workflow stage.

**Auth:** `org_admin`

**Response `204`:** No content.

**Errors:**

| Status | Code | Cause |
|---|---|---|
| `409` | `STAGE_IN_USE` | One or more incidents currently have this status. Reassign them before deleting the stage. |
| `400` | `CANNOT_DELETE_INITIAL` | The first stage (`orderIndex: 0`) cannot be deleted. All new incidents are assigned to it by default. |
| `400` | `MUST_HAVE_FINAL_STAGE` | Deleting this stage would leave the organization with no `isFinal: true` stage. |
