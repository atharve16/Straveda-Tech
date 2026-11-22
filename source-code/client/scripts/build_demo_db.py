"""Convert the supplied MySQL schema and JSON seed to an offline SQLite asset."""
import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / '03-demo-data'
OUT = Path(__file__).resolve().parents[1] / 'assets/database/rohan_energy_demo.db'


def sqlite_schema(source: str) -> str:
    statements = []
    for name, body in re.findall(r'CREATE TABLE `([^`]+)`\s*\((.*?)\) ENGINE=', source, re.S):
        lines = []
        for raw in body.splitlines():
            line = raw.split('--')[0].strip().rstrip(',')
            if not line:
                continue
            if line.startswith('KEY '):
                continue
            if line.startswith('UNIQUE KEY '):
                cols = re.search(r'\((.*)\)', line).group(1)
                lines.append(f'UNIQUE ({cols})')
                continue
            if line.startswith('CONSTRAINT '):
                lines.append(re.sub(r'^CONSTRAINT `[^`]+` ', '', line))
                continue
            line = re.sub(r'\b(?:VARCHAR\(\d+\)|MEDIUMTEXT|TEXT|DATETIME|DATE)\b', 'TEXT', line)
            line = re.sub(r'\bDECIMAL\(\d+,\d+\)', 'TEXT', line)
            line = re.sub(r'\b(?:TINYINT|INT)\b', 'INTEGER', line)
            line = line.replace('AUTO_INCREMENT ', '')
            line = line.replace('NOT NULL PRIMARY KEY', 'NOT NULL PRIMARY KEY')
            lines.append(line)
        statements.append(f'CREATE TABLE `{name}` (\n  ' + ',\n  '.join(lines) + '\n);')
    statements += [
        'CREATE INDEX idx_outlets_zone ON portal_outlets(zone);',
        'CREATE INDEX idx_outlet_log_sap ON portal_outlet_log(sap_code);',
        'CREATE INDEX idx_outlet_users_label ON portal_outlet_users(label);',
        'CREATE INDEX idx_orders_zone_status ON portal_orders(zone,status);',
        'CREATE INDEX idx_orders_creator ON portal_orders(created_by,status);',
        'CREATE INDEX idx_mis_date ON portal_mis_rows(d);',
        'CREATE INDEX idx_events_order ON portal_order_events(order_id);',
        'CREATE INDEX idx_returns_order ON portal_order_returns(order_id);',
        'CREATE INDEX idx_returns_status ON portal_order_returns(status);',
        'CREATE INDEX idx_files_order ON portal_order_files(order_id);',
        'CREATE TABLE officer_accounts (username TEXT PRIMARY KEY, data_json TEXT NOT NULL, pass_hash TEXT NOT NULL);',
        'CREATE TABLE audit_log (id INTEGER PRIMARY KEY, action TEXT NOT NULL, username TEXT, details TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);',
        'CREATE TABLE targets (id INTEGER PRIMARY KEY, month TEXT NOT NULL, scope_type TEXT NOT NULL, scope_value TEXT NOT NULL, target_vol INTEGER NOT NULL DEFAULT 0, UNIQUE(month,scope_type,scope_value));',
        'CREATE TABLE portal_change_log (id INTEGER PRIMARY KEY, area TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL DEFAULT \'\', summary TEXT NOT NULL DEFAULT \'\', details TEXT, username TEXT NOT NULL DEFAULT \'\', user_label TEXT NOT NULL DEFAULT \'\', user_role TEXT NOT NULL DEFAULT \'\', created_at TEXT NOT NULL);',
        'CREATE INDEX idx_change_area ON portal_change_log(area,id);',
        'PRAGMA user_version = 1;',
    ]
    return '\n'.join(statements)


def main():
    schema = sqlite_schema((SOURCE / 'schema.sql').read_text(encoding='utf-8'))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()
    con = sqlite3.connect(OUT)
    try:
        con.executescript(schema)
        counts = {}
        for path in sorted((SOURCE / 'json').glob('portal_*.json')):
            rows = json.loads(path.read_text(encoding='utf-8'))
            counts[path.stem] = len(rows)
            for row in rows:
                cols = list(row)
                placeholders = ','.join('?' for _ in cols)
                quoted = ','.join('`' + c + '`' for c in cols)
                con.execute(f'INSERT INTO `{path.stem}` ({quoted}) VALUES ({placeholders})', [row[c] for c in cols])
        users = json.loads((SOURCE / 'json/users.json').read_text(encoding='utf-8'))
        accounts = users['users'] if isinstance(users, dict) and 'users' in users else users
        if isinstance(accounts, dict):
            accounts = [{'username': k, **v} for k, v in accounts.items()]
        for account in accounts:
            username = account['username']
            pw = account.get('pass_hash', account.get('pass'))
            assert pw and pw.startswith(('$2y$', '$2b$', '$2a$')), username
            con.execute('INSERT INTO officer_accounts VALUES (?,?,?)', (username, json.dumps(account, ensure_ascii=False), pw))
        con.commit()
        con.execute('PRAGMA foreign_keys=ON')
        assert not con.execute('PRAGMA foreign_key_check').fetchall()
        for table, count in counts.items():
            assert con.execute(f'SELECT COUNT(*) FROM `{table}`').fetchone()[0] == count
        print(json.dumps({'tables': counts, 'officer_accounts': len(accounts), 'foreign_key_check': 'ok'}, indent=2))
    finally:
        con.close()


if __name__ == '__main__':
    main()
