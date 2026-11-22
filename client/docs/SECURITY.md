# Offline security design and limitations

## API source security audit (Task 04)

All 19 API branches are in [API_AUDIT_REPORT.md](API_AUDIT_REPORT.md). These are PHP observations, not Android controls already implemented.

- `api.php:42-85` opens MySQL before session/CSRF validation, has no action-specific method gate, and checks CSRF only for POST. A JSON-body GET can mutate data without this check. Many errors use HTTP 200; uncaught PDO exceptions have no router-wide catch.
- `ro_lookup` and `get_targets` have no session check; the former can expose cross-zone outlet geography and reference-DB error messages. `pending_count` exposes a global count to any session. `ref_lists` checks only that a session exists (`api.php:214-221,249-259,568-677`).
- Direct MIS writes use current `misUser.edit` and `misRowInScope`, but pending submit checks only a session. Pending approval checks non-HPCL Super Admin role, without state, creator, self or geography restrictions. `hidden_pages` is UI state, not a domain guard (`api.php:465-564,679-862`).
- `approvePending` reads a pending row before its transaction without a lock, inserts a MIS row, then updates pending by ID without a status condition or affected-row check. Two approvers may create duplicate MIS rows. `rejectPending` logs and reports success even if no pending row changed. `editPending`/`deletePending` have SELECT–write races and no audit history (`api.php:745-862`).
- `logAudit` catches and discards failures, so audit rows are not guaranteed. It logs free-form details after mutations and records no structured old/new values or IP. Pending edit/delete are absent. `audit_log.limit` has no bound; `save_note` can succeed for a nonexistent MIS row (`api.php:185-235`).
- `importData` has no server row/payload cap or duplicate check, and returns raw SQL exception text. Target saves accept arbitrary month/type/value and integer-cast negative volume; target reads are public (`api.php:249-279,529-564`).

The future local service needs explicit actor checks, scoped reads/writes and atomic pending transitions. Differences from PHP's weak guards or partial audit behavior require a recorded product/security decision and regression tests. Missing live configuration, officer roster, pending table and reference DB prevent runtime parity verification.

## Orders source security audit (Task 03)

The 37 action contracts are in [ORDERS_AUDIT_REPORT.md](ORDERS_AUDIT_REPORT.md). These observations are PHP source behavior, not Android controls already built.

- **Method and CSRF.** `orders.php:1049-1094` has no method allowlist. It checks the session CSRF token only for POST; JSON-body GET mutation reaches the same dispatcher without that check. `public_invoice` runs before sign-in/CSRF and relies on its random 32-hex token. The browser uses GET/POST conventions, but the PHP router does not enforce them.
- **Identity and scope.** `ordUser()` reloads current officer data or outlet profile/master linkage on each ordinary call. `ordScope()` is a query filter; `ordAwaitCond()` is a separate decision predicate. Approval requires both, pending status and optional `seen_updated_at` equality. Omitting the stale timestamp skips that check. `hidden_pages` has no domain-authorization effect. Executable `ordAwaitCond` denies outlet decisions despite a contradictory router comment (`orders.php:532-637,789-810,3013-3068`).
- **Stock and decisions.** Approval locks its O row and existing `stock_%` S rows before recomputing available stock; unset stock has no setting row to lock. Stock is SUM of approved item EA since each setting timestamp, not a mutable decrement. Concurrent first return requests have no existing R row to lock and no declared unique pending-request constraint (`orders.php:498-519,2930-2955,3013-3068`). These concurrency edges need local tests and a deliberate transaction policy.
- **Files.** Upload validates extension and leading bytes, checks size/role/order scope/stage, generates a random stored name and keeps bytes under `pod-files`. Download rechecks `ordLoad` scope, invoice visibility and file existence; response uses `nosniff`, CSP sandbox and sanitized filename. The file move occurs before SQL commit, so a process crash can leave an orphan. File headers are a limited content check, not complete document parsing (`orders.php:1443-1655`).
- **SAP and logs.** `sap_save` renames a master SAP and moves its OL history but does not update OU login profiles or old O snapshots. `sap_import remove` deletes missing OUT rows and matching OU profiles, despite an earlier no-deletion comment. `sap_import` exposes a caught SQL error message in one 500 response. `change_log area=mis` calls `chgFetch` without a dedicated MIS scope check in this orders route (`orders.php:1789-2043`).
- **Invoice privacy.** The PDF QR encodes an absolute public `invoice.html?t=<doc_token>` URL. A bearer of that token can fetch the redacted invoice without login; the route strips some actor/token fields but still returns invoice/order data. The offline QR payload, integrity/authenticity, privacy and cross-installation semantics need a product/security decision. No offline format is implemented (`orders.php:1062-1078`, `invoice.html:30-50`, `salesorder.js:327-331`).
- **Atomicity and legacy writes.** `set_prices`, `set_perms`, `set_stock`, `delete_product` perform multiple SQL writes without one transaction. `ordGet` and `ordEnsureSchema` can write on a GET through legacy repairs and numbering. `ordGiveNumber` retries unique collisions but does not check that its conditional UPDATE changed a row (`orders.php:135-350,1192-1285,1411-1442,2528-2545`).

Future Android operations must enforce actor/scope locally and use SQLite transactions plus app-private files. Any change from the PHP's partial-write or read-time behavior must be recorded as an explicit parity decision and tested. The missing live `config.php`, `users.php` and production database prevent runtime security verification here.

## Source behavior to preserve

The full authentication route and helper evidence is in [AUTHENTICATION_AUDIT_REPORT.md](AUTHENTICATION_AUDIT_REPORT.md). Verified PHP behavior includes the following concerns; they are not already implemented on Android:

- Officer login uses `$2y$` bcrypt verification or strict legacy plaintext equality. A successful plaintext match can rehash/write the officer file before an organization-tab mismatch rejects the login (`auth.php:84-120`). Outlet passwords use bcrypt cost 8; new officer hashes use PHP's default bcrypt cost. The seed hashes have **not** been verified against a password in a compatible implementation.
- `passSeal()` keeps an optional decryptable AES-256-GCM password copy for non-super officers and outlet profiles, using a key derived from server database credentials. `list_users` may return it to a managing superior; `outlet_list` returns it to an authorized outlet manager; import results may expose newly generated credentials. The live config/key is absent. These exposure paths need an explicit product/security decision before migration.
- `auth.php` creates a CSRF token and returns it on login/check, but does not verify it for officer account mutations. Only outlet-profile routes call `outletActor()` and require body CSRF. The router has no method restriction, so a JSON-body GET can reach mutations without the POST user-file lock. This is a source security gap; future local authorization should not silently assume PHP had stronger guards.
- `usersLock()` is best effort, `usersWrite()` has a non-atomic in-place fallback, `renameUser()` commits SQL before the officer-file save, and `outlet_update` may save a label before rejecting a short password. A local SQLite transaction can remove partial-write risk, but parity deviations must be recorded and tested.
- Officer `check` refreshes `hidden_cols,hidden_pages,org,ros,level,sales_areas` only, leaving `role,label,filter` cached. Outlet `check` rebuilds all identity fields from the current profile/master join and invalidates deleted/unlinked accounts. A deleted officer is invalidated on check. The Android refresh policy must be chosen explicitly.

`auth.php` checks outlet passwords with PHP `password_verify` and requires the SAP tab. It rejects outlet accounts that lack a usable zone or region. Officer login accepts an unambiguous case-insensitive username match and enforces the selected organization tab. `check` refreshes account permissions from storage and invalidates deleted accounts. These checks must be recreated in the local authentication service, including after role switching.

The portal has a *readable password* feature: `passSeal` encrypts a second copy using AES-256-GCM, while login uses bcrypt. `canViewPassword` limits who can read that copy. The server key derives from database credentials (`auth.php:1151–1192`). A device app has no server-held secret. The Android implementation must use a random Android Keystore protected key for any readable copy, and must enforce the original viewer rule in its domain service. The seed's `pass_view` fields are empty. Passwords must never be logged or stored in React state longer than needed to submit a form.

## Required Android controls (implementation pending)

| Area | Design requirement |
|---|---|
| Session | Persist only an opaque local identity marker in SecureStore. Re-read the account, outlet linkage, hidden pages and scope from SQLite on each app launch and identity switch. Clear navigation and cached data on logout or switch. |
| Passwords | Verify supplied PHP `$2y$` bcrypt hashes with a compatibility-tested local library. Store new passwords as bcrypt hashes. Never persist plaintext form input. |
| Storage | Keep SQLite, uploaded files and generated documents in app-private storage. Permit export only through an explicit Android share or document action. |
| SQL | Parameterize values. Allow dynamic table or column names only through fixed application allowlists. Enable `PRAGMA foreign_keys=ON` on every connection. |
| Transactions | Use one write transaction for multi-table changes, including approval, MIS synchronization, import and reset. Serialize concurrent writes and check affected row counts. |
| Authorization | Check scope and action eligibility in domain services before each read or mutation. Page visibility alone grants no access. Re-evaluate permissions after account changes and role switches. |
| Files | Restrict file kinds and size by the original `orders.php` rules; inspect file signatures; generate storage names internally; prevent path traversal; keep display names separate from paths. |
| Errors | Return actionable validation errors, while avoiding password, hash, key, raw SQL, file path or stack trace disclosure to the user. |
| Keys | Generate any encryption key on the device and protect it with Android Keystore. Do not place a reusable key in the JavaScript bundle or repository. |

## Limits of an entirely offline app

- The APK necessarily contains the demo database and account hashes. Anyone with the APK can extract these demo records and attempt offline password guessing. The shared demo password is public and must never be used with real data.
- A user who controls a rooted device or can tamper with the application binary/database can bypass local authorization. No server can independently enforce access or revoke a copied installation.
- Each installation has independent users, permissions, orders and files. Password changes and account deletion on one phone do not affect another phone.
- Android private storage and Keystore reduce ordinary data exposure, but cannot guarantee secrecy on a compromised, unlocked or backed-up device. Exported PDFs and workbooks leave app-private storage and are governed by the destination app.
- Local timestamps and document numbers depend on the device clock and database. Without synchronization, separate installations can produce the same document number; uniqueness can be guaranteed only within one installation.
- A local QR code cannot reproduce the original server-hosted public invoice link while honoring the no-network rule. Its offline behavior must be specified and verified before release.

## Current verification status

The generated seed passes SQLite integrity, foreign-key and relationship tests. Officer bcrypt hashes have only been checked for format, not verified against the demo password. No Android session, Keystore, authorization, file, or network tests have run yet.
