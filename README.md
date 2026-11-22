# STRAVEDA

The Git repository root is this directory. `source-code/client/` is the Expo SDK 58 Android application. `source-code/02-web-portal-source/` and `source-code/03-demo-data/` are reference inputs for local inventory and database verification; they are excluded from the EAS archive and are not required to build or run the APK. `documentation/` contains submission documents. `android/` is currently empty; no signed APK has been generated locally.

If reference inputs have been moved outside the repository, set `STRAVEDA_REFERENCE_SOURCE_DIR` to the PHP source directory and `STRAVEDA_DEMO_DATA_DIR` to the demo-data directory. Scripts also look in the current `source-code/` locations and the older root-level locations. Do not move these directories into the Android client.

All five implementation phases are complete. From `source-code/client/`, the regression suite verifies:
- `npm run typecheck` (TypeScript strict compilation with zero errors)
- `npm run test:domain` (21 automated unit/integration tests for auth, session, orders, POD, returns, CSV, MIS, inventory, stock, and profile password changes)
- `npm run test:seed` (11 SQLite schema, integrity, foreign key, and constraint tests)
- `npm run check:offline` (Static scanner confirming zero runtime network references)

The `production-apk` EAS profile uses project ID `1588b446-83d5-4a51-b162-d97e425ea5c6` and Android application ID `in.rohanenergy.offline`. The repository-root `.easignore` excludes reference material, caches, tests, and documentation from the archive while retaining the bundled SQLite database (`rohan_energy_demo.db`).

EAS archive inspection has been executed and verified locally (`npx eas-cli build:inspect --platform android --profile production-apk --stage archive`). The project is in a **READY** state for cloud APK generation via `npx eas-cli build --platform android --profile production-apk`. Physical device installation, cold launch, and airplane-mode operations remain pending cloud build and hardware testing. See [build instructions](source-code/client/docs/BUILD_INSTRUCTIONS.md) and the [release validation report](source-code/client/docs/RELEASE_VALIDATION_REPORT.md).
