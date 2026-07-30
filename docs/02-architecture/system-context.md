---
sidebar_position: 2
title: System Context
---

# System Context

This page presents the EcoTrack platform at two levels of abstraction: **Level 1** (system context — who uses it and what it talks to) and **Level 2** (containers — what the system is made of internally). A third diagram shows how those containers are deployed on AWS infrastructure.

---

## Level 1 — System Context

The system context diagram shows EcoTrack as a black box alongside the people who use it and the external systems it integrates with.

```mermaid
C4Context
  title EcoTrack — Level 1: System Context

  Person(citizen, "Citizen / Volunteer", "Reports geo-tagged environmental hazards and tracks assigned cleanup tasks via the mobile app")
  Person(admin, "Organization Admin", "Verifies incidents, creates tasks and events, and configures workflows via the web dashboard")

  System(ecotrack, "EcoTrack Platform", "Multi-tenant SaaS for community environmental monitoring and cleanup coordination")

  System_Ext(asgardeo, "WSO2 Asgardeo", "Identity-as-a-Service — OAuth2 authentication, JWT issuance, and user management")
  System_Ext(s3, "Amazon S3", "Object storage for user-uploaded incident photos and cleanup evidence")
  System_Ext(firebase, "Firebase FCM", "Real-time push notifications for proximity alerts and task assignments")
  System_Ext(mapbox, "Mapbox / MapTiler", "Commercial OpenStreetMap provider for map tile rendering and geocoding (up to 100k free requests/month)")

  Rel(citizen, ecotrack, "Reports incidents, views map, tracks tasks", "HTTPS")
  Rel(admin, ecotrack, "Manages incidents, assigns tasks, configures workflows", "HTTPS")
  Rel(ecotrack, asgardeo, "Authenticates users, validates JWT tokens", "OAuth2 / HTTPS")
  Rel(ecotrack, s3, "Uploads and retrieves incident media", "AWS SDK / HTTPS")
  Rel(ecotrack, firebase, "Dispatches proximity and task notifications", "FCM / HTTPS")
  Rel(ecotrack, mapbox, "Geocodes locations, fetches map tiles", "REST / HTTPS")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

### External System Responsibilities

| System | Role in EcoTrack |
|---|---|
| **WSO2 Asgardeo** | Handles all user authentication and OAuth2 token issuance. The NestJS API validates bearer tokens on every request. Tenant data isolation is handled separately via PostgreSQL RLS — not Asgardeo's B2B org model — to scale beyond the free tier's 3-org limit. |
| **Amazon S3** | Stores all unstructured media (incident photos, cleanup evidence). Only the S3 URL is saved in the relational database, preventing BLOB bloat and keeping RDS storage minimal. |
| **Firebase FCM** | Sends real-time push notifications to mobile devices — proximity alerts for nearby incidents and task assignment notifications. |
| **Mapbox / MapTiler** | Provides enterprise-grade OSM tile infrastructure for the incident map. Chosen over direct public OSM servers (which enforce a hard limit of 1 geocoding request/second) and Google Maps (which incurs rapid cost escalation). |

---

## Level 2 — Containers

The container diagram opens EcoTrack's boundary and shows the four internal runtime units and how they communicate.

```mermaid
C4Container
  title EcoTrack — Level 2: Containers

  Person(citizen, "Citizen / Volunteer", "Mobile user")
  Person(admin, "Organization Admin", "Web browser user")

  System_Boundary(platform, "EcoTrack Platform") {
    Container(web, "Web Dashboard", "Next.js 14 / TypeScript", "Server-side rendered admin interface. Incident verification, task assignment, volunteer management, workflow configuration, and analytics dashboard.")
    Container(mobile, "Mobile App", "React Native / TypeScript", "Cross-platform iOS + Android app. Geo-tagged incident reporting, camera integration, task tracking, RSVP, and map-based proximity alerts.")
    Container(api, "Backend API", "NestJS / TypeScript", "Modular monolith REST API. Handles authentication middleware, RBAC enforcement, multi-tenant session routing, spatial queries via PostGIS, media upload to S3, and FCM dispatch.")
    ContainerDb(db, "Relational Database", "PostgreSQL 15 + PostGIS 3", "Stores incidents, users, organizations, tasks, events, and workflow stages. RLS policies enforce per-tenant row isolation. PostGIS geometry types and GiST indexes power spatial radius queries.")
  }

  System_Ext(s3, "Amazon S3", "Incident media")
  System_Ext(asgardeo, "WSO2 Asgardeo", "OAuth2 / JWT")
  System_Ext(firebase, "Firebase FCM", "Push notifications")
  System_Ext(mapbox, "Mapbox / MapTiler", "Maps & geocoding")

  Rel(citizen, mobile, "Uses", "Mobile OS")
  Rel(admin, web, "Uses", "HTTPS / Browser")
  Rel(mobile, api, "REST API calls", "HTTPS / JSON")
  Rel(web, api, "REST API calls", "HTTPS / JSON")
  Rel(api, db, "Reads and writes via Drizzle ORM", "TCP / SQL")
  Rel(api, s3, "Stores incident media", "HTTPS / AWS SDK")
  Rel(api, asgardeo, "Validates bearer tokens", "HTTPS / OIDC")
  Rel(api, firebase, "Sends notifications", "HTTPS / FCM")
  Rel(mobile, mapbox, "Renders map tiles", "HTTPS")
  Rel(web, mapbox, "Renders map tiles", "HTTPS")
```

### Container Descriptions

| Container | Technology | Key Responsibilities |
|---|---|---|
| **Web Dashboard** | Next.js 14, TypeScript | Incident list + verification flow (≤3 clicks), task/event creation, dynamic workflow stage editor, volunteer roster, analytics. SSR via Next.js App Router for SEO on public campaign pages. |
| **Mobile App** | React Native, TypeScript | Incident submission (GPS + camera), assigned task list, event RSVP, evidence upload, proximity alert subscription. Single codebase for iOS and Android. |
| **Backend API** | NestJS, TypeScript | Auth middleware (validates Asgardeo JWT), RBAC guard, tenant session variable injection (for RLS), incident CRUD with PostGIS spatial queries, S3 presigned URL generation, FCM notification dispatch, dynamic workflow CRUD. |
| **Relational Database** | PostgreSQL 15 + PostGIS 3 | Single shared instance for all tenants. RLS policies restrict every row to the current tenant session. PostGIS `geography` columns store incident coordinates; GiST indexes accelerate radius queries to under 500 ms for 95% of requests. |

---

## Infrastructure Deployment

The following diagram shows how the containers are deployed on AWS infrastructure.

```mermaid
graph TD
  subgraph INTERNET["Public Internet"]
    USERS(["Citizens / Admins\n(Browser + Mobile)"])
  end

  subgraph AWS["AWS Cloud — Free Tier"]
    subgraph EC2["Amazon EC2 — t2.micro"]
      NGINX["Nginx\nReverse Proxy"]
      subgraph DOCKER["Docker Compose"]
        API_C["NestJS API Container\n:3001"]
        WEB_C["Next.js Web Container\n:3000"]
      end
    end

    RDS["Amazon RDS\nPostgreSQL 15 + PostGIS 3\n(Managed — decoupled from EC2)"]
    S3_B["Amazon S3 Bucket\nIncident Media Storage"]
  end

  subgraph EXT["External Cloud Services"]
    ASGARDEO_E["WSO2 Asgardeo"]
    FIREBASE_E["Firebase FCM"]
    MAPBOX_E["Mapbox / MapTiler"]
  end

  USERS --> NGINX
  NGINX --> WEB_C
  NGINX --> API_C
  API_C --> RDS
  API_C --> S3_B
  API_C --> ASGARDEO_E
  API_C --> FIREBASE_E
  WEB_C --> MAPBOX_E
  API_C --> MAPBOX_E
```

### Why EC2 + Managed RDS Instead of a Containerized Database?

Hosting PostgreSQL inside a Docker container on a 1 GB RAM Free Tier `t2.micro` instance risks:

- **Data corruption** on container restarts
- **Out-of-Memory (OOM) crashes** if the DB and API compete for the same RAM budget

By decoupling compute (EC2 + Docker Compose) from storage (Amazon RDS), both layers run cleanly within AWS Free Tier limits with no risk to data integrity. Redis caching is deferred to a post-launch scaling phase for the same OOM reason.
