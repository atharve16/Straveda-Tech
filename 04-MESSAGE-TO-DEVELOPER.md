Hi,

Attached is the source of our web dashboard, the **Rohan Energy Order & MIS Portal** (PHP backend + HTML/JS front end), together with a demo dataset (all dummy data) and demo logins for every role. Please read `01-README-START-HERE.md` first.

**What we need:** a **fully offline, standalone Android app** that reproduces this dashboard. There is no server and no internet connection. Everything runs and is stored on the phone.

**Requirements**

1. **Port the backend logic into the app.** The PHP files (`auth.php`, `orders.php`, `api.php`, `mis*.php`, `outlet-users.php`, `regions.php`) are the specification for login, roles, orders, approvals, Returns, MIS, FOC and SAP data. Store the data in a local database (SQLite / Room) using the layout in `03-demo-data/schema.sql`.
2. **Same screens and role logic as the web portal:** Super Admin, HPCL (Super Admin, Zonal Coordinator, Regional Manager, Sales Officer, Level 4), Rohan Zone / Regional Officer and Outlet (SAP number) login. Each role sees only what it sees on the web. Orders, approvals, Returns, MIS, Dashboard / Raw Data, FOC, SAP Numbers, Outlet Profiles, Inventory, RO Report, invoice / POD, Profile and password change.
3. **Local accounts.** Login works against accounts stored in the app, with hashed passwords. Include a way to switch between the demo roles so the whole approval flow can be shown on one phone.
4. **Excel import / export** (MIS and the officer / SAP uploads) and **Sales Order / Tax Invoice PDF** must work on the device, using the Android file picker and share sheet. The PDF must look like the one `salesorder.js` draws.
5. **Proper mobile layouts** for tables, the MIS sheet and forms.
6. **The app is preloaded with the demo dataset** on first launch, with a "Reset demo data" option.
7. **Everything bundled** in the app, no internet use at all (the web page loads Chart.js and SheetJS from a CDN; include both locally).
8. App name **Rohan Energy**. We will send the logo and colours. Splash screen and app icon included.
9. **Deliver** the full source code with build instructions and a signed APK / AAB.

**Important:** please work only from what is in this kit. We are not providing access to our live website, server, real data or real logins, and the app must not connect to any of them.

Please reply with:
- your approach (native Kotlin, Flutter or React Native), and how you will port the PHP logic,
- the order in which you would deliver the screens (the logic is large, about 1 MB of PHP and JS),
- timeline and cost.

Thanks!
