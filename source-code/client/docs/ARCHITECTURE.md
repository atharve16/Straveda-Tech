# Architecture (foundation and planned domains)

The client currently has an Expo Router entry and a bundled `expo-sqlite` database. The installed SDK 58 `SQLiteProvider` importer passes `forceOverwrite=false` by default, so its Android native importer is intended to copy the seed on first open and preserve the device copy on later launches. That lifecycle has **not** been verified on a device. Initialization enables foreign keys and checks schema version, four required tables and relationships. A root route error boundary now displays a database startup error and retry; the foundation screen also reports count-query failures. This foundation does not yet expose business screens.

The seed stores original DECIMAL fields as SQLite TEXT to avoid binary floating-point changes at rest. Future services must use a defined decimal calculation and rounding policy, tested against the PHP behavior, before writing totals. The current foundation performs no money calculations. The app has no `client/src/` directory; the offline scanner checks it only if it is added later.

Startup follows the Expo Router `expo-router/entry` → `app/_layout.tsx` → `SQLiteProvider` → `app/index.tsx` path. The app uses the Expo default splash because no custom splash plugin or image is configured. The provider's `Suspense` fallback is a spinner; its error boundary offers retry. The only route is `/`, so no business navigation or fallback route exists yet. These behaviors are source/config review, not an Android launch observation.

Domain services must own authorization and business rules. Repositories must own parameterized SQL. Device adapters must own files, secure storage, Excel, PDFs and sharing. Each installation has independent app-private state and no synchronization. The original PHP files remain read-only references outside `client/`.

## Reset Demo Data design (not implemented)

1. Settings shows a clearly named reset action and requires explicit confirmation.
2. Disable app writes and close all SQLite connections.
3. Copy the bundled seed to a temporary app-private file; verify schema version, counts, integrity and relationships before touching the live database.
4. Move the live database and associated generated-file directory to rollback locations. Replace the database with the verified seed. Keep the rollback copy until final verification succeeds.
5. Reopen SQLite, enable foreign keys and verify seed counts and foreign keys again. Clear SecureStore session and in-memory identity state. Remove the old generated files only after successful verification.
6. Navigate to login. If replacement or verification fails, restore both database and file directory from rollback locations and present an error.

The runtime adapter and UI for this sequence are pending. Resetting tables individually would risk leaving mismatched accounts, orders, MIS rows and files.
