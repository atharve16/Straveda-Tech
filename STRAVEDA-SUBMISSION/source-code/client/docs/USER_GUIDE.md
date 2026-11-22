# STRAVEDA user guide

## Install and sign in

Install the signed APK on Android when one is available. Open STRAVEDA, select Rohan, HPCL or Outlet, enter the account name or outlet SAP, then the password. Demo Rohan login: `demo_super` / `Demo@12345`. This shared password is for demonstration data only. The app asks for login again after a cold restart.

## Navigation and data

Use the top tabs. Dashboard shows scoped order and MIS counts, pending entries and litres from the local database. MIS lists recent rows; search by date, outlet, SAP or item. A Rohan Super Admin or Rohan zone account can add a row, select Edit to change its date/EA, or delete it after confirmation. Import CSV accepts `d,sap,item,ea` headings and appends valid in-scope rows atomically. Export shares all visible MIS rows as CSV through Android. Orders lists visible orders and current product/outlet references. Enter SAP, exact product name and whole paid EA to create a one-item draft, then tap Submit. Eligible officers can approve or reject a pending order; rejection needs a reason. Approval checks configured stock. Pending allows a signed-in user to submit an entry for an outlet within scope. A Rohan Super Admin can approve it into MIS or reject it with a reason. Reports shows an on-screen summary and CSV export. History shows new app actions.

## Persistence and troubleshooting

Records are stored in the installation's private SQLite database and should remain after app restart; device restart testing is still required. Each installation has independent data. No backend is used. If startup reports a database error, check storage and tap Try again. If login fails, check the organization tab, account name and password. If a write fails, read the displayed validation or stock message; the transaction should leave related tables unchanged. CSV export leaves app-private storage when shared. Workbook import, multi-line order editing and portal document workflows are not available in this submission state.
