import re
import sqlite3
import unittest
from pathlib import Path

CLIENT = Path(__file__).resolve().parents[2]
SEED = CLIENT / 'assets/database/rohan_energy_demo.db'


class AppSchemaTest(unittest.TestCase):
    def setUp(self):
        source = sqlite3.connect(SEED)
        self.db = sqlite3.connect(':memory:')
        source.backup(self.db)
        source.close()
        self.db.execute('PRAGMA foreign_keys=ON')

    def tearDown(self):
        self.db.close()

    def test_app_pending_duplicate_and_atomic_rollback(self):
        layout = (CLIENT / 'app/_layout.tsx').read_text(encoding='utf-8')
        ddl = re.search(r'await tx\.execAsync\(`(CREATE TABLE IF NOT EXISTS app_pending .*?)`\);', layout, re.S)
        self.assertIsNotNone(ddl)
        self.db.executescript(ddl.group(1))
        args = ('2026-11-22', '90000001', 'Demo Outlet', 'DEF', 10, 'demo_super', 'Central Zone', 'INDORE RET RO', 'Madhya Pradesh', 'INDORE-1 RETAIL SA')
        sql = "INSERT INTO app_pending(d,sap,outlet,item,ea,status,submitted_by,zone,ro,state,sales_area) VALUES(?,?,?,?,?,'pending',?,?,?,?,?)"
        self.db.execute(sql, args)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(sql, args)
        self.assertEqual(self.db.execute('SELECT count(*) FROM app_pending').fetchone()[0], 1)

    def test_order_draft_insert_matches_seed_schema(self):
        domain = (CLIENT / 'src/domain.ts').read_text(encoding='utf-8')
        sql = re.search(r'const created=await tx\.runAsync\("(INSERT INTO portal_orders.*?)",outlet\.zone', domain).group(1)
        args = ('Central Zone','Madhya Pradesh','INDORE RET RO','IND01','Demo Outlet','INDORE','INDORE-1 RETAIL SA','','','','','','','','','','','',105,2100,'demo_super','Demo Super','rohan_admin')
        self.db.execute(sql, args)
        self.assertEqual(self.db.execute("SELECT status,total_ea FROM portal_orders WHERE outlet='Demo Outlet'").fetchone(), ('draft',105))


if __name__ == '__main__':
    unittest.main()
