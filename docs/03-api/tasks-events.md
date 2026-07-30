---
sidebar_position: 5
title: Tasks & Events
---

# Tasks & Events

Once an incident is verified, an Organization Admin can convert it into either a **Task** (assigned to a single volunteer) or an **Event** (open community cleanup requiring RSVPs). Both types are actionable items derived from verified incidents.

---

## Tasks

A Task is an individual cleanup assignment given directly to one registered volunteer.

**Base path:** `/v1/tasks`

### Task Object

```json
{
  "id": "task-uuid",
  "organizationId": "org-uuid",
  "incidentId": "incident-uuid",
  "title": "Remove construction debris from eastern bank",
  "description": "Collect and bag the debris at grid reference A3. Equipment provided on site.",
  "assignedTo": {
    "id": "volunteer-uuid",
    "name": "Nimal P."
  },
  "status": "assigned",
  "dueDate": "2026-08-05T08:00:00Z",
  "completedAt": null,
  "evidenceUrls": [],
  "createdAt": "2026-07-31T11:00:00Z",
  "updatedAt": "2026-07-31T11:00:00Z"
}
```

| Field | Description |
|---|---|
| `status` | `assigned` \| `in_progress` \| `completed` \| `cancelled` |
| `evidenceUrls` | S3 URLs of "after" photos uploaded by the volunteer as completion evidence |

---

### `POST /v1/tasks`

Create a task from a verified incident and assign it to a volunteer.

**Auth:** `org_admin`

**Request body:**

```json
{
  "incidentId": "incident-uuid",
  "title": "Remove construction debris from eastern bank",
  "description": "Collect and bag the debris at grid reference A3.",
  "assignedToUserId": "volunteer-uuid",
  "dueDate": "2026-08-05T08:00:00Z"
}
```

**Constraints:**
- The referenced `incidentId` must belong to the same organization and have a status of `verified` or later.
- `assignedToUserId` must be a registered volunteer in the same organization.

**Response `201`:** Full [Task Object](#task-object).

**Errors:**

| Status | Code | Cause |
|---|---|---|
| `400` | `INCIDENT_NOT_VERIFIED` | The incident has not been verified yet |
| `404` | `INCIDENT_NOT_FOUND` | Incident not found in this organization's tenant |
| `404` | `VOLUNTEER_NOT_FOUND` | The specified user is not a volunteer in this org |

---

### `GET /v1/tasks`

List tasks. Organization Admins see all tasks for the org; Volunteers see only their assigned tasks.

**Auth:** `volunteer`, `org_admin`

**Query parameters:** `status`, `assignedToUserId` (admin only), `incidentId`, `page`, `limit`

**Response `200`:**

```json
{
  "data": [ /* array of Task Objects */ ],
  "meta": { "total": 8, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### `GET /v1/tasks/:id`

Retrieve a single task by ID.

**Auth:** The task's assigned volunteer or any `org_admin` in the same org.

**Response `200`:** Full [Task Object](#task-object).

---

### `PATCH /v1/tasks/:id`

Update a task's details (admin) or mark it as in progress (volunteer).

**Auth:** `org_admin` for all fields; `volunteer` for `status` only (own tasks only)

**Request body (org_admin):**

```json
{
  "title": "Updated task title",
  "description": "Updated description",
  "assignedToUserId": "another-volunteer-uuid",
  "dueDate": "2026-08-10T08:00:00Z",
  "status": "cancelled"
}
```

**Response `200`:** Updated [Task Object](#task-object).

---

### `POST /v1/tasks/:id/complete`

Submit task completion with "after" photo evidence. Sets status to `completed`.

**Auth:** The task's assigned volunteer or `org_admin`

**Request body:**

```json
{
  "evidenceUrls": [
    "https://ecotrack-incident-media.s3.ap-southeast-1.amazonaws.com/tasks/task-uuid/after-1.jpg"
  ],
  "notes": "All debris cleared and bagged. Left at the designated collection point."
}
```

Media must be uploaded via [`POST /v1/media/upload-url`](./incidents#upload-media-pre-step) before calling this endpoint.

**Response `200`:** Updated [Task Object](#task-object) with `status: "completed"`, `completedAt` timestamp, and `evidenceUrls` populated.

---

## Events

An Event is a large-scale community cleanup open to multiple volunteers via RSVP.

**Base path:** `/v1/events`

### Event Object

```json
{
  "id": "event-uuid",
  "organizationId": "org-uuid",
  "incidentId": "incident-uuid",
  "title": "Bolgoda Lake Eastern Bank Cleanup",
  "description": "Community cleanup drive targeting the construction debris on the eastern bank.",
  "location": {
    "lat": 6.8235,
    "lng": 80.0399,
    "address": "Eastern Bank, Bolgoda Lake, Panadura"
  },
  "scheduledAt": "2026-08-10T07:00:00Z",
  "endsAt": "2026-08-10T13:00:00Z",
  "maxAttendees": 50,
  "rsvpCount": 23,
  "status": "scheduled",
  "createdAt": "2026-07-31T11:00:00Z"
}
```

| Field | Description |
|---|---|
| `status` | `scheduled` \| `ongoing` \| `completed` \| `cancelled` |
| `rsvpCount` | Number of confirmed volunteer RSVPs |

---

### `POST /v1/events`

Create a community cleanup event from a verified incident.

**Auth:** `org_admin`

**Request body:**

```json
{
  "incidentId": "incident-uuid",
  "title": "Bolgoda Lake Eastern Bank Cleanup",
  "description": "Community cleanup drive targeting the construction debris.",
  "scheduledAt": "2026-08-10T07:00:00Z",
  "endsAt": "2026-08-10T13:00:00Z",
  "maxAttendees": 50
}
```

**Response `201`:** Full [Event Object](#event-object).

**Errors:**

| Status | Code | Cause |
|---|---|---|
| `400` | `INCIDENT_NOT_VERIFIED` | Referenced incident has not been verified |
| `400` | `INVALID_SCHEDULE` | `endsAt` is before `scheduledAt` |

---

### `GET /v1/events`

List events. Admins see all org events; volunteers see upcoming events they can RSVP to.

**Auth:** `volunteer`, `org_admin`

**Query parameters:** `status`, `from` (ISO date), `to` (ISO date), `page`, `limit`

**Response `200`:**

```json
{
  "data": [ /* array of Event Objects */ ],
  "meta": { "total": 4, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### `GET /v1/events/:id`

Retrieve full event details, including the RSVP list (admin only).

**Auth:** `volunteer` (own RSVP status only), `org_admin` (full RSVP list)

**Response `200`:**

```json
{
  "event": { /* Event Object */ },
  "myRsvp": "confirmed",
  "attendees": [ /* org_admin only — array of user summaries */ ]
}
```

---

### `POST /v1/events/:id/rsvp`

Submit or update an RSVP for an event.

**Auth:** `volunteer`, `org_admin`

**Request body:**

```json
{
  "status": "confirmed"
}
```

`status` must be one of: `confirmed` \| `declined` \| `maybe`

**Response `200`:**

```json
{
  "eventId": "event-uuid",
  "userId": "volunteer-uuid",
  "status": "confirmed",
  "updatedAt": "2026-07-31T12:00:00Z"
}
```

**Errors:**

| Status | Code | Cause |
|---|---|---|
| `409` | `EVENT_FULL` | Event has reached `maxAttendees` and status is `confirmed` |
| `400` | `EVENT_PAST` | The event's `scheduledAt` has already passed |
