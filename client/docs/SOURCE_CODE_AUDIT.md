# Source code audit — working inventory

This inventory was extracted from the supplied source. It is not a completed behavioral audit. The PHP source remains authoritative; methods must be reviewed in full before porting. The original 86-action inventory missed the early `public_invoice` branch at `orders.php:1062`, so at least 87 actions are reachable.

## PHP actions

| File:line | Action | Dispatched helper |
|---|---|---|
| `auth.php:33` | `login` | `see dispatch body` |
| `auth.php:140` | `check` | `see dispatch body` |
| `auth.php:171` | `logout` | `see dispatch body` |
| `auth.php:176` | `list_users` | `see dispatch body` |
| `auth.php:213` | `list_sales_areas` | `see dispatch body` |
| `auth.php:226` | `update_user_access` | `see dispatch body` |
| `auth.php:352` | `update_user_password` | `see dispatch body` |
| `auth.php:379` | `change_password` | `see dispatch body` |
| `auth.php:415` | `update_contact` | `see dispatch body` |
| `auth.php:429` | `add_user` | `see dispatch body` |
| `auth.php:506` | `add_regional_officer` | `see dispatch body` |
| `auth.php:567` | `update_regional_officer` | `see dispatch body` |
| `auth.php:614` | `delete_user` | `see dispatch body` |
| `auth.php:645` | `add_super_admin` | `see dispatch body` |
| `auth.php:692` | `update_super_admin` | `see dispatch body` |
| `auth.php:712` | `import_officers` | `see dispatch body` |
| `auth.php:720` | `convert_to_sales_areas` | `see dispatch body` |
| `auth.php:729` | `outlet_list` | `see dispatch body` |
| `auth.php:730` | `outlet_lookup` | `see dispatch body` |
| `auth.php:731` | `outlet_add` | `see dispatch body` |
| `auth.php:732` | `outlet_update` | `see dispatch body` |
| `auth.php:733` | `outlet_delete` | `see dispatch body` |
| `auth.php:734` | `outlet_import` | `see dispatch body` |
| `orders.php:1062` | `public_invoice` | early public branch |
| `orders.php:1097` | `meta` | `ordMeta` |
| `orders.php:1098` | `outlet` | `ordOutletLookup` |
| `orders.php:1099` | `sap_list` | `ordSapList` |
| `orders.php:1100` | `sap_save` | `ordSapSave` |
| `orders.php:1101` | `sap_history` | `ordSapHistory` |
| `orders.php:1102` | `sap_import` | `ordSapImport` |
| `orders.php:1103` | `ro_report` | `ordRoReport` |
| `orders.php:1104` | `list` | `ordList` |
| `orders.php:1105` | `get` | `ordGet` |
| `orders.php:1106` | `history` | `ordHistory` |
| `orders.php:1107` | `save` | `ordSave` |
| `orders.php:1108` | `submit` | `ordSubmit` |
| `orders.php:1109` | `delete` | `ordDelete` |
| `orders.php:1110` | `bulk` | `ordBulk` |
| `orders.php:1111` | `set_min_order` | `ordSetMinOrder` |
| `orders.php:1112` | `set_perms` | `ordSetPerms` |
| `orders.php:1113` | `set_prices` | `ordSetPrices` |
| `orders.php:1114` | `set_stock` | `ordSetStock` |
| `orders.php:1115` | `add_product` | `ordAddProduct` |
| `orders.php:1116` | `delete_product` | `ordDeleteProduct` |
| `orders.php:1117` | `save_foc_list` | `ordSaveFocList` |
| `orders.php:1118` | `upload_pod` | `ordUploadFile` |
| `orders.php:1119` | `upload_receipt` | `ordUploadFile` |
| `orders.php:1120` | `upload_invoice` | `ordUploadFile` |
| `orders.php:1121` | `edit_invoice` | `ordEditInvoice` |
| `orders.php:1122` | `pod_download` | `ordFileDownload` |
| `orders.php:1123` | `file_download` | `ordFileDownload` |
| `orders.php:1124` | `return_request` | `ordRetRequest` |
| `orders.php:1125` | `return_list` | `ordRetList` |
| `orders.php:1126` | `return_decide` | `ordRetDecide` |
| `orders.php:1127` | `change_log` | `ordChangeLog` |
| `orders.php:1128` | `outlet_officers` | `ordOutletOfficers` |
| `orders.php:1129` | `profile` | `ordProfile` |
| `orders.php:1130` | `superiors` | `ordSuperiors` |
| `orders.php:1131` | `approve` | `ordDecide` |
| `orders.php:1132` | `reject` | `ordDecide` |
| `api.php:60` | `sales` | `getSales` |
| `api.php:61` | `add` | `addEntry` |
| `api.php:62` | `update` | `updateEntry` |
| `api.php:63` | `delete` | `deleteEntry` |
| `api.php:64` | `import` | `importData` |
| `api.php:65` | `ro_lookup` | `roLookup` |
| `api.php:66` | `ref_lists` | `refLists` |
| `api.php:67` | `add_pending` | `addPending` |
| `api.php:68` | `list_pending` | `listPending` |
| `api.php:69` | `my_pending` | `myPending` |
| `api.php:70` | `approve` | `approvePending` |
| `api.php:71` | `reject` | `rejectPending` |
| `api.php:72` | `edit_pending` | `editPending` |
| `api.php:73` | `delete_pending` | `deletePending` |
| `api.php:74` | `audit_log` | `getAuditLog` |
| `api.php:75` | `pending_count` | `pendingCount` |
| `api.php:76` | `save_note` | `saveNote` |
| `api.php:77` | `get_targets` | `getTargets` |
| `api.php:78` | `save_target` | `saveTarget` |
| `mis.php:32` | `get` | `see dispatch body` |
| `mis.php:34` | `ver` | `misOut` |
| `mis.php:35` | `download` | `misDownload` |
| `mis.php:36` | `outlet` | `misOutlet` |
| `mis.php:37` | `save_row` | `misSaveRow` |
| `mis.php:38` | `delete_row` | `misDeleteRow` |
| `mis.php:39` | `delete_rows` | `misDeleteRows` |
| `mis.php:40` | `import` | `misImport` |

## PHP helper functions

| File:line | Helper |
|---|---|
| `auth.php:752` | `outletActor` |
| `auth.php:766` | `outletZoneOfficers` |
| `auth.php:778` | `outletScopeSql` |
| `auth.php:785` | `outletRegions` |
| `auth.php:792` | `outletLike` |
| `auth.php:795` | `outletCheckOutlet` |
| `auth.php:805` | `outletApi` |
| `auth.php:990` | `userLevel` |
| `auth.php:995` | `denyJson` |
| `auth.php:1005` | `actor` |
| `auth.php:1021` | `cleanContact` |
| `auth.php:1042` | `applyPages` |
| `auth.php:1047` | `applyContact` |
| `auth.php:1059` | `renameUser` |
| `auth.php:1090` | `childrenOf` |
| `auth.php:1097` | `isHpclSuper` |
| `auth.php:1102` | `canManage` |
| `auth.php:1115` | `officerRegions` |
| `auth.php:1126` | `regionSalesAreas` |
| `auth.php:1133` | `saKey` |
| `auth.php:1138` | `cleanRegional` |
| `auth.php:1151` | `passKey` |
| `auth.php:1156` | `passSeal` |
| `auth.php:1165` | `passView` |
| `auth.php:1176` | `setPassword` |
| `auth.php:1188` | `canViewPassword` |
| `auth.php:1194` | `writeUsers` |
| `auth.php:1203` | `validateOrg` |
| `auth.php:1213` | `sheetZones` |
| `auth.php:1218` | `zoneRegions` |
| `auth.php:1228` | `validateRos` |
| `auth.php:1237` | `userZones` |
| `auth.php:1245` | `userSheetZones` |
| `auth.php:1253` | `regionSheetZone` |
| `auth.php:1257` | `regionPortalZone` |
| `auth.php:1268` | `cleanZones` |
| `auth.php:1294` | `superScopeFields` |
| `auth.php:1299` | `cleanStates` |
| `auth.php:1306` | `superLimit` |
| `auth.php:1310` | `genPassword` |
| `auth.php:1319` | `genUsername` |
| `auth.php:1330` | `saTokens` |
| `auth.php:1341` | `salesAreasFor` |
| `auth.php:1362` | `legacySalesAreas` |
| `auth.php:1391` | `convertToSalesAreas` |
| `auth.php:1417` | `importOfficers` |
| `auth.php:1545` | `var_export_short` |
| `users-store.php:16` | `usersPath` |
| `users-store.php:19` | `usersWorkDir` |
| `users-store.php:28` | `usersLock` |
| `users-store.php:36` | `usersParse` |
| `users-store.php:46` | `usersLoad` |
| `users-store.php:68` | `usersWrite` |
| `users-store.php:90` | `usersWriteFail` |
| `outlet-users.php:23` | `ouDb` |
| `outlet-users.php:35` | `ouEnsure` |
| `outlet-users.php:53` | `ouFind` |
| `outlet-users.php:63` | `ouIsProfile` |
| `outlet-users.php:76` | `ouSession` |
| `outlet-users.php:94` | `ouSessionIsOutlet` |
| `outlet-users.php:101` | `ouRuleName` |
| `outlet-users.php:107` | `ouSuffix` |
| `outlet-users.php:113` | `ouRulePassword` |
| `outlet-users.php:118` | `ouHash` |
| `orders.php:107` | `ordFail` |
| `orders.php:113` | `ordOut` |
| `orders.php:118` | `ordDB` |
| `orders.php:135` | `ordEnsureSchema` |
| `orders.php:343` | `ordAddColumns` |
| `orders.php:351` | `ordOutlet` |
| `orders.php:358` | `ordItems` |
| `orders.php:362` | `ordProducts` |
| `orders.php:371` | `ordDirectNames` |
| `orders.php:375` | `ordFocRules` |
| `orders.php:387` | `ordFocFor` |
| `orders.php:396` | `ordFocInfo` |
| `orders.php:409` | `ordFocMigrate` |
| `orders.php:435` | `ordMinOrder` |
| `orders.php:442` | `ordPerms` |
| `orders.php:453` | `ordHpclInvHidden` |
| `orders.php:457` | `ordHideInv` |
| `orders.php:461` | `ordPrices` |
| `orders.php:474` | `ordMissingPrices` |
| `orders.php:479` | `ordMissingPricesMsg` |
| `orders.php:493` | `ordStockEnabled` |
| `orders.php:498` | `ordStock` |
| `orders.php:520` | `ordMinOrderMsg` |
| `orders.php:523` | `ordOutletCount` |
| `orders.php:532` | `ordUser` |
| `orders.php:593` | `ordRequireCsrf` |
| `orders.php:602` | `ordScope` |
| `orders.php:638` | `ordZoneRos` |
| `orders.php:644` | `ordSheetZoneOfRo` |
| `orders.php:649` | `ordRoSql` |
| `orders.php:654` | `ordSaKey` |
| `orders.php:658` | `ordSaSql` |
| `orders.php:664` | `ordCoversRo` |
| `orders.php:668` | `ordCoversSa` |
| `orders.php:674` | `ordCoversOrder` |
| `orders.php:678` | `ordOwns` |
| `orders.php:683` | `ordApprCovers` |
| `orders.php:688` | `ordApprSql` |
| `orders.php:694` | `ordStatesOfScope` |
| `orders.php:701` | `ordSuperApprovers` |
| `orders.php:713` | `ordHpclAs` |
| `orders.php:716` | `ordAdminPlaces` |
| `orders.php:718` | `ordAllZones` |
| `orders.php:721` | `ordUserZones` |
| `orders.php:728` | `ordInZones` |
| `orders.php:734` | `ordApprovers` |
| `orders.php:759` | `ordPlacerRole` |
| `orders.php:765` | `ordApproverText` |
| `orders.php:789` | `ordAwaitCond` |
| `orders.php:813` | `ordMarkDecidable` |
| `orders.php:827` | `ordBackfillPlacedRole` |
| `orders.php:845` | `ordHasApprover` |
| `orders.php:851` | `ordFormat` |
| `orders.php:878` | `ordItemsFor` |
| `orders.php:895` | `ordSelect` |
| `orders.php:902` | `ordLoad` |
| `orders.php:916` | `ordEvents` |
| `orders.php:922` | `ordLogEvent` |
| `orders.php:930` | `ordToday` |
| `orders.php:933` | `ordStr` |
| `orders.php:943` | `ordValidate` |
| `orders.php:954` | `ordCheck` |
| `orders.php:1142` | `ordMeta` |
| `orders.php:1192` | `ordSetPrices` |
| `orders.php:1220` | `ordSetStock` |
| `orders.php:1253` | `ordAddProduct` |
| `orders.php:1270` | `ordDeleteProduct` |
| `orders.php:1286` | `ordSaveFocList` |
| `orders.php:1353` | `ordSetMinOrder` |
| `orders.php:1370` | `ordSetPerms` |
| `orders.php:1385` | `ordAutoSteps` |
| `orders.php:1393` | `ordFinalizeSO` |
| `orders.php:1411` | `ordGiveNumber` |
| `orders.php:1429` | `ordHealStages` |
| `orders.php:1443` | `ordIniBytes` |
| `orders.php:1450` | `ordPodMaxBytes` |
| `orders.php:1455` | `ordFileInfo` |
| `orders.php:1464` | `ordPodContentOk` |
| `orders.php:1477` | `ordPodDir` |
| `orders.php:1484` | `ordPodLimitMsg` |
| `orders.php:1492` | `ordUploadFile` |
| `orders.php:1582` | `ordEditInvoice` |
| `orders.php:1632` | `ordFileDownload` |
| `orders.php:1656` | `ordOutletLookup` |
| `orders.php:1692` | `ordSapAccess` |
| `orders.php:1706` | `ordSapScope` |
| `orders.php:1719` | `ordRegionInfo` |
| `orders.php:1728` | `ordSapList` |
| `orders.php:1789` | `ordSapSave` |
| `orders.php:1871` | `ordSapImportClean` |
| `orders.php:1876` | `ordSapImportNum` |
| `orders.php:1878` | `ordSapImportBlank` |
| `orders.php:1881` | `ordSapImportPlan` |
| `orders.php:1942` | `ordSapImport` |
| `orders.php:2007` | `ordChangeLog` |
| `orders.php:2044` | `ordMeInfo` |
| `orders.php:2056` | `ordProfile` |
| `orders.php:2097` | `ordHpclTier` |
| `orders.php:2109` | `ordSuperiors` |
| `orders.php:2180` | `ordOutletProfile` |
| `orders.php:2194` | `ordOfficersOf` |
| `orders.php:2218` | `ordOutletOfficers` |
| `orders.php:2238` | `ordSapHistory` |
| `orders.php:2256` | `ordRoReportOrders` |
| `orders.php:2327` | `ordRoReport` |
| `orders.php:2456` | `ordList` |
| `orders.php:2511` | `ordHistory` |
| `orders.php:2528` | `ordGet` |
| `orders.php:2546` | `ordSave` |
| `orders.php:2637` | `ordPlaceInsert` |
| `orders.php:2647` | `ordInsertDraft` |
| `orders.php:2656` | `ordInsertItems` |
| `orders.php:2662` | `ordMoveToPending` |
| `orders.php:2677` | `ordSubmit` |
| `orders.php:2716` | `ordBulkBrand` |
| `orders.php:2722` | `ordBulkInt` |
| `orders.php:2727` | `ordBulkName` |
| `orders.php:2729` | `ordBulk` |
| `orders.php:2869` | `ordDelete` |
| `orders.php:2884` | `ordRetWho` |
| `orders.php:2889` | `ordRetMayDecide` |
| `orders.php:2894` | `ordRetAttach` |
| `orders.php:2904` | `ordRetRow` |
| `orders.php:2910` | `ordRetDecidable` |
| `orders.php:2917` | `ordRetMeta` |
| `orders.php:2930` | `ordRetRequest` |
| `orders.php:2956` | `ordRetList` |
| `orders.php:2987` | `ordRetDecide` |
| `orders.php:3013` | `ordDecide` |
| `api.php:21` | `getDB` |
| `api.php:89` | `norm` |
| `api.php:98` | `resolveColumns` |
| `api.php:178` | `cleanStr` |
| `api.php:185` | `ensureAuditTable` |
| `api.php:195` | `logAudit` |
| `api.php:204` | `getAuditLog` |
| `api.php:214` | `pendingCount` |
| `api.php:223` | `saveNote` |
| `api.php:238` | `ensureTargetsTable` |
| `api.php:249` | `getTargets` |
| `api.php:261` | `saveTarget` |
| `api.php:283` | `getSales` |
| `api.php:350` | `sheetResolveDates` |
| `api.php:394` | `portalPaidSql` |
| `api.php:398` | `portalOrdersExist` |
| `api.php:404` | `portalOrderScope` |
| `api.php:413` | `portalOrderRows` |
| `api.php:446` | `portalOrderSummary` |
| `api.php:465` | `apiEditor` |
| `api.php:471` | `apiMisKeys` |
| `api.php:472` | `apiMisFields` |
| `api.php:478` | `addEntry` |
| `api.php:495` | `updateEntry` |
| `api.php:514` | `deleteEntry` |
| `api.php:529` | `importData` |
| `api.php:568` | `refLists` |
| `api.php:574` | `roLookup` |
| `api.php:670` | `requireSession` |
| `api.php:679` | `addPending` |
| `api.php:701` | `myPending` |
| `api.php:722` | `listPending` |
| `api.php:745` | `approvePending` |
| `api.php:794` | `rejectPending` |
| `api.php:814` | `editPending` |
| `api.php:845` | `deletePending` |
| `mis-core.php:28` | `misFail` |
| `mis-core.php:32` | `misOut` |
| `mis-core.php:36` | `misDB` |
| `mis-core.php:46` | `misUser` |
| `mis-core.php:59` | `misKey` |
| `mis-core.php:61` | `misKeySql` |
| `mis-core.php:68` | `misScope` |
| `mis-core.php:103` | `misScopeSaps` |
| `mis-core.php:116` | `misScopeSql` |
| `mis-core.php:132` | `misRowInScope` |
| `mis-core.php:144` | `misRequireCsrf` |
| `mis-core.php:150` | `misEnsureSchema` |
| `mis-core.php:194` | `misMeta` |
| `mis-core.php:198` | `misMetaSet` |
| `mis-core.php:202` | `misBump` |
| `mis-core.php:207` | `misHasOrders` |
| `mis-core.php:212` | `misNormKey` |
| `mis-core.php:214` | `misCanonMaps` |
| `mis-core.php:225` | `misCanon` |
| `mis-core.php:237` | `misItemName` |
| `mis-core.php:244` | `misSync` |
| `mis-core.php:271` | `misN` |
| `mis-core.php:272` | `misRowOut` |
| `mis-core.php:277` | `misAllRows` |
| `mis-core.php:288` | `misPivots` |
| `mis-core.php:304` | `misWhere` |
| `mis-core.php:316` | `misDistinct` |
| `mis-core.php:323` | `misMonths` |
| `mis-core.php:329` | `misMonthTitle` |
| `mis-core.php:331` | `misGet` |
| `mis-core.php:353` | `misClean` |
| `mis-core.php:359` | `misCanonItem` |
| `mis-core.php:364` | `misCheckFields` |
| `mis-core.php:389` | `misLogVal` |
| `mis-core.php:394` | `misLogRow` |
| `mis-core.php:400` | `misLogTitle` |
| `mis-core.php:404` | `misLogDiff` |
| `mis-core.php:413` | `misLogFilter` |
| `mis-core.php:421` | `misSaveRow` |
| `mis-core.php:457` | `misDeleteRow` |
| `mis-core.php:474` | `misDeleteRows` |
| `mis-core.php:512` | `misImportRow` |
| `mis-core.php:541` | `misImport` |
| `mis-core.php:580` | `misOutlet` |
| `mis-core.php:592` | `misDownload` |
| `mis-xlsx.php:23` | `misZipRead` |
| `mis-xlsx.php:45` | `misZipWrite` |
| `mis-xlsx.php:61` | `misColName` |
| `mis-xlsx.php:62` | `misX` |
| `mis-xlsx.php:66` | `misNum` |
| `mis-xlsx.php:72` | `misSerial` |
| `mis-xlsx.php:74` | `misCell` |
| `mis-xlsx.php:83` | `misRow` |
| `mis-xlsx.php:85` | `misDom` |
| `mis-xlsx.php:90` | `misDomOut` |
| `mis-xlsx.php:94` | `misXp` |
| `mis-xlsx.php:196` | `misRowVal` |
| `mis-xlsx.php:204` | `misPivotModel` |
| `mis-xlsx.php:272` | `misMonthHead` |
| `mis-xlsx.php:276` | `misMS` |
| `mis-xlsx.php:279` | `misCols` |
| `mis-xlsx.php:299` | `misBuildXlsx` |
| `mis-xlsx.php:372` | `misSortCells` |
| `mis-xlsx.php:379` | `misBlanks` |
| `mis-xlsx.php:381` | `misBuildReports` |
| `mis-xlsx.php:491` | `misColsOf` |
| `mis-xlsx.php:493` | `misColItems` |
| `mis-xlsx.php:500` | `misSheet` |
| `mis-xlsx.php:510` | `misBuildCache` |
| `mis-xlsx.php:592` | `misRecText` |
| `regions.php:175` | `approvalStateList` |
| `regions.php:183` | `approvalStates` |
| `change-log.php:11` | `chgEnsure` |
| `change-log.php:31` | `chgRole` |
| `change-log.php:40` | `chgAdd` |
| `change-log.php:57` | `chgFetch` |

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

