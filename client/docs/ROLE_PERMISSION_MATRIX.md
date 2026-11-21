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

This is not a complete portal-wide permission matrix. The 18 page IDs in `auth.php` are visibility settings, not a substitute for server-side authorization. Authentication/account actions are audited below; `api.php` pending/MIS access, `misScopeSql`, and all `orders.php` action guards still need action-by-action review. The absent live `users.php` prevents verifying live per-user page and approval-state grants. Every unlisted permission remains `NEEDS_CLARIFICATION`.

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
