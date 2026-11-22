# Rohan Energy Android migration — work completed so far

**Current submission:** See [implementation checklist](IMPLEMENTATION_CHECKLIST.md), [technical documentation](PROJECT_DOCUMENTATION.md), [testing documentation](TESTING_DOCUMENTATION.md), [user guide](USER_GUIDE.md) and [project report](STRAVEDA_PROJECT_REPORT.md). The sections below record the earlier foundation phase; their status statements are superseded by those submission documents. The supplied PHP portal outside `client/` has not been modified.

## What exists

| Area | Completed work | Evidence |
|---|---|---|
| Source review | Inventory confirms 87 PHP actions and 305 helpers. All 23 authentication, 37 orders, 19 API and eight MIS actions have source contracts. MIS also has 45 core, 25 XLSX and four shared change-log helpers audited; four API helpers are not route-reachable and three authentication helpers have unknown reachability | [Authentication audit](AUTHENTICATION_AUDIT_REPORT.md), [orders audit](ORDERS_AUDIT_REPORT.md), [API audit](API_AUDIT_REPORT.md), [MIS audit](MIS_AUDIT_REPORT.md), [source audit](SOURCE_CODE_AUDIT.md) |
| Migration planning | An action-by-action working inventory and a partial role matrix | [PHP to TypeScript mapping](PHP_TO_TYPESCRIPT_MAPPING.md), [role matrix](ROLE_PERMISSION_MATRIX.md) |
| Local database | SQLite seed generated from `03-demo-data/schema.sql` and the supplied JSON, with 13 core tables, local officer accounts and three runtime tables | [Database report](DATABASE_MIGRATION_REPORT.md), `../assets/database/rohan_energy_demo.db` |
| Expo foundation source | Android-only Expo Router entry, bundled SQLite asset loading, schema-version and foreign-key checks, startup error boundary, EAS build profiles | `../app/`, `../app.config.js`, `../eas.json`, [architecture](ARCHITECTURE.md) |
| Verification | Nine passing seed tests, TypeScript typecheck and offline source scan; Expo dependency check found a React Native version mismatch | [Test report](TEST_REPORT.md), [offline verification](OFFLINE_VERIFICATION.md) |
| Security and reset planning | Offline security limits and a recoverable reset sequence | [Security](SECURITY.md), [architecture](ARCHITECTURE.md) |

## Seed data verified

| Dataset | Records |
|---|---:|
| Officer accounts | 10 |
| Outlet accounts / outlets | 10 / 10 |
| Orders / items / events | 12 / 15 / 18 |
| MIS rows | 106 |
| Products / FOC rules / settings | 2 / 3 / 23 |
| Returns / order-file records | 1 / 1 |

The source JSON and SQLite values match. SQLite integrity, original columns/indexes/cascade foreign keys, and relationships pass. Hashes have the expected bcrypt format; verification against the demo password has **not** been performed.

## What remains

- Resolve source gaps and product/security decisions recorded in the four module audits; validate behavior against a PHP runtime and original workbook when available.
- Align the installed Expo project to React Native 0.88.1, install `expo-dev-client` and ESLint with registry access, then validate a development build. TypeScript already passes.
- Implement authentication, account management, role switching and domain-level authorization.
- Implement master data, orders, approvals, delivery, returns, MIS, reports, Excel, matching PDFs and all 18 original page IDs.
- Implement the Settings reset action and its rollback-safe database and file restoration. It is currently **documented only**.
- Run Android device tests in airplane mode, compare PDFs and workbooks, and build signed APK and AAB files through EAS.

The source kit omits `config.php`, live `users.php`, `mis-data/seed.json`, and `mis-data/template.xlsx`; demo substitutes exist for configuration and users, while the workbook package is absent. The original public invoice QR link assumes a server and needs an offline equivalent; see [source audit](SOURCE_CODE_AUDIT.md) and [known limitations](KNOWN_LIMITATIONS.md).

## Reproduce the completed checks

From `client/`:

```sh
python scripts/build_demo_db.py
python -m unittest discover -s tests/database -v
python scripts/check_offline.py
```

The last run passed nine tests and found no runtime network references in the existing `app/`. The scanner also checks `src/` when that directory exists; it does not exist yet. See [build instructions](BUILD_INSTRUCTIONS.md) for the planned EAS commands and their current limitations.

## Exact next task

Review the [MIS audit](MIS_AUDIT_REPORT.md) and its unresolved template, scope and concurrency decisions; obtain the missing live source/workbook if exact parity is required. Then resolve the three unknown-reachability authentication helpers, verify PHP-compatible bcrypt, install React Native 0.88.1 and `expo-dev-client` with registry access, and run an EAS Android startup/restart/airplane-mode check. Phase 0 and Phase 1 are not complete. The detailed status table is in [module implementation status](MODULE_IMPLEMENTATION_STATUS.md). The client belongs to the parent Git repository; review and commit there, then push manually.


