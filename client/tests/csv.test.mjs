import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMisCsv, misCsv } from '../src/csv.ts';

test('CSV import handles quoted commas and rejects malformed headings',()=>{
  assert.deepEqual(parseMisCsv('d,sap,item,ea\n2026-11-22,90000001,"DEF, 20L",12\n'),[{d:'2026-11-22',sap:'90000001',item:'DEF, 20L',ea:'12'}]);
  assert.throws(()=>parseMisCsv('date,sap,item,ea\n2026-11-22,1,DEF,12'),/headings/);
});
test('CSV export escapes quotes and line structure',()=>{
  const text=misCsv([{id:1,d:'2026-11-22',sap:'90000001',outlet:'A "Fuel"',state:'MP',zone:'Central',ro:'Indore',sales_area:'SA',item:'DEF, 20L',ea:'12',litres:'240',src:'sheet',ver:1,notes:null}]);
  assert.match(text,/"A ""Fuel"""/);
  assert.match(text,/"DEF, 20L"/);
  assert.equal(text.trim().split(/\r?\n/).length,2);
});
