# Grow Class Runsheets Design

## Goal

Let the MNL Grow Team run its Grow Course runsheets in this app:

- Grow Heads create and edit Grow runsheets.
- The app creates one runsheet per upcoming date of every Grow Course topic.
- Volunteers rostered on a date can view that runsheet.

Also broaden schedule fetching to the whole ALL EVENTS tree, and add a category filter to the runsheet list.

## Rock references

| Thing | Rock ID |
|---|---|
| MNL Grow Team (Ministry Team, group type 23, parent 57) | Group 19108 |
| MNL \| Grow Class (runsheet content channel category) | Category 338 |
| Grow Courses (schedule category; each schedule is one topic) | Category 483 |
| ALL EVENTS (schedule root) | Category 171 |
| Campus schedule roots | 305 Manila, 306 Brisbane, 307 Seoul |

Example topic: Schedule 337, "MNL Grow - Spiritual Discipline".

## 1. Access model (additive)

Existing rules are unchanged. This includes the blanket view access every MNL Ministry Team member already has to MNL runsheets, which 19108 members keep. Grow rules only add access, and only for Grow runsheets.

A **Grow runsheet** is a content channel that meets both conditions:

- It is attached to category 338.
- Its title matches `<Grow schedule name> // <Month D, YYYY> // <time>`, where `<Grow schedule name>` is the name of an active schedule in category 483.

The access resolver adds a `growAccess` block to the session:

```ts
growAccess: {
  canEdit: boolean;               // active 19108 member with role "Overall Head" or "Unit Head"
  rosteredOccurrences: string[];  // "scheduleId:YYYY-MM-DD"
}
```

- **Grow editor**: an active member of 19108 whose GroupTypeRole name is `Overall Head` or `Unit Head`, matched case-insensitively by name rather than by hard-coded ID. A Grow editor can create, edit, duplicate and delete Grow runsheets. This grant covers no other runsheets.
- **Grow viewer**: a person with a Group Scheduler attendance (`ScheduledToAttend` or confirmed) on a schedule in category 483. The window runs from 7 days ago onward. A Grow viewer can view only the Grow runsheets whose schedule and date match one of their `rosteredOccurrences`.
- A person who has Grow access and no other access sees only the Grow runsheets that access allows. The login gate treats `growAccess.canEdit || rosteredOccurrences.length > 0` as having access.
- The server enforces every rule:
  - `runsheetAuthorization`: edit, create, delete and duplicate.
  - The list and detail actions: view.
- `growAccess` is cached with the rest of the session roles through `sessionCache`.

`resolveRunsheetAccessPolicy` stays pure. Grow resolution goes in a new pure module, `lib/growAccessPolicy.ts`, and the Rock fetches go in `rockResolveAccess`.

## 2. Automatic creation of Grow runsheets

New server action: `rockSyncGrowRunsheets`. The runsheet list page calls it on load, and the call never blocks the page.

1. If the user has neither Grow edit access nor global edit access, the action returns immediately.
2. It takes a Redis lock (`grow-sync`, about 10-minute TTL). If the lock is already held, it returns.
3. It fetches the active schedules in category 483 and expands each schedule's `iCalendarContent` into occurrence dates. The range runs from today (Asia/Manila) to `EffectiveEndDate`. Single-date and weekly recurrences must both work.
4. For each occurrence, it builds the title `<Schedule Name> // <Month D, YYYY> // <time>` with the existing `runsheetDate` helpers.
5. It skips any title that already exists among the runsheet channels (content channel type 13).
6. For each missing title, it calls `rockCreateServiceRunsheet(title, 13, 338)`, which seeds the runsheet from the MNL master template. Each run creates at most 50 runsheets.
7. It logs failures and continues with the remaining occurrences.

Every Grow title must contain the `MNL` campus marker. If a 483 schedule's name has no marker, the action prefixes the title with `MNL `.

**Next-date autofill**: on the Create page, choosing the MNL | Grow Class category lists the 483 topics. Choosing a topic fills in its next upcoming occurrence date and time.

## 3. Broader schedule fetching

`rockGetScheduleOptions` drops the hard-coded `CATEGORY_SCHEDULE_MAP`.

- It loads the schedule category tree under 171 recursively and fetches schedules in any of those categories.
- It keeps schedules that have an occurrence today or later.
- It filters by campus using the campus root (305, 306 or 307) that the schedule's category sits under, and uses the selected content channel category's campus to choose the root.
- The existing Kids and Youth filters and the "occurs on this date" check stay.
- The category tree is cached with the existing Rock object cache.

## 4. List filter

A pill filter sits above the runsheet list: **All · Sunday · Youth · Grow · Other**.

- The grouping comes from each channel's content channel category:
  - 336, 337, 339, 340, 342 and 343: Sunday
  - 341 and 344: Youth
  - 338: Grow
  - Anything else: Other
- The mapping lives in a small constants module.
- Only groups that contain at least one visible runsheet are shown.
- The selected pill is stored with `userPreferences`.

## 5. Error handling

- A failed Rock lookup for roles or roster data grants no Grow access (fail closed) and is logged. Existing access is unaffected.
- A failed sync does not affect the list page.
- If a title matches more than one 483 schedule name, access fails closed.

## 6. Testing

Unit tests in Jest, following the style of `runsheetAccessPolicy.test.ts`:

- `growAccessPolicy`:
  - Heads can edit.
  - A Member with no roster assignment gets no Grow access.
  - A rostered person can view only the matching occurrence.
  - Access adds up with global and campus access.
  - Grow access does not extend to non-Grow runsheets.
- Occurrence expansion: single-date schedules, weekly schedules, past-date skipping and `EffectiveEndDate`.
- Sync planning:
  - Missing titles are detected.
  - Running the sync twice creates nothing new.
  - The cap of 50 applies.
- Schedule tree: walking the categories recursively and resolving each schedule's campus root.
- List filter category mapping.

## 7. Release

Minor version bump: 1.15.1 → 1.16.0 (semver).
