# Rostered and Blanket Runsheet Access Design

**Date:** 2026-09-26  
**Status:** Draft for Review  

---

## 1. Context & Motivation

Previously, every member of any Rock Ministry Team (Group Type `23`, under the campus roots such as `57` for MNL) was granted blanket `viewer` access to **all** runsheets for their campus, and Events Team leaders were granted blanket `editor` access.

This led to unintended exposure:
1. Volunteers could view all Sunday runsheets across their campus even when they were not scheduled or rostered to serve.
2. Team members of non-Sunday ministries (such as the Grow Course Team, Group `19108`) inherited blanket view access to all Sunday services, despite having no Sunday service responsibilities.
3. Events Team leaders had blanket edit access across all campus runsheets.

### Goals
1. **Rostered-Only Sunday & General Runsheet View**: Volunteers see runsheets only for the exact date and service time they are rostered to attend.
2. **Events Team Blanket View (No Edit)**: Events Team members/leaders receive campus-wide blanket view access, but **no** blanket edit access.
3. **Grow Course Blanket Isolation**: Grow Course Overall Heads and Unit Heads have blanket edit and view access **only** to Grow Course category runsheets, and cannot view Sunday runsheets unless rostered.
4. **Campus Staff & Global Admins**: Maintain full/blanket access as appropriate.

---

## 2. Access Matrix

| Role / Group | General & Sunday Runsheets | Grow Class Runsheets | Can Edit? |
|---|---|---|---|
| **Global Staff / Admins** (`GLOBAL_EDIT_GROUP_IDS`: `2`, `46`, `32879`, `4`, `5`, Web Dev) | **Blanket View** (All campuses) | **Blanket View** (All campuses) | **Yes** (All campuses) |
| **Campus Staff** (Org Unit `28`) | **Blanket View** (Own campus) | **Blanket View** (Own campus) | **Yes** (Own campus) |
| **Events Team** (`* Events Team`, Group Type `23`) | **Blanket View** (Own campus) | Denied unless rostered | **No** (Blanket view only) |
| **Grow Course Heads** (Overall Head `20`, Unit Head `55` in Group `19108`) | Denied unless rostered | **Blanket View** (Grow category only) | **Yes** (Grow category only) |
| **Ministry Volunteers** (Worship, Tech, Kids, Ushers, etc.) | **Rostered Only** (Matching date & time) | Denied unless rostered | **No** (View-only for rostered slot) |
| **Grow Rostered Volunteers** | Denied unless rostered | **Rostered Only** (Matching course date) | **No** (View-only for rostered slot) |
| **Unauthenticated / Non-Rostered Public** | Denied | Denied | **No** |

---

## 3. Detailed Architecture & Matching Logic

### 3.1 Roster Resolution (`rockResolveAccess`)
When resolving a user session:
1. `fetchRosteredOccurrences(membershipPersonIds)` queries Rock RMS for `Attendances` where:
   - `ScheduledToAttend eq true`
   - `StartDateTime ge datetime'<7 days ago>'`
2. For each attendance occurrence:
   - Look up the `AttendanceOccurrence` record (`ScheduleId`, `OccurrenceDate`, `GroupId`).
   - Extract:
     - `campus`: Campus code derived from the occurrence group's ancestry (or Schedule).
     - `date`: `YYYY-MM-DD` (e.g. `2026-09-27`).
     - `time`: Normalized 24-hr time signature derived from `StartDateTime` (e.g. `09:00:00`, `10:00:00`, `11:30:00`, `15:00:00`, `17:00:00`, `17:30:00`).
3. Store roster keys in `rolesMap.rosteredViewer`:
   - Format: `<campus>:<date>:<timeSignature>` (e.g. `MNL:2026-09-27:10:00:00`).
   - Also continue to populate `rolesMap.growViewer` for Grow schedule matches: `<scheduleId>:<date>` (e.g. `483:2026-10-04`).

### 3.2 Blanket Policy Updates (`runsheetAccessPolicy.ts`)
1. **Remove Blanket Edit for Events Team**:
   - `isEventsTeam && isLeader` no longer adds to `editorGroupIds`.
2. **Remove General Blanket View for Group Type 23**:
   - Ministry Teams (Group Type `23`) no longer grant blanket `viewerGroupIds` or blanket `runsheetCampuses`, **except** for groups matching `EVENTS_TEAM_NAME_PATTERN` (`* Events Team`).
   - Events Team continues to receive blanket `viewerGroupIds` and `runsheetCampuses` for their campus.
   - Grow Team (`19108`) is excluded from Sunday blanket view.

### 3.3 Channel Access Enforcement (`runsheetChannelAccess.ts`)
When evaluating `canViewRunsheetChannel(session, channelName, growSchedules)`:
1. **Global & Campus Blanket Viewers**:
   - If user has `editor` role (Global or Org Unit 28), or holds blanket `viewer` (Events Team), and `canAccessRunsheetChannel(session.access.runsheetCampuses, channelName)` is true:
     → **ALLOW**.
2. **Grow Category Runsheets**:
   - If `matchGrowRunsheet(channelName, growSchedules)` matches a Grow schedule:
     - If user has `rolesMap.growEditor` → **ALLOW**.
     - If user has `rolesMap.growViewer` matching `<scheduleId>:<date>` → **ALLOW**.
     - Otherwise → **DENY**.
3. **Sunday & General Runsheets (Rostered-Only)**:
   - Extract `campus = extractRunsheetCampus(channelName)` (e.g. `MNL`).
   - Extract `date = extractChannelDate(channelName)` formatted as `YYYY-MM-DD`.
   - Extract `time = parseTimeToSortSignature(extractChannelTime(channelName))` (e.g. `10:00:00`).
   - Check if `rolesMap.rosteredViewer` contains `${campus}:${date}:${time}`.
   - If match found → **ALLOW**.
   - If no match found → **DENY**.

### 3.4 Direct URL & Mutation Gates
1. Direct URL access (`/[channelId]`) and server action content reads (`assertRunsheetViewAccess` / `rockGetRunsheetDetails`) enforce `canViewRunsheetChannel`. If the user is neither a blanket viewer nor rostered for that channel, they are denied with `403 Access Restricted`.
2. Mutation gate (`assertRunsheetEditAccess`):
   - Events Team, rostered volunteers, and grow viewers cannot mutate Sunday runsheets.
   - Grow Heads can only mutate Grow category runsheets.

---

## 4. Verification & Testing Plan
1. **Unit Tests**:
   - `runsheetAccessPolicy.test.ts`: Verify Events Team has blanket view but not edit; verify regular Group 23 teams do not get blanket view.
   - `runsheetChannelAccess.test.ts`: Test that volunteers can only see runsheets matching their exact rostered campus/date/time, and non-rostered runsheets return false.
   - `runsheetAuthorization.test.ts`: Verify edit denial for Events Team leaders.
2. **Integration Tests**:
   - `runsheetAccessBehavior.test.ts`: Test that channel list only returns matching rostered channels for a volunteer.
3. **Typecheck & Lint**:
   - `pnpm typecheck` and `pnpm lint`.
4. **Semver**:
   - Minor release (`1.18.0`) as this changes authorization capabilities for users.
