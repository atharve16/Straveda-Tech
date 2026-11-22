import test from 'node:test';
import assert from 'node:assert/strict';
import { handleBackNavigation, recordTabHistory } from '../src/navigation.ts';

test('logged out actor allows normal Android exit', () => {
  let actionsCalled = 0;
  const actions = {
    closeModal: () => actionsCalled++,
    closeSubSection: () => actionsCalled++,
    resetOrderTab: () => actionsCalled++,
    resetMisTab: () => actionsCalled++,
    resetApprovalsTab: () => actionsCalled++,
    popTab: () => actionsCalled++,
  };

  const state = {
    isLoggedIn: false,
    showMoreModal: false,
    activeSubSection: null,
    currentTab: 'Home',
    tabHistory: ['Home'],
  };

  const handled = handleBackNavigation(state, actions);
  assert.equal(handled, false);
  assert.equal(actionsCalled, 0);
});

test('Priority 1: open modal is closed first', () => {
  let modalClosed = false;
  let subSectionClosed = false;

  const actions = {
    closeModal: () => { modalClosed = true; },
    closeSubSection: () => { subSectionClosed = true; },
    resetOrderTab: () => {},
    resetMisTab: () => {},
    resetApprovalsTab: () => {},
    popTab: () => {},
  };

  const state = {
    isLoggedIn: true,
    showMoreModal: true,
    activeSubSection: 'inventory',
    currentTab: 'Orders',
    tabHistory: ['Home', 'Orders'],
  };

  const handled = handleBackNavigation(state, actions);
  assert.equal(handled, true);
  assert.equal(modalClosed, true);
  assert.equal(subSectionClosed, false);
});

test('Priority 2: active sub-section is closed before popping main screen', () => {
  let subSectionClosed = false;
  let tabPopped = false;

  const actions = {
    closeModal: () => {},
    closeSubSection: () => { subSectionClosed = true; },
    resetOrderTab: () => {},
    resetMisTab: () => {},
    resetApprovalsTab: () => {},
    popTab: () => { tabPopped = true; },
  };

  const state = {
    isLoggedIn: true,
    showMoreModal: false,
    activeSubSection: 'reports',
    currentTab: 'Orders',
    tabHistory: ['Home', 'Orders'],
  };

  const handled = handleBackNavigation(state, actions);
  assert.equal(handled, true);
  assert.equal(subSectionClosed, true);
  assert.equal(tabPopped, false);
});

test('Priority 3 & 4: internal non-default nested tabs restore before popping screen', () => {
  let orderTabReset = false;
  let misTabReset = false;
  let approvalsTabReset = false;
  let tabPopped = false;

  const actions = {
    closeModal: () => {},
    closeSubSection: () => {},
    resetOrderTab: () => { orderTabReset = true; },
    resetMisTab: () => { misTabReset = true; },
    resetApprovalsTab: () => { approvalsTabReset = true; },
    popTab: () => { tabPopped = true; },
  };

  // Orders create tab
  let handled = handleBackNavigation({
    isLoggedIn: true,
    showMoreModal: false,
    activeSubSection: null,
    currentTab: 'Orders',
    tabHistory: ['Home', 'Orders'],
    orderViewTab: 'create',
  }, actions);
  assert.equal(handled, true);
  assert.equal(orderTabReset, true);
  assert.equal(tabPopped, false);

  // MIS entry tab
  handled = handleBackNavigation({
    isLoggedIn: true,
    showMoreModal: false,
    activeSubSection: null,
    currentTab: 'MIS',
    tabHistory: ['Home', 'MIS'],
    misActiveTab: 'entry',
  }, actions);
  assert.equal(handled, true);
  assert.equal(misTabReset, true);

  // Approvals submit_entry tab
  handled = handleBackNavigation({
    isLoggedIn: true,
    showMoreModal: false,
    activeSubSection: null,
    currentTab: 'Approvals',
    tabHistory: ['Home', 'Approvals'],
    approvalsActiveTab: 'submit_entry',
  }, actions);
  assert.equal(handled, true);
  assert.equal(approvalsTabReset, true);
});

test('Priority 3: main tab navigation history pops back through visited screens to Home', () => {
  let poppedTarget = null;
  const actions = {
    closeModal: () => {},
    closeSubSection: () => {},
    resetOrderTab: () => {},
    resetMisTab: () => {},
    resetApprovalsTab: () => {},
    popTab: target => { poppedTarget = target; },
  };

  // User on Approvals, visited Home -> Orders -> MIS -> Approvals
  const state = {
    isLoggedIn: true,
    showMoreModal: false,
    activeSubSection: null,
    currentTab: 'Approvals',
    tabHistory: ['Home', 'Orders', 'MIS', 'Approvals'],
    approvalsActiveTab: 'pending_mis',
  };

  const handled = handleBackNavigation(state, actions);
  assert.equal(handled, true);
  assert.equal(poppedTarget, 'MIS');
});

test('Priority 5: root screen (Home) with no open state allows Android exit', () => {
  let actionCount = 0;
  const actions = {
    closeModal: () => actionCount++,
    closeSubSection: () => actionCount++,
    resetOrderTab: () => actionCount++,
    resetMisTab: () => actionCount++,
    resetApprovalsTab: () => actionCount++,
    popTab: () => actionCount++,
  };

  const state = {
    isLoggedIn: true,
    showMoreModal: false,
    activeSubSection: null,
    currentTab: 'Home',
    tabHistory: ['Home'],
  };

  const handled = handleBackNavigation(state, actions);
  assert.equal(handled, false);
  assert.equal(actionCount, 0);
});

test('recordTabHistory manages tab transitions without duplicate entries and resets on Home', () => {
  let history = ['Home'];
  history = recordTabHistory(history, 'Orders');
  assert.deepEqual(history, ['Home', 'Orders']);

  // Same tab does not duplicate
  history = recordTabHistory(history, 'Orders');
  assert.deepEqual(history, ['Home', 'Orders']);

  history = recordTabHistory(history, 'MIS');
  assert.deepEqual(history, ['Home', 'Orders', 'MIS']);

  // Clicking Home resets root history
  history = recordTabHistory(history, 'Home');
  assert.deepEqual(history, ['Home']);
});
