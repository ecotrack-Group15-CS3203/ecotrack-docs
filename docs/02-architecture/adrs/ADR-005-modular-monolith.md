---
sidebar_position: 6
title: "ADR-005: Modular Monolith"
---

# ADR-005: Modular Monolith vs. Microservices Architecture

## Status

Accepted

## Context

EcoTrack's backend must serve as the API layer for two client applications handling authentication, geospatial queries, media uploads, push notifications, and multi-tenant business logic. The architectural style chosen now determines the team's ability to develop, test, and deploy the system within the academic timeline.

Two architectural styles were evaluated:

- **Microservices:** Each domain concern (Incidents, Organizations, Notifications, Media, etc.) runs as an independently deployed service communicating over HTTP or a message queue.
- **Modular Monolith:** All domain concerns are implemented as distinct, well-bounded NestJS modules within a single deployable application.

## Considered Options

- **Option A: Microservices** — maximum deployment independence, each service scales individually.
- **Option B: Modular Monolith** — single deployment unit, modules enforce internal boundaries.

## Decision

**Modular Monolith** architecture is adopted for the initial prototype phase.

The NestJS application is structured as a set of feature modules (Auth, Organizations, Incidents, Tasks, Events, Workflows, Users, Notifications, Media), each with clearly defined interfaces. Modules communicate in-process via dependency injection rather than over a network. The module boundaries are explicitly designed to be the eventual split points if a microservices migration becomes necessary in a future phase.

## Consequences

### Positive

- **Deployment simplicity:** The entire backend is a single Docker container deployable with one `docker compose up` command on a single EC2 instance. No service mesh, API gateway, or inter-service networking is required.
- **Debugging simplicity:** A single process, a single log stream, and a single debugger attach point. Distributed tracing is not required.
- **Zero network overhead:** In-process module calls have no serialization, round-trip, or service discovery overhead. This is critical for multi-step operations like `verify incident → create task → dispatch notification`, which would become a distributed transaction in a microservices model.
- **Free Tier compatibility:** Microservices would require one EC2 instance per service, immediately exhausting the AWS Free Tier compute budget. The modular monolith runs entirely on a single t2.micro instance.
- **Future-proof module boundaries:** Clean NestJS module interfaces mean each module can be extracted into a standalone microservice with minimal refactoring when scale justifies the operational overhead.

### Negative

- **Scaling granularity:** All modules scale together. A notification dispatch spike cannot be scaled independently from incident creation. This is an acceptable trade-off at prototype scale.
- **Blast radius:** A fatal error in any module can crash the entire process. Mitigated by NestJS's global exception filter layer, which catches unhandled errors and returns structured responses without crashing the server.
- **Shared dependency tree:** All modules share the same Node.js dependency tree. A version conflict between two modules' dependencies cannot be resolved by independent deployment.

### Neutral

- NestJS supports microservices migration paths natively. Each module can be wrapped with a transport adapter (TCP, gRPC, RabbitMQ) to convert in-process calls to network calls, with minimal code changes, when the platform's growth justifies it.
