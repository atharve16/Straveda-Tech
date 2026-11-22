# Android APK build instructions

The lockfile specifies Expo SDK 58, React Native 0.88.1, React and React DOM 19.3.0, and TypeScript 6.0.3. The client is a partial portal migration. No APK or AAB has been built or signed.

From `source-code/client/`:

```sh
npm ci --include=dev
npx expo install --check
npm run typecheck
npm run test:domain
npm run test:seed
npm run check:offline
npx eas-cli build:inspect --platform android --profile production-apk --stage archive --output <temporary-directory-outside-repository> --force
```

The Expo slug is `rohan-energy-offline`; EAS project ID is `1588b446-83d5-4a51-b162-d97e425ea5c6`; Android application ID is `in.rohanenergy.offline`. The `production-apk` profile sets `buildType` to `apk`. The project is linked and an Android keystore was created remotely. Keep keystore material and passwords out of Git. The previous cloud build failed during dependency installation because React and React DOM differed; those versions now match locally. No new cloud build has completed.

Release configuration blocks `INTERNET` and `ACCESS_NETWORK_STATE`. The development configuration permits Metro networking. These are configuration checks; merged manifest, APK installation and release cold start remain unverified. `preview` and `production-apk` target APK; `production` targets AAB.

After local verification and when a cloud build is authorized, authenticate with `npx eas-cli login` if needed, then run `npx eas-cli build --platform android --profile production-apk`. After a successful build, inspect the merged manifest, install the APK on a real Android device, and test fresh launch, login, restart persistence and airplane-mode operation. Record actual device results in the testing documentation.

The PHP source and demo-data are optional local reference inputs. Set `STRAVEDA_REFERENCE_SOURCE_DIR` and `STRAVEDA_DEMO_DATA_DIR` if moved outside the repository. APK bundling uses only the committed SQLite asset; it does not regenerate the database.
