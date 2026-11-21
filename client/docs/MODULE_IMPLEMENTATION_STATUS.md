# Implementation status

| Area | Status |
|---|---|
| Source action/helper inventory | Original script reports 86/305; early `public_invoice` raises reachable action count to at least 87. Full behavioral audit pending |
| PHP to TypeScript action inventory | Generated; selected auth/order/MIS contracts reviewed, most action contracts pending; no TypeScript services exist |
| SQLite schema and demo seed asset | Generated; all source JSON values, columns, indexes, cascade foreign keys and decimal storage checked; bcrypt verification pending |
| Database seed tests | Nine passing tests; Android lifecycle integration pending |
| Expo foundation source | Dependencies installed from available npm cache; TypeScript passes; Android JS/asset export passes without Hermes bytecode and seed hash matches; Expo version check flags React Native 0.88.0 vs expected 0.88.1; Hermes/device validation pending |
| Android APK/AAB | Not built |
| Reset Demo Data | Recovery sequence documented in `ARCHITECTURE.md`; runtime adapter and Settings action not implemented |
| Offline source scan | Passed for current `app/` and `src/`; no device test yet |
| Authentication, authorization and 18 screens | Not started |
| Orders, approvals, delivery, returns | Not started |
| MIS, Excel, PDF and offline QA | Not started |

Phase 0 and Phase 1 are **not complete**. Next: finish all action contracts and bcrypt verification, obtain npm registry access for React Native 0.88.1, `expo-dev-client` and ESLint, then validate Expo/Android startup and database persistence. Authentication comes after those gates.

The client folder is not currently a Git repository; GitHub setup is also pending.

## Phase 2 scope after Phase 0/1 gates

1. Choose and verify a local bcrypt implementation against every supplied PHP `$2y$` hash and `Demo@12345`; preserve the supplied hashes and test wrong passwords.
2. Implement officer and outlet login with the original organization tabs, case-insensitive unambiguous officer lookup, outlet linkage check, and current-account revalidation. Store only a local session marker in secure device storage.
3. Implement logout and identity/role switching with a full scope and cache refresh. Preserve page access controls while enforcing authorization in domain services for every query and mutation.
4. Port `actor`, `userLevel`, organization/zone/region/sales-area helpers, outlet scope, page controls, user management permissions and password change/reset rules from `auth.php` and `outlet-users.php`.
5. Add regression tests for each login, session, password, account mutation and scope branch, including deletion and changed permissions while signed in. Authentication screens follow these services and tests.

These are remaining tasks, not completed implementation. The 87-action audit must finish before Phase 2 begins.


