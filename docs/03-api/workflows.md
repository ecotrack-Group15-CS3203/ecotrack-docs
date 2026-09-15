---
sidebar_position: 6
title: Workflows
---

# Workflows

Each organisation configures a custom set of **workflow stages** that define the status flow for incidents it has claimed, plus a single **Workflow Stage Rules** row that governs when creating or completing a task/event automatically advances an incident's stage. Stages are ordered by an integer `position` (zero-based) and identified by a server-generated, immutable `slug`. No backend code changes are required to add, rename, reorder, or delete stages.

**Base path:** `/v1/organisations/:organisationId/workflow-stages` and `/v1/organisations/:organisationId/workflow-stage-rules`

---

## Workflow Stage Object

```json
{
  "id": "stage-uuid",
  "organisationId": "org-uuid",
  "name": "Cleanup Scheduled",
  "slug": "cleanup_scheduled",
  "description": "A cleanup task or event has been created and scheduled.",
  "color": "#3B82F6",
  "position": 2,
  "isFinal": false,
  "createdAt": "2026-01-15T09:00:00Z",
  "updatedAt": "2026-01-15T09:00:00Z"
}
```

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name shown in the dashboard UI |
| `slug` | string | Server-generated from `name` at creation (lowercased, non-alphanumerics collapsed to `_`), suffixed `_2`, `_3`, ... on collision. **Immutable** — not settable via the update endpoint, since existing incidents reference it |
| `color` | string | 6-digit hex string, e.g. `#3B82F6` |
| `position` | integer | Zero-based position in the stage sequence. There is no `orderIndex` column — it's `position` |
| `isFinal` | boolean | If `true`, an incident on this stage is considered resolved |

---

## Default Workflow

When a new organisation is created, five stages are seeded automatically:

| Position | Name | Final |
|---|---|---|
| 0 | Reported | No |
| 1 | Claimed | No |
| 2 | Cleanup Scheduled | No |
| 3 | Resolved | Yes |
| 4 | Dismissed | No |

Position `0` ("Reported") is a fixed display placeholder for the Global Incident Pool stage — no incident's `currentStageId` ever actually points at it, since a pooled incident has `currentStageId: null`. The stage an incident actually lands on immediately after being claimed is position `1` ("Claimed" by default, though the org may rename or reorder it). "Dismissed" is the stage `PATCH .../incidents/:incidentId/reject` moves an incident to, looked up by its `dismissed` slug — if an org deletes that stage, rejection still succeeds, it just leaves `currentStageId` unchanged.

Organisations can rename, recolor, reorder, add, or delete any of these stages at any time (subject to the deletion constraints below).

---

## Workflow Stage Rules

Every organisation also has exactly one **Workflow Stage Rules** row, seeded at registration, configuring two independent behaviours:

- **Minimum stage precondition** — for Task Creation and Event Creation only. A `taskCreationMinStageId` / `eventCreationMinStageId` set to a stage id means the linked incident's `currentStage.position` must be at or beyond that stage's `position`, or the create call is rejected with `422`. A `null` minimum (the default) means no precondition — any claimed incident qualifies. Task/Event **Completion** carry no minimum-stage precondition; they are consequences of something that must always succeed on its own terms.
- **Auto-advance target** — for all four triggers (Task Creation, Event Creation, Task Completion, Event Completion). A `*TargetStageId` set to a stage id means the trigger, once satisfied, moves the incident straight to that stage. A `null` target (the default, "Automatic") means the trigger instead advances the incident to whatever stage is next by `position`. If the incident is already on a final stage, nothing advances.

### Workflow Stage Rules Object

```json
{
  "organisationId": "org-uuid",
  "taskCreationMinStageId": "stage-uuid-1",
  "taskCreationTargetStageId": null,
  "eventCreationMinStageId": "stage-uuid-1",
  "eventCreationTargetStageId": null,
  "taskCompletionTargetStageId": null,
  "eventCompletionTargetStageId": null,
  "createdAt": "2026-01-15T09:00:00Z",
  "updatedAt": "2026-01-15T09:00:00Z"
}
```

`organisationId` is the primary key of this table directly — there is exactly one row per organisation, not one row per rule.

These rules are what actually drives an incident's stage transitions when a task or event is created or completed — see [Tasks & Events](./tasks-events) for where each trigger fires. There is no unconditional "advance to next stage" behaviour independent of this configuration.

---

## Workflow Stage Endpoints

### `GET /v1/organisations/:organisationId/workflow-stages`

Return all workflow stages for the organisation, ordered by `position`.

**Auth:** `org_admin`, platform admin

**Response `200`:** a **bare array** of [Workflow Stage Objects](#workflow-stage-object) (not the paginated envelope — stage lists are unpaginated).

---

### `POST /v1/organisations/:organisationId/workflow-stages`

Create a new workflow stage. It is always appended after the current last stage — there is no way to insert at an arbitrary position on create; use the reorder endpoint afterwards if a different order is needed.

**Auth:** `org_admin`, platform admin

**Request body:**

```json
{
  "name": "Evidence Under Review",
  "description": "Cleanup evidence has been uploaded and is being reviewed by an admin.",
  "color": "#8B5CF6"
}
```

`color` must match `/^#[0-9a-fA-F]{6}$/`.

**Response `201`:** Full [Workflow Stage Object](#workflow-stage-object), with a server-generated `slug` and `position` set to the current stage count.

---

### `PATCH /v1/organisations/:organisationId/workflow-stages/:stageId`

Update a stage's `name`, `description`, `color`, and/or `isFinal`.

**Auth:** `org_admin`, platform admin

**Request body (all fields optional):**

```json
{
  "name": "Evidence Under Review",
  "description": "Updated description.",
  "color": "#7C3AED",
  "isFinal": false
}
```

There is no `slug` field here — it is immutable, and the global `ValidationPipe` rejects any request body that includes one (`403`/`400` — unknown property). `position` is likewise not settable here; use the reorder endpoint.

**Response `200`:** Updated [Workflow Stage Object](#workflow-stage-object).

---

### `PATCH /v1/organisations/:organisationId/workflow-stages/reorder`

Reassign the `position` of every stage in one atomic operation.

**Auth:** `org_admin`, platform admin

**Request body:**

```json
{
  "orderedStageIds": ["stage-uuid-1", "stage-uuid-2", "stage-uuid-5", "stage-uuid-3", "stage-uuid-4"]
}
```

Every existing stage id must appear exactly once, in the desired order; array index becomes `position`.

**Response `200`:** the full ordered array of [Workflow Stage Objects](#workflow-stage-object).

**Errors:**

| Status | Cause |
|---|---|
| `400` | The list omits a stage, repeats one, or includes an unknown stage id |

---

### `DELETE /v1/organisations/:organisationId/workflow-stages/:stageId`

Delete a workflow stage. Remaining stages are automatically renumbered so `position` stays contiguous from `0`.

**Auth:** `org_admin`, platform admin

**Response `200`:** `{ "success": true }`

**Errors:**

| Status | Cause |
|---|---|
| `409` | One or more incidents currently sit at this stage (`currentStageId`) |
| `409` | This stage is referenced by the organisation's [Workflow Stage Rules](#workflow-stage-rules) (a minimum or target stage) |

---

## Workflow Stage Rules Endpoints

### `GET /v1/organisations/:organisationId/workflow-stage-rules`

Return the organisation's single Workflow Stage Rules row, creating a default one first if this organisation predates the rules feature.

**Auth:** `org_admin`, platform admin

**Response `200`:** the [Workflow Stage Rules Object](#workflow-stage-rules-object) (not wrapped in an array or pagination envelope).

---

### `PATCH /v1/organisations/:organisationId/workflow-stage-rules`

Update any subset of the six rule fields.

**Auth:** `org_admin`, platform admin

**Request body (all fields optional):**

```json
{
  "taskCreationMinStageId": "stage-uuid-1",
  "taskCreationTargetStageId": null,
  "eventCreationMinStageId": "stage-uuid-1",
  "eventCreationTargetStageId": null,
  "taskCompletionTargetStageId": "stage-uuid-3",
  "eventCompletionTargetStageId": null
}
```

Each field is a stage id, `null` to explicitly clear it (no minimum / "Automatic"), or omitted to leave it unchanged.

**Response `200`:** the updated [Workflow Stage Rules Object](#workflow-stage-rules-object).

**Errors:**

| Status | Cause |
|---|---|
| `422` | A supplied stage id does not belong to this organisation |
