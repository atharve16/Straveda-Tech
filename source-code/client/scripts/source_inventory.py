"""Read-only, line-linked PHP route and function inventory.

This is a lexical inventory, not a call graph or behavioral audit. It never
overwrites the hand-reviewed migration documents.
"""

import re
import sys
from reference_paths import reference_dir

ROOT = reference_dir('STRAVEDA_REFERENCE_SOURCE_DIR', '02-web-portal-source')
FILES = [
    'auth.php', 'users-store.php', 'outlet-users.php', 'orders.php',
    'api.php', 'mis.php', 'mis-core.php', 'mis-xlsx.php',
    'regions.php', 'change-log.php',
]
ROUTER_SPANS = {
    'auth.php': (0, 750),
    'orders.php': (1090, 1140),
    'api.php': (50, 85),
    'mis.php': (25, 45),
}


def inventory():
    actions = []
    helpers = []
    for file in FILES:
        lines = (ROOT / file).read_text(encoding='utf-8-sig').splitlines()
        for no, line in enumerate(lines, 1):
            function = re.match(r'\s*function\s+(\w+)\s*\(', line)
            if function:
                helpers.append((file, no, function.group(1)))
            case = re.match(r"\s*case '([a-z_]+)':", line)
            if case and file in ROUTER_SPANS:
                start, stop = ROUTER_SPANS[file]
                if start < no < stop:
                    actions.append((file, no, case.group(1)))
            if file == 'orders.php' and re.search(r"\$action\s*===\s*'public_invoice'", line):
                actions.append((file, no, 'public_invoice'))
    actions.sort(key=lambda row: (FILES.index(row[0]), row[1]))
    return actions, helpers


if __name__ == '__main__':
    actions, helpers = inventory()
    if '--list' in sys.argv:
        for file, no, action in actions:
            print(f'action {file}:{no} {action}')
        for file, no, helper in helpers:
            print(f'helper {file}:{no} {helper}')
    print(f'{len(actions)} actions, {len(helpers)} helpers inventoried')
