# Role and permission matrix (source review in progress)

| Identity | Original representation | Confirmed scope and decision rule |
|---|---|
| Rohan Super Admin | `role=superadmin`, non-HPCL org | Decides own orders and orders within configured approval states; individual page controls can hide pages. |
| HPCL Super Admin | `role=superadmin`, `org=hpcl` | Distinct `ordAwaitCond` cases; approval states apply to other users' orders. |
| Rohan Zone Officer | `role=zone`, `org=rohan`, `level=zone` | Zone/team scope; can decide specific placed roles including own Rohan Zone orders. |
| Rohan Regional Officer | `role=zone`, `org=rohan`, `level=regional` | Region and sales-area scope; cannot decide orders under `ordAwaitCond`. |
| HPCL Zone Officer / Coordinator | `role=zone`, `org=hpcl`, `level=zone` | Zone/team scope; may decide specified placed roles including own HPCL Zone orders. |
| HPCL Regional Officer / Manager / Sales Officer | `role=zone`, `org=hpcl`, `level=regional` | Region and possibly sales-area scope; `ordAwaitCond` allows Rohan Admin and HPCL outlet orders subject to `ordScope`. |
| HPCL Level 4 officer | HPCL hierarchy designation in `ORD_HPCL_DESIG` | Exact effective account scope and privileges require full source review. |
| Outlet | `portal_outlet_users`, `outlet=true`, one SAP number | Derived zone/region/sales area from outlet record on login/check; `ordScope` limits to its own SAP. `ordAwaitCond` explicitly returns false for an outlet account. |

This matrix summarizes source-audited action guards; it does not establish runtime parity. The 18 page IDs in `auth.php` are visibility settings, not a substitute for server-side authorization. Authentication/account, `orders.php`, `api.php` and `mis.php` actions are audited below. The absent live `users.php` prevents verifying live per-user page and approval-state grants.

The 37 `orders.php` action guards have now been reviewed in [ORDERS_AUDIT_REPORT.md](ORDERS_AUDIT_REPORT.md). The matrix below records the executable source gates; the absent live roster prevents confirming production grants.
The API and MIS action matrices below supplement the order matrix.

## Direct MIS action eligibility (source audited)

Source: `mis.php:16-47`, `mis-core.php:46-142,331-350,421-600`. `get`, `ver`, `download` and `outlet` require `misUser()` to accept a signed-in session. `save_row`, `delete_row`, `delete_rows` and `import` additionally require `me.edit`. `hidden_pages` is not consulted. A PHP method is not constrained per action; POST alone invokes CSRF.

| Actor | Read/get/ver/download scope | Direct save/delete/bulk/import | Outlet lookup |
|---|---|---|---|
| Rohan Super Admin | All unless `approvalStates` limits states | Yes; state-restricted account may edit only its scope and import is forced append | Any exact master SAP; no scope guard |
| HPCL Super Admin | State list from `approvalStates` if present, otherwise all | No | Any exact master SAP |
| Rohan `role=zone`, zone level | Assigned zone/RO, with SAP fallback when SA restriction applies | Yes within old and proposed row scope; nonnull scope forces import append | Any exact master SAP |
| HPCL Zone Officer | Assigned zone/RO/SA | No | Any exact master SAP |
| Rohan or HPCL `role=zone`, regional level | Assigned RO and sales areas; missing SA yields no rows | Rohan: yes within scope, forced import append. HPCL: no | Any exact master SAP |
| Outlet account | Exact session SAP | No | Any exact master SAP |

The outlet session is accepted by `misUser` without a fresh profile lookup. A missing zone or required regional SA assignment gives empty MIS row scope. `misScopeSql` guards reads/export/bulk delete; `misRowInScope` guards create/update/single delete. `outlet` is the exception above. The browser's page visibility does not change these conditions. The separate `api.php` pending approval route uses different guards; see [MIS audit](MIS_AUDIT_REPORT.md) and [API audit](API_AUDIT_REPORT.md).

## API data-entry and pending eligibility (source audited)

`api.php` uses `misUser.edit` for direct MIS edits (Rohan non-HPCL Super Admin or Rohan `role=zone`), while pending routes use the cached PHP session role/organization. For MIS rows, `misScope` applies admin state limits, officer zone/region/sales area and outlet SAP; direct writes check both old and proposed row scope. Pending approval is **global** for a `role=superadmin` with `org!=hpcl`, even if that account has restricted approval states. Page visibility does not enter these guards. Full branches are in [API_AUDIT_REPORT.md](API_AUDIT_REPORT.md).

| API action(s) | Executable actor and scope rule |
|---|---|
| `sales` | Any signed-in username; current MIS scope; `hidden_cols` removed from row output |
| `add,update,delete,import` | Rohan Super Admin or Rohan `role=zone`; row geography must remain in current MIS scope; no creator test |
| `ro_lookup` | Public in PHP; exact SAP search across all zones, then configured reference DB |
| `ref_lists` | Any signed-in session; full geographic constants |
| `add_pending` | Any signed-in session, including HPCL and outlet; no geography/role validation |
| `my_pending,edit_pending,delete_pending` | Any signed-in session; own exact `submitted_by` for read/edit/delete; approved edit/delete denied |
| `list_pending,approve,reject` | Non-HPCL `role=superadmin`; all pending rows regardless of creator/state; self approval allowed |
| `audit_log,save_note,save_target` | Non-HPCL `role=superadmin`; no current state restriction on note/target IDs or dimensions |
| `pending_count` | Guest gets zero; every signed-in session sees global pending count |
| `get_targets` | Public in PHP; all targets or exact month |

## Orders action eligibility (source audited)

Abbreviations: RA = Rohan Super Admin; HA = HPCL Super Admin; RZ/RR = Rohan Zone/Regional Officer; HZ/HR = HPCL Zone/Regional Officer; O = outlet SAP account. Every nonpublic action requires a current valid `ordUser()` identity. `scope` means the action's own `ordScope`, `ordSapScope`, zone/RO/SA/state/creator predicate, not page visibility. HA also has the router allowlist at `orders.php:1087-1089`. Outlet actions are limited to their own SAP wherever a scope or order validation is used.

| Action | Eligible actor(s) and additional source gate |
|---|---|
| `public_invoice` | Public bearer token; approved invoice row with nonnull number; no identity check |
| `meta` | RA, HA, RZ, RR, HZ, HR, O; scoped counts and settings projection |
| `outlet` | RA, HA, RZ, RR, HZ, HR, O; admin state/selected zone or officer zone/RO/SA/own SAP |
| `sap_list` | RA, HA, RZ, RR, HZ, HR, O; `ordSapScope`, Regional read only |
| `sap_save` | RA, HA, RZ, HZ; `ordSapAccess.edit` and old/new region scope |
| `sap_history` | All seven actors; existing SAP under `ordSapScope` |
| `sap_import` | RA, HA, RZ, HZ; `remove` requires admin; row and existing-SAP scope |
| `ro_report` | RA, HA, RZ, HZ; officer groups restricted to own parent/organization scope |
| `list` | All seven actors; `ordScope`, optional awaiting predicate |
| `get` | All seven actors; `ordScope` |
| `history` | All seven actors; `ordScope`; HPCL actor also sees team event authors only |
| `save` | All seven actors; creator and status rules; RA may correct pending HPCL invoice; O own SAP |
| `submit` | All seven actors; creator, draft/rejected, approver, stock, price and minimum checks |
| `delete` | All seven actors; only creator's draft in permitted zone |
| `bulk` | RZ, RR, HZ, HR, O; `ordCheck` geography/SAP; RA/HA denied |
| `set_min_order` | RA only |
| `set_perms` | RA only |
| `set_prices` | RA, RZ, RR; HZ, HR, O only when `hpcl_edit_rates`; HA denied |
| `set_stock` | RA only |
| `add_product` | RA only |
| `delete_product` | RA only |
| `save_foc_list` | RA only |
| `upload_pod` | RA, RZ, RR; approved, visible/owner or HPCL-invoice coverage, receipt first |
| `upload_receipt` | RA, RZ, RR; HZ, HR, O if `hpcl_receipt`; approved/visible and not delivered; HA barred |
| `upload_invoice` | RA, RZ, RR; approved visible manual invoice, owner or HPCL-invoice coverage |
| `edit_invoice` | RA, RZ, RR; visible approved undelivered auto invoice |
| `pod_download` | All seven actors; `ordLoad` scope; file exists |
| `file_download` | All seven actors; `ordLoad` scope; HPCL invoice redacted if `hpcl_tax_invoice=false` |
| `return_request` | All seven actors; visible approved delivered order |
| `return_list` | All seven actors; `ordScope` |
| `return_decide` | Any actor with matching `ret_<org>_<level>` flag, visible pending R; nonadmin cannot decide own; admin state limit |
| `change_log` | All seven actors for SAP under `ordSapScope`; FOC only admin; MIS/FOC `chgFetch` lacks further order scope in this route |
| `outlet_officers` | All seven actors; O own SAP, others SAP under `ordSapScope` |
| `profile` | All seven actors; own identity projection |
| `superiors` | All seven actors; own hierarchy/contact projection |
| `approve` | RA/HA/RZ/HZ/HR by `ordAwaitCond` and `ordScope`; RR and O never decide; pending, optional stale check, current stock |
| `reject` | Same decision predicate as approve; nonempty comment required |

For exact placed-role combinations see the [approval actor matrix](ORDERS_AUDIT_REPORT.md#cross-action-rules-and-actor-eligibility). The outlet approval comment conflicts with `ordAwaitCond`'s executable denial. `hidden_pages` affects browser navigation only; it never substitutes for these conditions.

## Authentication and account management permissions (source audited)

The `auth.php` action guards were reviewed in [AUTHENTICATION_AUDIT_REPORT.md](AUTHENTICATION_AUDIT_REPORT.md). `actor()` re-reads the current officer file for management requests; `role`, `org`, `level`, `created_by` and target scope govern these routes. `hidden_pages` only hides browser navigation. No Android permission service exists yet.

| Actor | Read officers / sales areas | Create/edit/reset/delete officers | Super-admin management | Outlet-profile management | Own profile |
|---|---|---|---|---|---|
| Rohan Super Admin (`superadmin`, org not HPCL) | All officers, all mapped regions | Any manageable officer; cannot delete self or a parent with children | Add/edit super admins, including own label/states; own page hiding ignored | All regions; CSRF required | Change own password/contact |
| HPCL Super Admin (`superadmin`, org HPCL) | HPCL role-zone accounts; all mapped regions because `superLimit()` returns null | HPCL role-zone accounts only; creates HPCL Zone Officers; may add Regional Officers under manageable HPCL parent | Cannot add/edit super admins | All regions in current code; CSRF required | Change own password/contact |
| Rohan Zone Officer (`role=zone`, `org=rohan`, effective level zone) | Created Regional Officers; own mapped regions | Own `created_by` Regional Officers only | None | Denied | Change own password/contact |
| HPCL Zone Officer (`role=zone`, `org=hpcl`, effective level zone) | Created Regional Officers; own mapped regions | Own `created_by` Regional Officers only | None | Profiles in `officerRegions(actor)`; CSRF required | Change own password/contact |
| Regional Officer (either org) | Management routes denied by `actor('any')` | None | None | Denied | Change own password/contact |
| Outlet profile (`outlet=true`, one SAP) | Officer management denied; scope comes from joined master outlet | None | None | Denied | Change own password in profile table; contact edit denied |
| Guest | Management routes denied; `login`, `check`, `logout` callable | None | None | Denied | None |

`canManage()` handles target authorization for listing, reset and deletion. `update_user_access` and `update_regional_officer` add route-specific checks; e.g. a continuing super admin/Regional Officer edit in `update_user_access` ignores role/geography changes. A Rohan Super Admin can reset their own password through `update_user_password` because no self-target check exists there, while `canViewPassword()` never exposes their own readable view. Outlet manager routes use a region predicate on the joined `portal_outlets.ro`; a profile with no master row cannot be looked up/updated by those routes even if its profile row remains. The source has no global CSRF or HTTP-method guard for officer actions. All statements here are about source guards, not production account grants (live `users.php` is missing).

## Verified order decision eligibility

The following describes `ordAwaitCond` only. Every decision also requires a pending order visible under `ordScope`; a super admin's configured approval states, geographic scope, and creator ownership affect the outcome.

| Actor | Eligible placed roles under `ordAwaitCond` |
|---|---|
| Rohan Super Admin | Own order regardless of approval states; other orders within configured approval states |
| HPCL Super Admin | Rohan admin/zone/regional and HPCL regional/zone/outlet within approval states; own HPCL admin order |
| Rohan Zone Officer | Rohan admin; own Rohan zone; Rohan regional created by team member |
| Rohan Regional Officer | None |
| HPCL Zone Officer | Rohan admin/zone/regional, HPCL admin/outlet; own HPCL zone; HPCL regional created by team member |
| HPCL Regional Officer | Rohan admin and HPCL outlet |
| Outlet | None |

Source: `orders.php:602-635`, `789-810`, `3013-3055`. The comment near the router suggests an outlet can approve like a regional officer, but the executable `ordAwaitCond` returns `1 = 0` for a nonempty outlet SAP. The executable condition governs the mapping. Other actions and page visibility remain unverified.
