# Architecture (foundation and planned domains)

The client currently has an Expo Router entry and a bundled `expo-sqlite` database. `SQLiteProvider` copies the seed on first open and leaves the device copy intact on later launches. Initialization enables foreign keys and checks schema version, required tables and relationships. This foundation does not yet expose business screens.

Domain services must own authorization and business rules. Repositories must own parameterized SQL. Device adapters must own files, secure storage, Excel, PDFs and sharing. Each installation has independent app-private state and no synchronization. The original PHP files remain read-only references outside `client/`.

## Reset Demo Data design (not implemented)

1. Settings shows a clearly named reset action and requires explicit confirmation.
2. Disable app writes and close all SQLite connections.
3. Copy the bundled seed to a temporary app-private file; verify schema version, counts, integrity and relationships before touching the live database.
4. Move the live database and associated generated-file directory to rollback locations. Replace the database with the verified seed. Keep the rollback copy until final verification succeeds.
5. Reopen SQLite, enable foreign keys and verify seed counts and foreign keys again. Clear SecureStore session and in-memory identity state. Remove the old generated files only after successful verification.
6. Navigate to login. If replacement or verification fails, restore both database and file directory from rollback locations and present an error.

The runtime adapter and UI for this sequence are pending. Resetting tables individually would risk leaving mismatched accounts, orders, MIS rows and files.
