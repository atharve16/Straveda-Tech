export type MainTab = 'Home' | 'Orders' | 'MIS' | 'Approvals' | 'More';

export interface BackNavigationState {
  isLoggedIn: boolean;
  showMoreModal: boolean;
  activeSubSection: string | null;
  currentTab: MainTab;
  tabHistory: MainTab[];
  orderViewTab?: string;
  misActiveTab?: string;
  approvalsActiveTab?: string;
}

export interface BackNavigationActions {
  closeModal: () => void;
  closeSubSection: () => void;
  resetOrderTab: () => void;
  resetMisTab: () => void;
  resetApprovalsTab: () => void;
  popTab: (previousTab: MainTab) => void;
}

/**
 * Implements hardware back navigation priority order:
 * 1. If a modal / overlay is open, close it first.
 * 2. If a nested screen or subsection is open, return to parent screen.
 * 3. If a nested tab or internal navigation state has a valid previous state, restore that state.
 * 4. If the user navigated from one main screen to another, return to the previously visited screen.
 * 5. Only when on the root screen (Home) with no modal or nested state, exit the application.
 */
export function handleBackNavigation(
  state: BackNavigationState,
  actions: BackNavigationActions
): boolean {
  if (!state.isLoggedIn) {
    return false;
  }

  // 1. Modals / overlays
  if (state.showMoreModal) {
    actions.closeModal();
    return true;
  }

  // 2. Sub-sections / nested screens
  if (state.activeSubSection !== null) {
    actions.closeSubSection();
    return true;
  }

  // 3. Nested tab within main screens (priority 4 in prompt)
  if (state.currentTab === 'Orders' && state.orderViewTab && state.orderViewTab !== 'all_orders') {
    actions.resetOrderTab();
    return true;
  }
  if (state.currentTab === 'MIS' && state.misActiveTab && state.misActiveTab !== 'mis') {
    actions.resetMisTab();
    return true;
  }
  if (state.currentTab === 'Approvals' && state.approvalsActiveTab && state.approvalsActiveTab !== 'pending_mis') {
    actions.resetApprovalsTab();
    return true;
  }

  // 4. Main screen navigation history (priority 3 in prompt)
  if (state.currentTab !== 'Home') {
    const nextHistory = state.tabHistory.slice(0, -1);
    const target = nextHistory.length > 0 ? nextHistory[nextHistory.length - 1] : 'Home';
    actions.popTab(target);
    return true;
  }

  // 5. On root screen (Home) -> allow normal Android exit
  return false;
}

export function recordTabHistory(prevHistory: MainTab[], nextTab: MainTab): MainTab[] {
  if (nextTab === 'Home') return ['Home'];
  if (prevHistory[prevHistory.length - 1] === nextTab) return prevHistory;
  return [...prevHistory, nextTab];
}
