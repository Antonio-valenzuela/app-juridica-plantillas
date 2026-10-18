# Desktop Local Boundary Implementation Plan

> **For agentic workers:** Execute inline with executing-plans. User explicitly requires the current working tree, no worktree/commit/push/pull. TDD and verification-before-completion apply.

**Goal:** Authorize the canonical internal manual without workspace DB only inside launcher-controlled DESKTOP_LOCAL, never from request labels alone.

**Architecture:** Trusted launcher generates 32 random bytes per launch, passes capability/configuration through child-process environment and returns it only over private parent IPC or an in-process UI-host adapter. Next's standard CLI receives explicit `--hostname 127.0.0.1`; WEB commands remain unchanged. Manual routes dispatch to a dedicated guard; other resources retain current auth. A header-authenticated session exchange issues a scoped HttpOnly/SameSite=Strict session cookie for original-PDF links, without returning the capability to page JavaScript.

**Tech Stack:** Node.js crypto/child_process/net, Next16.3.4 standard CLI, Vitest. No dependencies added.

**Spec:** User authorization attachment `f2356b7a-f641-4e46-936e-ed6d3eb33567/Texto pegado.txt`.

## Global constraints

- Runtime defaults WEB. Only launcher configuration selects DESKTOP_LOCAL; unknown mode fails closed.
- Local capability is 256 bits, never logged/persisted/static/query-string. Comparison uses timingSafeEqual on validated equal-length bytes.
- Local config requires bind127.0.0.1, valid port, valid session deadline. Requests also match local configured origin/port; origin is defense-in-depth, never authentication.
- Manual is the only existing resource given local authorization. No case identity is manufactured.
- No manual/core/legal-engine changes; original bytes preserved.
- Browser preference is respected; no bypass of blocked UI access.
- Launcher closes owned backend process tree on trusted UI-host disconnect/exit, signal or expiry. No unrelated process termination.
- Native Windows window/EXE packaging remains outside this phase; UI-host adapter is explicit, not a fake desktop window.

## Task 1: Guard and manual routing — RED→GREEN

Files: create `lib/security/desktopLocalAccess.ts`, modify only auth calls of both `app/api/operational-manual` routes; create `tests/security/desktopLocalAccess.test.ts`.

Interfaces: `getRuntimeMode(): 'WEB'|'DESKTOP_LOCAL'|'INVALID'`; `requireDesktopLocalAccess(request,{allowCookie?}): {ok:true}|{ok:false,response:Response}`. It does not import Prisma. `requireOperationalManualAccess(request)` dispatches WEB to existing requireLawyerAccess and DESKTOP_LOCAL to the new guard; returns no fake organization.

- [ ] Write tests using real guards/manual store and mocked Prisma TLS outage. Controlled launcher environment includes random capability, bind/port/deadline.
- [ ] Run `npx vitest run tests/security/desktopLocalAccess.test.ts`: valid metadata/PDF expectations200 fail503 before changes.
- [ ] Implement exact capability/header/cookie matching, fail-closed config and mode; update two auth calls.
- [ ] Re-run:200 valid local,403 invalid/missing capability,503 WEB DB-down,401 forged identity, protected case/template/workspace routes unchanged.

## Task 2: Session exchange — RED→GREEN

Create `app/api/desktop-local/session/route.ts` and test.

Input: POST with launcher capability header. WEB404; local invalid403. Output:204 and cookie `lex_desktop_manual_cap`, Path=/api/operational-manual, HttpOnly, SameSite=Strict, no capability in response body. Cookie cannot establish runtime and never enters case guards.

- [ ] Write tests, run RED before route implementation.
- [ ] Implement POST guard with `allowCookie:false`; add no-store; expiry independent of client input.
- [ ] GREEN: emitted cookie grants manual access; wrong cookie denied; POST cannot mint from cookie-only request.

## Task 3: Launcher / lifecycle — RED→GREEN

Create `scripts/desktop/local-launcher.mjs` and CLI entry, package script, Node tests.

Interface: `launchDesktopLocal({projectDir,port?,development?,onOutput?}): Promise<{baseUrl,capability,expiresAt,backendPid,close()}>`; returned capability is for trusted host memory only. Default production supports Next start with existing build; explicit development flag for source-tree verification. All desktop env inherited from parent is overwritten, not trusted.

Child arguments: `[nextBin, development ? 'dev' : 'start', '--hostname','127.0.0.1','--port',String(port)]`. Port preflight bound only127; conflict fails, no attaching to existing server. Redact capability from child output. Readiness authenticated against session exchange/metadata, not HTTP200 on arbitrary server. Store only sanitized logs.

- [ ] Node tests generate separate launch sessions, reject invalid port, validate lifecycle/config via controlled backend adapter.
- [ ] Implement launcher, private IPC ready message, parent-disconnect cleanup, owned-process-tree stop on Windows. No custom server because standalone output cannot trace one.
- [ ] Verify actual app with controlled parent process; identify and stop only previous dev listener owned by this chat when necessary.

## Task 4: Evidence / human UI

Create `scripts/audit/verify-desktop-local.mjs`; evidence under `audit/desktop-local-boundary-2026-09-29`.

- [ ] Capture hashes of frozen engine/manual/case guard sources before changes and compare after.
- [ ] Start real desktop launcher with capability retained in harness memory; save listener evidence from netstat. No full secret logged.
- [ ] GET metadata200 and PDF200; require exact version/pages/fragments/SHA256; probe invalid/missing capability, fake desktop headers, protected client route.
- [ ] Close backend and assert port closed; relaunch with new secret, assert old secret403.
- [ ] Typecheck and focused auth/manual suites only; preserve33 existing errors and exclude13 global failures from this phase.
- [ ] UI-host session cookie transport tested independently. Inspect actual UI with approved browser where possible; do not simulate authenticated browser access or label native adapter complete if unavailable.
- [ ] Report15 required items with separate backend PASS and overall PASS/FAIL, actual remaining risks, no fabricated screenshots.

Self-review: server-controlled config plus capability is necessary, hostname alone never sufficient; cookie is server-issued cryptographic transport rather than runtime proof. UI-host disconnect controls child lifecycle, WEB never receives local trust. No route unrelated to the manual loses its guard.
