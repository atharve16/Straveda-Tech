# Known limitations and architectural boundaries

This document defines the functional boundaries, prototype scope, and known architectural constraints of the STRAVEDA offline Android application.

## 1. Account and user administration
- **Fixed account directory:** Account creation, account deletion, user editing, and officer assignment modification remain unavailable. The client authenticates against the committed set of 10 demo officer accounts and 10 outlet accounts.
- **Local self-service password update:** Users can change their own passwords by proving their current password via `ProfileSettingsScreen`. Passwords updated on one device are stored in that device's local SQLite database and do not propagate to any server or other devices.
- **Readable passwords deprecated:** The original PHP portal's server-keyed `pass_view` mechanism is deprecated in the offline client; changing an outlet password sets `pass_view` to `NULL` to prevent plaintext credential exposure.

## 2. Catalog, master data, and pricing
- **Product catalog editing:** Adding, editing, or deleting product lines is unavailable. The catalog is fixed to the products defined in the demo seed.
- **Price and FOC rule editing:** Product wholesale rates (`rate_<pid>`), GST percentages (`gst_<pid>`), and promotional Free-Of-Cost (FOC) thresholds cannot be modified in the app.
- **Stock controls:** Rohan Super Admins can adjust baseline inventory stock and toggle stock enforcement via `InventoryScreen`. Available stock is calculated dynamically (`baseline - SUM(approved order items EA since setting timestamp)`). Other roles have read-only stock views.

## 3. Administrative preview modules
- **Zones & Regions (`zones`):** The zone hierarchy, covered regional offices (ROs), and states are rendered as an audited structural preview. Editing geographic boundaries is unavailable.
- **Team Management (`team`):** Officer directory and reporting relationships are rendered as an audited preview. Role reassignments are unavailable.
- **Outlet Management (`outlets`):** Displays retail outlets mapped to the user's geographic scope from `portal_outlets`. Adding outlets or editing master metadata is unavailable.
- **Permission Matrix (`perms`):** Displays the 18 PAGE_IDS access matrix as an informational audit reference. In the mobile client, domain services enforce access control directly on all queries and mutations.
- **Demo Reset:** The 4-step reset architecture is detailed in `ARCHITECTURE.md` and accessible for review in Settings; an automated in-place database re-flashing routine is not implemented.

## 4. Offline documents and invoice QR
- **Server QR links excluded:** The original web portal embedded a public URL in the invoice QR code pointing to an online server (`invoice.html?t=<token>`). Because STRAVEDA is strictly offline and air-gapped, external server QR URLs are excluded.
- **Document viewer:** Sales orders, tax invoices, and proof of delivery status are rendered in the in-app `DocumentViewerModal` matching the original letterhead layout (`salesorder.js`), with local document numbers and offline signoff.
- **File attachments:** Payment receipts and POD documents (PDF, Office, JPEG, PNG up to 10 MB) are validated by magic byte headers and stored in app-private storage (`order-files/`). Sharing relies on the standard Android OS share sheet (`expo-sharing`).

## 5. Offline environment and multi-device semantics
- **Device isolation:** Each Android installation operates on an independent local SQLite database. Transactions, orders, MIS entries, and status changes on one phone are completely isolated from other devices.
- **Document numbering:** Order references (`RE-ORD-XXXXXX`) and local audit timestamps are generated from the device clock and local autoincrement counters. Uniqueness is guaranteed locally within each device installation.
- **Missing reference kit assets:** The original PHP repository lacked `mis-data/template.xlsx`, `mis-data/seed.json`, and live production database credentials. The committed SQLite demo asset and CSV workflows serve as the standalone offline environment.
