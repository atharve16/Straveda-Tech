# Verified business rules (source review in progress)

The rules below are source-derived. Runtime parity and the complete 87-action audit remain unverified.

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

`salesorder.js:327-331` encodes a URL built from `invoice.html?t=<doc_token>` and the portal base URI. For an offline app, use a QR with a versioned, self-contained invoice summary and a digest that can be compared with the locally opened invoice. Include document type/number, order reference/date, outlet SAP, line quantities including FOC, totals and a local record identifier. This is a proposed new offline format, not verified portal behavior; exact fields and privacy treatment require product approval before implementation. Do not encode a web URL.

## Additional validated details

`ordCheck` derives location and billing fields from the outlet SAP record. It validates date, SAP format (6-12 digits), outlet existence and actor scope, item names and uniqueness, whole paid EA, FOC and total EA, stock, and rate/GST when the admin edits an HPCL order. At submission it enforces at least one item, minimum total EA unless correcting an HPCL order, and configured prices where rate/GST are not explicitly supplied. It reports field-level errors with HTTP 422. The SAP-supplied location fields from the browser are ignored.

`auth.php` has three distinct login tabs. Outlet (`sap`) credentials are checked against `portal_outlet_users`, and the account must still map to an outlet zone/region. Officer usernames match case insensitively only when unambiguous. Officer organization selection is checked after password verification. `check` refreshes current permissions and scope, and invalidates deleted accounts. These behaviors need local equivalents; no authentication exists yet.

The `public_invoice` branch in `orders.php` is a separate unauthenticated action missed by the original 86-action inventory. Its 32-character lowercase hex token must find an approved order eligible for generated invoice display; the response removes private actor and token fields. This route cannot be carried over as a public URL in the offline app.

