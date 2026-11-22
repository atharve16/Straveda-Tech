import json
import sqlite3
import unittest
import re
import sys
from pathlib import Path

CLIENT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(CLIENT / 'scripts'))
from reference_paths import reference_dir

SOURCE = reference_dir('STRAVEDA_DEMO_DATA_DIR', '03-demo-data')
JSON = SOURCE / 'json'
DB = CLIENT / 'assets/database/rohan_energy_demo.db'
SCHEMA = SOURCE / 'schema.sql'


class DemoSeedTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not SCHEMA.is_file() or not list(JSON.glob('portal_*.json')):
            raise FileNotFoundError(
                f'Incomplete demo reference data in {SOURCE}. Set STRAVEDA_DEMO_DATA_DIR to the complete demo-data directory.'
            )

    def setUp(self):
        self.db = sqlite3.connect(DB)
        self.db.execute('PRAGMA foreign_keys=ON')

    def tearDown(self):
        self.db.close()

    def test_counts_and_integrity(self):
        self.assertEqual(self.db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])
        for source in JSON.glob('portal_*.json'):
            expected = len(json.loads(source.read_text(encoding='utf-8')))
            actual = self.db.execute(f'SELECT count(*) FROM `{source.stem}`').fetchone()[0]
            self.assertEqual(actual, expected, source.name)

    def test_source_relationships(self):
        checks = [
            'SELECT count(*) FROM portal_order_items i LEFT JOIN portal_orders o ON o.id=i.order_id WHERE o.id IS NULL',
            'SELECT count(*) FROM portal_order_files f LEFT JOIN portal_orders o ON o.id=f.order_id WHERE o.id IS NULL',
            'SELECT count(*) FROM portal_outlet_users u LEFT JOIN portal_outlets o ON o.sap_code=u.sap_code WHERE o.sap_code IS NULL',
            'SELECT count(*) FROM portal_foc f LEFT JOIN portal_products p ON p.pid=f.pid WHERE p.pid IS NULL',
        ]
        for query in checks:
            self.assertEqual(self.db.execute(query).fetchone()[0], 0)

    def test_unique_constraints(self):
        row = self.db.execute('SELECT pid,min_qty,foc_qty,created_by,created_at FROM portal_foc LIMIT 1').fetchone()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('INSERT INTO portal_foc(pid,min_qty,foc_qty,created_by,created_at) VALUES(?,?,?,?,?)', row)

    def test_officer_hash_shapes(self):
        users = self.db.execute('SELECT username,pass_hash FROM officer_accounts').fetchall()
        self.assertEqual(len(users), 10)
        for username, pw in users:
            self.assertEqual(len(pw), 60, username)
            self.assertTrue(pw.startswith(('$2y$', '$2a$', '$2b$')), username)

        outlets = self.db.execute('SELECT sap_code,pass,pass_view FROM portal_outlet_users').fetchall()
        self.assertEqual(len(outlets), 10)
        for sap, pw, view in outlets:
            self.assertEqual(len(pw), 60, sap)
            self.assertTrue(pw.startswith(('$2y$', '$2a$', '$2b$')), sap)
            self.assertIsNone(view, sap)

    def test_schema_columns_indexes_and_foreign_keys(self):
        source = SCHEMA.read_text(encoding='utf-8')
        for table, body in re.findall(r'CREATE TABLE `([^`]+)`\s*\((.*?)\) ENGINE=', source, re.S):
            actual = {r[1] for r in self.db.execute(f'PRAGMA table_info(`{table}`)')}
            expected = set(re.findall(r'`([^`]+)`\s+(?:INT|TINYINT|DECIMAL|VARCHAR|TEXT|MEDIUMTEXT|DATE|DATETIME)\b', body))
            self.assertEqual(actual, expected, table)
            source_indexes = re.findall(r'^\s*(?:UNIQUE KEY|KEY) `[^`]+` \(([^)]+)\)', body, re.M)
            actual_indexes = {
                tuple(c[2] for c in self.db.execute(f'PRAGMA index_info(`{idx[1]}`)'))
                for idx in self.db.execute(f'PRAGMA index_list(`{table}`)')
            }
            for cols in source_indexes:
                expected_cols = tuple(re.findall(r'`([^`]+)`', cols))
                self.assertIn(expected_cols, actual_indexes, (table, expected_cols))
            unique_sources = re.findall(r'^\s*UNIQUE KEY `[^`]+` \(([^)]+)\)', body, re.M)
            unique_indexes = {
                tuple(c[2] for c in self.db.execute(f'PRAGMA index_info(`{idx[1]}`)'))
                for idx in self.db.execute(f'PRAGMA index_list(`{table}`)') if idx[2]
            }
            for cols in unique_sources:
                self.assertIn(tuple(re.findall(r'`([^`]+)`', cols)), unique_indexes, table)
            source_fks = re.findall(r'FOREIGN KEY \(`([^`]+)`\) REFERENCES `([^`]+)`\(`([^`]+)`\) ON DELETE CASCADE', body)
            actual_fks = {(r[3], r[2], r[4], r[6]) for r in self.db.execute(f'PRAGMA foreign_key_list(`{table}`)')}
            for from_col, target, to_col in source_fks:
                self.assertIn((from_col, target, to_col, 'CASCADE'), actual_fks, table)

    def test_decimal_storage_and_copy_preservation(self):
        source = SCHEMA.read_text(encoding='utf-8')
        for table, body in re.findall(r'CREATE TABLE `([^`]+)`\s*\((.*?)\) ENGINE=', source, re.S):
            for column in re.findall(r'`([^`]+)` DECIMAL\(\d+,\d+\)', body):
                declared = {r[1]: r[2] for r in self.db.execute(f'PRAGMA table_info(`{table}`)')}
                self.assertEqual(declared[column].upper(), 'TEXT', (table, column))
        for table in ('portal_order_items', 'portal_orders', 'portal_products'):
            columns = [r[1] for r in self.db.execute(f'PRAGMA table_info(`{table}`)')]
            for name in ('rate', 'gst', 'price'):
                if name in columns:
                    types = self.db.execute(f'SELECT DISTINCT typeof(`{name}`) FROM `{table}` WHERE `{name}` IS NOT NULL').fetchall()
                    self.assertTrue(all(t[0] == 'text' for t in types), (table, name, types))
        device = sqlite3.connect(':memory:')
        try:
            self.db.backup(device)
            device.execute("INSERT INTO portal_settings(skey,svalue,updated_at) VALUES ('_copy_probe','preserved','2026-01-01')")
            self.assertEqual(device.execute("SELECT svalue FROM portal_settings WHERE skey='_copy_probe'").fetchone()[0], 'preserved')
            self.assertIsNone(self.db.execute("SELECT svalue FROM portal_settings WHERE skey='_copy_probe'").fetchone())
        finally:
            device.close()

    def test_seed_values_match_source_json(self):
        self.db.row_factory = sqlite3.Row
        for source in JSON.glob('portal_*.json'):
            rows = json.loads(source.read_text(encoding='utf-8'))
            for row in rows:
                key = next(iter(row))
                actual = self.db.execute(f'SELECT * FROM `{source.stem}` WHERE `{key}` = ?', (row[key],)).fetchone()
                self.assertIsNotNone(actual, (source.name, row[key]))
                for column, expected in row.items():
                    self.assertEqual(str(actual[column]) if actual[column] is not None else None,
                                     str(expected) if expected is not None else None,
                                     (source.name, row[key], column))

    def test_runtime_tables_and_version(self):
        names = {r[0] for r in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertTrue({'officer_accounts', 'audit_log', 'targets', 'portal_change_log'} <= names)
        for table in ('audit_log', 'targets', 'portal_change_log'):
            self.assertEqual(self.db.execute(f'SELECT COUNT(*) FROM `{table}`').fetchone()[0], 0)
        self.assertEqual(self.db.execute('PRAGMA user_version').fetchone()[0], 1)
        indexes = {tuple(c[2] for c in self.db.execute(f'PRAGMA index_info(`{r[1]}`)'))
                   for r in self.db.execute('PRAGMA index_list(`targets`)')}
        self.assertIn(('month', 'scope_type', 'scope_value'), indexes)

    def test_cascade_delete_on_copy(self):
        device = sqlite3.connect(':memory:')
        try:
            self.db.backup(device)
            device.execute('PRAGMA foreign_keys=ON')
            order_id = device.execute('SELECT order_id FROM portal_order_items LIMIT 1').fetchone()[0]
            device.execute('DELETE FROM portal_orders WHERE id=?', (order_id,))
            for table in ('portal_order_items', 'portal_order_events', 'portal_order_returns', 'portal_order_files'):
                self.assertEqual(device.execute(f'SELECT count(*) FROM `{table}` WHERE order_id=?', (order_id,)).fetchone()[0], 0)
            self.assertEqual(device.execute('PRAGMA foreign_key_check').fetchall(), [])
        finally:
            device.close()


if __name__ == '__main__':
    unittest.main()
