import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, StyleSheet, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Domain and CSV services (unchanged)
import {
  Actor,
  MisRow,
  Order,
  Pending,
  addMis,
  dashboard,
  decideOrder,
  decidePending,
  deleteMis,
  exportMisRows,
  listMis,
  listOrders,
  listOutlets,
  listPending,
  listProducts,
  submitOrder,
  submitPending,
  updateMis,
} from '../src/domain';
import { clearSession, loginAndSaveSession, restoreSession } from '../src/session';
import { canDecideReturns, getOrderDetail, listOrderReturns, previewDraftLines, saveOrderDraft, requestOrderReturn, decideOrderReturn, type OrderDetail, type OrderReturn } from '../src/order-workflows';
import { pickAndSaveOrderFile, shareOrderFile } from '../src/order-files';
import type { OrderFileKind } from '../src/order-file-validation';
import { misCsv, parseMisCsvDetailed } from '../src/csv';
import { commitMisImport, deleteSelectedMis, listMisHistory, previewMisImport, type MisImportPreview } from '../src/mis-workflows';
import type { MisHistory } from '../src/mis-history';
import { listInventory, type InventorySnapshot } from '../src/inventory';
import { setProductStock, setStockEnabled } from '../src/stock';
import { changeOwnPassword } from '../src/profile';
import { colors } from '../src/theme/tokens';
import { handleBackNavigation, recordTabHistory } from '../src/navigation';

// UI Components & Navigation
import { AppHeader } from '../src/components/navigation/AppHeader';
import { AppBottomNavigation, MainTab } from '../src/components/navigation/AppBottomNavigation';
import { MoreMenuModal, SubSectionId } from '../src/components/navigation/MoreMenuModal';
import { ErrorBanner } from '../src/components/common/Feedback';
import { DocumentViewerModal } from '../src/components/domain/DocumentViewerModal';

// Screens
import { AuthScreen } from '../src/screens/AuthScreen';
import { DashboardScreen } from '../src/screens/DashboardScreen';
import { OrdersScreen, type OrderViewTab } from '../src/screens/OrdersScreen';
import { MisScreen, type MisTab } from '../src/screens/MisScreen';
import { ApprovalsScreen, type ApprovalTab } from '../src/screens/ApprovalsScreen';
import { ReportsScreen } from '../src/screens/ReportsScreen';
import { InventoryScreen } from '../src/screens/InventoryScreen';
import { AdminScreen } from '../src/screens/AdminScreen';
import { ProfileSettingsScreen } from '../src/screens/ProfileSettingsScreen';
import { HistoryScreen } from '../src/screens/HistoryScreen';
import { PlaceholderScreen } from '../src/screens/PlaceholderScreen';

export default function App() {
  const db = useSQLiteContext();
  const operation = useRef(false);
  const importPicking = useRef(false);
  const importCommitting = useRef(false);

  // Authentication State
  const [actor, setActor] = useState<Actor | null>(null);
  const [restoring, setRestoring] = useState(true);

  // Navigation State
  const [currentTab, setCurrentTab] = useState<MainTab>('Home');
  const [tabHistory, setTabHistory] = useState<MainTab[]>(['Home']);
  const [activeSubSection, setActiveSubSection] = useState<SubSectionId | null>(null);
  const [showMoreModal, setShowMoreModal] = useState(false);
  const [orderInitialTab, setOrderInitialTab] = useState<'list' | 'create' | OrderViewTab>('list');
  const [orderCurrentTab, setOrderCurrentTab] = useState<OrderViewTab>('all_orders');
  const [misCurrentTab, setMisCurrentTab] = useState<MisTab>('mis');
  const [approvalsCurrentTab, setApprovalsCurrentTab] = useState<ApprovalTab>('pending_mis');

  // Operation / Loading / Error State
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  // Domain Data State
  const [metrics, setMetrics] = useState({ orders: 0, mis: 0, pending: 0, litres: 0 });
  const [mis, setMis] = useState<MisRow[]>([]);
  const [misHistory, setMisHistory] = useState<MisHistory[]>([]);
  const [misImportPreview, setMisImportPreview] = useState<MisImportPreview | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderReturns, setOrderReturns] = useState<OrderReturn[]>([]);
  const [standaloneDocDetail, setStandaloneDocDetail] = useState<OrderDetail | null>(null);
  const [standaloneDocError, setStandaloneDocError] = useState(false);
  const [returnDecisionAllowed, setReturnDecisionAllowed] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [history, setHistory] = useState<{ id: number; actor: string; action: string; detail: string; at: string }[]>([]);
  const [products, setProducts] = useState<{ pid: number; name: string; brand: string }[]>([]);
  const [outlets, setOutlets] = useState<{ sap_code: string; outlet_name: string }[]>([]);
  const [inventory, setInventory] = useState<InventorySnapshot | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState('');

  // Search State for MIS
  const [misSearch, setMisSearch] = useState('');

  const navStateRef = useRef({
    isLoggedIn: !!actor,
    showMoreModal,
    activeSubSection,
    currentTab,
    tabHistory,
    orderViewTab: orderCurrentTab,
    misActiveTab: misCurrentTab,
    approvalsActiveTab: approvalsCurrentTab,
  });

  useEffect(() => {
    navStateRef.current = {
      isLoggedIn: !!actor,
      showMoreModal,
      activeSubSection,
      currentTab,
      tabHistory,
      orderViewTab: orderCurrentTab,
      misActiveTab: misCurrentTab,
      approvalsActiveTab: approvalsCurrentTab,
    };
  }, [actor, showMoreModal, activeSubSection, currentTab, tabHistory, orderCurrentTab, misCurrentTab, approvalsCurrentTab]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      return handleBackNavigation(navStateRef.current, {
        closeModal: () => setShowMoreModal(false),
        closeSubSection: () => setActiveSubSection(null),
        resetOrderTab: () => {
          setOrderInitialTab('all_orders');
          setOrderCurrentTab('all_orders');
        },
        resetMisTab: () => {
          setMisCurrentTab('mis');
        },
        resetApprovalsTab: () => {
          setApprovalsCurrentTab('pending_mis');
        },
        popTab: (previousTab) => {
          setTabHistory(prev => {
            const next = prev.slice(0, -1);
            return next.length > 0 ? next : ['Home'];
          });
          setCurrentTab(previousTab);
          setActiveSubSection(null);
        },
      });
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let live = true;
    restoreSession(db)
      .then(saved => { if (live) setActor(saved); })
      .catch(() => { if (live) setError('Local session could not be read. Try reopening the app.'); })
      .finally(() => { if (live) setRestoring(false); });
    return () => { live = false; };
  }, [db]);

  // Synchronize data from local SQLite database
  useEffect(() => {
    if (!actor) return;
    let live = true;
    setBusy(true);
    setError('');

    Promise.all([
      listMis(db, actor, misSearch),
      listMisHistory(db, actor),
      listOrders(db, actor),
      listOrderReturns(db, actor),
      canDecideReturns(db, actor),
      listPending(db, actor),
      dashboard(db, actor),
      listProducts(db),
      listOutlets(db, actor),
      db.getAllAsync<{ id: number; actor: string; action: string; detail: string; at: string }>(
        'SELECT * FROM app_history ORDER BY id DESC LIMIT 100'
      ),
    ])
      .then(([m, mh, o, returns, canDecideReturn, p, d, pr, ol, h]) => {
        if (live) {
          setMis(m);
          setMisHistory(mh);
          setOrders(o);
          setOrderReturns(returns);
          setReturnDecisionAllowed(canDecideReturn);
          setPending(p);
          setMetrics(d);
          setProducts(pr);
          setOutlets(ol);
          setHistory(
            h.filter(
              x =>
                (actor.role === 'superadmin' && actor.org === 'rohan') ||
                x.actor === actor.username
            )
          );
        }
      })
      .catch(() => {
        if (live) setError('Local data could not be read.');
      })
      .finally(() => {
        if (live) setBusy(false);
      });

    return () => {
      live = false;
    };
  }, [db, actor, misSearch, version]);

  useEffect(() => {
    if (!actor) { setInventory(null); return; }
    let live = true;
    setInventoryLoading(true);
    setInventoryError('');
    listInventory(db, actor)
      .then(snapshot => { if (live) setInventory(snapshot); })
      .catch(() => { if (live) { setInventory(null); setInventoryError('Inventory could not be read from the local database.'); } })
      .finally(() => { if (live) setInventoryLoading(false); });
    return () => { live = false; };
  }, [db, actor, version]);

  useEffect(() => {
    setStandaloneDocDetail(null);
    setStandaloneDocError(false);
    if (activeSubSection !== 'invoice_preview' || !actor || !orders[0]) return;
    let live = true;
    getOrderDetail(db, actor, orders[0].id)
      .then(detail => { if (live) setStandaloneDocDetail(detail); })
      .catch(() => { if (live) setStandaloneDocError(true); });
    return () => { live = false; };
  }, [activeSubSection, actor, db, orders]);

  // Safe action runner with constraint error formatting
  async function run(action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
      setVersion(v => v + 1);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(
        /unique constraint/i.test(message)
          ? 'This entry is already pending.'
          : /sqlite|sql error|constraint failed/i.test(message)
          ? 'Local database action failed. No changes were saved.'
          : message
      );
      throw e;
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  // Authentication Handlers
  async function handleLogin(user: string, pass: string, orgName: string) {
    await run(async () => {
      const a = await loginAndSaveSession(db, user, pass, orgName);
      setActor(a);
      setCurrentTab('Home');
      setTabHistory(['Home']);
      setActiveSubSection(null);
    });
  }

  async function handleLogout() {
    try {
      await clearSession(db);
      setActor(null);
      setCurrentTab('Home');
      setTabHistory(['Home']);
      setActiveSubSection(null);
      setMisSearch('');
      setError('');
    } catch {
      setError('Logout could not clear the local session. Try again.');
    }
  }

  // CSV Import & Export Handlers
  async function pickCsv() {
    if (!actor || importPicking.current) return;
    importPicking.current = true;
    setError('');
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return;
      if ((picked.assets[0].size || 0) > 5_000_000) {
        throw new Error('CSV must be 5 MB or smaller.');
      }
      const raw = await new File(picked.assets[0].uri).text();
      const parsed = parseMisCsvDetailed(raw);
      setMisImportPreview(await previewMisImport(db, actor, parsed.lines, parsed.skipped, parsed.issues, parsed.rowNumbers));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      importPicking.current = false;
    }
  }

  async function commitCsvPreview() {
    if (!actor || !misImportPreview) throw new Error('No CSV preview is ready.');
    if (operation.current || importCommitting.current) throw new Error('An import is already in progress.');
    importCommitting.current = true;
    try {
      await run(async () => {
        const summary = await commitMisImport(db, actor, misImportPreview);
        setMisImportPreview(null);
        Alert.alert('MIS Import', `${summary.inserted} inserted · ${summary.skipped} blank rows skipped · ${summary.rejected} rejected.`);
      });
    } finally {
      importCommitting.current = false;
    }
  }

  async function shareCsv() {
    if (!actor) return;
    await run(async () => {
      const rows = await exportMisRows(db, actor);
      const file = new File(Paths.cache, `straveda-mis-${Date.now()}.csv`);
      file.create({ overwrite: true });
      await file.write(misCsv(rows));
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('Android sharing is unavailable on this device.');
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Scoped MIS Data',
      });
    });
  }

  // Navigation handlers
  function handleSelectMainTab(tab: MainTab) {
    if (tab === 'More') {
      setShowMoreModal(true);
    } else {
      setCurrentTab(tab);
      setTabHistory(prev => recordTabHistory(prev, tab));
      setActiveSubSection(null);
      if (tab === 'Orders') {
        setOrderInitialTab('list');
        setOrderCurrentTab('all_orders');
      }
    }
  }

  function handleSelectSubSection(sectionId: SubSectionId) {
    setActiveSubSection(sectionId);
  }

  // RENDER: AUTHENTICATION SCREEN
  if (restoring) {
    return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  }

  if (!actor) {
    return (
      <AuthScreen
        onLogin={handleLogin}
        loading={busy}
        error={error}
        onErrorDismiss={() => setError('')}
      />
    );
  }

  const orderWorkflow = {
    onSaveDraft: (sap: string, lines: { item: string; paid: number }[], editId?: number) => run(async () => { await saveOrderDraft(db, actor, sap, lines, editId); }),
    onPreviewLines: (lines: { item: string; paid: number }[]) => previewDraftLines(db, lines),
    onGetDetail: (id: number) => getOrderDetail(db, actor, id),
    onRequestReturn: (id: number, reason: string, creditNote: string) => run(() => requestOrderReturn(db, actor, id, reason, creditNote)),
    onDecideReturn: (id: number, approve: boolean, comment: string) => run(() => decideOrderReturn(db, actor, id, approve, comment)),
    onUploadFile: (id: number, kind: OrderFileKind) => run(async () => { await pickAndSaveOrderFile(db, actor, id, kind); }),
    onShareFile: (orderId: number, file: Parameters<typeof shareOrderFile>[3]) => shareOrderFile(db, actor, orderId, file),
    returns: orderReturns,
    returnDecisionAllowed,
  };

  const misWorkflow = {
    history: misHistory,
    importPreview: misImportPreview,
    onImportCsv: pickCsv,
    onCommitImport: commitCsvPreview,
    onCancelImport: () => setMisImportPreview(null),
    onDeleteSelected: (selected: MisRow[]) => {
      if (operation.current) throw new Error('Another action is in progress. Try again shortly.');
      return run(async () => { await deleteSelectedMis(db, actor, selected); });
    },
  };

  const inventoryWorkflow = {
    actor,
    snapshot: inventory?.actor === actor.username ? inventory : null,
    loading: inventoryLoading || inventory?.actor !== actor.username,
    error: inventoryError,
    onSetStock: (pid: number, value: string) => {
      if (operation.current) throw new Error('Another action is in progress. Try again shortly.');
      return run(async () => { await setProductStock(db, actor, pid, value); });
    },
    onSetStockEnabled: (enabled: boolean) => {
      if (operation.current) throw new Error('Another action is in progress. Try again shortly.');
      return run(async () => { await setStockEnabled(db, actor, enabled); });
    },
    onBack: () => setActiveSubSection(null),
  };

  const profileWorkflow = {
    actor,
    onChangePassword: (current: string, next: string) => {
      if (operation.current) throw new Error('Another action is in progress. Try again shortly.');
      return run(() => changeOwnPassword(db, actor, current, next));
    },
    onLogout: handleLogout,
    onBack: () => setActiveSubSection(null),
  };
  const adminWorkflow = {
    actor,
    outlets: inventory?.actor === actor.username ? inventory.outlets : [],
    loading: inventoryLoading || inventory?.actor !== actor.username,
    error: inventoryError,
    onBack: () => setActiveSubSection(null),
  };

  // Determine screen title for top bar
  const headerTitle =
    activeSubSection === 'rawdata'
      ? 'Raw MIS Data'
      : activeSubSection === 'entry'
      ? 'Direct Data Entry'
      : activeSubSection === 'returns'
      ? 'Order Returns'
      : activeSubSection === 'pod_upload'
      ? 'Proof of Delivery'
      : activeSubSection === 'reports'
      ? 'Reports & Analytics'
      : activeSubSection === 'roreport'
      ? 'RO Reports'
      : activeSubSection === 'inventory'
      ? 'Inventory & Prices'
      : activeSubSection === 'foc'
      ? 'FOC Scheme Rules'
      : activeSubSection === 'sap'
      ? 'SAP Master Directory'
      : activeSubSection === 'admin'
      ? 'Admin Console'
      : activeSubSection === 'zones'
      ? 'Zones & Regions'
      : activeSubSection === 'team'
      ? 'Team Hierarchy'
      : activeSubSection === 'outlets'
      ? 'Outlet Management'
      : activeSubSection === 'perms'
      ? 'Permission Matrix'
      : activeSubSection === 'profile'
      ? 'User Profile'
      : activeSubSection === 'password_change'
      ? 'Change Password'
      : activeSubSection === 'settings'
      ? 'Settings & Demo'
      : activeSubSection === 'history'
      ? 'Activity Log'
      : 'STRAVEDA';

  // RENDER: MAIN APPLICATION WORKSPACE
  return (
    <View style={styles.appContainer}>
      {/* Top Header */}
      <AppHeader
        actor={actor}
        onLogout={handleLogout}
        onOpenSettings={() => setActiveSubSection('settings')}
        onBack={activeSubSection ? () => setActiveSubSection(null) : undefined}
        screenTitle={headerTitle}
      />

      {/* Global Activity / Error Feedback */}
      {busy ? (
        <View style={styles.loadingBar}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorContainer}>
          <ErrorBanner message={error} onDismiss={() => setError('')} />
        </View>
      ) : null}

      {/* Main Content Viewport */}
      <View style={styles.contentViewport}>
        {/* SUB-SECTION VIEWS (Triggered from More Menu or Settings) */}
        {activeSubSection === 'rawdata' ? (
          <MisScreen
            actor={actor}
            rows={mis}
            search={misSearch}
            onSearchChange={setMisSearch}
            onExportCsv={shareCsv}
            {...misWorkflow}
            onAddRow={(d, s, i, e) => run(() => addMis(db, actor, d, s, i, e))}
            onUpdateRow={(row, d, e) => run(() => updateMis(db, actor, row, d, e))}
            onDeleteRow={row => run(() => deleteMis(db, actor, row))}
            initialTab="rawdata"
            onBack={() => setActiveSubSection(null)}
          />
        ) : activeSubSection === 'entry' ? (
          <MisScreen
            actor={actor}
            rows={mis}
            search={misSearch}
            onSearchChange={setMisSearch}
            onExportCsv={shareCsv}
            {...misWorkflow}
            onAddRow={(d, s, i, e) => run(() => addMis(db, actor, d, s, i, e))}
            onUpdateRow={(row, d, e) => run(() => updateMis(db, actor, row, d, e))}
            onDeleteRow={row => run(() => deleteMis(db, actor, row))}
            initialTab="entry"
            onBack={() => setActiveSubSection(null)}
          />
        ) : activeSubSection === 'returns' ? (
          <OrdersScreen
            actor={actor}
            orders={orders}
            products={products}
            outlets={outlets}
            initialTab="returns"
            {...orderWorkflow}
            onSubmitOrder={id => run(() => submitOrder(db, actor, id))}
            onApproveOrder={id => run(() => decideOrder(db, actor, id, true))}
            onRejectOrder={(id, reason) => run(() => decideOrder(db, actor, id, false, reason))}
            onBack={() => setActiveSubSection(null)}
          />
        ) : activeSubSection === 'pod_upload' ? (
          <OrdersScreen
            actor={actor}
            orders={orders}
            products={products}
            outlets={outlets}
            initialTab="pod"
            {...orderWorkflow}
            onSubmitOrder={id => run(() => submitOrder(db, actor, id))}
            onApproveOrder={id => run(() => decideOrder(db, actor, id, true))}
            onRejectOrder={(id, reason) => run(() => decideOrder(db, actor, id, false, reason))}
            onBack={() => setActiveSubSection(null)}
          />
        ) : activeSubSection === 'invoice_preview' ? (
          standaloneDocDetail ? <DocumentViewerModal
            visible={true}
            order={standaloneDocDetail.order}
            detail={standaloneDocDetail}
            onClose={() => setActiveSubSection(null)}
          /> : standaloneDocError
            ? <PlaceholderScreen moduleName="Document Viewer" category="Orders" description="The order document could not be read." features={[]} auditRef="" onBack={() => setActiveSubSection(null)} />
            : orders[0]
            ? <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>
            : <PlaceholderScreen moduleName="Document Viewer" category="Orders" description="No orders are available." features={[]} auditRef="" onBack={() => setActiveSubSection(null)} />
        ) : activeSubSection === 'reports' ? (
          <ReportsScreen
            actor={actor}
            misRows={mis}
            orders={orders}
            onExportCsv={shareCsv}
            initialTab="summary"
            onBack={() => setActiveSubSection(null)}
          />
        ) : activeSubSection === 'roreport' ? (
          <ReportsScreen
            actor={actor}
            misRows={mis}
            orders={orders}
            onExportCsv={shareCsv}
            initialTab="ro"
            onBack={() => setActiveSubSection(null)}
          />
        ) : activeSubSection === 'inventory' ? (
          <InventoryScreen key="inventory" {...inventoryWorkflow} />
        ) : activeSubSection === 'foc' ? (
          <InventoryScreen key="foc" {...inventoryWorkflow} initialTab="foc" />
        ) : activeSubSection === 'sap' ? (
          <InventoryScreen key="sap" {...inventoryWorkflow} initialTab="sap" />
        ) : activeSubSection === 'admin' ? (
          <AdminScreen {...adminWorkflow} initialTab="zones" />
        ) : activeSubSection === 'zones' ? (
          <AdminScreen {...adminWorkflow} initialTab="zones" />
        ) : activeSubSection === 'team' ? (
          <AdminScreen {...adminWorkflow} initialTab="team" />
        ) : activeSubSection === 'outlets' ? (
          <AdminScreen {...adminWorkflow} initialTab="outlets" />
        ) : activeSubSection === 'perms' ? (
          <AdminScreen {...adminWorkflow} initialTab="perms" />
        ) : activeSubSection === 'profile' || activeSubSection === 'settings' ? (
          <ProfileSettingsScreen {...profileWorkflow} />
        ) : activeSubSection === 'password_change' ? (
          <ProfileSettingsScreen {...profileWorkflow} initialShowPasswordModal={true} />
        ) : activeSubSection === 'history' ? (
          <HistoryScreen
            actor={actor}
            history={history}
            onBack={() => setActiveSubSection(null)}
          />
        ) : /* PRIMARY TAB SCREENS */
        currentTab === 'Home' ? (
          <DashboardScreen
            actor={actor}
            metrics={metrics}
            orders={orders}
            pending={pending}
            history={history}
            onNavigateTab={tab => {
              setCurrentTab(tab);
              setTabHistory(prev => recordTabHistory(prev, tab));
              setActiveSubSection(null);
            }}
            onNewOrder={() => {
              setCurrentTab('Orders');
              setTabHistory(prev => recordTabHistory(prev, 'Orders'));
              setOrderInitialTab('create');
              setOrderCurrentTab('create');
              setActiveSubSection(null);
            }}
            onAddMis={() => {
              setCurrentTab('MIS');
              setTabHistory(prev => recordTabHistory(prev, 'MIS'));
              setMisCurrentTab('entry');
              setActiveSubSection(null);
            }}
            onExportMis={shareCsv}
            onSubmitOrder={id => void run(() => submitOrder(db, actor, id))}
            onApproveOrder={id => void run(() => decideOrder(db, actor, id, true))}
            onRejectOrder={id => void run(() => decideOrder(db, actor, id, false, 'Rejected from Dashboard'))}
          />
        ) : currentTab === 'Orders' ? (
          <OrdersScreen
            actor={actor}
            orders={orders}
            products={products}
            outlets={outlets}
            initialTab={orderInitialTab}
            onTabChange={setOrderCurrentTab}
            {...orderWorkflow}
            onSubmitOrder={id => run(() => submitOrder(db, actor, id))}
            onApproveOrder={id => run(() => decideOrder(db, actor, id, true))}
            onRejectOrder={(id, reason) => run(() => decideOrder(db, actor, id, false, reason))}
          />
        ) : currentTab === 'MIS' ? (
          <MisScreen
            actor={actor}
            rows={mis}
            search={misSearch}
            onSearchChange={setMisSearch}
            onExportCsv={shareCsv}
            {...misWorkflow}
            onAddRow={(d, s, i, e) => run(() => addMis(db, actor, d, s, i, e))}
            onUpdateRow={(row, d, e) => run(() => updateMis(db, actor, row, d, e))}
            onDeleteRow={row => run(() => deleteMis(db, actor, row))}
            initialTab={misCurrentTab}
            onTabChange={setMisCurrentTab}
          />
        ) : currentTab === 'Approvals' ? (
          <ApprovalsScreen
            actor={actor}
            pendingList={pending}
            orders={orders}
            initialTab={approvalsCurrentTab}
            onTabChange={setApprovalsCurrentTab}
            onApprovePending={id => run(() => decidePending(db, actor, id, true))}
            onRejectPending={(id, reason) => run(() => decidePending(db, actor, id, false, reason))}
            onSubmitPendingEntry={(d, s, i, e) => run(() => submitPending(db, actor, d, s, i, e))}
            onApproveOrder={id => run(() => decideOrder(db, actor, id, true))}
            onRejectOrder={(id, reason) => run(() => decideOrder(db, actor, id, false, reason))}
          />
        ) : null}
      </View>

      {/* Bottom Navigation Bar */}
      <AppBottomNavigation
        currentTab={activeSubSection ? 'More' : currentTab}
        onSelectTab={handleSelectMainTab}
        pendingApprovalsCount={metrics.pending}
      />

      {/* Secondary Modules Menu Modal */}
      <MoreMenuModal
        visible={showMoreModal}
        onClose={() => setShowMoreModal(false)}
        onSelectSection={handleSelectSubSection}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingBar: {
    paddingVertical: 3,
    backgroundColor: colors.primarySubtle,
    alignItems: 'center',
  },
  errorContainer: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  contentViewport: {
    flex: 1,
  },
});
