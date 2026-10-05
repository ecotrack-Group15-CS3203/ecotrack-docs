---
sidebar_position: 2
title: Citizens
---

# Citizens: reporting a hazard

<div style={{display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center'}}>
  <figure style={{width: 260, margin: 0, textAlign: 'center'}}>
    <img src={require('./img/m-map.png').default} width="260" alt="Home map with nearby incidents" />
    <figcaption>Home map: incidents near you, the urgency filter and the closest incident</figcaption>
  </figure>
  <figure style={{width: 260, margin: 0, textAlign: 'center'}}>
    <img src={require('./img/m-notif.png').default} width="260" alt="Notifications inbox" />
    <figcaption>Notifications inbox</figcaption>
  </figure>
</div>

## The home map

The **Map** tab shows reported incidents around you. Use the chips (**All / Low / Medium / High / Critical**) or the filter button to filter by urgency and status (*Awaiting claim* or *Claimed*). The **Closest to you** card shows the nearest report; tap it to see the photo, description, location and status. The bell icon opens your notifications.

## Report an incident

Reporting takes three steps.

1. **Photo.** Tap **Report** (or the green **+** button). Then tap **Capture** to take a photo, or **Gallery** to pick one. Use **Retake** to try again. A photo is required.
2. **Location.** The app finds your GPS position and shows how accurate it is. Drag the pin, or tap the map, to mark the exact spot. Then tap **Next**.
3. **Details.** Enter a short **Title** (required) and an optional **Description**. Choose an **Urgency** (Low, Medium, High or Critical), then tap **Submit Report**.

{/* TODO(screenshots): add the three report wizard steps here (photo, location, details). */}

:::tip No internet?
The report is saved on your phone, and a banner shows "*1 report pending · waiting for connection*". The app sends it automatically when you are back online, even if the app was closed or the phone restarted. If a send fails, tap **Retry**.
:::

## Track your reports

The **Your reports** screen lists every report you have sent and its status:

| Status | Meaning |
|---|---|
| Awaiting claim | Sent, and visible to organisations whose service area covers the location. |
| Claimed | An organisation has accepted the report and is handling it. You get a notification. |
| Rejected / Duplicate | The organisation found the report invalid, or it repeats an earlier one. |

## Profile and alert settings

The **Profile** tab shows how many reports you have filed and how many tasks you have completed. Here you can set:

- **Notification radius:** how far away a new incident can be and still alert you.
- **Minimum notification urgency:** All, Medium+, High+ or Critical only.

You can also **Log Out** or **Delete Account** from this tab.

Want to help clean up as well? See [Become a volunteer](./volunteers#become-a-volunteer).
