# Source code audit — working inventory

This inventory was checked against the supplied PHP dispatch switches and the early `public_invoice` branch at `orders.php:1062`. The original script missed that branch. `python scripts/source_inventory.py` reports **87 actions and 305 declared PHP functions** without overwriting these notes. The 23 `auth.php` actions and 63 reachable authentication helpers have source contracts in [AUTHENTICATION_AUDIT_REPORT.md](AUTHENTICATION_AUDIT_REPORT.md); three authentication helper call sites remain unknown. All 37 `orders.php` actions and 129 order helpers have source contracts in [ORDERS_AUDIT_REPORT.md](ORDERS_AUDIT_REPORT.md). All 19 `api.php` actions and 36 API helpers were examined in [API_AUDIT_REPORT.md](API_AUDIT_REPORT.md); 32 helpers are route-reachable and four are not route-reachable in the supplied router. All eight `mis.php` actions, 45 MIS core helpers, 25 XLSX helpers and four shared change-log helpers have source contracts in [MIS_AUDIT_REPORT.md](MIS_AUDIT_REPORT.md). The PHP source remains authoritative.

## Completeness gate (2026-11-22)

| Measure | Result |
|---|---:|
| Discovered dispatchable actions | 87 (23 `auth`, 37 `orders` including `public_invoice`, 19 `api`, 8 `mis`) |
| Syntactically routable by PHP dispatch URL/body | 87; runtime execution needs the absent `config.php` and a populated local database |
| Confirmed dead actions | 0; frontend usage is not a reachability requirement for a public route |
| Declared PHP helper functions | 305 |
| Confirmed reachable helper functions | 298: 63 authentication, 129 orders, 32 API, 45 MIS core, 25 XLSX and 4 shared change-log helpers traced to supplied route call chains |
| Helpers requiring TypeScript migration | Rule/security/calculation helpers need local equivalents; server/database/file adapters need local replacements; 3 auth helper reachability questions remain unknown |
| Fully audited actions | 87 (23 `auth.php`, 37 `orders.php`, 19 `api.php`, 8 `mis.php`); no Android implementation |
| Pending actions | 0 in the supplied dispatch inventory; runtime parity remains unverified |
| Fully audited authentication helpers | 63 of 66 declared in focus files; 3 have unknown reachability |
| Fully audited orders helpers | 129 of 129 declared in `orders.php`; all traced to a route in supplied PHP |
| API helpers examined | 36: 32 route-reachable AUDITED, 4 NOT_REQUIRED for current API routes |
| MIS and shared helpers audited | 74: 45 `mis-core.php`, 25 `mis-xlsx.php`, 4 `change-log.php`; all route-reachable directly or indirectly |

The 305 functions include 25 in `mis-xlsx.php`; this file contains a NUL byte, so ordinary `rg` treats it as binary and undercounts functions. The inventory script reads it as text. The frontend files `index.html`, `orders.js`, `mis.js`, `dash-reports.js`, `salesorder.js`, and `invoice.html` call the PHP endpoints; `invoice.html:32` calls `public_invoice`. API action names repeat across separate endpoints (`approve`, `delete`, `get`, `import`); these are distinct routes, not duplicate implementations. No action is proven dead merely because a static search missed a browser caller.

### Source limits and exact remaining work

`auth.php`, `orders.php`, `api.php`, and `mis-core.php` include `config.php`, which is absent; only `config.example.php` is supplied. `users-store.php` reads `users.php`, also absent; `03-demo-data/users.demo.php` is the supplied demo substitute. `mis-core.php:174` references absent `mis-data/seed.json`, while `mis-core.php:289` and `mis-xlsx.php` need absent `mis-data/template.xlsx`. The JSON demo MIS rows are supplied separately, but they do not recreate the workbook package. The original live configuration, live officer roster, and workbook cannot be audited from this kit.

The API audit also found no supplied DDL or data for `PENDING_TABLE` (demo config calls it `pending_entries`) or the configured `RO_REF_DB.RO_REF_TABLE` fallback reference sheet. The API's pending workflow and reference lookup are source-audited, but their live table constraints and production contents cannot be verified from this kit; see [API_AUDIT_REPORT.md](API_AUDIT_REPORT.md).

The eight MIS action contracts and 74 MIS/shared helper contracts are in [MIS_AUDIT_REPORT.md](MIS_AUDIT_REPORT.md). The three unknown-reachability authentication helpers remain unresolved. The earlier selected fragments at the end of this file are superseded by the module reports. No Phase 2 implementation is authorized by this source audit.

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

The 37 `orders.php` rows below are index entries. Their complete source ranges, frontend callers, method/CSRF contract, field validation, actor and data scope, SQL/file/transaction effects, response/error contract, duplicate behavior and proposed Android tests are in [ORDERS_AUDIT_REPORT.md](ORDERS_AUDIT_REPORT.md#18-metadata-outlet-and-sap). The 129 order helper contracts and direct caller register are in its [helper section](ORDERS_AUDIT_REPORT.md#helper-dependency-register). `AUDITED` never means implemented.

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
| `orders.php:1062` | `public_invoice` | early public branch | AUDITED |
| `orders.php:1097` | `meta` | `ordMeta` | AUDITED |
| `orders.php:1098` | `outlet` | `ordOutletLookup` | AUDITED |
| `orders.php:1099` | `sap_list` | `ordSapList` | AUDITED |
| `orders.php:1100` | `sap_save` | `ordSapSave` | AUDITED |
| `orders.php:1101` | `sap_history` | `ordSapHistory` | AUDITED |
| `orders.php:1102` | `sap_import` | `ordSapImport` | AUDITED |
| `orders.php:1103` | `ro_report` | `ordRoReport` | AUDITED |
| `orders.php:1104` | `list` | `ordList` | AUDITED |
| `orders.php:1105` | `get` | `ordGet` | AUDITED |
| `orders.php:1106` | `history` | `ordHistory` | AUDITED |
| `orders.php:1107` | `save` | `ordSave` | AUDITED |
| `orders.php:1108` | `submit` | `ordSubmit` | AUDITED |
| `orders.php:1109` | `delete` | `ordDelete` | AUDITED |
| `orders.php:1110` | `bulk` | `ordBulk` | AUDITED |
| `orders.php:1111` | `set_min_order` | `ordSetMinOrder` | AUDITED |
| `orders.php:1112` | `set_perms` | `ordSetPerms` | AUDITED |
| `orders.php:1113` | `set_prices` | `ordSetPrices` | AUDITED |
| `orders.php:1114` | `set_stock` | `ordSetStock` | AUDITED |
| `orders.php:1115` | `add_product` | `ordAddProduct` | AUDITED |
| `orders.php:1116` | `delete_product` | `ordDeleteProduct` | AUDITED |
| `orders.php:1117` | `save_foc_list` | `ordSaveFocList` | AUDITED |
| `orders.php:1118` | `upload_pod` | `ordUploadFile` | AUDITED |
| `orders.php:1119` | `upload_receipt` | `ordUploadFile` | AUDITED |
| `orders.php:1120` | `upload_invoice` | `ordUploadFile` | AUDITED |
| `orders.php:1121` | `edit_invoice` | `ordEditInvoice` | AUDITED |
| `orders.php:1122` | `pod_download` | `ordFileDownload` | AUDITED |
| `orders.php:1123` | `file_download` | `ordFileDownload` | AUDITED |
| `orders.php:1124` | `return_request` | `ordRetRequest` | AUDITED |
| `orders.php:1125` | `return_list` | `ordRetList` | AUDITED |
| `orders.php:1126` | `return_decide` | `ordRetDecide` | AUDITED |
| `orders.php:1127` | `change_log` | `ordChangeLog` | AUDITED |
| `orders.php:1128` | `outlet_officers` | `ordOutletOfficers` | AUDITED |
| `orders.php:1129` | `profile` | `ordProfile` | AUDITED |
| `orders.php:1130` | `superiors` | `ordSuperiors` | AUDITED |
| `orders.php:1131` | `approve` | `ordDecide` | AUDITED |
| `orders.php:1132` | `reject` | `ordDecide` | AUDITED |
| `api.php:60` | `sales` | `getSales` | AUDITED |
| `api.php:61` | `add` | `addEntry` | AUDITED |
| `api.php:62` | `update` | `updateEntry` | AUDITED |
| `api.php:63` | `delete` | `deleteEntry` | AUDITED |
| `api.php:64` | `import` | `importData` | AUDITED |
| `api.php:65` | `ro_lookup` | `roLookup` | AUDITED |
| `api.php:66` | `ref_lists` | `refLists` | AUDITED |
| `api.php:67` | `add_pending` | `addPending` | AUDITED |
| `api.php:68` | `list_pending` | `listPending` | AUDITED |
| `api.php:69` | `my_pending` | `myPending` | AUDITED |
| `api.php:70` | `approve` | `approvePending` | AUDITED |
| `api.php:71` | `reject` | `rejectPending` | AUDITED |
| `api.php:72` | `edit_pending` | `editPending` | AUDITED |
| `api.php:73` | `delete_pending` | `deletePending` | AUDITED |
| `api.php:74` | `audit_log` | `getAuditLog` | AUDITED |
| `api.php:75` | `pending_count` | `pendingCount` | AUDITED |
| `api.php:76` | `save_note` | `saveNote` | AUDITED |
| `api.php:77` | `get_targets` | `getTargets` | AUDITED |
| `api.php:78` | `save_target` | `saveTarget` | AUDITED |
| `mis.php:32` | `get` | `misGet` | AUDITED |
| `mis.php:34` | `ver` | `misMeta/misOut` | AUDITED |
| `mis.php:35` | `download` | `misDownload` | AUDITED |
| `mis.php:36` | `outlet` | `misOutlet` | AUDITED |
| `mis.php:37` | `save_row` | `misSaveRow` | AUDITED |
| `mis.php:38` | `delete_row` | `misDeleteRow` | AUDITED |
| `mis.php:39` | `delete_rows` | `misDeleteRows` | AUDITED |
| `mis.php:40` | `import` | `misImport` | AUDITED |

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
| `orders.php:107` | `ordFail` | AUDITED |
| `orders.php:113` | `ordOut` | AUDITED |
| `orders.php:118` | `ordDB` | AUDITED |
| `orders.php:135` | `ordEnsureSchema` | AUDITED |
| `orders.php:343` | `ordAddColumns` | AUDITED |
| `orders.php:351` | `ordOutlet` | AUDITED |
| `orders.php:358` | `ordItems` | AUDITED |
| `orders.php:362` | `ordProducts` | AUDITED |
| `orders.php:371` | `ordDirectNames` | AUDITED |
| `orders.php:375` | `ordFocRules` | AUDITED |
| `orders.php:387` | `ordFocFor` | AUDITED |
| `orders.php:396` | `ordFocInfo` | AUDITED |
| `orders.php:409` | `ordFocMigrate` | AUDITED |
| `orders.php:435` | `ordMinOrder` | AUDITED |
| `orders.php:442` | `ordPerms` | AUDITED |
| `orders.php:453` | `ordHpclInvHidden` | AUDITED |
| `orders.php:457` | `ordHideInv` | AUDITED |
| `orders.php:461` | `ordPrices` | AUDITED |
| `orders.php:474` | `ordMissingPrices` | AUDITED |
| `orders.php:479` | `ordMissingPricesMsg` | AUDITED |
| `orders.php:493` | `ordStockEnabled` | AUDITED |
| `orders.php:498` | `ordStock` | AUDITED |
| `orders.php:520` | `ordMinOrderMsg` | AUDITED |
| `orders.php:523` | `ordOutletCount` | AUDITED |
| `orders.php:532` | `ordUser` | AUDITED |
| `orders.php:593` | `ordRequireCsrf` | AUDITED |
| `orders.php:602` | `ordScope` | AUDITED |
| `orders.php:638` | `ordZoneRos` | AUDITED |
| `orders.php:644` | `ordSheetZoneOfRo` | AUDITED |
| `orders.php:649` | `ordRoSql` | AUDITED |
| `orders.php:654` | `ordSaKey` | AUDITED |
| `orders.php:658` | `ordSaSql` | AUDITED |
| `orders.php:664` | `ordCoversRo` | AUDITED |
| `orders.php:668` | `ordCoversSa` | AUDITED |
| `orders.php:674` | `ordCoversOrder` | AUDITED |
| `orders.php:678` | `ordOwns` | AUDITED |
| `orders.php:683` | `ordApprCovers` | AUDITED |
| `orders.php:688` | `ordApprSql` | AUDITED |
| `orders.php:694` | `ordStatesOfScope` | AUDITED |
| `orders.php:701` | `ordSuperApprovers` | AUDITED |
| `orders.php:713` | `ordHpclAs` | AUDITED |
| `orders.php:716` | `ordAdminPlaces` | AUDITED |
| `orders.php:718` | `ordAllZones` | AUDITED |
| `orders.php:721` | `ordUserZones` | AUDITED |
| `orders.php:728` | `ordInZones` | AUDITED |
| `orders.php:734` | `ordApprovers` | AUDITED |
| `orders.php:759` | `ordPlacerRole` | AUDITED |
| `orders.php:765` | `ordApproverText` | AUDITED |
| `orders.php:789` | `ordAwaitCond` | AUDITED |
| `orders.php:813` | `ordMarkDecidable` | AUDITED |
| `orders.php:827` | `ordBackfillPlacedRole` | AUDITED |
| `orders.php:845` | `ordHasApprover` | AUDITED |
| `orders.php:851` | `ordFormat` | AUDITED |
| `orders.php:878` | `ordItemsFor` | AUDITED |
| `orders.php:895` | `ordSelect` | AUDITED |
| `orders.php:902` | `ordLoad` | AUDITED |
| `orders.php:916` | `ordEvents` | AUDITED |
| `orders.php:922` | `ordLogEvent` | AUDITED |
| `orders.php:930` | `ordToday` | AUDITED |
| `orders.php:933` | `ordStr` | AUDITED |
| `orders.php:943` | `ordValidate` | AUDITED |
| `orders.php:954` | `ordCheck` | AUDITED |
| `orders.php:1142` | `ordMeta` | AUDITED |
| `orders.php:1192` | `ordSetPrices` | AUDITED |
| `orders.php:1220` | `ordSetStock` | AUDITED |
| `orders.php:1253` | `ordAddProduct` | AUDITED |
| `orders.php:1270` | `ordDeleteProduct` | AUDITED |
| `orders.php:1286` | `ordSaveFocList` | AUDITED |
| `orders.php:1353` | `ordSetMinOrder` | AUDITED |
| `orders.php:1370` | `ordSetPerms` | AUDITED |
| `orders.php:1385` | `ordAutoSteps` | AUDITED |
| `orders.php:1393` | `ordFinalizeSO` | AUDITED |
| `orders.php:1411` | `ordGiveNumber` | AUDITED |
| `orders.php:1429` | `ordHealStages` | AUDITED |
| `orders.php:1443` | `ordIniBytes` | AUDITED |
| `orders.php:1450` | `ordPodMaxBytes` | AUDITED |
| `orders.php:1455` | `ordFileInfo` | AUDITED |
| `orders.php:1464` | `ordPodContentOk` | AUDITED |
| `orders.php:1477` | `ordPodDir` | AUDITED |
| `orders.php:1484` | `ordPodLimitMsg` | AUDITED |
| `orders.php:1492` | `ordUploadFile` | AUDITED |
| `orders.php:1582` | `ordEditInvoice` | AUDITED |
| `orders.php:1632` | `ordFileDownload` | AUDITED |
| `orders.php:1656` | `ordOutletLookup` | AUDITED |
| `orders.php:1692` | `ordSapAccess` | AUDITED |
| `orders.php:1706` | `ordSapScope` | AUDITED |
| `orders.php:1719` | `ordRegionInfo` | AUDITED |
| `orders.php:1728` | `ordSapList` | AUDITED |
| `orders.php:1789` | `ordSapSave` | AUDITED |
| `orders.php:1871` | `ordSapImportClean` | AUDITED |
| `orders.php:1876` | `ordSapImportNum` | AUDITED |
| `orders.php:1878` | `ordSapImportBlank` | AUDITED |
| `orders.php:1881` | `ordSapImportPlan` | AUDITED |
| `orders.php:1942` | `ordSapImport` | AUDITED |
| `orders.php:2007` | `ordChangeLog` | AUDITED |
| `orders.php:2044` | `ordMeInfo` | AUDITED |
| `orders.php:2056` | `ordProfile` | AUDITED |
| `orders.php:2097` | `ordHpclTier` | AUDITED |
| `orders.php:2109` | `ordSuperiors` | AUDITED |
| `orders.php:2180` | `ordOutletProfile` | AUDITED |
| `orders.php:2194` | `ordOfficersOf` | AUDITED |
| `orders.php:2218` | `ordOutletOfficers` | AUDITED |
| `orders.php:2238` | `ordSapHistory` | AUDITED |
| `orders.php:2256` | `ordRoReportOrders` | AUDITED |
| `orders.php:2327` | `ordRoReport` | AUDITED |
| `orders.php:2456` | `ordList` | AUDITED |
| `orders.php:2511` | `ordHistory` | AUDITED |
| `orders.php:2528` | `ordGet` | AUDITED |
| `orders.php:2546` | `ordSave` | AUDITED |
| `orders.php:2637` | `ordPlaceInsert` | AUDITED |
| `orders.php:2647` | `ordInsertDraft` | AUDITED |
| `orders.php:2656` | `ordInsertItems` | AUDITED |
| `orders.php:2662` | `ordMoveToPending` | AUDITED |
| `orders.php:2677` | `ordSubmit` | AUDITED |
| `orders.php:2716` | `ordBulkBrand` | AUDITED |
| `orders.php:2722` | `ordBulkInt` | AUDITED |
| `orders.php:2727` | `ordBulkName` | AUDITED |
| `orders.php:2729` | `ordBulk` | AUDITED |
| `orders.php:2869` | `ordDelete` | AUDITED |
| `orders.php:2884` | `ordRetWho` | AUDITED |
| `orders.php:2889` | `ordRetMayDecide` | AUDITED |
| `orders.php:2894` | `ordRetAttach` | AUDITED |
| `orders.php:2904` | `ordRetRow` | AUDITED |
| `orders.php:2910` | `ordRetDecidable` | AUDITED |
| `orders.php:2917` | `ordRetMeta` | AUDITED |
| `orders.php:2930` | `ordRetRequest` | AUDITED |
| `orders.php:2956` | `ordRetList` | AUDITED |
| `orders.php:2987` | `ordRetDecide` | AUDITED |
| `orders.php:3013` | `ordDecide` | AUDITED |
| `api.php:21` | `getDB` | AUDITED |
| `api.php:89` | `norm` | NOT_REQUIRED |
| `api.php:98` | `resolveColumns` | NOT_REQUIRED |
| `api.php:178` | `cleanStr` | AUDITED |
| `api.php:185` | `ensureAuditTable` | AUDITED |
| `api.php:195` | `logAudit` | AUDITED |
| `api.php:204` | `getAuditLog` | AUDITED |
| `api.php:214` | `pendingCount` | AUDITED |
| `api.php:223` | `saveNote` | AUDITED |
| `api.php:238` | `ensureTargetsTable` | AUDITED |
| `api.php:249` | `getTargets` | AUDITED |
| `api.php:261` | `saveTarget` | AUDITED |
| `api.php:283` | `getSales` | AUDITED |
| `api.php:350` | `sheetResolveDates` | NOT_REQUIRED |
| `api.php:394` | `portalPaidSql` | AUDITED |
| `api.php:398` | `portalOrdersExist` | AUDITED |
| `api.php:404` | `portalOrderScope` | AUDITED |
| `api.php:413` | `portalOrderRows` | NOT_REQUIRED |
| `api.php:446` | `portalOrderSummary` | AUDITED |
| `api.php:465` | `apiEditor` | AUDITED |
| `api.php:471` | `apiMisKeys` | AUDITED |
| `api.php:472` | `apiMisFields` | AUDITED |
| `api.php:478` | `addEntry` | AUDITED |
| `api.php:495` | `updateEntry` | AUDITED |
| `api.php:514` | `deleteEntry` | AUDITED |
| `api.php:529` | `importData` | AUDITED |
| `api.php:568` | `refLists` | AUDITED |
| `api.php:574` | `roLookup` | AUDITED |
| `api.php:670` | `requireSession` | AUDITED |
| `api.php:679` | `addPending` | AUDITED |
| `api.php:701` | `myPending` | AUDITED |
| `api.php:722` | `listPending` | AUDITED |
| `api.php:745` | `approvePending` | AUDITED |
| `api.php:794` | `rejectPending` | AUDITED |
| `api.php:814` | `editPending` | AUDITED |
| `api.php:845` | `deletePending` | AUDITED |
| `mis-core.php:28` | `misFail` | AUDITED |
| `mis-core.php:32` | `misOut` | AUDITED |
| `mis-core.php:36` | `misDB` | AUDITED |
| `mis-core.php:46` | `misUser` | AUDITED |
| `mis-core.php:59` | `misKey` | AUDITED |
| `mis-core.php:61` | `misKeySql` | AUDITED |
| `mis-core.php:68` | `misScope` | AUDITED |
| `mis-core.php:103` | `misScopeSaps` | AUDITED |
| `mis-core.php:116` | `misScopeSql` | AUDITED |
| `mis-core.php:132` | `misRowInScope` | AUDITED |
| `mis-core.php:144` | `misRequireCsrf` | AUDITED |
| `mis-core.php:150` | `misEnsureSchema` | AUDITED |
| `mis-core.php:194` | `misMeta` | AUDITED |
| `mis-core.php:198` | `misMetaSet` | AUDITED |
| `mis-core.php:202` | `misBump` | AUDITED |
| `mis-core.php:207` | `misHasOrders` | AUDITED |
| `mis-core.php:212` | `misNormKey` | AUDITED |
| `mis-core.php:214` | `misCanonMaps` | AUDITED |
| `mis-core.php:225` | `misCanon` | AUDITED |
| `mis-core.php:237` | `misItemName` | AUDITED |
| `mis-core.php:244` | `misSync` | AUDITED |
| `mis-core.php:271` | `misN` | AUDITED |
| `mis-core.php:272` | `misRowOut` | AUDITED |
| `mis-core.php:277` | `misAllRows` | AUDITED |
| `mis-core.php:288` | `misPivots` | AUDITED |
| `mis-core.php:304` | `misWhere` | AUDITED |
| `mis-core.php:316` | `misDistinct` | AUDITED |
| `mis-core.php:323` | `misMonths` | AUDITED |
| `mis-core.php:329` | `misMonthTitle` | AUDITED |
| `mis-core.php:331` | `misGet` | AUDITED |
| `mis-core.php:353` | `misClean` | AUDITED |
| `mis-core.php:359` | `misCanonItem` | AUDITED |
| `mis-core.php:364` | `misCheckFields` | AUDITED |
| `mis-core.php:389` | `misLogVal` | AUDITED |
| `mis-core.php:394` | `misLogRow` | AUDITED |
| `mis-core.php:400` | `misLogTitle` | AUDITED |
| `mis-core.php:404` | `misLogDiff` | AUDITED |
| `mis-core.php:413` | `misLogFilter` | AUDITED |
| `mis-core.php:421` | `misSaveRow` | AUDITED |
| `mis-core.php:457` | `misDeleteRow` | AUDITED |
| `mis-core.php:474` | `misDeleteRows` | AUDITED |
| `mis-core.php:512` | `misImportRow` | AUDITED |
| `mis-core.php:541` | `misImport` | AUDITED |
| `mis-core.php:580` | `misOutlet` | AUDITED |
| `mis-core.php:592` | `misDownload` | AUDITED |
| `mis-xlsx.php:23` | `misZipRead` | AUDITED |
| `mis-xlsx.php:45` | `misZipWrite` | AUDITED |
| `mis-xlsx.php:61` | `misColName` | AUDITED |
| `mis-xlsx.php:62` | `misX` | AUDITED |
| `mis-xlsx.php:66` | `misNum` | AUDITED |
| `mis-xlsx.php:72` | `misSerial` | AUDITED |
| `mis-xlsx.php:74` | `misCell` | AUDITED |
| `mis-xlsx.php:83` | `misRow` | AUDITED |
| `mis-xlsx.php:85` | `misDom` | AUDITED |
| `mis-xlsx.php:90` | `misDomOut` | AUDITED |
| `mis-xlsx.php:94` | `misXp` | AUDITED |
| `mis-xlsx.php:196` | `misRowVal` | AUDITED |
| `mis-xlsx.php:204` | `misPivotModel` | AUDITED |
| `mis-xlsx.php:272` | `misMonthHead` | AUDITED |
| `mis-xlsx.php:276` | `misMS` | AUDITED |
| `mis-xlsx.php:279` | `misCols` | AUDITED |
| `mis-xlsx.php:299` | `misBuildXlsx` | AUDITED |
| `mis-xlsx.php:372` | `misSortCells` | AUDITED |
| `mis-xlsx.php:379` | `misBlanks` | AUDITED |
| `mis-xlsx.php:381` | `misBuildReports` | AUDITED |
| `mis-xlsx.php:491` | `misColsOf` | AUDITED |
| `mis-xlsx.php:493` | `misColItems` | AUDITED |
| `mis-xlsx.php:500` | `misSheet` | AUDITED |
| `mis-xlsx.php:510` | `misBuildCache` | AUDITED |
| `mis-xlsx.php:592` | `misRecText` | AUDITED |
| `regions.php:175` | `approvalStateList` | AUDITED |
| `regions.php:183` | `approvalStates` | AUDITED |
| `change-log.php:11` | `chgEnsure` | AUDITED |
| `change-log.php:31` | `chgRole` | AUDITED |
| `change-log.php:40` | `chgAdd` | AUDITED |
| `change-log.php:57` | `chgFetch` | AUDITED |

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

