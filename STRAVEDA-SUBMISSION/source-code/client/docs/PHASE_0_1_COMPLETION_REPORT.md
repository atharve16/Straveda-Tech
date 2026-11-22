# Phase 0 and Phase 1 verification report — 2026-11-22

**Gate result: neither phase is complete.** The source inventory and host-side Android foundation checks advanced, but the full PHP behavior audit, compatible React Native installation, and actual Android launch/restart tests remain open. No authentication or business workflow was implemented. The supplied PHP portal and demo data were not changed.

## Work completed

- Fixed the read-only source inventory count to include the early `orders.public_invoice` route. The inventory reports 87 PHP actions and 305 declared PHP functions. `auth.logout` now has a complete source contract and `AUDITED` status; the other 86 actions and all 305 helpers are explicitly `NEEDS_CLARIFICATION`. Selected previously reviewed contracts remain partial.
- Reviewed the PHP route structure, included files, JavaScript callers, MIS workbook references, invoice QR construction, SQLite seed builder, offline scanner, Expo configuration, and installed Expo SDK compatibility table. Documented the missing source assets and the conflict between the outlet approval comment and executable guard.
- Added a root Expo Router error boundary for database startup errors. The existing foundation screen already reports count-query errors. No domain service, login, or workflow was added.
- Regenerated the bundled SQLite seed, ran its tests, typechecked the client, ran the static offline scanner, and resolved production Expo config. The regenerated DB SHA-256 is unchanged: `99A1D1154B1343111D4DFD29E568ACB01A85E806CC8C1C0B8DC0DFEC0526004A`.

## PHP audit statistics and remaining work

| Measure | Verified result |
|---|---:|
| Dispatchable action routes | 87: auth 23, orders 37, api 19, mis 8 |
| Actions with complete required contract | 1 (`auth.logout`) |
| Actions still pending complete audit | 86 |
| Declared PHP helper functions | 305, including 25 in NUL-containing `mis-xlsx.php` |
| Relevant helpers with complete required contract | 0 |
| Confirmed dead actions or unused helpers | 0 confirmed; helper reachability is not yet established |
| Helpers requiring migration | Unknown until call graph and server-only disposition are reviewed |

The route/function tables are inventories, not evidence of full behavioral review except for the separately documented `auth.logout` contract. `config.php` and live `users.php` are absent; demo examples exist. `mis-data/seed.json` and `mis-data/template.xlsx` are absent. The missing workbook prevents verification of exact sheet layout, styles, relationships, shared strings, and pivot formatting. The invoice QR currently encodes a server URL to `invoice.html?t=<token>`; an offline invoice identity and verification format needs a product decision. The `orders.php` outlet approval comment conflicts with `ordAwaitCond`, which blocks outlet decisions. Per-action method/CSRF, scope, SQL, transactions, response and Android parity mapping remain to be documented for the other 86 actions, as do all helper call graphs and dispositions.

## Technical foundation results

| Area | Result |
|---|---|
| Expo compatibility | Installed Expo 58.0.26 expects React Native 0.88.1; package and lockfile pin 0.88.0. Offline npm query for 0.88.1 returned `ENOTCACHED`. No speculative package edit was made. React 19.3.0, Router 58.0.32, SQLite 58.0.18, and TypeScript 5.9.3 are present in the lockfile. |
| TypeScript | `npm run typecheck` passed after the error boundary edit. |
| SQLite | Builder passed; 9 database tests passed; seed data, integrity, foreign keys, indexes, cascade and decimal TEXT storage are covered on the host. Installed provider source defaults `forceOverwrite` to false. Actual Android first copy and persistence after restart are untested. |
| Static offline check | Passed. `check_offline.py` covers the existing `app/` and a future `src/`; the latter does not exist. Production config blocks `INTERNET` and `ACCESS_NETWORK_STATE`. Airplane-mode operation and merged manifest remain untested. |
| Android build readiness | EAS profiles target development APK, preview APK, production APK, and production AAB. `expo-dev-client` is absent for the development profile. No EAS login/project link, cloud build, signing, APK installation, AAB, or device test was completed. Android Studio is not required for the planned EAS cloud build. |

## Commands run and actual results

From `client/`: `python scripts/source_inventory.py` (87/305), `python scripts/build_demo_db.py` (exit 0), `python -m unittest discover -s tests/database -v` (9 passed), `npm run typecheck` (exit 0), `python scripts/check_offline.py` (exit 0), `EXPO_OFFLINE=1 npx expo install --check` (exit 1: React Native mismatch), `npm view react-native@0.88.1 dist.tarball --offline` (exit 1: `ENOTCACHED`), and `EAS_BUILD_PROFILE=production NODE_ENV=production npx expo config --json` (Android-only package and blocked release network permissions resolved). See `TEST_REPORT.md` for the earlier Metro diagnostic and its limits.

## Files changed

- `client/app/_layout.tsx`
- `client/scripts/source_inventory.py`
- `client/docs/SOURCE_CODE_AUDIT.md`
- `client/docs/BUSINESS_RULES.md`
- `client/docs/PHP_TO_TYPESCRIPT_MAPPING.md`
- `client/docs/ROLE_PERMISSION_MATRIX.md`
- `client/docs/ARCHITECTURE.md`
- `client/docs/BUILD_INSTRUCTIONS.md`
- `client/docs/OFFLINE_VERIFICATION.md`
- `client/docs/TEST_REPORT.md`
- `client/docs/MODULE_IMPLEMENTATION_STATUS.md`
- `client/docs/README.md`
- `client/docs/KNOWN_LIMITATIONS.md`
- `client/docs/PHASE_0_1_COMPLETION_REPORT.md`

## Exact next task

Complete the per-action and per-helper PHP audit in the existing mapping documents, obtaining the missing live source and workbook if exact parity is required. Resolve the outlet approval and offline invoice QR contract. Then obtain registry access to install the Expo-compatible React Native version and `expo-dev-client`, verify PHP bcrypt against the demo hashes, and run an EAS Android build with first-launch, restart-persistence, merged-manifest and airplane-mode tests. Start Phase 2 only after the Phase 0/1 gates are satisfied.
