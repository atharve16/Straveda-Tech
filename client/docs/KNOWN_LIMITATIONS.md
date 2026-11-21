# Known limitations and source gaps

- The provided kit has no `mis-data/template.xlsx`, although the PHP MIS export/pivot implementation references it. Exact workbook reproduction cannot yet be verified.
- The original public Tax Invoice view and QR link assume a server URL. A fully offline equivalent needs a local document behavior and cannot use the original public link.
- The source audit and action mapping are incomplete. The inventory missed the early `public_invoice` action, so at least 87 actions require review. Most actions still lack full input, validation, authorization, scope, reads, writes, transition, return, error and test contracts.
- Expo dependencies were installed and TypeScript passed, but the SDK expects React Native 0.88.1 rather than pinned 0.88.0. ESLint and `expo-dev-client` could not be installed with the current disabled registry proxy. Expo native/device tests, domain tests, APK and AAB have not been completed.
- PHP-compatible verification of supplied `$2y$` bcrypt hashes against `Demo@12345` remains untested. The hashes were preserved.
- Fully offline security limitations and the readable-password design issue are documented in `SECURITY.md`.
