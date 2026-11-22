# Offline verification and release air-gap audit

This document records the offline compliance, security architecture, and air-gap verification results for the STRAVEDA Android application.

## 1. Static source air-gap audit

The offline verification script `scripts/check_offline.py` inspects all application source code in `source-code/client/app/` and `source-code/client/src/`:

```sh
python scripts/check_offline.py
```

**Verification result:**
- Output: `No runtime network references found in app/ or src/.`
- Audit findings: Zero occurrences of `http://`, `https://`, `fetch(`, `axios`, `XMLHttpRequest`, `WebSocket`, Firebase SDKs, or cloud analytics clients.
- The application runtime communicates exclusively with the local SQLite provider (`expo-sqlite`) and the device private filesystem (`expo-file-system`).

## 2. Release permission blocking

In `source-code/client/app.config.js`, Android permissions are configured as follows:

```javascript
const development =
  process.env.EAS_BUILD_PROFILE === 'development' ||
  (!process.env.EAS_BUILD_PROFILE &&
    process.env.NODE_ENV !== 'production');

module.exports = {
  expo: {
    android: {
      package: 'in.rohanenergy.offline',
      permissions: [],
      blockedPermissions: development
        ? []
        : [
            'android.permission.INTERNET',
            'android.permission.ACCESS_NETWORK_STATE',
          ],
    },
    // ...
  },
};
```

**Configuration audit:**
- In all non-development profiles (including `production-apk`), `android.permission.INTERNET` and `android.permission.ACCESS_NETWORK_STATE` are explicitly blocked.
- Prebuild configuration inspection via `EAS_BUILD_PROFILE="production-apk" npx expo config --type prebuild` verifies that `blockedPermissions` contains both permissions.

## 3. SQLite demo database bundling

The application requires no external database server, cloud instance, or remote sync service:
- Database asset: `source-code/client/assets/database/rohan_energy_demo.db`
- File size: 229,376 bytes (224 KB)
- SHA-256 hash: `99A1D1154B1343111D4DFD29E568ACB01A85E806CC8C1C0B8DC0DFEC0526004A`
- Bundling mechanism: Registered in `metro.config.js` via `config.resolver.assetExts.push('db')`, imported via `require('../assets/database/rohan_energy_demo.db')`, and provided to `SQLiteProvider` via `assetSource`.
- Initialization integrity: `app/_layout.tsx` checks `PRAGMA user_version = 1`, core table counts, and `PRAGMA foreign_key_check` on connection startup before rendering views.

## 4. EAS archive inspection verification

Archive contents were inspected locally using:
```sh
npx eas-cli build:inspect --platform android --profile production-apk --stage archive --output <temp-dir> --force
```

**Audit findings:**
- The archive contains exactly 49 non-git project files.
- All non-runtime reference source files (`source-code/02-web-portal-source/`), demo source JSONs (`source-code/03-demo-data/`), project documentation, tests, and scripts are completely excluded via the root `.easignore`.
- The SQLite database asset is present with an identical SHA-256 hash and file size.
- No network secrets, remote API keys, or web service URLs are packaged into the release archive.

## 5. Tests requiring physical device execution

While static, configuration, and archive inspections pass completely, the following tests cannot be verified in a headless development environment and require a signed APK on a physical Android device:
1. **Merged AndroidManifest.xml verification:** Unpacking the generated APK to verify that `android.permission.INTERNET` does not appear anywhere in the final merged manifest.
2. **Cold launch in Airplane Mode:** Installing the APK on a physical phone, turning on Airplane Mode, and verifying first-launch database initialization and full UI responsiveness.
3. **Hardware restart persistence:** Force-stopping the application, restarting the physical device, and verifying that session and SQLite mutations persist without corruption.
