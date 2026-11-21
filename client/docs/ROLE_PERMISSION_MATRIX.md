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

This is not a complete permission matrix. `auth.php`, `ordScope`, page controls and all action guards must be mapped before domain implementation.

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
