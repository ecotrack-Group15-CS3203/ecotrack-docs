---
sidebar_position: 2
title: Project Overview
---

# Project Overview

## Background

With the increasing impact of urbanization on local ecosystems, community-led environmental initiatives are becoming vital. In regions like Sri Lanka, local environmental protection efforts — such as those around the Bolgoda Lake area — rely on manual reporting and fragmented social media groups to organize cleanups or report pollution incidents.

Currently, there is a lack of centralized, user-friendly digital tools that allow citizens to report environmental issues (such as illegal dumping or water pollution) and enable local NGOs or community groups to manage these reports as actionable tasks. Relying on generic messaging platforms leads to lost data, uncoordinated efforts, and no long-term tracking for environmental restoration.

## Problem Description

Community environmental groups face significant challenges in managing public reports:

- Reports of pollution or illegal activities are buried in chat threads, making them difficult to track or verify.
- Existing environmental management systems are designed for government agencies or large-scale enterprises, requiring complex GIS expertise and high costs.
- Volunteer tracking is unaccountable, data is duplicated, and coordination is inefficient.

There is a clear need for a **simple, mobile-first, and affordable SaaS platform** that enables centralized reporting, task assignment for volunteers, and transparent progress tracking for small-scale environmental protection groups.

## Proposed Solution

EcoTrack is a Software-as-a-Service (SaaS) environmental coordination platform that centralizes environmental "incidents" reported by the public into a single management interface for local administrators.

| Capability | Description |
|---|---|
| **Centralized Reporting** | Citizens submit reports with photos and geo-tags via a mobile app |
| **Task Management** | Administrators convert reports into cleanup tasks or events and assign them to volunteers |
| **Multi-Tenant Architecture** | Multiple independent organizations (e.g., different local green societies) share the same platform with full data isolation |
| **Configurable Workflows** | Organizations customize the status flow of a report without technical expertise |

## Objectives

1. Analyze the challenges local environmental groups face in coordinating volunteer efforts and tracking pollution reports.
2. Design and implement a centralized, multi-tenant platform for community-driven reporting, tracking, and managing environmental pollution incidents.
3. Provide a mobile app for community users and volunteers to submit geo-tagged, photo-verified incident reports, paired with a web dashboard for organization administrators to verify reports, assign tasks, and monitor progress.
4. Develop a multi-tenant backend system that guarantees secure, row-level data isolation for distinct environmental organizations using the shared platform.
5. Automate volunteer task dispatching, allowing administrators to convert and assign verified community reports.
6. Evaluate whether the platform effectively reduces the temporal delay between initial incident reporting and community-driven remediation.

## Scope

### Included

**Mobile Application**
- Primary interface for citizens to submit photo-verified, geo-tagged hazard reports
- Opt-in volunteers can view assigned tasks and upload cleanup evidence
- Map-based proximity alerts for local environmental issues

**Web Application**
- Responsive dashboard for Organization Admins to verify incident leads
- Volunteer database management and task assignment
- Customizable dynamic workflow stages

**Backend Services & Database**
- Containerized REST API (NestJS)
- Pooled PostgreSQL database with Row-Level Security (RLS) for complete data isolation between organizations
- Dynamic Workflow Engine for tenant-configurable incident status stages

### Out of Scope

- Automated image classification or Machine Learning for pollution detection
- Physical IoT sensor integrations for water or air quality monitoring
- Financial payment gateways or donation processing

## Comparison with Existing Systems

Several existing platforms demonstrate strong capabilities in civic issue mapping, but none meet the requirements of small-scale environmental groups operating independently:

| System | Strength | Gap |
|---|---|---|
| **Ushahidi** | Multi-channel data ingestion, spatial visualization for crisis mapping | No native multi-tenant data separation for independent NGOs |
| **SeeClickFix** | Mobile-first geo-tagging, Open311 standard, routes reports to municipal ticketing | Designed for municipal authorities, not volunteer-based environmental groups |
| **FixMyStreet** | GIS polygon routing to the correct local authority | No automated incident-to-task conversion or customizable volunteer workflows |

EcoTrack addresses these gaps with a pooled multi-tenant architecture, automated report-to-task conversion, and configurable per-tenant workflow stages.
