---
sidebar_position: 5
title: Tasks & Events
---

# Tasks & Events

Once an incident is claimed (see [Incidents](./incidents)), an org admin can create a **Task** (a single-volunteer cleanup assignment) or an **Event** (an open community cleanup with RSVPs) against it. Both are nested under an organisation: `/v1/organisations/:organisationId/tasks` and `/v1/organisations/:organisationId/events`.

Whether creating a task/event is allowed, and whether completing one auto-advances the parent incident's workflow stage, is governed by the organisation's [Workflow Stage Rules](./workflows#workflow-stage-rules) — there is no unconditional "advance to next stage" behaviour.

---

## Tasks

### Task status vs. assignment status — two separate things

A task's own `status` is `pending` | `in_progress` | `completed`. There is **no** `unassigned` or `cancelled` task status. A volunteer's assignment to a task is tracked on a **separate** `task_assignments` row, with its own `status`: `assigned` | `accepted` | `declined` | `cancelled`, plus `respondedAt` and `declineReason`. A task always has exactly one active assignee at a time; reassigning cancels the old assignment row and creates (or reactivates) another rather than adding a second live assignment.

### Task Object

```json
{
  "id": "task-uuid",
  "organisationId": "org-uuid",
  "incidentId": "incident-uuid",
  "title": "Remove construction debris from eastern bank",
  "description": "Collect and bag the debris at grid reference A3. Equipment provided on site.",
  "priority": "medium",
  "dueDate": "2026-08-05T08:00:00Z",
  "status": "pending",
  "startedAt": null,
  "completedAt": null,
  "createdByUserId": "admin-uuid",
  "assignments": [
    {
      "id": "assignment-uuid",
      "volunteerUserId": "volunteer-uuid",
      "status": "assigned",
      "respondedAt": null,
      "declineReason": null,
      "volunteer": { "id": "volunteer-uuid", "fullName": "Nimal P.", "email": "nimal@example.com" }
    }
  ],
  "notes": [],
  "photos": [],
  "createdAt": "2026-07-31T11:00:00Z",
  "updatedAt": "2026-07-31T11:00:00Z"
}
```

| Field | Description |
|---|---|
| `status` | `pending` \| `in_progress` \| `completed` — the task's own lifecycle |
| `priority` | `low` \| `medium` \| `high` |
| `dueDate` | Required at creation |
| `assignments[].status` | `assigned` \| `accepted` \| `declined` \| `cancelled` — the volunteer's response lifecycle, independent of the task's own status |
| `photos` | Completion evidence, added via a dedicated endpoint before the task can be marked complete |

---

### `POST /v1/organisations/:organisationId/tasks`

Create a task from a claimed incident and assign it to one volunteer.

**Auth:** `org_admin`

**Request body:**

```json
{
  "incidentId": "incident-uuid",
  "title": "Remove construction debris from eastern bank",
  "description": "Collect and bag the debris at grid reference A3.",
  "assignedTo": "volunteer-uuid",
  "dueDate": "2026-08-05T08:00:00Z",
  "priority": "medium"
}
```

**Constraints:**
- The incident must belong to this organisation, have `verificationStatus: "approved"`, and satisfy the org's `taskCreationMinStageId` precondition if one is configured (see [Workflow Stage Rules](./workflows#workflow-stage-rules))
- `assignedTo` must be an active `volunteer` of this organisation

If the trigger fires, the incident is advanced per `taskCreationTargetStageId` (or the next stage by `position` if that's `null`). A due-date reminder is scheduled for 24 hours before `dueDate` via the notification outbox (see [Multi-Tenancy](../02-architecture/multi-tenancy.md) and the note on push delivery in [Authentication](./authentication)).

**Response `201`:** Full [Task Object](#task-object).

**Errors:**

| Status | Cause |
|---|---|
| `400` | The incident is not `approved`, has no current stage, or the target volunteer is not an active volunteer of this org |
| `422` | The incident hasn't reached the org's configured minimum stage for task creation |

---

### `GET /v1/organisations/:organisationId/tasks`

**Auth:** `org_admin`, platform admin

**Query parameters:** `status` (`pending`\|`in_progress`\|`completed`), `page`, `limit`

**Response `200`:** `{ items, total, page, limit }`.

---

### `GET /v1/organisations/:organisationId/tasks/mine`

The calling volunteer's own tasks, filterable by assignment/task-status view.

**Auth:** `volunteer`

**Query parameters:** `view` (`assigned`\|`in_progress`\|`completed`\|`declined`\|`upcoming`), `page`, `limit`

**Response `200`:** `{ items, total, page, limit }`.

---

### `GET /v1/organisations/:organisationId/tasks/:taskId`

**Auth:** the task's currently or previously assigned volunteer, `org_admin`, or platform admin

**Response `200`:** Full [Task Object](#task-object).

---

### `PATCH /v1/organisations/:organisationId/tasks/:taskId`

Update a task's `priority`, `dueDate`, and/or reassign it. Supplying `assignedTo` **reassigns** — it cancels the current active assignment and creates or reactivates one for the new volunteer, it does not add a second assignee.

**Auth:** `org_admin`

**Request body (all fields optional):**

```json
{
  "priority": "high",
  "dueDate": "2026-08-10T08:00:00Z",
  "assignedTo": "another-volunteer-uuid"
}
```

**Response `200`:** Updated [Task Object](#task-object).

---

### `PATCH /v1/organisations/:organisationId/tasks/:taskId/assignments/respond`

The assigned volunteer accepts or declines their assignment.

**Auth:** `volunteer` (must be the assignee)

**Request body:** `{ "accept": true }` or `{ "accept": false, "reason": "Unavailable that week." }`

**Response `200`:** Updated [Task Object](#task-object). The task's own `status` is unaffected by a decline — an admin must reassign.

**Errors:**

| Status | Cause |
|---|---|
| `400` | The volunteer already responded to this assignment |
| `403` | Caller is not assigned to this task |

---

### `PATCH /v1/organisations/:organisationId/tasks/:taskId/progress/start`

Mark an accepted task as `in_progress`.

**Auth:** `volunteer` (must have an `accepted` assignment)

**Response `200`:** Updated [Task Object](#task-object).

**Errors:**

| Status | Cause |
|---|---|
| `400` | Task is not `pending` (already started or completed) |
| `403` | Caller hasn't accepted this task's assignment yet |

---

### `POST /v1/organisations/:organisationId/tasks/:taskId/progress/notes`

Add a progress note.

**Auth:** `volunteer` (accepted assignee)

**Request body:** `{ "note": "Started clearing the eastern bank." }`

**Response `201`:** Updated [Task Object](#task-object).

---

### `POST /v1/organisations/:organisationId/tasks/:taskId/progress/photos`

Attach up to 5 completion-evidence photos, already uploaded via [`POST /v1/media/upload-url`](./incidents#upload-media-pre-step).

**Auth:** `volunteer` (accepted assignee)

**Request body:** `{ "mediaUrls": ["https://ecotrack-media.s3.amazonaws.com/....jpg"] }`

**Response `201`:** Updated [Task Object](#task-object) with `photos` populated.

**Errors:**

| Status | Cause |
|---|---|
| `400` | Empty `mediaUrls`, or more than 5 |

---

### `PATCH /v1/organisations/:organisationId/tasks/:taskId/progress/complete`

Mark the task complete. **Requires at least one evidence photo already attached** via the `progress/photos` endpoint above — there is no way to complete a task with zero photos.

**Auth:** `volunteer` (accepted assignee)

**Response `200`:** Updated [Task Object](#task-object) with `status: "completed"` and `completedAt` set.

If every sibling task on the parent incident is now complete, the incident is advanced per `taskCompletionTargetStageId` (or the next stage by `position` — see [Workflow Stage Rules](./workflows#workflow-stage-rules)).

**Errors:**

| Status | Cause |
|---|---|
| `400` | Task is not `in_progress`, or has no completion photos attached yet |
| `403` | Caller hasn't accepted this task's assignment |

---

## Events

An Event is a scheduled community cleanup, linked to one or more claimed incidents, open to multiple volunteers via RSVP.

**Base path:** `/v1/organisations/:organisationId/events`

### Event Object

```json
{
  "id": "event-uuid",
  "organisationId": "org-uuid",
  "title": "Bolgoda Lake Eastern Bank Cleanup",
  "description": "Community cleanup drive targeting the construction debris on the eastern bank.",
  "location": { "lat": 6.8235, "lng": 80.0399 },
  "scheduledAt": "2026-08-10T07:00:00Z",
  "endsAt": "2026-08-10T13:00:00Z",
  "maxAttendees": 50,
  "rsvpCount": 23,
  "status": "scheduled",
  "createdByUserId": "admin-uuid",
  "incidents": [ /* array of linked Incident Objects */ ],
  "rsvps": [ { "userId": "...", "rsvpedAt": "...", "user": { "id": "...", "fullName": "...", "email": "..." } } ],
  "createdAt": "2026-07-31T11:00:00Z",
  "updatedAt": "2026-07-31T11:00:00Z"
}
```

| Field | Description |
|---|---|
| `status` | `scheduled` → `ongoing` → `completed`, or → `cancelled` from either. `scheduled` is never a target — nothing transitions back to it |
| `maxAttendees` | `null` means uncapped, no capacity check on RSVP |
| `rsvpCount` | Maintained by the RSVP/cancel-RSVP endpoints under a row lock, not derived on read |

---

### `POST /v1/organisations/:organisationId/events`

Create an event linked to one or more claimed incidents. At least one `incidentId` is required; each linked incident is independently checked against the org's `eventCreationMinStageId` precondition.

**Auth:** `org_admin`

**Request body:**

```json
{
  "incidentIds": ["incident-uuid-1", "incident-uuid-2"],
  "title": "Bolgoda Lake Eastern Bank Cleanup",
  "description": "Community cleanup drive targeting the construction debris.",
  "location": { "lat": 6.8235, "lng": 80.0399 },
  "scheduledAt": "2026-08-10T07:00:00Z",
  "endsAt": "2026-08-10T13:00:00Z",
  "maxAttendees": 50
}
```

**Response `201`:** Full [Event Object](#event-object). Each qualifying linked incident is advanced per `eventCreationTargetStageId` (or the next stage by `position`).

**Errors:**

| Status | Cause |
|---|---|
| `400` | Any linked incident is not `approved`, or has no current stage |
| `422` | Any linked incident hasn't reached the org's minimum stage for event creation |

---

### `GET /v1/organisations/:organisationId/events`

**Auth:** `org_admin`, `volunteer`, platform admin

**Query parameters:** `status`, `page`, `limit`

**Response `200`:** `{ items, total, page, limit }`; each item includes `rsvpedByMe: boolean` for the calling user.

---

### `GET /v1/organisations/:organisationId/events/:eventId`

**Auth:** `org_admin`, `volunteer`, platform admin

**Response `200`:** Full [Event Object](#event-object), including the full RSVP list.

---

### `PATCH /v1/organisations/:organisationId/events/:eventId/status`

Transition an event's lifecycle status. Valid transitions: `scheduled → ongoing | cancelled`, `ongoing → completed | cancelled`. `completed` and `cancelled` are terminal.

**Auth:** `org_admin`

**Request body:** `{ "status": "completed" }` — one of `ongoing` \| `completed` \| `cancelled`

Cancelling notifies every RSVPed volunteer and cancels the pending reminder. Completing advances every linked incident per `eventCompletionTargetStageId` (or the next stage by `position`) — this always succeeds on its own terms, unlike creation, which has a precondition.

**Response `200`:** Updated [Event Object](#event-object).

**Errors:**

| Status | Cause |
|---|---|
| `400` | The requested transition isn't valid from the event's current status |

---

### `POST /v1/organisations/:organisationId/events/:eventId/rsvp`

RSVP to an event. Idempotent — RSVPing again while already going is a no-op, not an error. Capacity is enforced with a `SELECT ... FOR UPDATE` row lock on the event, not an application-level check, so two concurrent RSVPs can't both squeeze past `maxAttendees`.

**Auth:** `volunteer`

**Response `200`:** Updated [Event Object](#event-object).

**Errors:**

| Status | Cause |
|---|---|
| `409` | Event is at `maxAttendees` capacity |
| `410` | Event has been cancelled |
| `400` | Event has already taken place (`status: completed`) |

---

### `DELETE /v1/organisations/:organisationId/events/:eventId/rsvp`

Withdraw an RSVP. Idempotent — cancelling when not RSVPed is a no-op. Allowed even on a cancelled or completed event (a withdrawal only ever removes capacity pressure, never adds it).

**Auth:** `volunteer`

**Response `200`:** Updated [Event Object](#event-object).
