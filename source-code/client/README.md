# STRAVEDA offline Android client

This is an Expo Router / React Native / TypeScript Android client using a bundled SQLite demo database (`rohan_energy_demo.db`). All five implementation phases are complete, providing:
- Local offline authentication with PHP `$2y$` bcrypt compatibility and persistent session restoration across restarts.
- Scoped Dashboard, KPI metrics, and local device audit trail.
- Multi-item order drafts, pricing and FOC tier calculations, approvals, proof of delivery (POD) attachments, and return requests.
- Scoped MIS management with detailed CSV preview/import, atomic commit, export sharing, and transactional bulk deletion.
- Inventory tracking, baseline stock constraints, and Super Admin stock toggles.
- User profile management with self-service password changes proving current credentials.
- In-app document viewer for Sales Order vouchers and Tax Invoices (matching portal layout without external network links).

## Clean checkout & verification

Install Node.js 22 and Python 3. From `source-code/client/` run:

```sh
npm ci --include=dev
npx expo install --check
npm run typecheck
npm run test:domain
npm run test:seed
npm run check:offline
```

The Android application ID is `in.rohanenergy.offline`; Expo slug is `rohan-energy-offline`; EAS project ID is `1588b446-83d5-4a51-b162-d97e425ea5c6`.

## EAS Archive Inspection & Cloud Build

The EAS archive inspection has passed locally:
```sh
npx eas-cli build:inspect --platform android --profile production-apk --stage archive --output <temporary-directory-outside-repository> --force
```
Archive validation confirms that all reference PHP sources, demo data JSONs, documentation, tests, and caches are excluded, while the application source, assets, and 229 KB SQLite database are packaged.

When authorized, the cloud APK build can be started with:
```sh
npx eas-cli build --platform android --profile production-apk
```

Technical architecture, testing logs, and validation details are located in `docs/`:
- `docs/RELEASE_VALIDATION_REPORT.md` — Comprehensive release validation audit and readiness checklist.
- `docs/BUILD_INSTRUCTIONS.md` — APK build and on-device testing guide.
- `docs/MODULE_IMPLEMENTATION_STATUS.md` — Complete module-by-module implementation matrix.
- `docs/KNOWN_LIMITATIONS.md` — Verified architectural boundaries and prototype limits.
- `docs/OFFLINE_VERIFICATION.md` — Air-gap analysis and permission enforcement.
- `docs/TESTING_DOCUMENTATION.md` — Automated test results and physical device test procedures.
