# Offline verification

The Phase 1 source scan is `python scripts/check_offline.py`. It searches `app/` and `src/` for URL literals and common network clients. It does not inspect native dependency code, binary assets or generated Android manifests. The web portal's CDN references remain only in the unmodified source kit and are not used by the client.

Release profiles in `app.config.js` block Android `INTERNET` and `ACCESS_NETWORK_STATE` permissions. The development build permits networking for the Expo development server; this does not constitute an offline release test.

**Not yet verified:** a release APK in airplane mode, merged Android manifest permissions, cold start, authentication, order workflow, PDF, Excel, and file viewing. No APK exists yet.

The scan passed again after dependency installation. The app imports the bundled `.db` through `SQLiteProvider.assetSource`, and `metro.config.js` registers `.db` as a Metro asset. Installed `expo-sqlite` SDK 58 source passes `forceOverwrite=false` by default; its Android importer skips copying when the device database file already exists. This supports first-copy and later-preservation behavior by source review, but the bundle and lifecycle still need an Android device test. A SQLite in-memory copy test confirms local changes do not affect the seed; it does not simulate Android storage.

An Android Metro diagnostic export without Hermes bytecode included the database asset with a matching SHA-256. The normal Hermes export failed with `spawn EPERM` in this workspace. Neither export is a device launch or airplane-mode test.
