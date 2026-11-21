"""Generate a line-linked inventory from the immutable portal source."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / '02-web-portal-source'
DOC = Path(__file__).resolve().parents[1] / 'docs'
DOC.mkdir(exist_ok=True)
FILES = ['auth.php', 'users-store.php', 'outlet-users.php', 'orders.php', 'api.php', 'mis.php', 'mis-core.php', 'mis-xlsx.php', 'regions.php', 'change-log.php']
actions = []
helpers = []
for file in FILES:
    lines = (ROOT / file).read_text(encoding='utf-8-sig').splitlines()
    for no, line in enumerate(lines, 1):
        m = re.match(r'\s*function\s+(\w+)\s*\(', line)
        if m:
            helpers.append((file, no, m.group(1)))
        m = re.match(r"\s*case '([a-z_]+)':(?:\s*([a-zA-Z_][a-zA-Z_0-9]*)\s*\()?", line)
        if m and file in ('auth.php', 'orders.php', 'api.php', 'mis.php'):
            # Only router cases, not role or file-type switches.
            limit = {'auth.php': 750, 'orders.php': 1140, 'api.php': 85, 'mis.php': 45}[file]
            start = {'auth.php': 0, 'orders.php': 1090, 'api.php': 50, 'mis.php': 25}[file]
            if start < no < limit:
                actions.append((file, no, m.group(1), m.group(2) or 'see dispatch body'))

audit = ['# Source code audit — working inventory', '', 'This inventory was extracted from the supplied source. It is not a completed behavioral audit. The PHP source remains authoritative; methods must be reviewed in full before porting.', '', '## PHP actions', '', '| File:line | Action | Dispatched helper |', '|---|---|---|']
audit += [f'| `{f}:{n}` | `{a}` | `{h}` |' for f,n,a,h in actions]
audit += ['', '## PHP helper functions', '', '| File:line | Helper |', '|---|---|']
audit += [f'| `{f}:{n}` | `{h}` |' for f,n,h in helpers]
audit += ['', '## Frontend files', '', '| File | Purpose |', '|---|---|', '| `index.html` | Shell, dashboard, Raw Data, entry and admin views |', '| `orders.js`, `orders.css` | Order, approval, delivery, returns, SAP, stock, FOC and officer screens |', '| `mis.js`, `mis.css` | MIS grid and import/export |', '| `dash-reports.js` | Dashboard calculations and charts |', '| `salesorder.js` | Sales Order and Tax Invoice PDF drawing |', '| `invoice.html` | Public invoice view in original portal; requires offline redesign |', '| `qrcode.js` | QR generation |', '| `jspdf.umd.min.js`, `xlsx.mini.min.js` | Bundled PDF and Excel libraries |', '| `logo-mark.svg`, `logo-hpcl.svg`, `bg.jpg` | Local visual assets |', '', '## Confirmed critical rules', '', '- The 18 page IDs are in `auth.php` and are individually adjustable for users.', '- `ordAwaitCond` depends on `placed_role`, creator identity, organization, role level, team and approval states. `ordScope` adds geographic and ownership filtering.', '- `ordDecide` requires `pending`, checks scope and eligibility, compares `seen_updated_at`, rechecks stock, then records decision and events inside a transaction.', '- Approval sets delivery stage to `transit`. Rejection clears that stage. Rejection requires a reason.', '- A return requires an approved and delivered order, a reason of at least three characters and a credit note. Pending and approved return requests block another request.', '- `api.php` creates `audit_log` and `targets`; `change-log.php` creates `portal_change_log`.', '- Core schema has 13 tables. Officer accounts are originally file-based.', '', '## Outstanding audit work', '', 'Read and document the body of every listed helper, all frontend event handlers, workbook column rules, PDF geometry, validations and error conditions. Do not mark modules complete until this is done.']
(DOC / 'SOURCE_CODE_AUDIT.md').write_text('\n'.join(audit) + '\n', encoding='utf-8')

mapping = ['# PHP to TypeScript mapping — working inventory', '', 'Each row is an action to port. Input fields, validations, permissions, database effects and tests are **not yet verified** except where documented in `SOURCE_CODE_AUDIT.md`. The mapping is a gate, not evidence of implementation.', '', '| PHP location | Action | PHP helper | Planned TypeScript service | Automated test | Status |', '|---|---|---|---|---|---|']
mapping += [f'| `{f}:{n}` | `{a}` | `{h}` | `{f.removesuffix(".php")}.{a}` | `tests/regression/{f.removesuffix(".php")}/{a}.test.ts` | pending source review |' for f,n,a,h in actions]
(DOC / 'PHP_TO_TYPESCRIPT_MAPPING.md').write_text('\n'.join(mapping) + '\n', encoding='utf-8')
print(f'{len(actions)} actions, {len(helpers)} helpers inventoried')
