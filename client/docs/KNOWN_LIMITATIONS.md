# Known limitations and source gaps

- The provided kit has no `mis-data/template.xlsx`, although the PHP MIS export/pivot implementation references it. It also lacks `mis-data/seed.json`, the live `config.php`, and live `users.php`; `config.example.php` and `03-demo-data/users.demo.php` are demo substitutes. Exact live configuration, account grants and workbook reproduction cannot yet be verified.
- The original public Tax Invoice view and QR link assume a server URL. A fully offline equivalent needs a local document behavior and cannot use the original public link.
- The source audit and action mapping are incomplete. The updated inventory includes `public_invoice` and confirms 87 dispatchable actions and 305 declared helpers; `auth.logout` has a complete source contract, while the other 86 actions still need complete input, validation, authorization, scope, reads, writes, transaction, response and Android migration contracts. Helper reachability and server-only disposition are not established.
- Expo dependencies were installed and TypeScript passed, but the SDK expects React Native 0.88.1 rather than pinned 0.88.0. ESLint and `expo-dev-client` could not be installed with the current disabled registry proxy. Expo native/device tests, domain tests, APK and AAB have not been completed.
- PHP-compatible verification of supplied `$2y$` bcrypt hashes against `Demo@12345` remains untested. The hashes were preserved.
- Fully offline security limitations and the readable-password design issue are documented in `SECURITY.md`.
