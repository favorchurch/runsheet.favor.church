# Server Actions

`src/server-actions/` is the portal's only write boundary to Rock RMS. Client components should call these actions instead of calling Rock directly.

## Rules for new actions

1. Start files that export actions with `'use server'`.
2. Authenticate first with `assertAuthenticated()`, `getRockSession()`, or a narrower `assert*` helper.
3. Authorize every client-provided Rock id with the matching access helper, such as `assertAccessibleGroupId()`.
4. Validate external input before building Rock request bodies; use Zod where the shape is user-controlled.
5. Use `rockGet`, `rockPost`, `rockPatch`, and `rockDelete` from `internal/rockFetch.ts` so Redis and Next.js caches invalidate together.
6. Keep one-off HTTP helpers inside `internal/` unless they are part of the public action surface.

## Naming

- `rockGet*` actions read Rock data.
- `rockCreate*`, `rockSet*`, `rockSave*`, `rockDelete*`, and `rockPerform*` actions mutate Rock or perform a workflow-level operation.
- `internal/` modules are private data-layer helpers used by actions and auth resolution.
