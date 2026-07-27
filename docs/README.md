---
id: welcome
slug: /
title: Welcome to EcoTrack Docs
sidebar_label: Welcome
sidebar_position: 0
---

# EcoTrack Platform Documentation

**EcoTrack** is a Multi-Tenant SaaS platform for community-driven, hyper-local environmental monitoring and cleanup coordination. It provides a centralized system for citizens to report environmental incidents, administrators to manage volunteer-led cleanups, and multiple independent organizations to operate on the same platform with strict data isolation.

> **Project:** PID 08 — Group 15 | **Mentor:** Mr. Nipuna Fernando

---

## What is EcoTrack?

Local environmental groups rely on fragmented tools (WhatsApp, spreadsheets, social media) to coordinate pollution responses. EcoTrack replaces this with:

- A **mobile app** for citizens to submit geo-tagged, photo-verified hazard reports
- A **web dashboard** for organization admins to verify reports, assign tasks, and monitor progress
- A **multi-tenant backend** that ensures complete data isolation between independent environmental organizations
- A **configurable workflow engine** letting admins customize incident status stages without touching code

---

## Who Are These Docs For?

| Audience | Start Here |
|---|---|
| New team members / contributors | [Onboarding →](/docs/onboarding) |
| Understanding system design | [Architecture →](/docs/architecture/system-context) |
| Building against the API | [API Reference →](/docs/api) |
| Deploying or operating the platform | [Runbooks →](/docs/runbooks) |
| Exploring individual components | [Components →](/docs/components) |

---

## Platform at a Glance

| Layer | Technology |
|---|---|
| Web Frontend | Next.js (TypeScript), SSR |
| Mobile App | React Native (iOS + Android) |
| Backend API | NestJS (modular monolith) |
| Database | PostgreSQL + PostGIS (spatial queries) |
| ORM | Drizzle ORM |
| Multi-Tenancy | PostgreSQL Row-Level Security (RLS) |
| Identity & Auth | WSO2 Asgardeo (OAuth2 / RBAC) |
| Object Storage | Amazon S3 |
| Compute | Amazon EC2 + Docker |
| Database Hosting | Amazon RDS (PostgreSQL) |
| Maps & Geocoding | Mapbox / MapTiler (OpenStreetMap) |
| Push Notifications | Firebase Cloud Messaging |

---

## Documentation Structure

```
docs/
├── 01-onboarding/      Project overview, key concepts, local setup
├── 02-architecture/    System context (C4), tech stack, multi-tenancy, ADRs
├── 03-api/             REST API reference — endpoints, auth, request/response
├── 04-runbooks/        Local development, AWS deployment, CI/CD pipeline
└── 05-components/      Web dashboard, mobile app, backend module breakdown
```
