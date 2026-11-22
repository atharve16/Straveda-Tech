# Implementation status

| Area | Status |
|---|---|
| Source action/helper inventory | 87 dispatchable actions and 305 declared functions; 23 auth actions/63 reachable auth helpers and 37 orders actions/129 order helpers are source-audited; 3 auth helper call sites remain unknown; 27 API/MIS actions and 110 other helpers still need audit |
| PHP to TypeScript action inventory | 60 actions are `AUDITED`, not implemented; 27 API/MIS actions remain `NEEDS_CLARIFICATION`; no TypeScript business services exist |
| SQLite schema and demo seed asset | Generated; all source JSON values, columns, indexes, cascade foreign keys and decimal storage checked; bcrypt verification pending |
| Database seed tests | Nine passing tests; Android lifecycle integration pending |
| Expo foundation source | TypeScript passes; root route error boundary added; earlier Android JS/asset export without Hermes bytecode passed; Expo SDK 58 expects React Native 0.88.1 while lockfile pins 0.88.0, and offline npm cache lacks 0.88.1; Hermes/device validation pending |
| Android APK/AAB | Not built |
| Reset Demo Data | Recovery sequence documented in `ARCHITECTURE.md`; runtime adapter and Settings action not implemented |
| Offline source scan | Passed for the existing `app/`; scanner would also inspect `src/` if created later; no device test yet |
| Authentication, authorization and 18 screens | Authentication/account source audit complete for the supplied PHP; live data/security decisions pending; Android implementation not started |
| Orders, approvals, delivery, returns | All 37 `orders.php` actions and 129 helpers source-audited in `ORDERS_AUDIT_REPORT.md`; no Android implementation or runtime parity test |
| MIS, Excel, PDF and offline QA | Not started |

Phase 0 and Phase 1 are **not complete**. Next: audit the remaining 19 `api.php` and 8 `mis.php` actions and 110 other helpers, resolve the three unknown auth-helper call sites, verify bcrypt compatibility, obtain npm registry access for React Native 0.88.1 and `expo-dev-client`, then validate Expo/Android startup and database persistence. Authentication and orders implementation come after those gates and review of the source audits.

The client is inside the parent Git working tree (`git rev-parse --show-toplevel` resolves to `C:/Users/HP/Downloads/ANDROID-DEVELOPER-KIT`). Review and commit changes from that repository root; the user will push manually.

## Phase 2 scope after Phase 0/1 gates

1. Choose and verify a local bcrypt implementation against every supplied PHP `$2y$` hash and `Demo@12345`; preserve the supplied hashes and test wrong passwords.
2. Implement officer and outlet login with the original organization tabs, case-insensitive unambiguous officer lookup, outlet linkage check, and current-account revalidation. Store only a local session marker in secure device storage.
3. Implement logout and identity/role switching with a full scope and cache refresh. Preserve page access controls while enforcing authorization in domain services for every query and mutation.
4. Port `actor`, `userLevel`, organization/zone/region/sales-area helpers, outlet scope, page controls, user management permissions and password change/reset rules from `auth.php` and `outlet-users.php`.
5. Add regression tests for each login, session, password, account mutation and scope branch, including deletion and changed permissions while signed in. Authentication screens follow these services and tests.

These are remaining tasks, not completed implementation. The 87-action audit must finish before Phase 2 begins.


