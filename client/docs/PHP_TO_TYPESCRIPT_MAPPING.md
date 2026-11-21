# PHP to TypeScript mapping — working inventory

Each row is an action to port. Input fields, validations, permissions, database effects and tests are **not yet verified** except where documented in `SOURCE_CODE_AUDIT.md` and the reviewed fragments below. The mapping is a gate, not evidence of implementation. There is no `src/` or TypeScript domain service yet.

| PHP location | Action | PHP helper | Planned TypeScript service | Automated test | Status |
|---|---|---|---|---|---|
| `auth.php:33` | `login` | `see dispatch body` | `auth.login` | `tests/regression/auth/login.test.ts` | pending source review |
| `auth.php:140` | `check` | `see dispatch body` | `auth.check` | `tests/regression/auth/check.test.ts` | pending source review |
| `auth.php:171` | `logout` | `see dispatch body` | `auth.logout` | `tests/regression/auth/logout.test.ts` | pending source review |
| `auth.php:176` | `list_users` | `see dispatch body` | `auth.list_users` | `tests/regression/auth/list_users.test.ts` | pending source review |
| `auth.php:213` | `list_sales_areas` | `see dispatch body` | `auth.list_sales_areas` | `tests/regression/auth/list_sales_areas.test.ts` | pending source review |
| `auth.php:226` | `update_user_access` | `see dispatch body` | `auth.update_user_access` | `tests/regression/auth/update_user_access.test.ts` | pending source review |
| `auth.php:352` | `update_user_password` | `see dispatch body` | `auth.update_user_password` | `tests/regression/auth/update_user_password.test.ts` | pending source review |
| `auth.php:379` | `change_password` | `see dispatch body` | `auth.change_password` | `tests/regression/auth/change_password.test.ts` | pending source review |
| `auth.php:415` | `update_contact` | `see dispatch body` | `auth.update_contact` | `tests/regression/auth/update_contact.test.ts` | pending source review |
| `auth.php:429` | `add_user` | `see dispatch body` | `auth.add_user` | `tests/regression/auth/add_user.test.ts` | pending source review |
| `auth.php:506` | `add_regional_officer` | `see dispatch body` | `auth.add_regional_officer` | `tests/regression/auth/add_regional_officer.test.ts` | pending source review |
| `auth.php:567` | `update_regional_officer` | `see dispatch body` | `auth.update_regional_officer` | `tests/regression/auth/update_regional_officer.test.ts` | pending source review |
| `auth.php:614` | `delete_user` | `see dispatch body` | `auth.delete_user` | `tests/regression/auth/delete_user.test.ts` | pending source review |
| `auth.php:645` | `add_super_admin` | `see dispatch body` | `auth.add_super_admin` | `tests/regression/auth/add_super_admin.test.ts` | pending source review |
| `auth.php:692` | `update_super_admin` | `see dispatch body` | `auth.update_super_admin` | `tests/regression/auth/update_super_admin.test.ts` | pending source review |
| `auth.php:712` | `import_officers` | `see dispatch body` | `auth.import_officers` | `tests/regression/auth/import_officers.test.ts` | pending source review |
| `auth.php:720` | `convert_to_sales_areas` | `see dispatch body` | `auth.convert_to_sales_areas` | `tests/regression/auth/convert_to_sales_areas.test.ts` | pending source review |
| `auth.php:729` | `outlet_list` | `see dispatch body` | `auth.outlet_list` | `tests/regression/auth/outlet_list.test.ts` | pending source review |
| `auth.php:730` | `outlet_lookup` | `see dispatch body` | `auth.outlet_lookup` | `tests/regression/auth/outlet_lookup.test.ts` | pending source review |
| `auth.php:731` | `outlet_add` | `see dispatch body` | `auth.outlet_add` | `tests/regression/auth/outlet_add.test.ts` | pending source review |
| `auth.php:732` | `outlet_update` | `see dispatch body` | `auth.outlet_update` | `tests/regression/auth/outlet_update.test.ts` | pending source review |
| `auth.php:733` | `outlet_delete` | `see dispatch body` | `auth.outlet_delete` | `tests/regression/auth/outlet_delete.test.ts` | pending source review |
| `auth.php:734` | `outlet_import` | `see dispatch body` | `auth.outlet_import` | `tests/regression/auth/outlet_import.test.ts` | pending source review |
| `orders.php:1062` | `public_invoice` | early public branch | `orders.public_invoice` | `tests/regression/orders/public_invoice.test.ts` | offline contract pending |
| `orders.php:1097` | `meta` | `ordMeta` | `orders.meta` | `tests/regression/orders/meta.test.ts` | pending source review |
| `orders.php:1098` | `outlet` | `ordOutletLookup` | `orders.outlet` | `tests/regression/orders/outlet.test.ts` | pending source review |
| `orders.php:1099` | `sap_list` | `ordSapList` | `orders.sap_list` | `tests/regression/orders/sap_list.test.ts` | pending source review |
| `orders.php:1100` | `sap_save` | `ordSapSave` | `orders.sap_save` | `tests/regression/orders/sap_save.test.ts` | pending source review |
| `orders.php:1101` | `sap_history` | `ordSapHistory` | `orders.sap_history` | `tests/regression/orders/sap_history.test.ts` | pending source review |
| `orders.php:1102` | `sap_import` | `ordSapImport` | `orders.sap_import` | `tests/regression/orders/sap_import.test.ts` | pending source review |
| `orders.php:1103` | `ro_report` | `ordRoReport` | `orders.ro_report` | `tests/regression/orders/ro_report.test.ts` | pending source review |
| `orders.php:1104` | `list` | `ordList` | `orders.list` | `tests/regression/orders/list.test.ts` | pending source review |
| `orders.php:1105` | `get` | `ordGet` | `orders.get` | `tests/regression/orders/get.test.ts` | pending source review |
| `orders.php:1106` | `history` | `ordHistory` | `orders.history` | `tests/regression/orders/history.test.ts` | pending source review |
| `orders.php:1107` | `save` | `ordSave` | `orders.save` | `tests/regression/orders/save.test.ts` | pending source review |
| `orders.php:1108` | `submit` | `ordSubmit` | `orders.submit` | `tests/regression/orders/submit.test.ts` | pending source review |
| `orders.php:1109` | `delete` | `ordDelete` | `orders.delete` | `tests/regression/orders/delete.test.ts` | pending source review |
| `orders.php:1110` | `bulk` | `ordBulk` | `orders.bulk` | `tests/regression/orders/bulk.test.ts` | pending source review |
| `orders.php:1111` | `set_min_order` | `ordSetMinOrder` | `orders.set_min_order` | `tests/regression/orders/set_min_order.test.ts` | pending source review |
| `orders.php:1112` | `set_perms` | `ordSetPerms` | `orders.set_perms` | `tests/regression/orders/set_perms.test.ts` | pending source review |
| `orders.php:1113` | `set_prices` | `ordSetPrices` | `orders.set_prices` | `tests/regression/orders/set_prices.test.ts` | pending source review |
| `orders.php:1114` | `set_stock` | `ordSetStock` | `orders.set_stock` | `tests/regression/orders/set_stock.test.ts` | pending source review |
| `orders.php:1115` | `add_product` | `ordAddProduct` | `orders.add_product` | `tests/regression/orders/add_product.test.ts` | pending source review |
| `orders.php:1116` | `delete_product` | `ordDeleteProduct` | `orders.delete_product` | `tests/regression/orders/delete_product.test.ts` | pending source review |
| `orders.php:1117` | `save_foc_list` | `ordSaveFocList` | `orders.save_foc_list` | `tests/regression/orders/save_foc_list.test.ts` | pending source review |
| `orders.php:1118` | `upload_pod` | `ordUploadFile` | `orders.upload_pod` | `tests/regression/orders/upload_pod.test.ts` | pending source review |
| `orders.php:1119` | `upload_receipt` | `ordUploadFile` | `orders.upload_receipt` | `tests/regression/orders/upload_receipt.test.ts` | pending source review |
| `orders.php:1120` | `upload_invoice` | `ordUploadFile` | `orders.upload_invoice` | `tests/regression/orders/upload_invoice.test.ts` | pending source review |
| `orders.php:1121` | `edit_invoice` | `ordEditInvoice` | `orders.edit_invoice` | `tests/regression/orders/edit_invoice.test.ts` | pending source review |
| `orders.php:1122` | `pod_download` | `ordFileDownload` | `orders.pod_download` | `tests/regression/orders/pod_download.test.ts` | pending source review |
| `orders.php:1123` | `file_download` | `ordFileDownload` | `orders.file_download` | `tests/regression/orders/file_download.test.ts` | pending source review |
| `orders.php:1124` | `return_request` | `ordRetRequest` | `orders.return_request` | `tests/regression/orders/return_request.test.ts` | pending source review |
| `orders.php:1125` | `return_list` | `ordRetList` | `orders.return_list` | `tests/regression/orders/return_list.test.ts` | pending source review |
| `orders.php:1126` | `return_decide` | `ordRetDecide` | `orders.return_decide` | `tests/regression/orders/return_decide.test.ts` | pending source review |
| `orders.php:1127` | `change_log` | `ordChangeLog` | `orders.change_log` | `tests/regression/orders/change_log.test.ts` | pending source review |
| `orders.php:1128` | `outlet_officers` | `ordOutletOfficers` | `orders.outlet_officers` | `tests/regression/orders/outlet_officers.test.ts` | pending source review |
| `orders.php:1129` | `profile` | `ordProfile` | `orders.profile` | `tests/regression/orders/profile.test.ts` | pending source review |
| `orders.php:1130` | `superiors` | `ordSuperiors` | `orders.superiors` | `tests/regression/orders/superiors.test.ts` | pending source review |
| `orders.php:1131` | `approve` | `ordDecide` | `orders.approve` | `tests/regression/orders/approve.test.ts` | pending source review |
| `orders.php:1132` | `reject` | `ordDecide` | `orders.reject` | `tests/regression/orders/reject.test.ts` | pending source review |
| `api.php:60` | `sales` | `getSales` | `api.sales` | `tests/regression/api/sales.test.ts` | pending source review |
| `api.php:61` | `add` | `addEntry` | `api.add` | `tests/regression/api/add.test.ts` | pending source review |
| `api.php:62` | `update` | `updateEntry` | `api.update` | `tests/regression/api/update.test.ts` | pending source review |
| `api.php:63` | `delete` | `deleteEntry` | `api.delete` | `tests/regression/api/delete.test.ts` | pending source review |
| `api.php:64` | `import` | `importData` | `api.import` | `tests/regression/api/import.test.ts` | pending source review |
| `api.php:65` | `ro_lookup` | `roLookup` | `api.ro_lookup` | `tests/regression/api/ro_lookup.test.ts` | pending source review |
| `api.php:66` | `ref_lists` | `refLists` | `api.ref_lists` | `tests/regression/api/ref_lists.test.ts` | pending source review |
| `api.php:67` | `add_pending` | `addPending` | `api.add_pending` | `tests/regression/api/add_pending.test.ts` | pending source review |
| `api.php:68` | `list_pending` | `listPending` | `api.list_pending` | `tests/regression/api/list_pending.test.ts` | pending source review |
| `api.php:69` | `my_pending` | `myPending` | `api.my_pending` | `tests/regression/api/my_pending.test.ts` | pending source review |
| `api.php:70` | `approve` | `approvePending` | `api.approve` | `tests/regression/api/approve.test.ts` | pending source review |
| `api.php:71` | `reject` | `rejectPending` | `api.reject` | `tests/regression/api/reject.test.ts` | pending source review |
| `api.php:72` | `edit_pending` | `editPending` | `api.edit_pending` | `tests/regression/api/edit_pending.test.ts` | pending source review |
| `api.php:73` | `delete_pending` | `deletePending` | `api.delete_pending` | `tests/regression/api/delete_pending.test.ts` | pending source review |
| `api.php:74` | `audit_log` | `getAuditLog` | `api.audit_log` | `tests/regression/api/audit_log.test.ts` | pending source review |
| `api.php:75` | `pending_count` | `pendingCount` | `api.pending_count` | `tests/regression/api/pending_count.test.ts` | pending source review |
| `api.php:76` | `save_note` | `saveNote` | `api.save_note` | `tests/regression/api/save_note.test.ts` | pending source review |
| `api.php:77` | `get_targets` | `getTargets` | `api.get_targets` | `tests/regression/api/get_targets.test.ts` | pending source review |
| `api.php:78` | `save_target` | `saveTarget` | `api.save_target` | `tests/regression/api/save_target.test.ts` | pending source review |
| `mis.php:32` | `get` | `see dispatch body` | `mis.get` | `tests/regression/mis/get.test.ts` | pending source review |
| `mis.php:34` | `ver` | `misOut` | `mis.ver` | `tests/regression/mis/ver.test.ts` | pending source review |
| `mis.php:35` | `download` | `misDownload` | `mis.download` | `tests/regression/mis/download.test.ts` | pending source review |
| `mis.php:36` | `outlet` | `misOutlet` | `mis.outlet` | `tests/regression/mis/outlet.test.ts` | pending source review |
| `mis.php:37` | `save_row` | `misSaveRow` | `mis.save_row` | `tests/regression/mis/save_row.test.ts` | pending source review |
| `mis.php:38` | `delete_row` | `misDeleteRow` | `mis.delete_row` | `tests/regression/mis/delete_row.test.ts` | pending source review |
| `mis.php:39` | `delete_rows` | `misDeleteRows` | `mis.delete_rows` | `tests/regression/mis/delete_rows.test.ts` | pending source review |
| `mis.php:40` | `import` | `misImport` | `mis.import` | `tests/regression/mis/import.test.ts` | pending source review |

## Reviewed contract fragments

| Actions | Input and validation | Authorization and scope | Reads and writes | Return and errors | Required tests |
|---|---|---|---|---|---|
| `auth.login` | Username, password, org; trim; require both; PHP bcrypt for supplied hashes | Outlet SAP tab and valid outlet linkage; officer org tab match; unique case-insensitive fallback | Read account/outlet; legacy plaintext officer password may be rehashed; establish session | User/CSRF; 400, 401, 403 or outlet DB 500 | Wrong tab, case collision, hash compatibility, missing linkage, session |
| `auth.check`, `auth.logout` | Current session | Re-read current account; invalidate deleted one | Read account/scope/page settings; refresh or destroy session | Current user/CSRF or false; logout ok | Changed scope/pages, deletion, logout |
| `orders.public_invoice` | GET `t`: 32 lowercase hex | Public token; approved generated invoice only | Read order/items; no write | Redacted order or 404 | Token, status, redaction, legacy FOC; offline QR contract |
| `orders.save`, `orders.submit` | ID, date, SAP, remarks, items, submit flag; `ordCheck` validates SAP, lines, FOC, stock, minimum and prices | Role, creator, status and geographic scope; submit needs mapped approver | Read order/items/outlet/products/settings/users; create/update order, replace lines, log event, move to pending | Updated order; 403/404/409/422 | Role/status matrix, SAP spoofing, FOC, stock, prices, transaction rollback |
| `orders.approve`, `orders.reject` | ID, optional `seen_updated_at`, comment; reject needs comment | Pending under `ordScope` AND `ordAwaitCond` | Lock/read order and stock; update decision, event, invoice mode/numbering | Updated order; 403/404/409/422 | Every actor/placed role, scope, stale edit, stock race, invoice mode |
| `orders.return_request`, `orders.return_decide` | Order/return ID, reason, credit note, decision/comment | Visible approved delivered order; decision permission and scope; no nonadmin self-decision | Read order/returns/permissions; insert/update return and event | Order/return; 403/404/409/422 | Delivery, duplicate requests, self-decision, state scope, permission |
| `mis.get`, `mis.ver` | Full action inputs still pending | `misScopeSql`; full action guard pending | `misSync` reads orders/items/MIS and conditionally updates MIS and revision | Full action return/error contract pending | Stale deletion, duplicate prevention, no-op revision, scope |

All other rows still require complete source review. Listed TypeScript names and test paths are planned, not implemented.

