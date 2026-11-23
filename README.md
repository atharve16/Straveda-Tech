# STRAVEDA

STRAVEDA is an offline-first Android prototype for selected Rohan Energy Order & MIS Portal workflows. The Android client is in `source-code/client/`; the PHP portal and demo-data directories are retained as reference inputs and are not part of the Android runtime.

## Assignment documentation

- **[Complete Technical Project Documentation](documentation/STRAVEDA_TECHNICAL_DOCUMENTATION.md)** — project overview, scope, architecture, technology stack, folder structure, state management, authentication, workflows, offline design, testing, build, limitations, and future scope.
- **[Database Schema Reference](documentation/STRAVEDA_DATABASE_SCHEMA.md)** — seed data, reference tables, runtime SQLite extensions, relationships, indexes, data semantics, integrity checks, and schema change guidance.

## Repository layout

- `source-code/client/` — Expo SDK 58 / React Native Android application.
- `source-code/02-web-portal-source/` — reference PHP portal source; not used at runtime by the Android app.
- `source-code/03-demo-data/` — reference schema and demo JSON data used for seed validation.
- `documentation/` — assignment and technical documentation.
- Repository-root `.easignore` controls the EAS archive; reference inputs, docs, tests, and scripts are excluded while the bundled SQLite database is retained.

## Technology and runtime

The client uses TypeScript, React Native 0.88.1, Expo SDK 58, Expo Router, Expo SQLite, bcryptjs, and Expo device file/document-sharing modules. **Redux is not used**: UI state is managed with React component state and root navigation state; persistent business data is stored in SQLite.

The application is designed to run offline with a bundled SQLite demo database and app-private file storage. Each installation has its own independent local data; there is no backend, cloud database, or cross-device synchronization.

Android application ID: `in.rohanenergy.offline`  
Expo slug: `rohan-energy-offline`  
EAS project ID: `1588b446-83d5-4a51-b162-d97e425ea5c6`  
APK profile: `production-apk`

## Local setup and verification

Prerequisites: Node.js 22 and Python 3.

From `source-code/client/`:

```bash
npm ci --include=dev
npx expo install --check
npm run typecheck
npm run test:domain
npm run test:seed
npm run check:offline
```

The current repository package script includes eight domain/workflow test files (28 tests in the latest recorded report) and 11 SQLite seed/schema tests. See the technical documentation for test scope and known device-level checks.

## Android APK

Inspect the EAS archive without starting a cloud build:

```bash
npx eas-cli build:inspect --platform android --profile production-apk --stage archive --output <temporary-directory-outside-repository> --force
```

Build the APK when ready:

```bash
npx eas-cli build --platform android --profile production-apk
```

The final APK still requires physical-device validation, including airplane-mode operation and inspection of the merged Android manifest. See the [client build instructions](source-code/client/docs/BUILD_INSTRUCTIONS.md) and [release validation report](source-code/client/docs/RELEASE_VALIDATION_REPORT.md).
