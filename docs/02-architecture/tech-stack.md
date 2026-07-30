---
sidebar_position: 3
title: Tech Stack
---

# Tech Stack

This page documents every technology selected for EcoTrack and the rationale behind each choice. Selections are justified against concrete alternatives evaluated during the feasibility study.

---

## Overview

| Layer | Technology | Version |
|---|---|---|
| Web Frontend | Next.js + TypeScript | 14 |
| Mobile App | React Native + TypeScript | 0.74+ |
| Backend API | NestJS + TypeScript | 10 |
| Database | PostgreSQL + PostGIS | 15 + PostGIS 3 |
| ORM | Drizzle ORM | Latest |
| Auth / IAM | WSO2 Asgardeo | Cloud (Free Tier) |
| Object Storage | Amazon S3 | — |
| Compute | Amazon EC2 (Docker Compose) | t2.micro |
| Managed DB | Amazon RDS (PostgreSQL) | Free Tier |
| CI/CD | GitHub Actions | — |
| Testing | Jest (unit) + Cypress (E2E) | — |
| Maps & Geocoding | Mapbox / MapTiler | — |
| Push Notifications | Firebase FCM | — |
| Containerization | Docker + Docker Compose | — |

---

## Frontend

### Web Dashboard — Next.js + TypeScript vs. Standard React + JavaScript

Next.js is chosen over a plain React + JavaScript setup for two reasons:

1. **Server-Side Rendering (SSR):** Public environmental campaign pages must be discoverable by search engines. Next.js App Router SSR makes incident reports and organization profiles indexable without a separate SSR layer.
2. **Static Typing:** TypeScript's compile-time checks prevent a class of runtime errors that are especially dangerous in a multi-tenant application where wrong `organizationId` values could expose data across tenant boundaries.

### Mobile App — React Native vs. Native (Swift / Kotlin)

React Native is chosen over native iOS (Swift) and Android (Kotlin) development because:

- The team maintains a **unified TypeScript codebase** across web, mobile, and backend — maximizing code reuse and domain model consistency.
- A single codebase deploys to both iOS and Android simultaneously, halving platform-specific development effort.
- For the prototype phase, mobile performance characteristics are within acceptable bounds for a field reporting app.

---

## Backend

### API Framework — NestJS vs. Express.js

NestJS is chosen over the minimalist Express.js framework for the following reasons:

| Concern | Express.js | NestJS |
|---|---|---|
| Architecture enforcement | None — developers design their own structure | Enforces modular, injectable, decorator-driven architecture out of the box |
| TypeScript support | Manual setup required | First-class TypeScript support |
| Scalability path | Ad-hoc refactoring needed to grow | Modular structure allows individual NestJS modules to be extracted into microservices later |
| Enterprise patterns | None built-in | Guards, interceptors, pipes, and middleware are first-class citizens |

NestJS's enforced modular structure is the foundation for the **modular monolith** strategy — the codebase stays clean enough to split into microservices in a future scaling phase without a full rewrite.

### Modular Monolith vs. Microservices

A modular monolith is chosen over a microservices architecture for the initial prototype phase:

| Factor | Microservices | Modular Monolith |
|---|---|---|
| Deployment overhead | High (Kubernetes, service mesh, inter-service networking) | Low (single Docker Compose service) |
| Debugging complexity | High (distributed tracing needed) | Low (single process, standard logs) |
| Network latency | Added latency on every inter-service call | Zero — in-process calls |
| Feasibility for team size | Requires dedicated DevOps expertise | Manageable by a small student team |
| Future scalability | Already split | Modules designed for extraction when needed |

---

## Data Layer

### Database — PostgreSQL + PostGIS vs. Alternatives

PostgreSQL with the PostGIS extension is chosen over standard relational databases and NoSQL alternatives because:

- **Geospatial types:** PostGIS `geography` columns natively store latitude/longitude with metre-accurate distance calculations. Standard FLOAT-based coordinate storage cannot do this efficiently.
- **GiST spatial indexes:** PostGIS GiST indexes execute radius queries (e.g., "find all incidents within 5 km of this volunteer") in under 500 ms at scale — a core NFR.
- **Row-Level Security:** PostgreSQL's native RLS feature is the foundation of the entire multi-tenant isolation strategy. No other database engine provides equivalent native RLS at this maturity level.
- **ACID compliance:** Transactional integrity is critical when converting an incident into a task and updating its status atomically.

### ORM — Drizzle ORM vs. Prisma vs. Raw SQL

Drizzle ORM is chosen over both Prisma and raw SQL:

| Concern | Prisma | Raw SQL | Drizzle ORM |
|---|---|---|---|
| TypeScript type safety | Strong | None | Strong |
| PostGIS custom types | Poor (limited extension support) | Full control | Supports raw SQL template literals alongside typed schema |
| SQL injection protection | Yes | Manual parameterization | Yes (parameterized by default) |
| Bundle size / overhead | Heavy runtime (Rust engine) | Zero | Thin — minimal runtime overhead |
| Query transparency | Abstracted, hard to predict | Full control | Transparent — generated SQL is predictable |

Drizzle's hybrid model — a typed schema definition alongside escape-hatch raw SQL template literals — allows the team to write type-safe queries for standard operations while dropping into raw PostGIS SQL for spatial radius queries, without sacrificing SQL injection protection.

---

## Multi-Tenancy & Identity

### Tenant Strategy — Shared DB/Shared Schema + RLS vs. Database-per-Tenant

See the dedicated [Multi-Tenancy](./multi-tenancy) page for full detail.

**Summary:** Provisioning a new PostgreSQL database per tenant is financially and operationally unfeasible. A shared schema with PostgreSQL RLS provides equivalent isolation at a fraction of the cost, operating entirely within the AWS Free Tier.

### Identity — WSO2 Asgardeo vs. Custom Authentication

WSO2 Asgardeo is chosen over building custom authentication for a fundamental security reason: **custom authentication implementations are a leading source of authentication vulnerabilities** (OWASP A07: Identification and Authentication Failures). Asgardeo provides:

- OAuth2 / OIDC-compliant JWT issuance
- Social login support (Google, GitHub)
- MFA out of the box
- 7,500 Consumer Monthly Active Users on the free tier

EcoTrack uses Asgardeo for **authentication only**. Tenant mapping and data isolation are handled at the database layer via RLS, bypassing Asgardeo's B2B organizational tier limits (capped at 3 organizations on the free plan).

---

## Infrastructure & DevOps

### Cloud — AWS Free Tier vs. Self-Hosted

AWS is chosen to provide a production-equivalent environment at zero CapEx for the prototype phase. The specific services used:

| AWS Service | Purpose | Free Tier Limit |
|---|---|---|
| EC2 (t2.micro) | Compute — runs Docker Compose with NestJS and Next.js | 750 hours/month for 12 months |
| RDS (PostgreSQL) | Managed database — decoupled from EC2 to prevent OOM | 750 hours/month, 20 GB storage for 12 months |
| S3 | Incident media object storage | 5 GB standard storage for 12 months |

Total CapEx for the prototype phase: **~$10** (domain registration only).

### CI/CD — GitHub Actions vs. Jenkins

GitHub Actions is chosen over a self-hosted Jenkins server because:

- Jenkins would require a dedicated EC2 instance, consuming the remaining Free Tier compute allocation.
- GitHub Actions pipelines (lint → unit test → E2E test → Docker build → EC2 deploy) run on GitHub-hosted runners at no cost for public repositories.
- The pipeline integrates directly with the GitHub repository, pull requests, and issue tracker in a single ecosystem.

### Testing — Jest + Cypress vs. Manual

An automated testing strategy is chosen over manual testing because in a multi-tenant system, **manual testing cannot reliably verify tenant data isolation boundaries**. Automated tests can programmatically assert that a request authenticated as Tenant A cannot retrieve Tenant B's incidents.

- **Jest:** Unit tests for NestJS service layer, guards, and RLS session injection logic.
- **Cypress:** End-to-end tests for the full web dashboard flows (incident creation, verification, task assignment) verifying the ≤3-click NFR.

---

## Maps & Geocoding

### Mapbox / MapTiler vs. Google Maps vs. Public OSM Servers

| Provider | Cost | Concurrent Request Limit | Suitability |
|---|---|---|---|
| Google Maps | Rapid cost escalation after free tier ($200/month credit) | High | Not suitable for zero-budget prototype |
| Public OSM (OSMF) | Free | **1 geocoding request/second** — hard policy limit | Not suitable for multi-user concurrent reporting |
| Mapbox / MapTiler | Free up to 100,000 requests/month | High (enterprise-grade) | Suitable — same OSM data on enterprise infrastructure |

Commercial OSM providers (Mapbox or MapTiler) are chosen because they serve the same open-source geospatial dataset on infrastructure designed for production-scale concurrent usage, staying within policy and within budget.
