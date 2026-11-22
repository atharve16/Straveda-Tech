# Build instructions (foundation only)

The installed Expo SDK 58 tooling (`node_modules/expo/bundledNativeModules.json`) and `EXPO_OFFLINE=1 npx expo install --check` expect React Native 0.88.1. `package.json` and the lockfile pin 0.88.0. `npm view react-native@0.88.1 dist.tarball --offline` returned `ENOTCACHED`, so the compatible release could not be installed without registry access; package files were not changed speculatively. The development EAS profile requires `expo-dev-client`, which is absent. ESLint is absent. No APK or AAB has been built or signed. The foundation does not yet implement the portal.

With npm registry access and an Expo/EAS account, from `client/`:

```sh
npm ci
npx expo install react-native@0.88.1 expo-dev-client
npm install --save-dev eslint eslint-config-expo
npx expo install --check
npm run typecheck
npx eslint app --ext .tsx
python scripts/build_demo_db.py
python -m unittest discover -s tests/database -v
npm run check:offline
npx eas-cli login
npx eas-cli build --platform android --profile development
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform android --profile production-apk
npx eas-cli build --platform android --profile production
```

EAS will ask for Android signing credentials on the first build; let EAS generate and store them securely or supply an existing keystore through its credential flow. Do not commit keystore files or passwords. `preview` and `production-apk` target APK; `production` targets AAB. This configuration has not yet been validated by an actual cloud build. Expo's [APK documentation](https://docs.expo.dev/build-reference/apk/) and [EAS configuration documentation](https://docs.expo.dev/build/eas-json/) describe these profile settings.

`EAS_BUILD_PROFILE=production NODE_ENV=production npx expo config --json` resolved Android only, package `in.rohanenergy.offline`, no requested Android permissions, and blocked `INTERNET` and `ACCESS_NETWORK_STATE`. The development configuration permits Metro networking. `development` is an internal APK profile with `developmentClient=true`; `preview` and `production-apk` are APK profiles; `production` is an AAB profile. These are configuration checks only: the merged manifest, EAS account/project linkage, signing credentials, cloud build, APK installation, and release cold start remain unverified. Android Studio is not required for the EAS cloud workflow.

A local Android Metro export without Hermes bytecode succeeded and included the SQLite asset with a matching hash. Standard Hermes export failed with `spawn EPERM` when the sandbox prevented launching the compiler. Re-run the normal export and EAS builds in an unrestricted build environment; the diagnostic export is not a substitute for a release build.
