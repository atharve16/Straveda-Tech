# Build instructions (foundation only)

The Expo foundation dependencies were installed from the available npm cache, and TypeScript passed. Expo SDK 58's offline dependency check expects React Native 0.88.1, while this project pins 0.88.0. The development EAS profile requires `expo-dev-client`, which is not installed. ESLint is not installed. Registry requests currently fail through the environment proxy (`127.0.0.1:9`), so these packages could not be added and validated here. No APK or AAB has been built or signed. The foundation does not yet implement the portal.

With npm registry access, from `client/`:

```sh
npm ci
npx expo install react-native expo-dev-client
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

Static config review: `app.config.js` resolves to Android only, package `in.rohanenergy.offline`, and release `blockedPermissions` includes `INTERNET` and `ACCESS_NETWORK_STATE`. `development` is an internal APK with `developmentClient=true`; `preview` and `production-apk` are APKs; `production` is an AAB. The merged Android manifest and cloud build remain unverified. The development configuration permits networking for Metro, so test offline behavior with a release profile.

A local Android Metro export without Hermes bytecode succeeded and included the SQLite asset with a matching hash. Standard Hermes export failed with `spawn EPERM` when the sandbox prevented launching the compiler. Re-run the normal export and EAS builds in an unrestricted build environment; the diagnostic export is not a substitute for a release build.
