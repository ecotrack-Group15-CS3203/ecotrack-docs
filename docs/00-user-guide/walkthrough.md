---
sidebar_position: 5
title: Walkthrough
---

# Walkthrough: from report to cleanup

This example follows one incident through the whole system.

1. A **citizen** sees oil on a lake shore. In the app they take a photo, confirm the location, set urgency to *High* and tap **Submit Report**. ([Citizens](./citizens#report-an-incident))
2. The report appears in the **Incident Pool** of the lake conservation society, whose service area covers the spot. The **admin** clicks **Claim incident**, and the citizen gets a "Your report was claimed" notification. ([Incident Pool](./org-admins#incident-pool-claiming-reports))
3. The admin clicks **+ Create task** and assigns it to a volunteer. The incident moves on to *Cleanup Scheduled*, as set in the [stage rules](./org-admins#workflow-stages-and-rules).
4. The **volunteer** gets a "New cleanup task assigned" notification. They tap **Start Task**, clean up the site, add an evidence photo and tap **Complete Task**. ([Cleanup tasks](./volunteers#cleanup-tasks))
5. The incident moves to *Resolved*. The admin's dashboard and Reports page update, and the citizen can see the result in **Your reports**.
