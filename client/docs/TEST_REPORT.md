# Test report

## Recheck on 2026-11-22

| Command (from `client/`) | Actual result |
|---|---|
| `python scripts/source_inventory.py` | Exit 0; 87 actions, 305 helpers inventoried (including `public_invoice`) |
| `python scripts/build_demo_db.py` | Exit 0; 12 supplied portal JSON tables loaded, 10 officer accounts, foreign-key check OK; bundled DB SHA-256 `99A1D1154B1343111D4DFD29E568ACB01A85E806CC8C1C0B8DC0DFEC0526004A`, unchanged |
| `python -m unittest discover -s tests/database -v` | Exit 0; 9 tests passed |
| `npm run typecheck` | Exit 0 after adding the root route error boundary |
| `python scripts/check_offline.py` | Exit 0; no runtime network references in scanned source (`app/` exists; `src/` does not) |
| `EXPO_OFFLINE=1 npx expo install --check` | Exit 1; React Native 0.88.0 is installed/pinned; SDK 58 expects 0.88.1 |
| `npm view react-native@0.88.1 dist.tarball --offline` | Exit 1, `ENOTCACHED`; compatible package cannot be installed from local npm cache |
| `EAS_BUILD_PROFILE=production NODE_ENV=production npx expo config --json` | Resolved SDK 58, Android-only, package `in.rohanenergy.offline`, blocked release network permissions |

No Android binary was built or installed in this recheck. The database seed and SQLite constraints were tested on the host; Android first launch, restart persistence, merged manifest and airplane-mode behavior remain unverified. This is why Phase 1 is not complete.

## Earlier foundation checks

Run: `python -m unittest discover -s tests/database -v`, `npm run typecheck`, `python scripts/check_offline.py`, Expo offline dependency check and Expo public configuration.

Result: **9 database seed tests passed**. They check source JSON row counts and values, SQLite integrity, foreign keys, source relationships, FOC uniqueness, original columns/indexes/cascade constraints, decimal TEXT declarations, isolated copy behavior, hash format and empty outlet `pass_view`. TypeScript typecheck passed. The offline source scan passed. Expo public config resolved Android-only platform and `in.rohanenergy.offline`. `EXPO_OFFLINE=1 npx expo install --check` reported React Native 0.88.0 while SDK 58 expects 0.88.1. Online check failed through the environment's disabled proxy. ESLint could not run because it is not installed and the registry could not be reached. A development client dependency is also absent.

These checks do **not** verify PHP-compatible bcrypt passwords, domain logic, Android first-launch behavior, PDF/Excel output, a release manifest, or airplane-mode operation.

Metro diagnostic: `EXPO_OFFLINE=1 npx expo export --platform android --no-bytecode --max-workers 1 --output-dir .expo-export-check` bundled 1,157 modules and included the 229,376-byte SQLite asset. The exported asset's SHA-256 matched the source seed (`99A1D1154B1343111D4DFD29E568ACB01A85E806CC8C1C0B8DC0DFEC0526004A`). The normal Hermes export reached bundling but failed when this environment denied spawning the bytecode compiler (`EPERM`); no release bundle or APK was verified.


