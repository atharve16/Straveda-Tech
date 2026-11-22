# Android APK build instructions

The repository specifies Expo SDK 58, React Native 0.88.1, React and React DOM 19.3.0, and TypeScript 6.0.3. All five implementation phases are complete. The project is verified and ready for cloud APK generation.

## Local verification commands

From `source-code/client/`:

```sh
npm ci --include=dev
npx expo install --check
npm run typecheck
npm run test:domain
npm run test:seed
npm run check:offline
```

All commands must exit cleanly with code 0:
- `npm run typecheck`: Validates TypeScript strict compilation across all screens, components, and domain services.
- `npm run test:domain`: Executes 21 automated integration and unit tests covering authentication, session restoration, multi-line order drafts, stock calculations, approvals, POD, returns, CSV preview/import/export, bulk delete, and password updates.
- `npm run test:seed`: Executes 11 database schema, cascade foreign key, unique index, and demo hash tests.
- `npm run check:offline`: Scans client code for runtime network calls or URLs (verifying 0 occurrences).

## EAS local archive inspection

To verify the bundle without triggering a remote build:

```sh
npx eas-cli build:inspect --platform android --profile production-apk --stage archive --output <temporary-directory-outside-repository> --force
```

Archive inspection confirms:
- 49 non-git project files packaged.
- Reference PHP portal source (`02-web-portal-source`), demo JSON data (`03-demo-data`), documentation, test suites, and caches are excluded via the repository-root `.easignore`.
- Bundled SQLite database (`rohan_energy_demo.db`, 229,376 bytes, SHA-256 `99A1D1154B1343111D4DFD29E568ACB01A85E806CC8C1C0B8DC0DFEC0526004A`) is preserved and packaged.

## Building the Android release APK

The application ID is `in.rohanenergy.offline`, Expo slug is `rohan-energy-offline`, and EAS project ID is `1588b446-83d5-4a51-b162-d97e425ea5c6`.

The `production-apk` profile in `eas.json` specifies:
```json
{
  "production-apk": {
    "android": {
      "buildType": "apk"
    }
  }
}
```

The release configuration in `app.config.js` blocks `android.permission.INTERNET` and `android.permission.ACCESS_NETWORK_STATE`.

When authorized by the user, trigger the cloud APK build by running:
```sh
npx eas-cli build --platform android --profile production-apk
```

> **Note:** The user decides when to run the cloud build. Do not trigger cloud builds automatically.

## Post-build physical device validation checklist

Once EAS builds and delivers the signed APK:
1. **Installation:** Transfer and install the APK on a physical Android device (`adb install app-production-apk.apk`).
2. **Offline Launch:** Switch device to **Airplane Mode** (Wi-Fi and mobile data disabled).
3. **Cold Start:** Open STRAVEDA. Verify that the initial launch initializes the SQLite database and displays the sign-in screen without crash or network timeout.
4. **Login & Session:** Sign in with a demo account (e.g. `demo_super` / `Demo@12345`). Close the app completely, kill the process, and reopen to verify session restoration.
5. **Workflows:** Test order draft creation, approval, MIS CSV export (via Android share), and password change.
6. **Manifest Verification:** Run `aapt dump badging <apk-file>` or unpack the APK to verify that `android.permission.INTERNET` is absent from the merged `AndroidManifest.xml`.
