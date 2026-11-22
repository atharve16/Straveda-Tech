# STRAVEDA testing documentation & verification log

## 1. Automated regression test results

Verification executed on Windows with Node.js 22.18.0, Python 3.13, and Expo SDK 58.

```sh
cd source-code/client
npm run typecheck
npm run test:domain
npm run test:seed
npm run check:offline
```

### Summary of automated suites

| Test Suite | Framework / Tool | Scope / Targets | Status | Details |
|---|---|---|---|---|
| **TypeScript Typecheck** | `tsc --noEmit` | Strict compilation across all screens, components, domain services | **PASS** | 0 errors |
| **Domain Tests** | `node:test` (`tests/domain.test.mjs`) | Geographic scope, SAP boundaries, write permissions, pending role gates, date parsing | **PASS** | 4/4 passing |
| **CSV Parser Tests** | `node:test` (`tests/csv.test.mjs`) | Quoted commas, escaped quotes, multiline handling, malformed header rejection | **PASS** | 2/2 passing |
| **Session Tests** | `node:test` (`tests/session.test.mjs`) | Single-row session table (`app_session`), identity restoration, disabled/missing account cleanup, restart persistence | **PASS** | 2/2 passing |
| **Order Workflow Tests** | `node:test` (`tests/order-workflows.test.mjs`) | Multi-item draft lines, duplicate prevention, FOC tier calculation, rate snapshot, order submit, approval, POD receipt gating, return request/decision, restart persistence | **PASS** | 2/2 passing |
| **MIS Workflow Tests** | `node:test` (`tests/mis-workflows.test.mjs`) | Bulk delete (removing sheet rows, hiding order projections), role & scope enforcement, atomic version check, CSV detailed preview, blank row skip, duplicate batch token protection, atomic rollback | **PASS** | 4/4 passing |
| **Inventory Tests** | `node:test` (`tests/inventory.test.mjs`) | Stock calculation (`baseline - approved EA`), FOC inclusion, timestamp bounding, unlimited missing stock, Super Admin stock setting and toggle, atomic rollback on failure | **PASS** | 4/4 passing |
| **Profile & Password Tests** | `node:test` (`tests/profile.test.mjs`) | Self-service password change, current password proof, 8-byte minimum, `$2y$` / `$2a$` bcrypt verification, `pass_view` clearing, failed write rollback, disabled account rejection | **PASS** | 3/3 passing |
| **Database Seed & Integrity Tests** | `python unittest` (`tests/database/`) | SQLite schema matching source, cascade foreign keys, unique indexes, count parity against JSON source, duplicate pending prevention (`app_pending_active_once`), decimal storage preservation | **PASS** | 11/11 passing |
| **Offline Air-Gap Scan** | `python` (`scripts/check_offline.py`) | Static inspection of `app/` and `src/` for URL literals, network libraries, or remote APIs | **PASS** | 0 references |
| **EAS Archive Inspection** | `eas-cli` (`build:inspect`) | Local archive packaging check for `production-apk` profile | **PASS** | 49 non-git files, SQLite DB asset included, reference inputs excluded |

**Total Automated Tests:** 32 passing tests (21 domain/workflow tests + 11 database seed tests) + full TypeScript compilation + static air-gap check. Zero failures, zero skipped tests.

---

## 2. Manual test cases for physical Android device

The following manual test cases require a signed APK installed on physical hardware:

| Case ID | Scenario | Procedure | Expected Result | Current Automated Verification | Real Device Status |
|---|---|---|---|---|---|
| **TC-01** | Fresh install & cold launch | Install APK, turn on Airplane Mode, launch app | App opens immediately to login screen; database copied to app-private storage; no network timeout | SQLite asset verified; `SQLiteProvider` configured with `assetSource` | Pending physical APK |
| **TC-02** | Correct & wrong login | Attempt login with `demo_super` and incorrect password, then `Demo@12345` | Incorrect password displays validation error; correct password displays Dashboard with Central Zone scope | Bcrypt hash comparison unit tested in `profile.test.mjs` and `verify_demo_hash.cjs` | Pending physical APK |
| **TC-03** | Persistent session | Log in, force close app from Android App Switcher, reopen app | App bypasses login and opens directly to Dashboard with saved actor restored | `app_session` single-row storage and restoration verified across restart in `session.test.mjs` | Pending physical APK |
| **TC-04** | Role & geographic scoping | Log in as `demo_rohan_ro` (Indore RO); view Orders and MIS | Only orders and MIS rows in Indore RO / Central Zone are visible; other regional data hidden | Scope filter algorithms verified in `domain.test.mjs` and `order-workflows.test.mjs` | Pending physical APK |
| **TC-05** | Multi-item order draft | Create draft with 2 distinct items, submit order | Draft saves items, computes total EA and FOC quantities, and appears in My Orders queue | Multi-line draft and FOC logic verified in `order-workflows.test.mjs` | Pending physical APK |
| **TC-06** | Order approval & stock decrement | Log in as `demo_super`, approve pending order | Order status transitions to `approved`; available stock decreases by approved EA | Approval state transition and stock calculation verified in `inventory.test.mjs` | Pending physical APK |
| **TC-07** | Document attachment & POD | Upload payment receipt PDF, then upload POD image | Payment receipt attached; POD upload transitions order stage to `delivered` | Magic byte signature verification and file sequence verified in `order-workflows.test.mjs` | Pending physical APK |
| **TC-08** | Order return & credit note | Request return on delivered order; approve return as admin | Return recorded with reason & credit note; decision updates return status | Return request and decision verified in `order-workflows.test.mjs` | Pending physical APK |
| **TC-09** | MIS CSV import | Pick valid CSV file, preview rows, commit import | Detailed preview shows valid vs skipped rows; commit atomically inserts rows and creates audit log | Parser and atomic batch commit verified in `mis-workflows.test.mjs` | Pending physical APK |
| **TC-10** | MIS CSV export | Click "Export CSV" from MIS screen | Android native share dialog opens; exported file can be saved to device or shared | CSV formatting and file export verified in `csv.test.mjs` | Pending physical APK |
| **TC-11** | Password change | Change password in Profile settings, log out, sign in with new password | Old password rejected; new password authenticates successfully | Password change, hash update, and restart persistence verified in `profile.test.mjs` | Pending physical APK |
| **TC-12** | Merged manifest permissions | Run `aapt dump permissions <apk>` on built APK | `android.permission.INTERNET` is completely absent | `blockedPermissions` verified in `app.config.js` and Expo prebuild config | Pending cloud APK build |
