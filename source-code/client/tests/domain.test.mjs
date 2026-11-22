import test from 'node:test';
import assert from 'node:assert/strict';
import { inScope, canEditMis, canDecidePending, canDecideOrder, validDate } from '../src/domain.ts';

const admin = { username: 'demo_super', label: 'Admin', role: 'superadmin', org: 'rohan', level: 'superadmin', ros: [], salesAreas: [], states: [] };
const officer = { username: 'demo_rohan_ro', label: 'Officer', role: 'zone', org: 'rohan', level: 'regional', zone: 'Central Zone', ros: ['INDORE RET RO'], salesAreas: ['INDORE-1 RETAIL SA'], states: [] };
const outlet = { username: '90000001', label: 'Outlet', role: 'outlet', org: 'outlet', level: 'outlet', zone: 'Central Zone', ros: ['INDORE RET RO'], salesAreas: [], sap: '90000001', states: [] };
const row = { sap: '90000001', zone: 'Central Zone', ro: 'INDORE RET RO', sales_area: 'INDORE-1 RETAIL SA', state: 'Madhya Pradesh' };
const order = { ...row, id: 1, order_ref: 'O1', status: 'pending', order_date: '2026-11-01', outlet: 'Outlet', total_ea: 100, created_by: 'x', placed_role: 'hpcl_outlet', updated_at: '', delivery_stage: '' };

test('geographic and SAP restrictions', () => {
  assert.equal(inScope(officer, row), true);
  assert.equal(inScope(officer, { ...row, ro: 'OTHER' }), false);
  assert.equal(inScope(officer, { ...row, sales_area: 'OTHER' }), false);
  assert.equal(inScope(outlet, row), true);
  assert.equal(inScope(outlet, { ...row, sap: '90000002' }), false);
});
test('write permissions and pending decisions', () => {
  assert.equal(canEditMis(admin), true);
  assert.equal(canEditMis(officer), false);
  assert.equal(canDecidePending(admin), true);
  assert.equal(canDecidePending(outlet), false);
  assert.equal(canDecideOrder(admin, order), true);
  assert.equal(canDecideOrder(outlet, order), false);
  assert.equal(canDecideOrder(admin, { ...order, status: 'approved' }), false);
});
test('order decision roles do not inherit blanket pending access', () => {
  const hpclAdmin = { ...admin, username: 'hpcl_admin', org: 'hpcl' };
  const hpclZone = { ...officer, org: 'hpcl', level: 'zone' };
  assert.equal(canDecideOrder(hpclAdmin, { ...order, placed_role: 'hpcl_admin' }), false);
  assert.equal(canDecideOrder(hpclAdmin, { ...order, placed_role: 'hpcl_outlet' }), true);
  assert.equal(canDecideOrder(hpclZone, { ...order, placed_role: 'hpcl_regional' }), false);
  assert.equal(canDecideOrder(officer, { ...order, placed_role: 'rohan_regional' }), false);
});
test('strict calendar dates', () => {
  assert.equal(validDate('2026-11-22'), true);
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2026-2-3'), false);
});
