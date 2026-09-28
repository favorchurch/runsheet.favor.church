# Rock-Linked Event Team Roster — Design

**Date:** 2026-09-28
**Status:** Approved
**Version target:** 1.19.0 → 1.20.0

## Problem

The Event Team Roster card holds the ten vital service roles as free text typed by hand into
`Roster: <role>` runsheet items. The same assignments already exist in Rock Group Scheduler,
maintained by the team captains. The two drift constantly: a producer retypes names that Rock
already knows, and a last-minute Group Scheduler swap never reaches the runsheet.

Separately, switching on **Show Archived** sorts past runsheets oldest-first, so the runsheet
someone actually wants (last Sunday) is at the bottom of a long list.

## Feature 1 — Rock-linked Event Team Roster

### Scope

MNL runsheets only. BNE and SEL roster cards keep today's free-text behaviour untouched. The
campus gate is a data check (`extractRunsheetCampus(name) === 'MNL'`) against a config table, so
extending to another campus later is adding group IDs, not changing code.

### Role mapping

Verified against production Rock on 2026-09-28. In Group Scheduler a **role** is a `Location`
attached to the team `Group`, and a **service** is a `Schedule`.

| Runsheet role (`VITAL_ROLES`) | Group | Rock role (locationId), in fill order |
|---|---|---|
| Service Director | 19100 | Service Director (475) |
| Stage Manager Captain | 19100 | Stage Manager Team Captain (479) |
| Assistant Stage Managers | 19100 | Stage Manager/s (480) |
| Service Producer | 19109 | Service Producer (661) |
| Assistant Service Producers | 19109 | Assistant Service Producer (662) |
| Music Director | 19095 | Music Director (794) |
| Worship Leaders | 19095 | Worship Leader 1 (799), Worship Leader 2 (800) |
| Offstage Director | 19095 | Off-Stage Director (498), Off-Stage Director Shadow (499) |
| Host Core Cap | 19096 | Core/Lead Captain (Host) (524) |
| Security Lead | 19144 | Core Captain (Security) (748) |

Multi-slot roles read as one merged cell: whichever slots are filled in Rock contribute a name,
in slot order, and empty slots contribute nothing. They write back positionally — the first name
in the cell goes to the first slot, the second to the second. Submitting more names than the role
has slots is rejected with a message naming the limit; it is never silently truncated.

### Occurrence resolution

A runsheet channel is named `MNL Crowne // September 27, 2026 // 3PM`. The prefix
(`extractChannelTitleDisplay`) is the campus + venue, the trailing segment
(`extractChannelTime` → `parseTimeToSortSignature`) is the time, and `extractChannelDate` is the
date. These resolve to a Rock `Schedule` by matching the group's own service list on prefix plus
time signature, with an exact-name fallback for time-less schedules such as `MNL Family Night`.

A channel resolves only when exactly one schedule matches. If nothing matches, more than one
matches, or the campus is not MNL, the runsheet is **unlinked**: the roster card behaves exactly
as it does today and says so quietly.

### Linkage is per role, not per runsheet

Not every team schedules every service. Group 19096 (Host) and 19144 (Security) carry no
`MNL Family Night` schedule at all, so on a Family Night runsheet Host Core Cap and Security Lead
have no Rock slot to read from or write to.

A role is linked only when its own `Location` carries the matched `Schedule`
(`GroupLocationSchedule`). A role that does not **behaves exactly as it did before this feature**:
free text, the existing people picker with its Guest affordance, the stored `Roster:` value, and no
write-back. The rest of the card stays linked. For a multi-slot role only the slots that carry the
schedule count, so a role with one of its two slots available is linked with one slot, and its
overflow message reflects that.

A linked role with nobody rostered is still linked — it shows empty and stays editable through the
Rock picker. Empty and unlinked are different states and must not be collapsed into one.

### Reading

Rock is the source of display truth for the ten linked roles. On page load the app fetches the
Attendances for that occurrence date and schedule across the five groups and mapped locations,
and renders those names.

Assignments count as rostered when their RSVP is **Yes (confirmed)** or **Unknown (pending)**;
declined assignments are excluded. This matches how roster-based runsheet *access* already
works since 1.18.1.

The `Roster: <role>` content-channel items stay, because propagate, compare, print and the
existing tests all read them. They are rewritten from Rock whenever the fetched roster differs,
so they remain a faithful mirror rather than a second source of truth.

Freshness is refresh-driven: the query is fetched on page load with `staleTime: 0` and no
polling and no focus refetch. A Group Scheduler change appears on the next page load.

### Writing

Editing one linked role writes only that role. The write is a diff of Rock's current occupants
of that role's slots against the submitted list:

- A person no longer in the list is **unscheduled** — their assignment is removed from Rock,
  the same as removing them in Group Scheduler.
- A person newly in the list is added as **confirmed (RSVP Yes)**. The runsheet is built close
  to service, so a producer putting someone in the roster card knows they are serving.
- A person who stays keeps their existing assignment untouched, including its current RSVP
  state — a confirmed volunteer is never churned into a fresh record by an unrelated edit to
  the same cell.

Writes go through Rock's own Group Scheduler REST actions
(`ScheduledPersonAddConfirmed`, `ScheduledPersonRemove`) rather than raw `Attendance` rows, so
Rock's own occurrence handling and scheduling side effects apply.

Guards:

- The caller must pass the existing runsheet edit permission check.
- The runsheet date must not be in the past. Writing a roster for a service that already
  happened rewrites history for no benefit.
- Rejected writes change nothing — not Rock, not the runsheet item.

### Person identity

Roster cells currently store display names only, with no Rock person ID, so a name alone cannot
safely address a Rock person. For the ten linked roles the picker therefore becomes
Rock-search-only: a name must be chosen from Rock search, and the picker carries the Rock person
ID with it for the duration of the edit. Free-typed names and the Guest affordance are not
available on these roles.

The person IDs are not persisted into the runsheet item. The cell text stays a plain display
string for backwards compatibility, and Rock supplies the IDs again on the next read.

### Failure behaviour

- **Write fails** — the cell reverts to Rock's last-known state, an inline error appears on the
  row, and the `Roster:` item is not updated. No silent divergence.
- **Read fails** — the card falls back to the stored `Roster:` values with a "couldn't reach
  Rock" note. A roster card must not go blank minutes before a service because Rock hiccuped.
- **Rock write actions are unauthorised for the app's API identity** — this is a live risk. The
  eight Group Scheduler write REST actions have historically had no `Auth` rows at all on this
  Rock instance (learning `2026-07-24-scheduler-write-actions-had-no-auth-rows-for-anyone`), so
  authorisation must be proven against `rock-preview` before any of the write path is built.

## Feature 2 — Archive sort order

`compareRunsheetChannels` gains a direction. The landing list partitions into upcoming and past:
upcoming stays ascending (nearest service first, unchanged), past sorts descending (most recent
first). Switching on **Show Archived** then puts last Sunday at the top of the archived block.

The comparator stays a single pure function; only the direction and the partition are new.

## Out of scope

- BNE and SEL group mappings.
- Roles beyond the ten in `VITAL_ROLES`, and any Rock role not listed in the mapping table.
- Live push (webhooks / realtime). Refresh-driven only, by decision.
- Backfilling historical runsheets from Rock.
