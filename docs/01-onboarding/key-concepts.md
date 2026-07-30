---
sidebar_position: 3
title: Key Concepts
---

# Key Concepts

This page defines the core domain terms used throughout the EcoTrack platform and its documentation.

---

## Tenant / Organization

A **Tenant** is an independent environmental group (e.g., a local NGO, green society, or lake restoration team) that registers a dedicated workspace on the EcoTrack platform. Each tenant:

- Has its own isolated set of incidents, volunteers, tasks, and events
- Can configure its own incident workflow stages
- Manages its own volunteer database and invite links
- Is identified by a unique `organizationId` on every database row

Data isolation between tenants is enforced at the database engine level using **PostgreSQL Row-Level Security (RLS)** — not just application-layer filtering.

---

## Incident

An **Incident** is a geo-tagged, photo-verified environmental hazard report submitted by a Citizen. Each incident captures:

- A text description of the hazard
- One or more photo attachments (stored in Amazon S3, URL saved in the database)
- Precise geolocation coordinates (latitude/longitude)
- A community urgency indicator
- The current workflow status (e.g., *Reported*, *Verified*, *Cleanup Scheduled*, *Resolved*)

Incidents remain in a **pending** state until an Organization Admin verifies them. Verified incidents can be converted into a **Task** or an **Event**.

---

## Task

A **Task** is an individual, actionable cleanup assignment derived from a verified incident. Tasks are:

- Assigned directly to a single registered volunteer
- Tracked through the volunteer's mobile app
- Completed by the volunteer uploading "after" images as cleanup evidence

---

## Event

An **Event** is a large-scale community cleanup derived from a verified incident. Unlike tasks, events:

- Are open to multiple volunteers via RSVP
- Appear on the volunteer's event schedule in the mobile app
- Are managed and monitored by the Organization Admin through the web dashboard

---

## Dynamic Workflow

A **Dynamic Workflow** is a tenant-configurable sequence of status stages that an incident progresses through. Rather than hardcoding stages in backend code, each tenant defines its own ordered list of stages (stored as an `order-index` dataset).

**Default example:**

```
Reported → Verified → Cleanup Scheduled → Resolved
```

Administrators can add, rename, or reorder stages from the web dashboard without any backend code changes.

---

## User Roles

EcoTrack uses Role-Based Access Control (RBAC) with three primary roles:

| Role | Also Known As | Key Capabilities |
|---|---|---|
| **Citizen** | Community User | Submit incident reports, view the public incident map, receive proximity alerts, request to join an organization |
| **Volunteer** | Opt-In Volunteer | Inherits all Citizen capabilities + view assigned tasks, submit cleanup evidence, RSVP to events |
| **Organization Admin** | Tenant Admin | Verify incidents, create tasks and events, assign volunteers, configure workflow stages, manage the volunteer database, view dashboard analytics |

> Volunteers are Citizens who have been approved by an Organization Admin. A user can be a Volunteer in one organization and a Citizen in another.

---

## Row-Level Security (RLS)

**Row-Level Security** is a native PostgreSQL feature that automatically filters every query result based on a security policy tied to the current session's `organizationId`. In EcoTrack:

- Every multi-tenant table has an `organization_id` column
- An RLS policy is attached to each table requiring `organization_id = current_setting('app.current_tenant')`
- The NestJS backend sets this session variable on every authenticated request
- If the policy is not satisfied, the row is **invisible** to the query — not just hidden at the application layer

This guarantees that even if there is an application-level bug, data from one tenant can never appear in another tenant's response.

---

## Multi-Tenancy

**Multi-tenancy** is the platform's ability to serve multiple independent organizations from a single shared infrastructure while guaranteeing complete data isolation between them.

EcoTrack uses a **Shared Database, Shared Schema** model:

- All tenants share a single PostgreSQL instance and the same table structure
- Isolation is enforced by `organization_id` foreign keys + PostgreSQL RLS policies
- This is more cost-efficient than provisioning a separate database per tenant and operates entirely within AWS Free Tier limits for the prototype phase

---

## WSO2 Asgardeo

**WSO2 Asgardeo** is the Identity-as-a-Service (IDaaS) solution used for user authentication and OAuth2 token issuance. EcoTrack uses Asgardeo strictly for **authentication** (verifying who the user is). Tenant membership and data isolation are handled separately at the database layer using RLS, allowing the platform to scale beyond Asgardeo's free-tier B2B organization limits.

---

## PostGIS

**PostGIS** is a spatial extension for PostgreSQL that adds support for geographic data types, spatial indexing (GiST), and geospatial query functions. EcoTrack uses PostGIS for:

- Storing incident coordinates as `geometry` / `geography` types
- Executing radius queries to find incidents or volunteers near a given location
- Powering the hyper-local proximity alert system on the mobile app
