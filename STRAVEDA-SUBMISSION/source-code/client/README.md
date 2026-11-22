# STRAVEDA offline Android client

This is an Expo Router / React Native / TypeScript Android client using a bundled SQLite demo database. It has local login, scoped dashboard and MIS views, MIS CRUD and CSV import/export, one-item order drafts and decisions, pending entry decisions, an on-screen summary and activity history. It is a partial migration of the supplied PHP portal. See `docs/IMPLEMENTATION_CHECKLIST.md` for the actual scope.

## Clean checkout

Install Node.js 22 and Python 3. From `client/` run:

```sh
npm ci --legacy-peer-deps
python scripts/source_inventory.py
python -m unittest discover -s tests/database -v
node scripts/verify_demo_hash.cjs
npm run test:domain
npm run typecheck
python scripts/check_offline.py
npx expo start
```

The Android release APK uses the existing `in.rohanenergy.offline` package ID. To build through EAS, authenticate with `npx eas-cli login`, initialize/link the Expo project if prompted, then run `npx eas-cli build --platform android --profile production-apk`. EAS may ask to generate Android signing credentials. Download a successful APK from the build result and inspect/install it on an Android device. No APK is included unless this succeeds.

Technical, testing and user documents are in `docs/`.
