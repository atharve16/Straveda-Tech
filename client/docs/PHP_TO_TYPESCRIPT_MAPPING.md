# PHP to TypeScript mapping — working inventory

Each row is a distinct endpoint/action pair to evaluate for a local Android service. There are 87 rows, including `orders.public_invoice`; repeated action words at different endpoints are separate contracts. The 23 `auth.php` source contracts are `AUDITED` in [AUTHENTICATION_AUDIT_REPORT.md](AUTHENTICATION_AUDIT_REPORT.md), and the 37 `orders.php` contracts are `AUDITED` in [ORDERS_AUDIT_REPORT.md](ORDERS_AUDIT_REPORT.md). The remaining 27 API/MIS actions need audit. TypeScript service names and test paths are proposed migration targets, not existing code. No action has a working Android business implementation or a `client/src/` service. The 305 helper statuses are tracked in `SOURCE_CODE_AUDIT.md`.

| PHP location | Action | PHP helper | Planned TypeScript service | Automated test | Status |
|---|---|---|---|---|---|
| `auth.php:33` | `login` | `usersLoad`, `ouFind`, `ouSession`, `ouIsProfile`, `userLevel`, `writeUsers` | `auth.login` | `tests/regression/auth/login.test.ts` | AUDITED |
| `auth.php:140` | `check` | `ouSessionIsOutlet`, `ouFind`, `ouSession`, `usersLoad`, `userLevel` | `auth.check` | `tests/regression/auth/check.test.ts` | AUDITED |
| `auth.php:171` | `logout` | PHP session only | `auth.logout` | `tests/regression/auth/logout.test.ts` | AUDITED |
| `auth.php:176` | `list_users` | `actor`, `canManage`, `canViewPassword`, `passView`, `approvalStates`, zone helpers | `auth.list_users` | `tests/regression/auth/list_users.test.ts` | AUDITED |
| `auth.php:213` | `list_sales_areas` | `actor`, `superLimit`, `officerRegions`, `regionSalesAreas` | `auth.list_sales_areas` | `tests/regression/auth/list_sales_areas.test.ts` | AUDITED |
| `auth.php:226` | `update_user_access` | `actor`, `cleanZones`, `applyPages`, `childrenOf`, `cleanContact`, `renameUser`, `writeUsers` | `auth.update_user_access` | `tests/regression/auth/update_user_access.test.ts` | AUDITED |
| `auth.php:352` | `update_user_password` | `actor`, `canManage`, `setPassword`, `writeUsers` | `auth.update_user_password` | `tests/regression/auth/update_user_password.test.ts` | AUDITED |
| `auth.php:379` | `change_password` | `ouSessionIsOutlet`, `ouHash`, `passSeal`, `setPassword`, `writeUsers` | `auth.change_password` | `tests/regression/auth/change_password.test.ts` | AUDITED |
| `auth.php:415` | `update_contact` | `ouSessionIsOutlet`, `cleanContact`, `applyContact`, `writeUsers` | `auth.update_contact` | `tests/regression/auth/update_contact.test.ts` | AUDITED |
| `auth.php:429` | `add_user` | `actor`, `cleanZones`, `validateOrg`, `setPassword`, `writeUsers` | `auth.add_user` | `tests/regression/auth/add_user.test.ts` | AUDITED |
| `auth.php:506` | `add_regional_officer` | `actor`, `canManage`, `cleanRegional`, zone helpers, `setPassword`, `writeUsers` | `auth.add_regional_officer` | `tests/regression/auth/add_regional_officer.test.ts` | AUDITED |
| `auth.php:567` | `update_regional_officer` | `actor`, `canManage`, `cleanRegional`, `cleanContact`, `applyPages`, `renameUser` | `auth.update_regional_officer` | `tests/regression/auth/update_regional_officer.test.ts` | AUDITED |
| `auth.php:614` | `delete_user` | `actor`, `canManage`, `childrenOf`, `writeUsers` | `auth.delete_user` | `tests/regression/auth/delete_user.test.ts` | AUDITED |
| `auth.php:645` | `add_super_admin` | `actor`, `cleanStates`, `setPassword`, `writeUsers` | `auth.add_super_admin` | `tests/regression/auth/add_super_admin.test.ts` | AUDITED |
| `auth.php:692` | `update_super_admin` | `actor`, `applyPages`, `cleanStates`, `writeUsers` | `auth.update_super_admin` | `tests/regression/auth/update_super_admin.test.ts` | AUDITED |
| `auth.php:712` | `import_officers` | `actor`, `importOfficers`, mapping/password helpers | `auth.import_officers` | `tests/regression/auth/import_officers.test.ts` | AUDITED |
| `auth.php:720` | `convert_to_sales_areas` | `actor`, `convertToSalesAreas`, `legacySalesAreas` | `auth.convert_to_sales_areas` | `tests/regression/auth/convert_to_sales_areas.test.ts` | AUDITED |
| `auth.php:729` | `outlet_list` | `outletActor`, `outletApi`, scope/view helpers | `auth.outlet_list` | `tests/regression/auth/outlet_list.test.ts` | AUDITED |
| `auth.php:730` | `outlet_lookup` | `outletActor`, `outletApi`, `outletCheckOutlet` | `auth.outlet_lookup` | `tests/regression/auth/outlet_lookup.test.ts` | AUDITED |
| `auth.php:731` | `outlet_add` | `outletActor`, `outletApi`, `ouRulePassword`, `ouHash`, `passSeal` | `auth.outlet_add` | `tests/regression/auth/outlet_add.test.ts` | AUDITED |
| `auth.php:732` | `outlet_update` | `outletActor`, `outletApi`, `ouHash`, `passSeal` | `auth.outlet_update` | `tests/regression/auth/outlet_update.test.ts` | AUDITED |
| `auth.php:733` | `outlet_delete` | `outletActor`, `outletApi`, `outletScopeSql` | `auth.outlet_delete` | `tests/regression/auth/outlet_delete.test.ts` | AUDITED |
| `auth.php:734` | `outlet_import` | `outletActor`, `outletApi`, `ouRulePassword`, `ouHash`, `passSeal` | `auth.outlet_import` | `tests/regression/auth/outlet_import.test.ts` | AUDITED |
| `orders.php:1062` | `public_invoice` | early public branch | `orders.public_invoice` | `tests/regression/orders/public_invoice.test.ts` | AUDITED |
| `orders.php:1097` | `meta` | `ordMeta` | `orders.meta` | `tests/regression/orders/meta.test.ts` | AUDITED |
| `orders.php:1098` | `outlet` | `ordOutletLookup` | `orders.outlet` | `tests/regression/orders/outlet.test.ts` | AUDITED |
| `orders.php:1099` | `sap_list` | `ordSapList` | `orders.sap_list` | `tests/regression/orders/sap_list.test.ts` | AUDITED |
| `orders.php:1100` | `sap_save` | `ordSapSave` | `orders.sap_save` | `tests/regression/orders/sap_save.test.ts` | AUDITED |
| `orders.php:1101` | `sap_history` | `ordSapHistory` | `orders.sap_history` | `tests/regression/orders/sap_history.test.ts` | AUDITED |
| `orders.php:1102` | `sap_import` | `ordSapImport` | `orders.sap_import` | `tests/regression/orders/sap_import.test.ts` | AUDITED |
| `orders.php:1103` | `ro_report` | `ordRoReport` | `orders.ro_report` | `tests/regression/orders/ro_report.test.ts` | AUDITED |
| `orders.php:1104` | `list` | `ordList` | `orders.list` | `tests/regression/orders/list.test.ts` | AUDITED |
| `orders.php:1105` | `get` | `ordGet` | `orders.get` | `tests/regression/orders/get.test.ts` | AUDITED |
| `orders.php:1106` | `history` | `ordHistory` | `orders.history` | `tests/regression/orders/history.test.ts` | AUDITED |
| `orders.php:1107` | `save` | `ordSave` | `orders.save` | `tests/regression/orders/save.test.ts` | AUDITED |
| `orders.php:1108` | `submit` | `ordSubmit` | `orders.submit` | `tests/regression/orders/submit.test.ts` | AUDITED |
| `orders.php:1109` | `delete` | `ordDelete` | `orders.delete` | `tests/regression/orders/delete.test.ts` | AUDITED |
| `orders.php:1110` | `bulk` | `ordBulk` | `orders.bulk` | `tests/regression/orders/bulk.test.ts` | AUDITED |
| `orders.php:1111` | `set_min_order` | `ordSetMinOrder` | `orders.set_min_order` | `tests/regression/orders/set_min_order.test.ts` | AUDITED |
| `orders.php:1112` | `set_perms` | `ordSetPerms` | `orders.set_perms` | `tests/regression/orders/set_perms.test.ts` | AUDITED |
| `orders.php:1113` | `set_prices` | `ordSetPrices` | `orders.set_prices` | `tests/regression/orders/set_prices.test.ts` | AUDITED |
| `orders.php:1114` | `set_stock` | `ordSetStock` | `orders.set_stock` | `tests/regression/orders/set_stock.test.ts` | AUDITED |
| `orders.php:1115` | `add_product` | `ordAddProduct` | `orders.add_product` | `tests/regression/orders/add_product.test.ts` | AUDITED |
| `orders.php:1116` | `delete_product` | `ordDeleteProduct` | `orders.delete_product` | `tests/regression/orders/delete_product.test.ts` | AUDITED |
| `orders.php:1117` | `save_foc_list` | `ordSaveFocList` | `orders.save_foc_list` | `tests/regression/orders/save_foc_list.test.ts` | AUDITED |
| `orders.php:1118` | `upload_pod` | `ordUploadFile` | `orders.upload_pod` | `tests/regression/orders/upload_pod.test.ts` | AUDITED |
| `orders.php:1119` | `upload_receipt` | `ordUploadFile` | `orders.upload_receipt` | `tests/regression/orders/upload_receipt.test.ts` | AUDITED |
| `orders.php:1120` | `upload_invoice` | `ordUploadFile` | `orders.upload_invoice` | `tests/regression/orders/upload_invoice.test.ts` | AUDITED |
| `orders.php:1121` | `edit_invoice` | `ordEditInvoice` | `orders.edit_invoice` | `tests/regression/orders/edit_invoice.test.ts` | AUDITED |
| `orders.php:1122` | `pod_download` | `ordFileDownload` | `orders.pod_download` | `tests/regression/orders/pod_download.test.ts` | AUDITED |
| `orders.php:1123` | `file_download` | `ordFileDownload` | `orders.file_download` | `tests/regression/orders/file_download.test.ts` | AUDITED |
| `orders.php:1124` | `return_request` | `ordRetRequest` | `orders.return_request` | `tests/regression/orders/return_request.test.ts` | AUDITED |
| `orders.php:1125` | `return_list` | `ordRetList` | `orders.return_list` | `tests/regression/orders/return_list.test.ts` | AUDITED |
| `orders.php:1126` | `return_decide` | `ordRetDecide` | `orders.return_decide` | `tests/regression/orders/return_decide.test.ts` | AUDITED |
| `orders.php:1127` | `change_log` | `ordChangeLog` | `orders.change_log` | `tests/regression/orders/change_log.test.ts` | AUDITED |
| `orders.php:1128` | `outlet_officers` | `ordOutletOfficers` | `orders.outlet_officers` | `tests/regression/orders/outlet_officers.test.ts` | AUDITED |
| `orders.php:1129` | `profile` | `ordProfile` | `orders.profile` | `tests/regression/orders/profile.test.ts` | AUDITED |
| `orders.php:1130` | `superiors` | `ordSuperiors` | `orders.superiors` | `tests/regression/orders/superiors.test.ts` | AUDITED |
| `orders.php:1131` | `approve` | `ordDecide` | `orders.approve` | `tests/regression/orders/approve.test.ts` | AUDITED |
| `orders.php:1132` | `reject` | `ordDecide` | `orders.reject` | `tests/regression/orders/reject.test.ts` | AUDITED |
| `api.php:60` | `sales` | `getSales` | `api.sales` | `tests/regression/api/sales.test.ts` | NEEDS_CLARIFICATION |
| `api.php:61` | `add` | `addEntry` | `api.add` | `tests/regression/api/add.test.ts` | NEEDS_CLARIFICATION |
| `api.php:62` | `update` | `updateEntry` | `api.update` | `tests/regression/api/update.test.ts` | NEEDS_CLARIFICATION |
| `api.php:63` | `delete` | `deleteEntry` | `api.delete` | `tests/regression/api/delete.test.ts` | NEEDS_CLARIFICATION |
| `api.php:64` | `import` | `importData` | `api.import` | `tests/regression/api/import.test.ts` | NEEDS_CLARIFICATION |
| `api.php:65` | `ro_lookup` | `roLookup` | `api.ro_lookup` | `tests/regression/api/ro_lookup.test.ts` | NEEDS_CLARIFICATION |
| `api.php:66` | `ref_lists` | `refLists` | `api.ref_lists` | `tests/regression/api/ref_lists.test.ts` | NEEDS_CLARIFICATION |
| `api.php:67` | `add_pending` | `addPending` | `api.add_pending` | `tests/regression/api/add_pending.test.ts` | NEEDS_CLARIFICATION |
| `api.php:68` | `list_pending` | `listPending` | `api.list_pending` | `tests/regression/api/list_pending.test.ts` | NEEDS_CLARIFICATION |
| `api.php:69` | `my_pending` | `myPending` | `api.my_pending` | `tests/regression/api/my_pending.test.ts` | NEEDS_CLARIFICATION |
| `api.php:70` | `approve` | `approvePending` | `api.approve` | `tests/regression/api/approve.test.ts` | NEEDS_CLARIFICATION |
| `api.php:71` | `reject` | `rejectPending` | `api.reject` | `tests/regression/api/reject.test.ts` | NEEDS_CLARIFICATION |
| `api.php:72` | `edit_pending` | `editPending` | `api.edit_pending` | `tests/regression/api/edit_pending.test.ts` | NEEDS_CLARIFICATION |
| `api.php:73` | `delete_pending` | `deletePending` | `api.delete_pending` | `tests/regression/api/delete_pending.test.ts` | NEEDS_CLARIFICATION |
| `api.php:74` | `audit_log` | `getAuditLog` | `api.audit_log` | `tests/regression/api/audit_log.test.ts` | NEEDS_CLARIFICATION |
| `api.php:75` | `pending_count` | `pendingCount` | `api.pending_count` | `tests/regression/api/pending_count.test.ts` | NEEDS_CLARIFICATION |
| `api.php:76` | `save_note` | `saveNote` | `api.save_note` | `tests/regression/api/save_note.test.ts` | NEEDS_CLARIFICATION |
| `api.php:77` | `get_targets` | `getTargets` | `api.get_targets` | `tests/regression/api/get_targets.test.ts` | NEEDS_CLARIFICATION |
| `api.php:78` | `save_target` | `saveTarget` | `api.save_target` | `tests/regression/api/save_target.test.ts` | NEEDS_CLARIFICATION |
| `mis.php:32` | `get` | `see dispatch body` | `mis.get` | `tests/regression/mis/get.test.ts` | NEEDS_CLARIFICATION |
| `mis.php:34` | `ver` | `misOut` | `mis.ver` | `tests/regression/mis/ver.test.ts` | NEEDS_CLARIFICATION |
| `mis.php:35` | `download` | `misDownload` | `mis.download` | `tests/regression/mis/download.test.ts` | NEEDS_CLARIFICATION |
| `mis.php:36` | `outlet` | `misOutlet` | `mis.outlet` | `tests/regression/mis/outlet.test.ts` | NEEDS_CLARIFICATION |
| `mis.php:37` | `save_row` | `misSaveRow` | `mis.save_row` | `tests/regression/mis/save_row.test.ts` | NEEDS_CLARIFICATION |
| `mis.php:38` | `delete_row` | `misDeleteRow` | `mis.delete_row` | `tests/regression/mis/delete_row.test.ts` | NEEDS_CLARIFICATION |
| `mis.php:39` | `delete_rows` | `misDeleteRows` | `mis.delete_rows` | `tests/regression/mis/delete_rows.test.ts` | NEEDS_CLARIFICATION |
| `mis.php:40` | `import` | `misImport` | `mis.import` | `tests/regression/mis/import.test.ts` | NEEDS_CLARIFICATION |

## Reviewed contract fragments

| Actions | Input and validation | Authorization and scope | Reads and writes | Return and errors | Required tests |
|---|---|---|---|---|---|
| `auth.login` | Username, password, org; trim; require both; PHP bcrypt for supplied hashes | Outlet SAP tab and valid outlet linkage; officer org tab match; unique case-insensitive fallback | Read account/outlet; legacy plaintext officer password may be rehashed; establish session | User/CSRF; 400, 401, 403 or outlet DB 500 | Wrong tab, case collision, hash compatibility, missing linkage, session |
| `auth.check`, `auth.logout` | Current session | Re-read current account; invalidate deleted one | Read account/scope/page settings; refresh or destroy session | Current user/CSRF or false; logout ok | Changed scope/pages, deletion, logout |
| `orders.public_invoice` | Query `t`: 32 lowercase hex; PHP has no method gate | Public token; approved invoice with nonnull invoice number; no explicit `invoice_mode` check | Read order/items; schema ensure may write | Redacted order or 404 | Token, status, manual-mode edge, redaction, legacy FOC; offline QR contract |
| `orders.save`, `orders.submit` | ID, date, SAP, remarks, items, submit flag; `ordCheck` validates SAP, lines, FOC, stock, minimum and prices | Role, creator, status and geographic scope; submit needs mapped approver | Read order/items/outlet/products/settings/users; create/update order, replace lines, log event, move to pending | Updated order; 403/404/409/422 | Role/status matrix, SAP spoofing, FOC, stock, prices, transaction rollback |
| `orders.approve`, `orders.reject` | ID, optional `seen_updated_at`, comment; reject needs comment | Pending under `ordScope` AND `ordAwaitCond` | Lock/read order and stock; update decision, event, invoice mode/numbering | Updated order; 403/404/409/422 | Every actor/placed role, scope, stale edit, stock race, invoice mode |
| `orders.return_request`, `orders.return_decide` | Order/return ID, reason, credit note, decision/comment | Visible approved delivered order; decision permission and scope; no nonadmin self-decision | Read order/returns/permissions; insert/update return and event | Order/return; 403/404/409/422 | Delivery, duplicate requests, self-decision, state scope, permission |
| `mis.get`, `mis.ver` | Full action inputs still pending | `misScopeSql`; full action guard pending | `misSync` reads orders/items/MIS and conditionally updates MIS and revision | Full action return/error contract pending | Stale deletion, duplicate prevention, no-op revision, scope |

The 23 authentication contracts are documented in [AUTHENTICATION_AUDIT_REPORT.md](AUTHENTICATION_AUDIT_REPORT.md). Each of the 37 order rows above maps to the individually numbered request/response, authorization, data-effect and Android/test contract in [ORDERS_AUDIT_REPORT.md](ORDERS_AUDIT_REPORT.md); this table supplies its planned service and test path. The short fragments above are supplementary. The other 27 API/MIS action rows still require complete source review. Listed TypeScript names and test paths are planned, not implemented.

## Orders request/response and data-effect mapping

All ordinary order actions use `ordUser()` plus the HPCL admin router allowlist; all POSTs require the session CSRF body token. PHP does not enforce HTTP method by action. `public_invoice` bypasses both. Validation errors use `ordFail` or HTTP 422 `{ok:false,error,fields}`; successful JSON is `{ok:true,...}` except downloads, which return bytes. Exact error strings, branch guards, transaction/lock boundaries, frontend line ranges and regression cases are in the [numbered action contracts](ORDERS_AUDIT_REPORT.md). The destination and planned test path for **each** action are in the mapping table above.

| Action | Request → success | Authorization and direct data effect to reproduce locally |
|---|---|---|
| `public_invoice` | Query `t` → redacted `order` | Public token; approved invoice with number; read order/items after schema ensure |
| `meta` | Optional `exclude` → identity, catalog, settings, stock, scoped counts/approvers/returns | `ordScope`; read orders/items/settings/products/FOC/outlets/users |
| `outlet` | Query `code,zone?` → found/allowed/outlet | Admin state/zone or officer RO/SA/own SAP; read master outlet |
| `sap_list` | Query filters/page/pick → rows/count/scope/filter values | `ordSapScope`; read master outlets |
| `sap_save` | Body `orig?,sap_code,ro,ORD_SAP_FIELDS` → outlet/changed/created | Admin/Zone Officer, old/new region scope; transactional outlet+history insert/update |
| `sap_history` | Query `code` → latest 20 changes | Existing scoped SAP; read outlet log |
| `sap_import` | Body `rows,mode?,add?,update?,remove?,remove_n?` → preview or apply counts | Admin/Zone Officer; preview read, apply transaction add/update/delete master and optional profile rows plus log |
| `ro_report` | Query `from?,to?` → grouped officer/SA/order report | Admin/Zone Officer and hierarchy; read users/orders/items/events/files/settings |
| `list` | Query status/zone/awaiting/month/date/search → `orders` | `ordScope` and optional awaiting; read orders/items/returns/files/settings |
| `get` | Query `id` → order/events/files/approvers | `ordScope`; read and possibly repair legacy stage/numbers/items |
| `history` | Selector → `events` | `ordScope`, HPCL event-author filter; read order events |
| `save` | Body `id?,date,sap_code,remarks?,items,submit?` → `order,submitted` | Creator/status or Rohan admin correction; transaction order+items+events/pending |
| `submit` | Body `id` → `order` | Creator draft/rejected, current min/price/stock/approver; locked order transaction/event |
| `delete` | Body `id` → ok | Creator draft in scope; delete order, FK cascades metadata |
| `bulk` | Body `mode,rows` → candidates/errors/counts | Rohan/HPCL officers/outlet; one transaction per created order |
| `set_min_order` | Body `min_ea` → min setting | Rohan admin; upsert setting |
| `set_perms` | Body complete boolean `perms` → settings | Rohan admin; per-key upserts without transaction |
| `set_prices` | Body all product `prices` → prices | Rohan or switch-enabled HPCL; per-product rate/GST upserts |
| `set_stock` | Body `enabled?,stock?` → stock/settings | Rohan admin; toggle and stock setting upserts/deletes |
| `add_product` | Body `name,brand` → catalog/stock/price/FOC | Rohan admin; insert product |
| `delete_product` | Body `pid` → catalog/stock/price/FOC | Rohan admin; delete product/settings/FOC, historical item snapshots remain |
| `save_foc_list` | Body `pid,mrp_type?,mrp?,dlp?,gst?,rows` → FOC/info/prices | Rohan admin; transaction replace FOC/settings; best-effort change log |
| `upload_pod` | Multipart `id,csrf,file` → order/files | Rohan/admin, approved/visible, receipt first; stored file + file metadata/order stage/events |
| `upload_receipt` | Multipart `id,csrf,file` → order/files | Rohan/admin or switch-enabled HPCL, approved/visible; replace file metadata/file and log |
| `upload_invoice` | Multipart `id,csrf,file` → order/files | Rohan/admin, approved visible manual invoice; insert/replace metadata/file and log |
| `edit_invoice` | Body `id,edits` → order | Rohan/admin, visible approved undelivered auto invoice; update corrections JSON only |
| `pod_download` | Query `id,inline?` → bytes | `ordLoad`; read POD metadata and private file |
| `file_download` | Query `id,kind?,inline?` → bytes | `ordLoad`; invoice visibility switch; read metadata/private file |
| `return_request` | Body `id,reason,credit_note` → order/return | Visible delivered approved order; transaction insert pending return/event |
| `return_list` | Query `status?,q?` → returns/decision flags | `ordScope`; read returns/orders/settings |
| `return_decide` | Body `rid,approve,comment?` → return | `ret_org_level` flag, scope, state/self guard; locked return update/event |
| `change_log` | Query `area,page?,q?` → log rows/pages | FOC admin, SAP scoped, MIS/FOC shared log; read outlet/change logs |
| `outlet_officers` | Query `code?` → SAP/officer contacts | Own SAP for outlet, otherwise `ordSapScope`; read master/users |
| `profile` | Selector → own profile | Current account; read officer/master/children and scoped SAP count |
| `superiors` | Selector → own hierarchy chains | Current account; read users/master and hierarchy mapping |
| `approve` | Body `id,comment?,seen_updated_at?` → order | `ordScope`+`ordAwaitCond`, pending/stock; locked order/settings, decision/events/numbers |
| `reject` | Body `id,comment,seen_updated_at?` → order | Same decision scope, reason required; locked order status/event |

