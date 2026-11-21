# Rohan Energy Order & MIS Portal — Developer Kit (offline Android app)

You are asked to build a **fully offline, standalone Android app** that reproduces the web portal in this kit.
No server, no internet, no connection to any live website. Everything (accounts, orders, MIS, files) lives on the phone.
All data in this kit is **fake demo data**.

## 1. What is in this kit

| Folder | Contents |
|---|---|
| `02-web-portal-source/` | The complete working web portal (PHP backend + HTML/JS/CSS front end). **This is the specification**: screens to copy, business rules to port. |
| `03-demo-data/` | Fake data: `schema.sql` (final table layout), `demo-data.sql` and `json/*.json` (same data, one file per table), `users.demo.php` / `json/users.json` (demo accounts). |
| `04-MESSAGE-TO-DEVELOPER.md` | The written brief (requirements, deliverables). |

## 2. Demo logins (password for every account: `Demo@12345`)

The sign-in screen has three tabs. A user can only sign in on the tab of their organisation.

| Tab | Username | Role |
|---|---|---|
| Rohan Energy | `demo_super` | Super Admin: all zones, users, prices, stock, FOC, SAP numbers, MIS editing, permissions |
| HPCL | `demo_hpcl_super` | HPCL Super Admin |
| Rohan Energy | `demo_rohan_zo` | Zone Officer, Central Zone (Indore + Bhopal regions); creates Regional Officers |
| Rohan Energy | `demo_rohan_ro` | Regional Officer, Indore region (4 sales areas) |
| Rohan Energy | `demo_rohan_ro2` | Regional Officer, Bhopal region (3 sales areas) |
| Rohan Energy | `demo_rohan_zo_up` | Zone Officer, North Central Retail (Kanpur region) |
| HPCL | `demo_hpcl_zo` | HPCL Zonal Coordinator (Level 3) |
| HPCL | `demo_hpcl_rm` | HPCL Regional Manager (Level 2), Indore region |
| HPCL | `demo_hpcl_so` | HPCL Sales Officer (Level 1), Indore-1 / Indore-2 sales areas |
| HPCL | `demo_hpcl_l4` | HPCL Level 4 officer (all demo zones) |
| Outlet (SAP No.) | `90000001` … `90000010` | Outlet login: SAP number + password |

## 3. How the portal works (summary)

* **Hierarchy:** Super Admin > Zone Officer > Regional Officer (Rohan side); HPCL has its own Super Admin, Zonal Coordinator, Regional Manager, Sales Officer, Level 4 officer; each outlet (SAP number) has its own login.
  Every user sees only their own zone / regions / sales areas. The rules are in `auth.php` and `orders.php`.
* **Orders:** an officer picks an outlet (SAP number), adds lines (two SKUs, 20 L packs), submits. Statuses: `draft → pending → approved / rejected` (rejected orders can be edited and resubmitted).
  **Who approves an order depends on who placed it** (`placed_role`; see `ordAwaitCond()` in `orders.php`).
* **On approval:** a Sales Order number is given (`RCSO2/26-27/n`); orders placed on the HPCL side also get a Tax Invoice number (`RETI/26-27/n`). Rate and GST are fixed on each line at that moment.
  The Sales Order / Tax Invoice PDFs are drawn by `salesorder.js` (jsPDF) and must look the same in the app.
* **Delivery:** approved → `transit` → `delivered` (Proof of Delivery file uploaded). Delivered orders are locked; a **Return** can then be requested and approved (who may approve is a permission switch).
* **FOC (free of cost):** the FOC page holds scheme rules (`min_qty` → `foc_qty` per SKU). Order quantity = paid + FOC (`portal_order_items.paid / foc / ea`).
* **MIS:** one table (`portal_mis_rows`) feeds the Dashboard, Raw Data and the MIS Excel-style sheets. Excel upload / download exist (`mis-xlsx.php`, `mis.js`).
* **Pages (tabs):** `dashboard, rawdata, mis, entry, admin, neworder, myorders, approvals, allorders, returns, inventory, foc, sap, roreport, perms, zones, team, outlets` (list = `PAGE_IDS` in `auth.php`; the Super Admin can switch pages off per user).

## 4. Where to find each feature in the source

| Feature | Files |
|---|---|
| Sign-in, sessions, roles, user management, password change, officer Excel import | `auth.php`, `users-store.php`, `outlet-users.php` |
| Orders, approvals, returns, products, prices, stock, FOC, SAP numbers, reports, POD upload | `orders.php` (API) + `orders.js`, `orders.css` (screens) |
| Sales Order / Tax Invoice PDF, public invoice page | `salesorder.js`, `invoice.html`, `qrcode.js`, `jspdf.umd.min.js` |
| Dashboard, Raw Data, data entry, targets, audit log | `index.html` (shell + dashboard), `dash-reports.js`, `api.php` |
| MIS sheets, Excel upload / download, MIS change log | `mis.php`, `mis-core.php`, `mis-xlsx.php`, `mis.js`, `mis.css`, `change-log.php` |
| Zones, regions, sales areas (fixed master list) | `regions.php` |

## 5. Rules for the Android app

1. **Port the PHP logic into the app.** Each `action` in `auth.php` / `orders.php` / `api.php` / `mis.php` is one function to re-implement against a local database (SQLite / Room) using the table layout in `03-demo-data/schema.sql`.
2. **Accounts are local.** Replace `users.php` with a local users table (the demo accounts are in `json/users.json`; passwords are bcrypt hashes of `Demo@12345`). Add a "switch demo role" option so one phone can show the whole approval flow.
3. **Bundle everything.** `index.html` currently loads Chart.js and SheetJS from a CDN: include both inside the app. No internet may be needed at any point.
4. **Files on the phone:** Excel upload/download, Proof-of-Delivery files and PDFs use the Android file picker / share sheet.
5. **First launch** loads the demo data; add a "Reset demo data" option.
6. **Mobile layouts** for the tables, the MIS sheet and forms (the web pages are desktop-first).

## 6. Optional: run the web portal on your computer (to see the exact behaviour)

Needs PHP 8 (with `pdo_mysql`, `mbstring`, `openssl`) and MySQL 5.7+.

1. Create an empty database `rohan_demo`; load `03-demo-data/schema.sql`, then `03-demo-data/demo-data.sql`.
2. In `02-web-portal-source/`: copy `config.example.php` to `config.php` (adjust the DB login if needed) and copy `../03-demo-data/users.demo.php` to `users.php`.
3. In that folder run `php -S 127.0.0.1:8100` and open `http://127.0.0.1:8100/index.html`.

## 7. Not included on purpose

The live website, its server settings, the real user accounts and passwords, real outlets / orders / MIS data, and the real HPCL officer list. Do not request them: build against the demo data only.
The Sales Order / Tax Invoice PDF layout shows the Rohan Energy company letterhead (name, address, GSTIN, e-mail) because that is how the real document looks; keep it as is.
