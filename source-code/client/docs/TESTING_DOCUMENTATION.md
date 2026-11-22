# STRAVEDA testing documentation

## Environment and automated results

Verification was run on Windows with Node.js 22, Python 3 and the installed Expo SDK 58 dependencies on 22 November 2026. `python scripts/source_inventory.py` reported 87 actions and 305 helpers. `python -m unittest discover -s tests/database -v` passed 11/11 database tests, including seed schema, source values, independent-copy preservation, app pending uniqueness and order insert schema. `node scripts/verify_demo_hash.cjs` passed correct and incorrect password checks against the demo bcrypt hash. `npm run test:domain` passed five geography, permission, date and CSV tests. `npm run typecheck` passed. `python scripts/check_offline.py` found no runtime network references in `app/` or `src/`. `EXPO_OFFLINE=1 npx expo install --check` reported dependencies up to date, with its own offline reliability warning. `EXPO_OFFLINE=1 npx expo export --platform android --output-dir .expo-export-check` succeeded with Hermes bytecode and the 229 KB SQLite asset. These are source and host checks, not device proof.

## Manual test cases for Android

| Case | Expected result | Actual status |
|---|---|---|
| Fresh install and first launch | Seed copied, schema checked, login shown | Not performed on device |
| Correct/wrong officer and outlet login | Correct organization and password required | Bcrypt hash unit check only; UI not device tested |
| Restricted role and geography | Rows and actions limited to account scope | Source reviewed; device test pending |
| Add MIS and restart | Row remains after restart | Device test pending |
| Submit same pending row twice | Active duplicate rejected | Unique SQLite index added; device test pending |
| Approve/reject pending twice | One decision and at most one MIS row | Transaction and status predicate implemented; device test pending |
| Create, submit and approve order | Snapshot, minimum/price, stock, event and MIS projection handled | Order insert SQL tested; device test pending |
| MIS CSV import/export | Valid scoped rows imported atomically; exported file shareable | Parser tests passed; Android file flow pending |
| Airplane mode cold start | App opens and local actions work | Not performed |
| Merged Android manifest | No runtime network permissions | Not available until APK build |

## Android installation and offline verification

No APK was available when this document was written. `npx eas-cli whoami` returned `Not logged in`, so the cloud build could not start without the owner's Expo account authentication. An Android device installation, database reopen and airplane-mode test have not been performed. The app has no runtime network calls by source scan and release config blocks the two usual network permissions, but only a finished APK and merged manifest can prove the release state.

## Known limitations and tests not performed

Full portal parity, MIS workbook import/bulk delete, multi-line order editing, delivery/PDF/return flows, products/stock editing and account management are incomplete. No device UI test suite exists. No production APK, instrumented Android test, hardware startup test, persistence restart test, release permission inspection or runtime network capture was completed. The source has a local transaction design for critical actions, but those actions need Android integration testing before being claimed as validated.
