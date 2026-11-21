# Source code audit — working inventory

This inventory was checked against the supplied PHP dispatch switches and the early `public_invoice` branch at `orders.php:1062`. The original script missed that branch. `python scripts/source_inventory.py` reports **87 actions and 305 declared PHP functions** without overwriting these notes. The 23 `auth.php` actions and 63 directly reachable authentication helpers have source contracts in [AUTHENTICATION_AUDIT_REPORT.md](AUTHENTICATION_AUDIT_REPORT.md); three authentication helper call sites remain unknown. Other modules remain a route/function inventory, not a completed behavioral audit. The PHP source remains authoritative.

## Completeness gate (2026-11-22)

| Measure | Result |
|---|---:|
| Discovered dispatchable actions | 87 (23 `auth`, 37 `orders` including `public_invoice`, 19 `api`, 8 `mis`) |
| Syntactically routable by PHP dispatch URL/body | 87; runtime execution needs the absent `config.php` and a populated local database |
| Confirmed dead actions | 0; frontend usage is not a reachability requirement for a public route |
| Declared PHP helper functions | 305 |
| Confirmed reachable helper functions | 63 authentication helpers traced to supplied route call chains; other modules pending |
| Helpers requiring TypeScript migration | 50 reachable authentication rule/security helpers; 13 server-only adapters need local replacements; 3 auth helper reachability unknown; other modules pending |
| Fully audited actions | 23 (`auth.php`); no Android implementation |
| Pending actions | 64 (non-authentication routes) |
| Fully audited authentication helpers | 63 of 66 declared in focus files; 3 have unknown reachability |

The 305 functions include 25 in `mis-xlsx.php`; this file contains a NUL byte, so ordinary `rg` treats it as binary and undercounts functions. The inventory script reads it as text. The frontend files `index.html`, `orders.js`, `mis.js`, `dash-reports.js`, `salesorder.js`, and `invoice.html` call the PHP endpoints; `invoice.html:32` calls `public_invoice`. API action names repeat across separate endpoints (`approve`, `delete`, `get`, `import`); these are distinct routes, not duplicate implementations. No action is proven dead merely because a static search missed a browser caller.

### Source limits and exact remaining work

`auth.php`, `orders.php`, `api.php`, and `mis-core.php` include `config.php`, which is absent; only `config.example.php` is supplied. `users-store.php` reads `users.php`, also absent; `03-demo-data/users.demo.php` is the supplied demo substitute. `mis-core.php:174` references absent `mis-data/seed.json`, while `mis-core.php:289` and `mis-xlsx.php` need absent `mis-data/template.xlsx`. The JSON demo MIS rows are supplied separately, but they do not recreate the workbook package. The original live configuration, live officer roster, and workbook cannot be audited from this kit.

For **each of the remaining 64 action rows below**, review its dispatch branch and the called helper body (including indirect calls), then record required and optional fields, method and CSRF behavior, validation, authentication and role/scope guards, tables and SQL, transaction boundaries, success/error payloads, and Android service/test mapping. The 239 other helper rows and three unknown-reachability authentication helpers still need disposition. The selected non-authentication contract fragments at the end are partial evidence and do not satisfy this gate. Compare JavaScript action references and HTML forms against the final route list. No Phase 2 implementation is authorized by this source audit.

### Fully audited action contract

`auth.logout` (`auth.php:171-174`; browser caller `index.html:1238`) accepts the `action=logout` selector via query string or JSON body on any HTTP method; it has no required or optional business fields. The router starts a PHP session and may create a CSRF token before dispatch, but explicitly skips the user-file lock for `logout` and has no logout CSRF or authentication guard. A guest and every officer/outlet role may call it. It calls `session_destroy()`, reads/writes no application database table, executes no SQL and starts no database transaction. It responds with JSON `{"ok":true}` under the route's JSON/no-cache headers; there is no action-specific failure branch or error payload. No helper function is called by this case. The Android equivalent is to clear only the local session and in-memory identity, then route to the later login screen; this is a migration requirement, not an implementation.

## Authentication action contracts

The table records each `auth.php` action's required/optional business input, guard and effect. Exact method/CSRF/lock behavior, error text/status, success shape, indirect helpers and Android requirements are in [the dedicated audit](AUTHENTICATION_AUDIT_REPORT.md#individual-action-contracts). Every action accepts a JSON body through any HTTP method; only outlet actions verify body CSRF. POST takes `usersLock()` except for login/check/logout. `auth.php:18-31` is the shared route source. `AUDITED` means PHP source behavior documented, **not** Android behavior implemented.

| Action and source | Input and validation | Guard and storage effect | Success; Android contract |
|---|---|---|---|
| `login` `33-139` | Trimmed username/password; optional org tab; SAP 6–12 digits or exact/unambiguous-case officer lookup | Public; read profile+master or officer file; legacy plaintext may rehash/write before org mismatch | User+CSRF session; preserve distinct local account paths |
| `check` `140-170` | Selector only | Session; outlet rejoined/rebuilt, officer file reloaded with six fields refreshed; missing account destroys session | `ok,user,csrf` or `ok:false`; revalidate local identity |
| `logout` `171-175` | Selector only | Public; destroys PHP session; no DB/file write | `ok:true`; clear local identity |
| `list_users` `176-212` | Selector only | Super/Zone Officer; `canManage` filters officers; decrypt view only through `canViewPassword`; file read | `ok,users`; enforce list scope and password visibility |
| `list_sales_areas` `213-225` | Selector only | Super/Zone Officer; mapping and `officerRegions`; no write | `ok,sales_areas`; local mapping |
| `update_user_access` `226-351` | Required username/role; optional org/filter/zones/regions/label/columns/pages/contact/new username; role/zone/child checks | Super; HPCL super constrained to manageable HPCL role-zone target; officer file write; rename also commits dynamic MySQL username-column updates first | `ok:true`; atomic local reference updates |
| `update_user_password` `352-378` | Username/password required; new password ≥8 bytes | Super/Zone Officer, `canManage`; hashes/seals and writes officer file | `ok:true`; local reset and view policy |
| `change_password` `379-414` | Current/new required; current verifies, new ≥8 bytes and different | Own active officer or outlet; officer file or outlet table update | `ok:true`; separate local store paths |
| `update_contact` `415-428` | Optional email/mobile; normalize/validate/unique | Own officer only; officer file write, outlet denied | `ok,email,mobile`; local contact update |
| `add_user` `429-505` | Required username/password/role/label; optional org/filter/zones/regions/columns; username/role/password checks | Super; HPCL super creates HPCL zone only; officer file write | `ok:true`; organized Zone Officer account |
| `add_regional_officer` `506-566` | Required username/password/label/region/sales areas; optional parent for super | Super or parent Zone Officer; region+area scope; officer file write | `ok:true`; preserve parent hierarchy |
| `update_regional_officer` `567-613` | Required target/region/sales areas; optional parent/label/contact/pages/new username | Super or managing Zone Officer; officer file write, possible MySQL rename | `ok:true`; local hierarchy/reference update |
| `delete_user` `614-644` | Required username; no self/child deletion | Super or managing Zone Officer; removes officer file entry, preserves orders | `ok:true`; retain historical records |
| `add_super_admin` `645-691` | Required username/password/label/org; optional states; case-insensitive duplicate check | Rohan super only; officer file write | `ok:true`; distinguish super orgs |
| `update_super_admin` `692-711` | Required target; optional label/pages/states/all_states | Rohan super only; officer file write | `ok:true`; keep approval states separate from geography |
| `import_officers` `712-719,1417-1543` | Rows 1–600; optional dry_run/org/areas_by; row validation and parent matching | Super; final officer file write only outside dry run if created | `ok,dry_run,org,counts,results`; local batch preview/import |
| `convert_to_sales_areas` `720-728,1391-1415` | Selector only | Super; reads outlet districts; writes officer file only if converted | `ok,converted,how,left`; idempotent local migration |
| `outlet_list` `729-740,812-856` | Optional q/ro/zo/page/per | Super or HPCL Zone Officer + CSRF; scoped profile/master reads | Counts/rows/regions/metadata; scoped local listing |
| `outlet_lookup` `729-740,857-866` | Required 6–12-digit sap_code | Same guard; reads master/profile existence | Outlet/exists/suggested; local linkage check |
| `outlet_add` `729-740,867-885` | Required linked SAP; optional label/password | Same guard; INSERT profile with bcrypt cost 8 | `ok:true`; separate local profile |
| `outlet_update` `729-740,886-904` | Required linked existing SAP; optional label/password ≥8 | Same guard; label UPDATE may precede password validation/UPDATE | `ok:true`; record partial-write source behavior |
| `outlet_delete` `729-740,905-933` | Either all+filters or valid sap_codes | Same guard; scoped joined DELETE profile only | `ok,deleted`; retain master/outlet orders |
| `outlet_import` `729-740,934-989` | ≤500 rows/slice with sap/name/idx; optional reset | Same guard; one transaction per slice; create/reset/keep | Per-slice counts and missing/outside/bad; local import parity |

## PHP actions

| File:line | Action | Dispatched helper | Status |
|---|---|---|---|
| `auth.php:33` | `login` | `see dispatch body` | AUDITED |
| `auth.php:140` | `check` | `see dispatch body` | AUDITED |
| `auth.php:171` | `logout` | `see dispatch body` | AUDITED |
| `auth.php:176` | `list_users` | `see dispatch body` | AUDITED |
| `auth.php:213` | `list_sales_areas` | `see dispatch body` | AUDITED |
| `auth.php:226` | `update_user_access` | `see dispatch body` | AUDITED |
| `auth.php:352` | `update_user_password` | `see dispatch body` | AUDITED |
| `auth.php:379` | `change_password` | `see dispatch body` | AUDITED |
| `auth.php:415` | `update_contact` | `see dispatch body` | AUDITED |
| `auth.php:429` | `add_user` | `see dispatch body` | AUDITED |
| `auth.php:506` | `add_regional_officer` | `see dispatch body` | AUDITED |
| `auth.php:567` | `update_regional_officer` | `see dispatch body` | AUDITED |
| `auth.php:614` | `delete_user` | `see dispatch body` | AUDITED |
| `auth.php:645` | `add_super_admin` | `see dispatch body` | AUDITED |
| `auth.php:692` | `update_super_admin` | `see dispatch body` | AUDITED |
| `auth.php:712` | `import_officers` | `see dispatch body` | AUDITED |
| `auth.php:720` | `convert_to_sales_areas` | `see dispatch body` | AUDITED |
| `auth.php:729` | `outlet_list` | `see dispatch body` | AUDITED |
| `auth.php:730` | `outlet_lookup` | `see dispatch body` | AUDITED |
| `auth.php:731` | `outlet_add` | `see dispatch body` | AUDITED |
| `auth.php:732` | `outlet_update` | `see dispatch body` | AUDITED |
| `auth.php:733` | `outlet_delete` | `see dispatch body` | AUDITED |
| `auth.php:734` | `outlet_import` | `see dispatch body` | AUDITED |
| `orders.php:1062` | `public_invoice` | early public branch | NEEDS_CLARIFICATION |
| `orders.php:1097` | `meta` | `ordMeta` | NEEDS_CLARIFICATION |
| `orders.php:1098` | `outlet` | `ordOutletLookup` | NEEDS_CLARIFICATION |
| `orders.php:1099` | `sap_list` | `ordSapList` | NEEDS_CLARIFICATION |
| `orders.php:1100` | `sap_save` | `ordSapSave` | NEEDS_CLARIFICATION |
| `orders.php:1101` | `sap_history` | `ordSapHistory` | NEEDS_CLARIFICATION |
| `orders.php:1102` | `sap_import` | `ordSapImport` | NEEDS_CLARIFICATION |
| `orders.php:1103` | `ro_report` | `ordRoReport` | NEEDS_CLARIFICATION |
| `orders.php:1104` | `list` | `ordList` | NEEDS_CLARIFICATION |
| `orders.php:1105` | `get` | `ordGet` | NEEDS_CLARIFICATION |
| `orders.php:1106` | `history` | `ordHistory` | NEEDS_CLARIFICATION |
| `orders.php:1107` | `save` | `ordSave` | NEEDS_CLARIFICATION |
| `orders.php:1108` | `submit` | `ordSubmit` | NEEDS_CLARIFICATION |
| `orders.php:1109` | `delete` | `ordDelete` | NEEDS_CLARIFICATION |
| `orders.php:1110` | `bulk` | `ordBulk` | NEEDS_CLARIFICATION |
| `orders.php:1111` | `set_min_order` | `ordSetMinOrder` | NEEDS_CLARIFICATION |
| `orders.php:1112` | `set_perms` | `ordSetPerms` | NEEDS_CLARIFICATION |
| `orders.php:1113` | `set_prices` | `ordSetPrices` | NEEDS_CLARIFICATION |
| `orders.php:1114` | `set_stock` | `ordSetStock` | NEEDS_CLARIFICATION |
| `orders.php:1115` | `add_product` | `ordAddProduct` | NEEDS_CLARIFICATION |
| `orders.php:1116` | `delete_product` | `ordDeleteProduct` | NEEDS_CLARIFICATION |
| `orders.php:1117` | `save_foc_list` | `ordSaveFocList` | NEEDS_CLARIFICATION |
| `orders.php:1118` | `upload_pod` | `ordUploadFile` | NEEDS_CLARIFICATION |
| `orders.php:1119` | `upload_receipt` | `ordUploadFile` | NEEDS_CLARIFICATION |
| `orders.php:1120` | `upload_invoice` | `ordUploadFile` | NEEDS_CLARIFICATION |
| `orders.php:1121` | `edit_invoice` | `ordEditInvoice` | NEEDS_CLARIFICATION |
| `orders.php:1122` | `pod_download` | `ordFileDownload` | NEEDS_CLARIFICATION |
| `orders.php:1123` | `file_download` | `ordFileDownload` | NEEDS_CLARIFICATION |
| `orders.php:1124` | `return_request` | `ordRetRequest` | NEEDS_CLARIFICATION |
| `orders.php:1125` | `return_list` | `ordRetList` | NEEDS_CLARIFICATION |
| `orders.php:1126` | `return_decide` | `ordRetDecide` | NEEDS_CLARIFICATION |
| `orders.php:1127` | `change_log` | `ordChangeLog` | NEEDS_CLARIFICATION |
| `orders.php:1128` | `outlet_officers` | `ordOutletOfficers` | NEEDS_CLARIFICATION |
| `orders.php:1129` | `profile` | `ordProfile` | NEEDS_CLARIFICATION |
| `orders.php:1130` | `superiors` | `ordSuperiors` | NEEDS_CLARIFICATION |
| `orders.php:1131` | `approve` | `ordDecide` | NEEDS_CLARIFICATION |
| `orders.php:1132` | `reject` | `ordDecide` | NEEDS_CLARIFICATION |
| `api.php:60` | `sales` | `getSales` | NEEDS_CLARIFICATION |
| `api.php:61` | `add` | `addEntry` | NEEDS_CLARIFICATION |
| `api.php:62` | `update` | `updateEntry` | NEEDS_CLARIFICATION |
| `api.php:63` | `delete` | `deleteEntry` | NEEDS_CLARIFICATION |
| `api.php:64` | `import` | `importData` | NEEDS_CLARIFICATION |
| `api.php:65` | `ro_lookup` | `roLookup` | NEEDS_CLARIFICATION |
| `api.php:66` | `ref_lists` | `refLists` | NEEDS_CLARIFICATION |
| `api.php:67` | `add_pending` | `addPending` | NEEDS_CLARIFICATION |
| `api.php:68` | `list_pending` | `listPending` | NEEDS_CLARIFICATION |
| `api.php:69` | `my_pending` | `myPending` | NEEDS_CLARIFICATION |
| `api.php:70` | `approve` | `approvePending` | NEEDS_CLARIFICATION |
| `api.php:71` | `reject` | `rejectPending` | NEEDS_CLARIFICATION |
| `api.php:72` | `edit_pending` | `editPending` | NEEDS_CLARIFICATION |
| `api.php:73` | `delete_pending` | `deletePending` | NEEDS_CLARIFICATION |
| `api.php:74` | `audit_log` | `getAuditLog` | NEEDS_CLARIFICATION |
| `api.php:75` | `pending_count` | `pendingCount` | NEEDS_CLARIFICATION |
| `api.php:76` | `save_note` | `saveNote` | NEEDS_CLARIFICATION |
| `api.php:77` | `get_targets` | `getTargets` | NEEDS_CLARIFICATION |
| `api.php:78` | `save_target` | `saveTarget` | NEEDS_CLARIFICATION |
| `mis.php:32` | `get` | `see dispatch body` | NEEDS_CLARIFICATION |
| `mis.php:34` | `ver` | `misOut` | NEEDS_CLARIFICATION |
| `mis.php:35` | `download` | `misDownload` | NEEDS_CLARIFICATION |
| `mis.php:36` | `outlet` | `misOutlet` | NEEDS_CLARIFICATION |
| `mis.php:37` | `save_row` | `misSaveRow` | NEEDS_CLARIFICATION |
| `mis.php:38` | `delete_row` | `misDeleteRow` | NEEDS_CLARIFICATION |
| `mis.php:39` | `delete_rows` | `misDeleteRows` | NEEDS_CLARIFICATION |
| `mis.php:40` | `import` | `misImport` | NEEDS_CLARIFICATION |

## PHP helper functions

| File:line | Helper | Status |
|---|---|---|
| `auth.php:752` | `outletActor` | AUDITED |
| `auth.php:766` | `outletZoneOfficers` | AUDITED |
| `auth.php:778` | `outletScopeSql` | AUDITED |
| `auth.php:785` | `outletRegions` | AUDITED |
| `auth.php:792` | `outletLike` | AUDITED |
| `auth.php:795` | `outletCheckOutlet` | AUDITED |
| `auth.php:805` | `outletApi` | AUDITED |
| `auth.php:990` | `userLevel` | AUDITED |
| `auth.php:995` | `denyJson` | AUDITED |
| `auth.php:1005` | `actor` | AUDITED |
| `auth.php:1021` | `cleanContact` | AUDITED |
| `auth.php:1042` | `applyPages` | AUDITED |
| `auth.php:1047` | `applyContact` | AUDITED |
| `auth.php:1059` | `renameUser` | AUDITED |
| `auth.php:1090` | `childrenOf` | AUDITED |
| `auth.php:1097` | `isHpclSuper` | AUDITED |
| `auth.php:1102` | `canManage` | AUDITED |
| `auth.php:1115` | `officerRegions` | AUDITED |
| `auth.php:1126` | `regionSalesAreas` | AUDITED |
| `auth.php:1133` | `saKey` | AUDITED |
| `auth.php:1138` | `cleanRegional` | AUDITED |
| `auth.php:1151` | `passKey` | AUDITED |
| `auth.php:1156` | `passSeal` | AUDITED |
| `auth.php:1165` | `passView` | AUDITED |
| `auth.php:1176` | `setPassword` | AUDITED |
| `auth.php:1188` | `canViewPassword` | AUDITED |
| `auth.php:1194` | `writeUsers` | AUDITED |
| `auth.php:1203` | `validateOrg` | AUDITED |
| `auth.php:1213` | `sheetZones` | AUDITED |
| `auth.php:1218` | `zoneRegions` | AUDITED |
| `auth.php:1228` | `validateRos` | NEEDS_CLARIFICATION |
| `auth.php:1237` | `userZones` | AUDITED |
| `auth.php:1245` | `userSheetZones` | AUDITED |
| `auth.php:1253` | `regionSheetZone` | AUDITED |
| `auth.php:1257` | `regionPortalZone` | AUDITED |
| `auth.php:1268` | `cleanZones` | AUDITED |
| `auth.php:1294` | `superScopeFields` | NEEDS_CLARIFICATION |
| `auth.php:1299` | `cleanStates` | AUDITED |
| `auth.php:1306` | `superLimit` | AUDITED |
| `auth.php:1310` | `genPassword` | NEEDS_CLARIFICATION |
| `auth.php:1319` | `genUsername` | AUDITED |
| `auth.php:1330` | `saTokens` | AUDITED |
| `auth.php:1341` | `salesAreasFor` | AUDITED |
| `auth.php:1362` | `legacySalesAreas` | AUDITED |
| `auth.php:1391` | `convertToSalesAreas` | AUDITED |
| `auth.php:1417` | `importOfficers` | AUDITED |
| `auth.php:1545` | `var_export_short` | AUDITED |
| `users-store.php:16` | `usersPath` | AUDITED |
| `users-store.php:19` | `usersWorkDir` | AUDITED |
| `users-store.php:28` | `usersLock` | AUDITED |
| `users-store.php:36` | `usersParse` | AUDITED |
| `users-store.php:46` | `usersLoad` | AUDITED |
| `users-store.php:68` | `usersWrite` | AUDITED |
| `users-store.php:90` | `usersWriteFail` | AUDITED |
| `outlet-users.php:23` | `ouDb` | AUDITED |
| `outlet-users.php:35` | `ouEnsure` | AUDITED |
| `outlet-users.php:53` | `ouFind` | AUDITED |
| `outlet-users.php:63` | `ouIsProfile` | AUDITED |
| `outlet-users.php:76` | `ouSession` | AUDITED |
| `outlet-users.php:94` | `ouSessionIsOutlet` | AUDITED |
| `outlet-users.php:101` | `ouRuleName` | AUDITED |
| `outlet-users.php:107` | `ouSuffix` | AUDITED |
| `outlet-users.php:113` | `ouRulePassword` | AUDITED |
| `outlet-users.php:118` | `ouHash` | AUDITED |
| `orders.php:107` | `ordFail` | NEEDS_CLARIFICATION |
| `orders.php:113` | `ordOut` | NEEDS_CLARIFICATION |
| `orders.php:118` | `ordDB` | NEEDS_CLARIFICATION |
| `orders.php:135` | `ordEnsureSchema` | NEEDS_CLARIFICATION |
| `orders.php:343` | `ordAddColumns` | NEEDS_CLARIFICATION |
| `orders.php:351` | `ordOutlet` | NEEDS_CLARIFICATION |
| `orders.php:358` | `ordItems` | NEEDS_CLARIFICATION |
| `orders.php:362` | `ordProducts` | NEEDS_CLARIFICATION |
| `orders.php:371` | `ordDirectNames` | NEEDS_CLARIFICATION |
| `orders.php:375` | `ordFocRules` | NEEDS_CLARIFICATION |
| `orders.php:387` | `ordFocFor` | NEEDS_CLARIFICATION |
| `orders.php:396` | `ordFocInfo` | NEEDS_CLARIFICATION |
| `orders.php:409` | `ordFocMigrate` | NEEDS_CLARIFICATION |
| `orders.php:435` | `ordMinOrder` | NEEDS_CLARIFICATION |
| `orders.php:442` | `ordPerms` | NEEDS_CLARIFICATION |
| `orders.php:453` | `ordHpclInvHidden` | NEEDS_CLARIFICATION |
| `orders.php:457` | `ordHideInv` | NEEDS_CLARIFICATION |
| `orders.php:461` | `ordPrices` | NEEDS_CLARIFICATION |
| `orders.php:474` | `ordMissingPrices` | NEEDS_CLARIFICATION |
| `orders.php:479` | `ordMissingPricesMsg` | NEEDS_CLARIFICATION |
| `orders.php:493` | `ordStockEnabled` | NEEDS_CLARIFICATION |
| `orders.php:498` | `ordStock` | NEEDS_CLARIFICATION |
| `orders.php:520` | `ordMinOrderMsg` | NEEDS_CLARIFICATION |
| `orders.php:523` | `ordOutletCount` | NEEDS_CLARIFICATION |
| `orders.php:532` | `ordUser` | NEEDS_CLARIFICATION |
| `orders.php:593` | `ordRequireCsrf` | NEEDS_CLARIFICATION |
| `orders.php:602` | `ordScope` | NEEDS_CLARIFICATION |
| `orders.php:638` | `ordZoneRos` | NEEDS_CLARIFICATION |
| `orders.php:644` | `ordSheetZoneOfRo` | NEEDS_CLARIFICATION |
| `orders.php:649` | `ordRoSql` | NEEDS_CLARIFICATION |
| `orders.php:654` | `ordSaKey` | NEEDS_CLARIFICATION |
| `orders.php:658` | `ordSaSql` | NEEDS_CLARIFICATION |
| `orders.php:664` | `ordCoversRo` | NEEDS_CLARIFICATION |
| `orders.php:668` | `ordCoversSa` | NEEDS_CLARIFICATION |
| `orders.php:674` | `ordCoversOrder` | NEEDS_CLARIFICATION |
| `orders.php:678` | `ordOwns` | NEEDS_CLARIFICATION |
| `orders.php:683` | `ordApprCovers` | NEEDS_CLARIFICATION |
| `orders.php:688` | `ordApprSql` | NEEDS_CLARIFICATION |
| `orders.php:694` | `ordStatesOfScope` | NEEDS_CLARIFICATION |
| `orders.php:701` | `ordSuperApprovers` | NEEDS_CLARIFICATION |
| `orders.php:713` | `ordHpclAs` | NEEDS_CLARIFICATION |
| `orders.php:716` | `ordAdminPlaces` | NEEDS_CLARIFICATION |
| `orders.php:718` | `ordAllZones` | NEEDS_CLARIFICATION |
| `orders.php:721` | `ordUserZones` | NEEDS_CLARIFICATION |
| `orders.php:728` | `ordInZones` | NEEDS_CLARIFICATION |
| `orders.php:734` | `ordApprovers` | NEEDS_CLARIFICATION |
| `orders.php:759` | `ordPlacerRole` | NEEDS_CLARIFICATION |
| `orders.php:765` | `ordApproverText` | NEEDS_CLARIFICATION |
| `orders.php:789` | `ordAwaitCond` | NEEDS_CLARIFICATION |
| `orders.php:813` | `ordMarkDecidable` | NEEDS_CLARIFICATION |
| `orders.php:827` | `ordBackfillPlacedRole` | NEEDS_CLARIFICATION |
| `orders.php:845` | `ordHasApprover` | NEEDS_CLARIFICATION |
| `orders.php:851` | `ordFormat` | NEEDS_CLARIFICATION |
| `orders.php:878` | `ordItemsFor` | NEEDS_CLARIFICATION |
| `orders.php:895` | `ordSelect` | NEEDS_CLARIFICATION |
| `orders.php:902` | `ordLoad` | NEEDS_CLARIFICATION |
| `orders.php:916` | `ordEvents` | NEEDS_CLARIFICATION |
| `orders.php:922` | `ordLogEvent` | NEEDS_CLARIFICATION |
| `orders.php:930` | `ordToday` | NEEDS_CLARIFICATION |
| `orders.php:933` | `ordStr` | NEEDS_CLARIFICATION |
| `orders.php:943` | `ordValidate` | NEEDS_CLARIFICATION |
| `orders.php:954` | `ordCheck` | NEEDS_CLARIFICATION |
| `orders.php:1142` | `ordMeta` | NEEDS_CLARIFICATION |
| `orders.php:1192` | `ordSetPrices` | NEEDS_CLARIFICATION |
| `orders.php:1220` | `ordSetStock` | NEEDS_CLARIFICATION |
| `orders.php:1253` | `ordAddProduct` | NEEDS_CLARIFICATION |
| `orders.php:1270` | `ordDeleteProduct` | NEEDS_CLARIFICATION |
| `orders.php:1286` | `ordSaveFocList` | NEEDS_CLARIFICATION |
| `orders.php:1353` | `ordSetMinOrder` | NEEDS_CLARIFICATION |
| `orders.php:1370` | `ordSetPerms` | NEEDS_CLARIFICATION |
| `orders.php:1385` | `ordAutoSteps` | NEEDS_CLARIFICATION |
| `orders.php:1393` | `ordFinalizeSO` | NEEDS_CLARIFICATION |
| `orders.php:1411` | `ordGiveNumber` | NEEDS_CLARIFICATION |
| `orders.php:1429` | `ordHealStages` | NEEDS_CLARIFICATION |
| `orders.php:1443` | `ordIniBytes` | NEEDS_CLARIFICATION |
| `orders.php:1450` | `ordPodMaxBytes` | NEEDS_CLARIFICATION |
| `orders.php:1455` | `ordFileInfo` | NEEDS_CLARIFICATION |
| `orders.php:1464` | `ordPodContentOk` | NEEDS_CLARIFICATION |
| `orders.php:1477` | `ordPodDir` | NEEDS_CLARIFICATION |
| `orders.php:1484` | `ordPodLimitMsg` | NEEDS_CLARIFICATION |
| `orders.php:1492` | `ordUploadFile` | NEEDS_CLARIFICATION |
| `orders.php:1582` | `ordEditInvoice` | NEEDS_CLARIFICATION |
| `orders.php:1632` | `ordFileDownload` | NEEDS_CLARIFICATION |
| `orders.php:1656` | `ordOutletLookup` | NEEDS_CLARIFICATION |
| `orders.php:1692` | `ordSapAccess` | NEEDS_CLARIFICATION |
| `orders.php:1706` | `ordSapScope` | NEEDS_CLARIFICATION |
| `orders.php:1719` | `ordRegionInfo` | NEEDS_CLARIFICATION |
| `orders.php:1728` | `ordSapList` | NEEDS_CLARIFICATION |
| `orders.php:1789` | `ordSapSave` | NEEDS_CLARIFICATION |
| `orders.php:1871` | `ordSapImportClean` | NEEDS_CLARIFICATION |
| `orders.php:1876` | `ordSapImportNum` | NEEDS_CLARIFICATION |
| `orders.php:1878` | `ordSapImportBlank` | NEEDS_CLARIFICATION |
| `orders.php:1881` | `ordSapImportPlan` | NEEDS_CLARIFICATION |
| `orders.php:1942` | `ordSapImport` | NEEDS_CLARIFICATION |
| `orders.php:2007` | `ordChangeLog` | NEEDS_CLARIFICATION |
| `orders.php:2044` | `ordMeInfo` | NEEDS_CLARIFICATION |
| `orders.php:2056` | `ordProfile` | NEEDS_CLARIFICATION |
| `orders.php:2097` | `ordHpclTier` | NEEDS_CLARIFICATION |
| `orders.php:2109` | `ordSuperiors` | NEEDS_CLARIFICATION |
| `orders.php:2180` | `ordOutletProfile` | NEEDS_CLARIFICATION |
| `orders.php:2194` | `ordOfficersOf` | NEEDS_CLARIFICATION |
| `orders.php:2218` | `ordOutletOfficers` | NEEDS_CLARIFICATION |
| `orders.php:2238` | `ordSapHistory` | NEEDS_CLARIFICATION |
| `orders.php:2256` | `ordRoReportOrders` | NEEDS_CLARIFICATION |
| `orders.php:2327` | `ordRoReport` | NEEDS_CLARIFICATION |
| `orders.php:2456` | `ordList` | NEEDS_CLARIFICATION |
| `orders.php:2511` | `ordHistory` | NEEDS_CLARIFICATION |
| `orders.php:2528` | `ordGet` | NEEDS_CLARIFICATION |
| `orders.php:2546` | `ordSave` | NEEDS_CLARIFICATION |
| `orders.php:2637` | `ordPlaceInsert` | NEEDS_CLARIFICATION |
| `orders.php:2647` | `ordInsertDraft` | NEEDS_CLARIFICATION |
| `orders.php:2656` | `ordInsertItems` | NEEDS_CLARIFICATION |
| `orders.php:2662` | `ordMoveToPending` | NEEDS_CLARIFICATION |
| `orders.php:2677` | `ordSubmit` | NEEDS_CLARIFICATION |
| `orders.php:2716` | `ordBulkBrand` | NEEDS_CLARIFICATION |
| `orders.php:2722` | `ordBulkInt` | NEEDS_CLARIFICATION |
| `orders.php:2727` | `ordBulkName` | NEEDS_CLARIFICATION |
| `orders.php:2729` | `ordBulk` | NEEDS_CLARIFICATION |
| `orders.php:2869` | `ordDelete` | NEEDS_CLARIFICATION |
| `orders.php:2884` | `ordRetWho` | NEEDS_CLARIFICATION |
| `orders.php:2889` | `ordRetMayDecide` | NEEDS_CLARIFICATION |
| `orders.php:2894` | `ordRetAttach` | NEEDS_CLARIFICATION |
| `orders.php:2904` | `ordRetRow` | NEEDS_CLARIFICATION |
| `orders.php:2910` | `ordRetDecidable` | NEEDS_CLARIFICATION |
| `orders.php:2917` | `ordRetMeta` | NEEDS_CLARIFICATION |
| `orders.php:2930` | `ordRetRequest` | NEEDS_CLARIFICATION |
| `orders.php:2956` | `ordRetList` | NEEDS_CLARIFICATION |
| `orders.php:2987` | `ordRetDecide` | NEEDS_CLARIFICATION |
| `orders.php:3013` | `ordDecide` | NEEDS_CLARIFICATION |
| `api.php:21` | `getDB` | NEEDS_CLARIFICATION |
| `api.php:89` | `norm` | NEEDS_CLARIFICATION |
| `api.php:98` | `resolveColumns` | NEEDS_CLARIFICATION |
| `api.php:178` | `cleanStr` | NEEDS_CLARIFICATION |
| `api.php:185` | `ensureAuditTable` | NEEDS_CLARIFICATION |
| `api.php:195` | `logAudit` | NEEDS_CLARIFICATION |
| `api.php:204` | `getAuditLog` | NEEDS_CLARIFICATION |
| `api.php:214` | `pendingCount` | NEEDS_CLARIFICATION |
| `api.php:223` | `saveNote` | NEEDS_CLARIFICATION |
| `api.php:238` | `ensureTargetsTable` | NEEDS_CLARIFICATION |
| `api.php:249` | `getTargets` | NEEDS_CLARIFICATION |
| `api.php:261` | `saveTarget` | NEEDS_CLARIFICATION |
| `api.php:283` | `getSales` | NEEDS_CLARIFICATION |
| `api.php:350` | `sheetResolveDates` | NEEDS_CLARIFICATION |
| `api.php:394` | `portalPaidSql` | NEEDS_CLARIFICATION |
| `api.php:398` | `portalOrdersExist` | NEEDS_CLARIFICATION |
| `api.php:404` | `portalOrderScope` | NEEDS_CLARIFICATION |
| `api.php:413` | `portalOrderRows` | NEEDS_CLARIFICATION |
| `api.php:446` | `portalOrderSummary` | NEEDS_CLARIFICATION |
| `api.php:465` | `apiEditor` | NEEDS_CLARIFICATION |
| `api.php:471` | `apiMisKeys` | NEEDS_CLARIFICATION |
| `api.php:472` | `apiMisFields` | NEEDS_CLARIFICATION |
| `api.php:478` | `addEntry` | NEEDS_CLARIFICATION |
| `api.php:495` | `updateEntry` | NEEDS_CLARIFICATION |
| `api.php:514` | `deleteEntry` | NEEDS_CLARIFICATION |
| `api.php:529` | `importData` | NEEDS_CLARIFICATION |
| `api.php:568` | `refLists` | NEEDS_CLARIFICATION |
| `api.php:574` | `roLookup` | NEEDS_CLARIFICATION |
| `api.php:670` | `requireSession` | NEEDS_CLARIFICATION |
| `api.php:679` | `addPending` | NEEDS_CLARIFICATION |
| `api.php:701` | `myPending` | NEEDS_CLARIFICATION |
| `api.php:722` | `listPending` | NEEDS_CLARIFICATION |
| `api.php:745` | `approvePending` | NEEDS_CLARIFICATION |
| `api.php:794` | `rejectPending` | NEEDS_CLARIFICATION |
| `api.php:814` | `editPending` | NEEDS_CLARIFICATION |
| `api.php:845` | `deletePending` | NEEDS_CLARIFICATION |
| `mis-core.php:28` | `misFail` | NEEDS_CLARIFICATION |
| `mis-core.php:32` | `misOut` | NEEDS_CLARIFICATION |
| `mis-core.php:36` | `misDB` | NEEDS_CLARIFICATION |
| `mis-core.php:46` | `misUser` | NEEDS_CLARIFICATION |
| `mis-core.php:59` | `misKey` | NEEDS_CLARIFICATION |
| `mis-core.php:61` | `misKeySql` | NEEDS_CLARIFICATION |
| `mis-core.php:68` | `misScope` | NEEDS_CLARIFICATION |
| `mis-core.php:103` | `misScopeSaps` | NEEDS_CLARIFICATION |
| `mis-core.php:116` | `misScopeSql` | NEEDS_CLARIFICATION |
| `mis-core.php:132` | `misRowInScope` | NEEDS_CLARIFICATION |
| `mis-core.php:144` | `misRequireCsrf` | NEEDS_CLARIFICATION |
| `mis-core.php:150` | `misEnsureSchema` | NEEDS_CLARIFICATION |
| `mis-core.php:194` | `misMeta` | NEEDS_CLARIFICATION |
| `mis-core.php:198` | `misMetaSet` | NEEDS_CLARIFICATION |
| `mis-core.php:202` | `misBump` | NEEDS_CLARIFICATION |
| `mis-core.php:207` | `misHasOrders` | NEEDS_CLARIFICATION |
| `mis-core.php:212` | `misNormKey` | NEEDS_CLARIFICATION |
| `mis-core.php:214` | `misCanonMaps` | NEEDS_CLARIFICATION |
| `mis-core.php:225` | `misCanon` | NEEDS_CLARIFICATION |
| `mis-core.php:237` | `misItemName` | NEEDS_CLARIFICATION |
| `mis-core.php:244` | `misSync` | NEEDS_CLARIFICATION |
| `mis-core.php:271` | `misN` | NEEDS_CLARIFICATION |
| `mis-core.php:272` | `misRowOut` | NEEDS_CLARIFICATION |
| `mis-core.php:277` | `misAllRows` | NEEDS_CLARIFICATION |
| `mis-core.php:288` | `misPivots` | NEEDS_CLARIFICATION |
| `mis-core.php:304` | `misWhere` | NEEDS_CLARIFICATION |
| `mis-core.php:316` | `misDistinct` | NEEDS_CLARIFICATION |
| `mis-core.php:323` | `misMonths` | NEEDS_CLARIFICATION |
| `mis-core.php:329` | `misMonthTitle` | NEEDS_CLARIFICATION |
| `mis-core.php:331` | `misGet` | NEEDS_CLARIFICATION |
| `mis-core.php:353` | `misClean` | NEEDS_CLARIFICATION |
| `mis-core.php:359` | `misCanonItem` | NEEDS_CLARIFICATION |
| `mis-core.php:364` | `misCheckFields` | NEEDS_CLARIFICATION |
| `mis-core.php:389` | `misLogVal` | NEEDS_CLARIFICATION |
| `mis-core.php:394` | `misLogRow` | NEEDS_CLARIFICATION |
| `mis-core.php:400` | `misLogTitle` | NEEDS_CLARIFICATION |
| `mis-core.php:404` | `misLogDiff` | NEEDS_CLARIFICATION |
| `mis-core.php:413` | `misLogFilter` | NEEDS_CLARIFICATION |
| `mis-core.php:421` | `misSaveRow` | NEEDS_CLARIFICATION |
| `mis-core.php:457` | `misDeleteRow` | NEEDS_CLARIFICATION |
| `mis-core.php:474` | `misDeleteRows` | NEEDS_CLARIFICATION |
| `mis-core.php:512` | `misImportRow` | NEEDS_CLARIFICATION |
| `mis-core.php:541` | `misImport` | NEEDS_CLARIFICATION |
| `mis-core.php:580` | `misOutlet` | NEEDS_CLARIFICATION |
| `mis-core.php:592` | `misDownload` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:23` | `misZipRead` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:45` | `misZipWrite` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:61` | `misColName` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:62` | `misX` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:66` | `misNum` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:72` | `misSerial` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:74` | `misCell` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:83` | `misRow` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:85` | `misDom` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:90` | `misDomOut` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:94` | `misXp` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:196` | `misRowVal` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:204` | `misPivotModel` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:272` | `misMonthHead` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:276` | `misMS` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:279` | `misCols` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:299` | `misBuildXlsx` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:372` | `misSortCells` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:379` | `misBlanks` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:381` | `misBuildReports` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:491` | `misColsOf` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:493` | `misColItems` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:500` | `misSheet` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:510` | `misBuildCache` | NEEDS_CLARIFICATION |
| `mis-xlsx.php:592` | `misRecText` | NEEDS_CLARIFICATION |
| `regions.php:175` | `approvalStateList` | AUDITED |
| `regions.php:183` | `approvalStates` | AUDITED |
| `change-log.php:11` | `chgEnsure` | NEEDS_CLARIFICATION |
| `change-log.php:31` | `chgRole` | NEEDS_CLARIFICATION |
| `change-log.php:40` | `chgAdd` | NEEDS_CLARIFICATION |
| `change-log.php:57` | `chgFetch` | NEEDS_CLARIFICATION |

## Frontend files

| File | Purpose |
|---|---|
| `index.html` | Shell, dashboard, Raw Data, entry and admin views |
| `orders.js`, `orders.css` | Order, approval, delivery, returns, SAP, stock, FOC and officer screens |
| `mis.js`, `mis.css` | MIS grid and import/export |
| `dash-reports.js` | Dashboard calculations and charts |
| `salesorder.js` | Sales Order and Tax Invoice PDF drawing |
| `invoice.html` | Public invoice view in original portal; requires offline redesign |
| `qrcode.js` | QR generation |
| `jspdf.umd.min.js`, `xlsx.mini.min.js` | Bundled PDF and Excel libraries |
| `logo-mark.svg`, `logo-hpcl.svg`, `bg.jpg` | Local visual assets |

## Confirmed critical rules

- The 18 page IDs are in `auth.php` and are individually adjustable for users.
- `ordAwaitCond` depends on `placed_role`, creator identity, organization, role level, team and approval states. `ordScope` adds geographic and ownership filtering.
- `ordDecide` requires `pending`, checks scope and eligibility, compares `seen_updated_at`, rechecks stock, then records decision and events inside a transaction.
- Approval sets delivery stage to `transit`. Rejection clears that stage. Rejection requires a reason.
- A return requires an approved and delivered order, a reason of at least three characters and a credit note. Pending and approved return requests block another request.
- `api.php` creates `audit_log` and `targets`; `change-log.php` creates `portal_change_log`.
- Core schema has 13 tables. Officer accounts are originally file-based.

## Outstanding audit work

Read and document the body of every listed helper, all frontend event handlers, workbook column rules, PDF geometry, validations and error conditions. Do not mark modules complete until this is done.

## Targeted source review completed in this pass

`auth.php:33-170`: login takes username, password and organization tab. It rejects empty credentials, checks outlet bcrypt plus current zone/region linkage, or checks an officer account with an unambiguous case-insensitive username fallback and organization match. `check` refreshes account scope and page settings and invalidates deleted accounts. `logout` destroys the session. No TypeScript equivalent exists.

`orders.php:943-1057`: `ordCheck` derives outlet and geographic fields from SAP, validates date, SAP, item uniqueness, paid EA plus FOC, stock, rate/GST where required, minimum order and prices on submission, and returns field errors through `ordValidate` with HTTP 422.

`orders.php:2546-2705`: save and submit enforce actor, owner, status and scope rules; edit replaces order lines inside a transaction; submit rechecks items, minimum EA, stock, prices and mapped approvers before moving to pending.

`orders.php:3013-3072`: approval/rejection requires a pending order under both `ordScope` and `ordAwaitCond`; optional `seen_updated_at` protects against stale edits; approval locks and rechecks stock, records events and invoice mode, and calls automatic numbering. Rejection requires a comment.

`mis-core.php:244-270`: `misSync` removes stale order-sourced rows, inserts missing approved nonhistorical order items, and bumps revision only if rows changed.

The remaining action and helper contracts, frontend behavior and original runtime outcomes are **unverified**. This targeted review does not close the full behavioral audit.

