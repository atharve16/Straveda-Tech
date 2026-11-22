# STRAVEDA offline Android client

This is an Expo Router / React Native / TypeScript Android client using a bundled SQLite demo database. It has local login, scoped dashboard and MIS views, MIS CRUD and CSV import/export, one-item order drafts and decisions, pending entry decisions, an on-screen summary and activity history. It is a partial migration of the supplied PHP portal. See `docs/IMPLEMENTATION_CHECKLIST.md` for the actual scope.

## Clean checkout

Install Node.js 22 and Python 3. From `client/` run:

```sh
npm ci --include=dev
npx expo install --check
python scripts/source_inventory.py
python -m unittest discover -s tests/database -v
node scripts/verify_demo_hash.cjs
npm run test:domain
npm run typecheck
python scripts/check_offline.py
npx expo start
```

The Android application ID is `in.rohanenergy.offline`; Expo slug is `rohan-energy-offline`; EAS project ID is `1588b446-83d5-4a51-b162-d97e425ea5c6`. The `production-apk` profile produces an APK after a successful cloud build. A remote keystore was created, but the previous build failed during dependency installation. No signed APK exists yet. The repository-root `.easignore` governs archive exclusions.

Reference inputs default to `../02-web-portal-source/` and `../03-demo-data/`. If moved outside the repository, set `STRAVEDA_REFERENCE_SOURCE_DIR` and `STRAVEDA_DEMO_DATA_DIR` to their directories. They are needed for local inventory and seed comparison, not APK bundling. Do not run `scripts/build_demo_db.py` unless you intend to regenerate the committed SQLite asset.

Inspect the archive locally before another build: `npx eas-cli build:inspect --platform android --profile production-apk --stage archive --output <temporary-directory-outside-repository> --force`. See `docs/BUILD_INSTRUCTIONS.md` for release and device checks.

Technical, testing and user documents are in `docs/`.
