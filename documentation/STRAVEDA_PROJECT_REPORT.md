# STRAVEDA
## Offline Android sales and order management demonstration

**Academic project report**  
**Submission date:** 22 November 2026  
**Platform:** Android  
**Implementation status:** Partial functional client; APK pending build

## Abstract

STRAVEDA is an offline Android client built from an existing Expo foundation and a supplied Rohan Energy portal demo dataset. It keeps each installation's records in a private SQLite database. The current client implements local login, scoped dashboard and MIS views, MIS CRUD and CSV import/export, one-item order drafts and decisions, pending approval, a local summary and history. Several audited portal workflows remain incomplete, and no device build was verified at report time.

## 1. Introduction

The source kit contains a PHP web portal, demo data, a SQLite conversion script and extensive source audits. The Android objective is to make core data available and editable without a backend after installation. The project reused the existing Expo Router client and database seed.

## 2. Problem statement

The portal's browser/server workflow depends on PHP and MySQL. The requested Android submission must work offline, preserve data per installation and respect account scope. Porting all audited actions is substantial; this report records the implemented subset and remaining work honestly.

## 3. Objectives

Provide an Android-only Expo client, local persistence, authenticated role-aware data views, transaction-backed core actions, buildable source and clear verification documents. Produce a signed APK if EAS cloud authentication and build complete.

## 4. Existing and proposed system

The existing PHP portal has authenticated MIS, orders, approvals, stock, outlet, report and document workflows described in the audit reports. The Android client uses SQLite and local domain functions instead of a server. There is no synchronization between installations.

## 5. Functional requirements and current coverage

| Requirement | Current implementation |
|---|---|
| Officer/outlet authentication | Local bcrypt verification and organization selection |
| Dashboard | Scoped SQLite counts and litres |
| MIS | View, search, add/edit/delete, append CSV import and scoped CSV export; workbook import and bulk delete pending |
| Orders | View, one-item draft/submit, eligible pending approval/rejection; multi-line editing and full delivery lifecycle pending |
| Pending entries | Submit, approve and reject with transactional MIS insertion |
| Product/stock/outlet | Product/outlet lists and stock check for approval; management screens pending |
| Reports/export | On-screen summary and scoped MIS CSV export |
| History | New local mutation log and order events |

## 6. Non-functional requirements

The app is Android-only, uses no runtime backend, keeps an independent SQLite database per install, validates local input, uses parameterized SQL and transactions for multi-table actions, and has a release configuration intended to remove network permissions. Device-level offline and performance validation remain pending.

## 7. Technology stack

Expo SDK 58, Expo Router, React Native 0.88.1, React 19.3, TypeScript, expo-sqlite, Expo Document Picker/File System/Sharing, bcryptjs, Python 3 seed scripts and EAS cloud build configuration. No paid runtime service is used. EAS build may require an account but the installed app does not.

## 8. Architecture

`app/_layout.tsx` opens and validates the SQLite seed. `app/index.tsx` renders the login and six tabs. `src/domain.ts` performs authentication, geography checks, queries and writes. The seed comes from `assets/database/rohan_energy_demo.db`. The app-owned pending and activity tables are created idempotently at startup. Each action operates on the local database only.

## 9. Database design

The seed includes officer accounts, outlet users/master data, products, settings, orders/items/events, MIS rows and other portal tables. Source MySQL decimal values are preserved as SQLite text. `app_pending` stores locally submitted MIS requests and their decision state. `app_history` stores new action summaries. The pending active-row unique index prevents identical concurrent submissions by one account. SQLite foreign keys are enabled and checked at startup. The detailed conversion is in `DATABASE_MIGRATION_REPORT.md`.

## 10. Module descriptions

Authentication verifies PHP demo bcrypt hashes with `$2y$` prefix adaptation and selects the account's organization. Dashboard and lists apply account scope. MIS writes validate date, outlet and quantity, and CSV import accepts only in-scope rows in one transaction. Export shares scoped CSV through Android. Pending approval moves the request state and inserts a MIS row within one transaction. A creator can save and submit a one-item order. Order approval checks stock, snapshots price/GST, assigns local identifiers and creates missing order-item MIS projections in the same transaction as status and event. A rejection requires a reason. Reports display an on-screen summary and CSV export. History records new app actions.

## 11. Screenshots

No application screenshots were captured. No image is invented for this report.

## 12. Testing methodology and actual results

The database suite passed 11/11 tests. The demo bcrypt check passed for correct and wrong passwords. Five domain/CSV unit tests passed for geography, permissions, calendar dates and CSV handling. TypeScript passed. Source inventory reported 87 PHP actions and 305 helpers. Offline source scan found no runtime network references. Expo offline dependency check reported dependencies up to date with an offline reliability warning. Android Hermes bundle export succeeded with the CSV and order additions. EAS reported `Not logged in`, so no cloud APK build started. Device installation and airplane-mode tests have not been performed.

## 13. Security and offline considerations

The app uses local bcrypt hashes, account scope checks, parameterized SQL, transactions and app-private SQLite storage. It holds the current session in memory, so a cold start requires login. The shared demo password and seed are extractable from an APK; they are unsuitable for production data. A modified client or rooted device can bypass device-local authorization. Network-free runtime behavior is supported by source scan and configuration but requires APK and device verification.

## 14. Limitations

The implementation is a partial portal migration. XLSX import, MIS bulk delete, multi-line order editing, full delivery lifecycle, PDF document files, returns, account management, product and stock editing and complete reporting remain unimplemented. No signed APK, merged manifest, Android cold start, restart persistence or airplane-mode outcome is claimed until actually tested.

## 15. Future enhancements

Complete the remaining source-audited workflows, add Android integration tests, validate decimal totals against portal cases, implement secure file export, and verify a signed release on an Android device in airplane mode.

## 16. Conclusion

The existing foundation now contains functional SQLite-backed screens and limited transactional workflows. The project is source-checkable and documented. Submission readiness still depends on a successful APK build and device verification, and full portal parity remains future work.
