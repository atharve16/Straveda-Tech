# Test report

Run: `python -m unittest discover -s tests/database -v`, `npm run typecheck`, `python scripts/check_offline.py`, Expo offline dependency check and Expo public configuration.

Result: **9 database seed tests passed**. They check source JSON row counts and values, SQLite integrity, foreign keys, source relationships, FOC uniqueness, original columns/indexes/cascade constraints, decimal TEXT declarations, isolated copy behavior, hash format and empty outlet `pass_view`. TypeScript typecheck passed. The offline source scan passed. Expo public config resolved Android-only platform and `in.rohanenergy.offline`. `EXPO_OFFLINE=1 npx expo install --check` reported React Native 0.88.0 while SDK 58 expects 0.88.1. Online check failed through the environment's disabled proxy. ESLint could not run because it is not installed and the registry could not be reached. A development client dependency is also absent.

These checks do **not** verify PHP-compatible bcrypt passwords, domain logic, Android first-launch behavior, PDF/Excel output, a release manifest, or airplane-mode operation.

Metro diagnostic: `EXPO_OFFLINE=1 npx expo export --platform android --no-bytecode --max-workers 1 --output-dir .expo-export-check` bundled 1,157 modules and included the 229,376-byte SQLite asset. The exported asset's SHA-256 matched the source seed (`99A1D1154B1343111D4DFD29E568ACB01A85E806CC8C1C0B8DC0DFEC0526004A`). The normal Hermes export reached bundling but failed when this environment denied spawning the bytecode compiler (`EPERM`); no release bundle or APK was verified.


