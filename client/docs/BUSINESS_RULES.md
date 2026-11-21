# Verified business rules (source review in progress)

The rules below are source-derived fragments, not a complete contract for the 87 dispatchable actions. Runtime parity is unverified. `config.php`, live `users.php`, and the `mis-data` directory are absent; `config.example.php` and `03-demo-data/users.demo.php` describe a demo setup, not the live portal. No rule inferred from those missing files is treated as verified.

## Authentication and account rules audited in Task 02

The complete 23-route source contracts and 66-helper dependency review are in [AUTHENTICATION_AUDIT_REPORT.md](AUTHENTICATION_AUDIT_REPORT.md). These rules describe PHP behavior; no Android authentication is implemented.

- `auth.php:33-139` has three login tabs. The SAP tab queries `portal_outlet_users` and requires its joined `portal_outlets` row to provide zone and region. The Rohan/HPCL tabs query officer `users.php`: exact username first, then exactly one case-insensitive match. A stored nonempty `org` must match the selected Rohan/HPCL tab; a null-org officer can use either. An omitted/unrecognized tab bypasses that organization comparison in PHP. Legacy plaintext officer credentials are rehashed after a successful match, potentially **before** a later tab mismatch rejects login.
- `auth.php:122-170` creates different officer and outlet sessions. Officer `check` reloads the account but refreshes only columns, hidden pages, organization, regions, level and sales areas; role, label and filter remain cached. Outlet `check` rebuilds all outlet identity/scope fields from the current profile/master join. A missing account or unusable outlet linkage destroys the session. Successful login regenerates the PHP session ID; logout destroys it.
- `auth.php:990-1114` requires `role=zone` plus `org=rohan|hpcl` for an order officer. Explicit `level=regional` distinguishes Regional Officer; older organized zone accounts default to Zone Officer. Rohan super admin manages all officers; HPCL super admin manages HPCL role-zone accounts; a Zone Officer manages only Regional Officers whose `created_by` is that officer. `superLimit()` currently returns `null`, so its management-region restriction is inactive despite older comments.
- `auth.php:226-348,506-640` preserves child relationships. A Zone Officer cannot lose a child region, change away from organized zone role, or be deleted while Regional Officer children remain. Changing the parent Zone Officer's organization carries children to it. Moving a Regional Officer under a new parent changes its organization. Renaming updates username-like columns in every current MySQL table and child `created_by`/password-setter metadata; the SQL commit precedes the officer-file write.
- `auth.php:15,1042-1046` allowlists 18 `hidden_pages` IDs and ignores a self-page edit. `orders.js:216-244,291` uses this field to hide tab buttons; the server's action and data-scope guards are separate. Page hiding does not revoke route access by itself.
- `auth.php:1151-1193`, `outlet-users.php:101-119` store bcrypt hashes plus an optional AES-GCM recoverable view for non-super officer and outlet profiles. Officer hashes use PHP's default bcrypt cost; outlet hashes explicitly use cost 8. Import can return generated passwords in results. The source's generated outlet password is predictable from normalized outlet name and a 1000-row block suffix. No bcrypt compatibility test was run here.
- `auth.php:805-988` keeps outlet profiles separate from the SAP master list. Lookup/add/update validate a linked 6–12-digit SAP number and manager region. Import accepts at most 500 rows per request and commits each slice separately. Outlet profile deletion does not delete the master outlet or orders. `outlet_update` may save a label before rejecting a short password.
- `regions.php:14-201` is the shared 16-sheet-zone, 14-portal-zone, region, sales-area and approval-state mapping. `cleanZones` handles multi-zone subsets; `cleanRegional` requires a region and at least one of its canonical sales areas. Historical district scopes can be converted only when mapping evidence exists; an unmatched restricted district set remains empty.

**Unresolved Android policy:** whether to preserve recoverable password views/generated credentials, officer `check`'s partial refresh, and the two non-atomic source mutation paths. The live `users.php`/`config.php` are absent, so real grants, case collisions, and password-view decryption cannot be verified from the kit. See the report's source-gap section.

## Orders, approval and stock

`orders.php:387` selects the FOC quantity from the matching product rule with the greatest `min_qty` that does not exceed paid EA. Free EA is clamped to at least zero. It is added to paid EA. The supplied database already has `foc_list_v1`, so the legacy FOC conversion in `ordFocMigrate` must not be rerun on the seed.

`orders.php:435` reads `min_order_ea`; missing means zero. `ordStockEnabled` uses `cfg_stock_enabled` if set; otherwise it is enabled only if a stock setting exists. `ordStock` treats an unset product stock as unlimited. Available stock is the last set total minus EA of approved orders decided at or after that stock setting's `updated_at`. Draft, pending and rejected orders consume none. Approval checks remaining stock inside its transaction. This is a calculation from orders, not a mutable decrementing inventory counter.

`ordDecide` accepts only a pending order visible under `ordScope` and eligible under `ordAwaitCond`. A nonempty `seen_updated_at` must still equal the stored value. Rejection requires a comment. Approval records `approved`, sets `delivery_stage='transit'`, records events and calls `ordAutoSteps`. That calls `ordFinalizeSO`, which gives a Sales Order number, conditionally gives a Tax Invoice number, and fills any missing line rate/GST snapshot. `ordGiveNumber` uses the order date's April–March financial year, computes the maximum existing suffix plus one, and retries a uniqueness conflict up to five times.

`ordAwaitCond` has distinct eligibility for Rohan Super Admin, HPCL Super Admin, Rohan Zone Officer, HPCL Zone Officer, HPCL Regional Officer and outlet. A Rohan Regional Officer and outlet cannot decide orders. Creator identity and team membership matter for self and subordinate cases. Approval state limits apply to super admins except their own orders. Eligibility is additionally limited by `ordScope`; implementing the role list alone would grant excessive access.

`ordRetRequest` requires an approved order with `delivery_stage='delivered'`, a reason of at least three characters and nonempty credit note information. Existing pending or approved returns block a new request. `ordRetDecide` requires the configurable return permission, scope and pending status; a nonadmin cannot decide their own request; rejection needs a comment.

## MIS

`misSync` deletes order-sourced rows whose order item no longer belongs to an approved nonhistorical order. It inserts a row for each approved nonhistorical order item without an existing `item_id`, then increments the MIS revision only if rows changed. The unique `item_id` index is part of duplicate prevention. `misAllRows` reads `gone=0` rows under `misScopeSql`, ordered by ID; dashboard and workbook consumers share this table.

## Files and documents

`orders.php` limits POD to 10 MiB and allows PDF, XLS, XLSX, DOC, DOCX and CSV. Receipts additionally allow JPEG and PNG. `ordFileSignature` checks file signatures for each extension. A payment receipt is required before POD upload (`ORD_RECEIPT_REQUIRED`). The offline app needs a local replacement for the original invoice QR URL; this is a documented design conflict with the no-network requirement, and no URL should be generated without an explicit compatible behavior.

## Source gap

`mis-core.php:misPivots` and `mis-xlsx.php` refer to a `mis-data/template.xlsx` workbook, but no such file is present in the supplied kit. Exact pivot-template reproduction requires that asset. This gap must be reported rather than filled with an invented workbook structure.

`mis-xlsx.php:299-370` identifies data sheet `sheet2.xml` with columns A:M, pivot caches 2 and 3, pivot tables 3 through 6, template styles, report sheets and workbook XML references. These are edits to an existing workbook package. The source does not supply the original styles, relationships, pivot layouts or workbook package, so it is insufficient to recreate the template faithfully.

`salesorder.js:327-331` encodes the absolute URL produced by `new URL('invoice.html?t='+o.doc_token, document.baseURI)`. `invoice.html:32` fetches `orders.php?action=public_invoice&t=<token>` and creates a PDF locally from the response. `orders.php:1062-1075` validates a 32-character lowercase hex token, selects an approved generated invoice, and redacts actor and token fields. The server URL and unauthenticated lookup cannot work on a standalone offline installation. Preserve the invoice's identity, line quantities including legacy FOC behavior, tax/financial values, and local authenticity check in a versioned offline QR design; exact payload and privacy policy remain a product decision. No network URL workaround is acceptable.

`mis-core.php:174` also expects `mis-data/seed.json` for its first-use import. The supplied `03-demo-data/json/portal_mis_rows.json` provides seeded rows for SQLite, but the original workbook seed file is absent. `mis-xlsx.php` rewrites the data sheet and pivot parts of the original ZIP package while retaining its styles and relationships; without `template.xlsx`, exact layout, shared strings, formatting, and pivot behavior cannot be compared. Keep Excel parity pending the actual template.

`orders.php:1091-1094` comments that outlet profiles can approve like a regional officer, while `ordAwaitCond` returns an impossible condition for a nonempty outlet SAP. The implemented condition blocks outlet decisions. This source contradiction needs product confirmation before any Android approval service is written. The server router checks CSRF on POST, but per-action method restrictions and any possible GET mutation path still require a complete audit.

## Additional validated details

`ordCheck` derives location and billing fields from the outlet SAP record. It validates date, SAP format (6-12 digits), outlet existence and actor scope, item names and uniqueness, whole paid EA, FOC and total EA, stock, and rate/GST when the admin edits an HPCL order. At submission it enforces at least one item, minimum total EA unless correcting an HPCL order, and configured prices where rate/GST are not explicitly supplied. It reports field-level errors with HTTP 422. The SAP-supplied location fields from the browser are ignored.

`auth.php` has three distinct login tabs. Outlet (`sap`) credentials are checked against `portal_outlet_users`, and the account must still map to an outlet zone/region. Officer usernames match case insensitively only when unambiguous. Officer organization selection is checked after password verification. `check` refreshes current permissions and scope, and invalidates deleted accounts. These behaviors need local equivalents; no authentication exists yet.

The `public_invoice` branch in `orders.php` is a separate unauthenticated action missed by the original 86-action inventory. Its 32-character lowercase hex token must find an approved order eligible for generated invoice display; the response removes private actor and token fields. This route cannot be carried over as a public URL in the offline app.

