---
sidebar_position: 3
title: Mobile App
---

# Mobile App

The EcoTrack mobile app is built with **React Native** (TypeScript), targeting both iOS and Android from a single unified codebase. Citizens use it to report environmental hazards; Volunteers use it to track assigned tasks, RSVP to events, and submit cleanup evidence.

React Native is chosen over native Swift/Kotlin development to keep the full stack in a unified TypeScript ecosystem and deploy to both platforms simultaneously (see [ADR documentation](../architecture/adrs/ADR-001-nestjs-backend)).

---

## Screen Inventory

| Screen | Available To | Description |
|---|---|---|
| Login | All users | Asgardeo PKCE OAuth2 login via in-app browser |
| Incident Map | All users | Interactive Mapbox map displaying nearby incident geo-pins |
| Report Incident | Citizens, Volunteers | 3-step wizard: capture photo → confirm GPS pin → describe hazard |
| Incident Detail | All users | Single incident: photos, description, status, distance from user |
| My Tasks | Volunteers | Assigned task list with due dates and current status |
| Task Detail | Volunteers | Full task info, location pin, "Mark Complete" with evidence upload |
| Events | Volunteers | Upcoming community cleanup events with RSVP controls |
| Event Detail | Volunteers | Event info, map pin, attendee count, RSVP button |
| Profile | All users | Account info, notification radius preference, organization membership |
| Join Organization | Citizens | Browse organization directory, submit a join request |

---

## Navigation Structure

```
RootNavigator
├── AuthStack                        (unauthenticated)
│   ├── LoginScreen
│   └── RegisterScreen
└── AppStack                         (authenticated)
    ├── BottomTabNavigator
    │   ├── Map tab     → IncidentMapScreen
    │   ├── Report tab  → ReportIncidentScreen (3-step wizard)
    │   ├── Tasks tab   → TasksListScreen
    │   └── Profile tab → ProfileScreen
    └── Modal / Stack Screens
        ├── IncidentDetailScreen
        ├── TaskDetailScreen
        ├── TaskCompleteScreen    (evidence upload)
        ├── EventListScreen
        ├── EventDetailScreen
        └── JoinOrganizationScreen
```

---

## Incident Reporting Flow

The report submission is a 3-step wizard that captures all required data while minimizing user friction:

```
Step 1 — Capture Photo
  Opens the device camera (react-native-image-picker)
  User photographs the environmental hazard
  Photo is uploaded to S3 in the background via presigned URL
  (POST /v1/media/upload-url → PUT directly to S3)

Step 2 — Confirm Location
  Displays the device's current GPS coordinates on a Mapbox mini-map
  User can drag the pin to adjust the exact incident location
  Location permission is requested here if not already granted

Step 3 — Describe the Hazard
  Short title (required)
  Description text (optional)
  Urgency selector: Low / Medium / High / Critical
  Submit → POST /v1/incidents with the S3 media URL from Step 1
```

The S3 upload begins during Step 2 so that by the time the user reaches Step 3, the upload is already complete and submission is near-instant.

---

## Device Permissions

Permissions are requested at the point of use, not at app launch:

| Permission | Platform | Requested When | Purpose |
|---|---|---|---|
| Location (When In Use) | iOS + Android | First map view or report attempt | GPS for incident geo-tagging and proximity alerts |
| Camera | iOS + Android | First "Take Photo" tap on the report screen | Incident photo capture |
| Notifications | iOS | After first successful login | Firebase FCM push notification delivery |

:::caution PDPA Compliance
The app must display an explicit consent prompt before collecting or transmitting any location data. The user must actively confirm consent before geospatial data is sent to the backend. This aligns with Sri Lanka's Personal Data Protection Act (PDPA) and GDPR principles documented in the requirements.
:::

---

## Push Notifications (Firebase FCM)

The app uses **Firebase Cloud Messaging** for real-time alerts. On authenticated app launch, the device FCM token is registered with the backend:

```typescript
const fcmToken = await messaging().getToken();
await apiClient.users.registerDevice({ fcmToken, platform: Platform.OS });
```

Three notification types are dispatched by the `NotificationsModule`:

| Type | Trigger | Recipients |
|---|---|---|
| Proximity Alert | New incident reported within a user's configured radius | All users with location alerts enabled near the incident |
| Task Assignment | Admin assigns a task to a volunteer | The assigned volunteer only |
| Event Reminder | 24 hours before a confirmed RSVP event | All confirmed event attendees |

---

## Invite Link Deep Linking

Organization Admins generate single-use invite links from the web dashboard. The invite URL format is:

```
https://ecotrack.example.com/join?token=<signed-jwt>
```

The React Native app is registered as a deep link handler for the `ecotrack.example.com` associated domain. When a user opens an invite link:

1. The app opens (or launches) and extracts the `token` query parameter
2. Calls `POST /v1/organizations/accept-invite` with the token
3. The user's role is updated to `volunteer` and their JWT refreshes on next login
4. App navigates to the organization's task list

If the user has not yet registered, the token is preserved through the Asgardeo PKCE registration flow and consumed immediately after the new account is created.

---

## Offline Handling

The app shows a connection status banner when the device is offline. Incident draft submissions are queued in device storage (AsyncStorage) and automatically retried when connectivity is restored. The Mapbox SDK's offline tile packs API caches the map tiles for the user's last known location.
