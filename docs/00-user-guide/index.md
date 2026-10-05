---
sidebar_position: 1
title: User Guide
---

# User Guide

This guide is for the people who **use** EcoTrack: citizens reporting hazards, volunteers doing cleanups and organisation admins running the dashboard. If you are building or running the platform, start at [Onboarding](/docs/onboarding) instead.

## What EcoTrack is

EcoTrack links the public with environmental organisations such as NGOs, green societies and lake-restoration groups. Citizens report hazards like illegal dumping or water pollution from their phones. Each report has a photo and a GPS location. Nearby organisations claim the reports, move them through their own workflow, and send volunteers to clean them up.

| Part | Who uses it | Where |
|---|---|---|
| Mobile app (Android) | Citizens and volunteers | [Install the app](#install-the-mobile-app-android) |
| Web dashboard | Organisation admins | [https://ecotrack.tech](https://ecotrack.tech) |

## User roles

| Role | What they can do |
|---|---|
| **Citizen** | Report incidents, browse the incident map, get alerts about nearby incidents, ask to join an organisation. |
| **Volunteer** | Everything a citizen can do, plus: receive cleanup tasks, upload cleanup evidence, RSVP to cleanup events. A citizen becomes a volunteer when an organisation approves their join request or they accept an invite link. |
| **Organisation admin** | Uses the web dashboard to claim and verify incidents, set up workflow stages, create tasks and events, manage volunteers, and view reports. |

Each organisation's data is kept separate from every other organisation's. One organisation can never see another's incidents, tasks or volunteers.

## Install the mobile app (Android)

1. On an Android phone, download **EcoTrack.apk** from the [latest release](https://github.com/ecotrack-Group15-CS3203/ecotrack-mobile/releases/latest).
2. Open the downloaded file. If Android asks, allow your browser to *install unknown apps*, then tap **Install**.
3. Open EcoTrack and allow **location**, **camera** and **notifications** when asked. Reports need a location, and the app uses your location to find incidents near you.

## Signing in

EcoTrack uses **WSO2 Asgardeo** to sign users in. Tap **Log In** in the app, or **Log in** on the website. You are taken to the EcoTrack sign-in page, where you can sign in or create a new account. You then come back to EcoTrack already signed in.

On the website, only organisation admins can open the dashboard. If a citizen or volunteer signs in there, they are sent to the "get the app" page. To set up a new organisation, see [Register an organisation](./org-admins#register-an-organisation).

## In this guide

- [Citizens](./citizens): reporting a hazard and tracking it
- [Volunteers](./volunteers): joining an organisation, tasks and events
- [Organisation admins](./org-admins): the web dashboard
- [Walkthrough](./walkthrough): one incident from report to cleanup
- [Troubleshooting](./troubleshooting)
