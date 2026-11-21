# Offline security design and limitations

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
