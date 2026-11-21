# Rohan Energy Android migration — work completed so far

This folder records the current state of the offline Android migration. **The Android application is not complete or installable.** The supplied PHP portal outside `client/` has not been modified.

## What exists

| Area | Completed work | Evidence |
|---|---|---|
| Source review | Original inventory of 86 routed PHP actions and 305 helper functions; an early public invoice action brings the reachable action count to at least 87. Selected auth/order/MIS rules reviewed; complete audit pending | [Source audit](SOURCE_CODE_AUDIT.md), [business rules](BUSINESS_RULES.md) |
| Migration planning | An action-by-action working inventory and a partial role matrix | [PHP to TypeScript mapping](PHP_TO_TYPESCRIPT_MAPPING.md), [role matrix](ROLE_PERMISSION_MATRIX.md) |
| Local database | SQLite seed generated from `03-demo-data/schema.sql` and the supplied JSON, with 13 core tables, local officer accounts and three runtime tables | [Database report](DATABASE_MIGRATION_REPORT.md), `../assets/database/rohan_energy_demo.db` |
| Expo foundation source | Android-only Expo Router entry, bundled SQLite asset loading, schema-version and foreign-key checks, EAS build profiles | `../app/`, `../app.config.js`, `../eas.json`, [architecture](ARCHITECTURE.md) |
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

- Complete the behavioral audit and fill every mapping row with inputs, validation, authorization, database effects and tests.
- Align the installed Expo project to React Native 0.88.1, install `expo-dev-client` and ESLint with registry access, then validate a development build. TypeScript already passes.
- Implement authentication, account management, role switching and domain-level authorization.
- Implement master data, orders, approvals, delivery, returns, MIS, reports, Excel, matching PDFs and all 18 original page IDs.
- Implement the Settings reset action and its rollback-safe database and file restoration. It is currently **documented only**.
- Run Android device tests in airplane mode, compare PDFs and workbooks, and build signed APK and AAB files through EAS.

The source kit omits the `mis-data/template.xlsx` file referenced by the PHP MIS export code. The original public invoice QR link also assumes a server and needs an offline equivalent; see [known limitations](KNOWN_LIMITATIONS.md).

## Reproduce the completed checks

From `client/`:

```sh
python scripts/build_demo_db.py
python -m unittest discover -s tests/database -v
python scripts/check_offline.py
```

The last run passed nine tests and found no runtime network references in `app/` or `src/`. See [build instructions](BUILD_INSTRUCTIONS.md) for the planned EAS commands and their current limitations.

## Exact next task

Finish the source behavior mapping and PHP-compatible bcrypt verification, then align/install the remaining Expo and lint dependencies with npm registry access and run Android startup/persistence tests. Phase 0 and Phase 1 are not complete. The detailed status table is in [module implementation status](MODULE_IMPLEMENTATION_STATUS.md).


