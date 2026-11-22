# STRAVEDA Release Validation Report

**Date of Execution:** 23 November 2026  
**Environment:** Windows, Node.js 22.18.0, Python 3.13, Expo SDK 58, React Native 0.88.1  
**Target Platform:** Android (Standalone Offline APK)  
**Package Identifier:** `in.rohanenergy.offline`  
**EAS Project ID:** `1588b446-83d5-4a51-b162-d97e425ea5c6`  
**Release Profile:** `production-apk`  
**Overall Readiness:** **READY FOR CLOUD BUILD**

---

## 1. Executive Summary

This report documents the final validation, dependency audit, regression suite results, offline air-gap verification, and archive inspection for the STRAVEDA Android application. All five development phases are complete. 

Local automated test suites passed with a 100% success rate across 32 individual unit/integration/database tests, full strict TypeScript compilation, and static offline scanning. Archive inspection verified that all reference source code, tests, and non-runtime material are excluded while preserving the bundled SQLite database. The project is ready for the cloud build command:
```sh
npx eas-cli build --platform android --profile production-apk
```

---

## 2. Project Structure & Configuration Validation

| Check | Expected | Actual Result | Status |
|---|---|---|---|
| **Root Directory** | Git repository root | `ANDROID-DEVELOPER-KIT` | PASS |
| **Client Directory** | Application root | `source-code/client/` | PASS |
| **Package Name** | `in.rohanenergy.offline` | Verified in `app.config.js` | PASS |
| **Expo Slug** | `rohan-energy-offline` | Verified in `app.config.js` | PASS |
| **EAS Project ID** | `1588b446-83d5-4a51-b162-d97e425ea5c6` | Verified in `app.config.js` extra | PASS |
| **React / React DOM** | Matched versions (19.3.0) | `19.3.0` pinned in `package.json` | PASS |
| **React Native** | SDK 58 compatible (^0.88.1) | `^0.88.1` in `package.json` | PASS |
| **Expo Router Entry** | Entry point configuration | `"main": "expo-router/entry"` | PASS |
| **Dependencies Check** | Expo SDK dependency parity | `npx expo install --check` reports up to date | PASS |
| **Lockfile Sync** | Clean `package-lock.json` sync | `npm ci --dry-run` reports up to date (3s) | PASS |
| **SQLite Asset** | Bundled demo database | `assets/database/rohan_energy_demo.db` (229,376 bytes, SHA-256 `99A1D1154B1343111D4DFD29E568ACB01A85E806CC8C1C0B8DC0DFEC0526004A`) | PASS |
| **Metro Asset Extension** | Register `.db` files | `config.resolver.assetExts.push('db')` in `metro.config.js` | PASS |

---

## 3. Automated Test Suite Results

All automated suites were executed from `source-code/client/`:

```sh
npm run typecheck
npm run test:domain
npm run test:seed
npm run check:offline
```

### Test Suite Execution Log

1. **TypeScript Strict Typecheck (`npm run typecheck`):**
   - Command: `tsc --noEmit`
   - Result: Exited with code 0. Zero errors, zero warnings.

2. **Domain & Workflow Test Suite (`npm run test:domain`):**
   - Framework: Node.js native test runner (`node:test`)
   - `tests/domain.test.mjs`: 4/4 passed (Geographic and SAP restrictions, write permissions, pending role boundaries, calendar date validation).
   - `tests/csv.test.mjs`: 2/2 passed (Quoted comma handling, multiline cells, malformed header rejection, quote escaping).
   - `tests/session.test.mjs`: 2/2 passed (Persistent session restoration across SQLite close/reopen, automatic invalid/disabled session cleanup).
   - `tests/order-workflows.test.mjs`: 2/2 passed (Multi-line draft creation, FOC calculations, rate snapshots, draft submission, order approval, payment receipt & POD upload sequencing, return requests & decisions, restart persistence).
   - `tests/mis-workflows.test.mjs`: 4/4 passed (Bulk delete removing sheet data and hiding order projections, scope and version concurrency checks, CSV preview and atomic batch commit, duplicate batch token protection, atomic rollback on error).
   - `tests/inventory.test.mjs`: 4/4 passed (Stock calculation from setting timestamp and approved orders, FOC inclusion, unlimited missing stock handling, Super Admin stock setting and toggle, atomic rollback on error).
   - `tests/profile.test.mjs`: 3/3 passed (Officer self-service password change proving current password, outlet profile password change and `pass_view` clearing, failed write rollback, disabled account rejection).
   - `tests/navigation.test.mjs`: 7/7 passed (Logged-out actor exit, Priority 1 modal closing, Priority 2 sub-section dismissal, Priority 3 & 4 nested tab reset, Priority 3 visited main tab history popping, Priority 5 root Home exit, and tab transition history recording).
   - Subtotal: **28/28 passing tests.**

3. **Database Schema & Integrity Suite (`npm run test:seed`):**
   - Framework: Python `unittest` (`tests/database/`)
   - `test_app_schema.py`: 2/2 passed (Duplicate pending prevention via `app_pending_active_once` index, order draft insert schema compatibility).
   - `test_seed.py`: 9/9 passed (`PRAGMA integrity_check`, `PRAGMA foreign_key_check`, count parity against source JSON files, source relationships, unique constraints, bcrypt hash shapes, column/index/foreign key verification, decimal storage preservation).
   - Subtotal: **11/11 passing tests.**

4. **Offline Air-Gap Scan (`npm run check:offline`):**
   - Command: `python scripts/check_offline.py`
   - Result: `No runtime network references found in app/ or src/.` Zero network dependencies.

---

## 4. EAS Archive Inspection

Archive packaging was inspected locally outside the Git repository:

```sh
npx eas-cli build:inspect --platform android --profile production-apk --stage archive --output <temp-dir> --force
```

### Archive Content Verification Findings
- **Total Non-Git Files:** Exactly 49 files.
- **Reference PHP Excluded:** `source-code/02-web-portal-source/` contains 0 files in the archive.
- **Demo Data JSONs Excluded:** `source-code/03-demo-data/` contains 0 files in the archive.
- **Documentation Excluded:** `documentation/` and `source-code/client/docs/` contain 0 files in the archive.
- **Tests & Scripts Excluded:** `tests/` and `scripts/` contain 0 files in the archive.
- **Application Source Included:** All files in `app/`, `src/`, `src/components/`, `src/screens/`, `src/theme/`.
- **Database Asset Included:** `assets/database/rohan_energy_demo.db` is present, verified at 229,376 bytes with SHA-256 matching the committed asset (`99A1D1154B1343111D4DFD29E568ACB01A85E806CC8C1C0B8DC0DFEC0526004A`).
- **Configuration Files Included:** `app.config.js`, `eas.json`, `metro.config.js`, `package.json`, `package-lock.json`, `tsconfig.json`.

---

## 5. Confirmed Defects Fixed

1. **Android Status Bar & Display Cutout Overlap:**
   - *Issue:* Application header content overlapped with the Android status bar icons (clock, battery, Wi-Fi, notifications) on edge-to-edge Android displays.
   - *Root Cause:* Built-in `SafeAreaView` from `react-native` only supports iOS safe areas and does not calculate Android status bar insets. Additionally, `SafeAreaProvider` was missing from `app/_layout.tsx`.
   - *Fix:* Configured `SafeAreaProvider` at the application root (`app/_layout.tsx`), configured `<StatusBar barStyle="dark-content" />` for visible contrast, integrated `useSafeAreaInsets()` in `AppHeader.tsx` to extend header background behind the status bar while padding interactive header content cleanly below `insets.top`, applied safe area top padding to `AuthScreen.tsx`, and replaced redundant `SafeAreaView` instances in `ScreenContainer.tsx` and `app/index.tsx` with standard `View` to eliminate duplicate spacing.
2. **Android Hardware Back Button Premature Application Exit:**
   - *Issue:* Pressing the physical/gesture Android hardware back button immediately exited the application even when viewing sub-sections, modals, internal tabs, or non-root screens.
   - *Root Cause:* The application renders conditionally within a single route (`app/index.tsx`) rather than a multi-route stack, and had no registered Android `BackHandler` listener for screen transitions.
   - *Fix:* Created `src/navigation.ts` with pure `handleBackNavigation` and `recordTabHistory` functions and unit tests in `tests/navigation.test.mjs` (7/7 passing). Integrated a centralized `BackHandler` listener with a state ref in `app/index.tsx` adhering to the required 5-level priority:
     1. Close open modals/dialogs (`showMoreModal`, native Dialog modals).
     2. Close active sub-sections / nested screens (`activeSubSection`).
     3. Reset internal non-default tab states (Orders, MIS, Approvals).
     4. Pop main tab history back through visited screens to `Home`.
     5. Allow normal Android exit only when on the root screen (`Home`) with no open modal or nested state (or on `AuthScreen`).
3. **Sub-Section Tab State Desynchronization:**
   - *Issue:* When navigating between sub-sections from the More Menu (e.g. from "Zones & Regions" to "Team Hierarchy", or between different Reports/MIS views), the screen component preserved the initial state of the previous tab if remounting did not re-initialize internal state.
   - *Fix:* Added `useEffect` hooks in `ReportsScreen.tsx`, `AdminScreen.tsx`, `MisScreen.tsx`, and `InventoryScreen.tsx` to automatically synchronize internal active tab state whenever the `initialTab` prop changes.
4. **Missing Sub-Section Back Navigation in Reports:**
   - *Issue:* `ReportsScreen` lacked an in-screen back button when opened from More Menu sub-sections (`reports` or `roreport`).
   - *Fix:* Added `onBack` handler and button support to `ReportsScreen`, allowing users to navigate back to the primary view both via the screen and the top header.
5. **EAS Root Configuration Governance:**
   - *Issue:* EAS CLI operates from the Git repository root, where `.easignore` governs cloud archive packaging.
   - *Fix:* Confirmed repository-root `.easignore` properly excludes development tools, reference sources, and documentation while preserving runtime assets.

---

## 6. Remaining Known Limitations

The following architectural limitations are intentional prototype boundaries and remain in effect:
1. **User Administration Unavailable:** No new user creation or account administration exists; authentication is restricted to the pre-seeded demo accounts.
2. **Master Data Read-Only:** Products, prices, FOC promotional tiers, and outlet master directory cannot be edited through the application UI. Stock baseline limits can be configured by Rohan Super Admin.
3. **Administrative Previews:** Geographic zones, team hierarchy, role permission matrix, organization details, and demo reset are informational audited previews.
4. **No Server Invoice QR:** The original web portal's public QR linking to a server invoice is excluded to enforce the offline air-gap; documents are viewed as local vouchers.
5. **Independent Local Installations:** Each device functions as an independent island with its own SQLite database.

---

## 7. Manual Android Tests Requiring Physical Device Execution

The following tests require an installed APK on physical hardware and cannot be verified via automated CLI commands:

1. **Cold Launch in Airplane Mode:** Verify that the app launches cleanly on first install without Wi-Fi or mobile data, successfully copying the SQLite asset to private app storage.
2. **Hardware Restart Persistence:** Verify that logging in, updating an order draft, or changing a password persists across an Android OS reboot or process kill.
3. **Android Share Sheet Integration:** Verify that exporting MIS CSV and opening attached order documents (PDF, Office, image) correctly opens the device's native share/document viewer.
4. **Merged Manifest Permissions:** Verify that the final compiled APK binary contains no `<uses-permission android:name="android.permission.INTERNET" />` in its merged `AndroidManifest.xml`.

---

## 8. Final APK Build Readiness

**Assessment:** **READY**

The project has satisfied all regression, dependency, type safety, offline air-gap, and archive packaging prerequisites. It is prepared for execution of the EAS cloud build command:

```sh
npx eas-cli build --platform android --profile production-apk
```
