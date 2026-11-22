import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme/tokens';
import { ScreenContainer } from '../components/common/ScreenContainer';
import { FormField, SearchBar } from '../components/common/Inputs';
import { PrimaryButton, SecondaryButton } from '../components/common/Buttons';
import { EmptyState, ConfirmationDialog } from '../components/common/Feedback';
import { MisRowCard } from '../components/domain/MisRowCard';
import type { Actor, MisRow } from '../domain';
import { canEditMis } from '../domain';
import type { MisHistory } from '../mis-history';
import type { MisImportPreview } from '../mis-workflows';

interface MisScreenProps {
  actor: Actor;
  rows: MisRow[];
  search: string;
  onSearchChange: (query: string) => void;
  onExportCsv: () => Promise<void>;
  onImportCsv: () => Promise<void>;
  importPreview: MisImportPreview | null;
  onCommitImport: () => Promise<void>;
  onCancelImport: () => void;
  onDeleteSelected: (rows: MisRow[]) => Promise<void>;
  history: MisHistory[];
  onAddRow: (d: string, sap: string, item: string, ea: string) => Promise<void>;
  onUpdateRow: (row: MisRow, d: string, ea: string) => Promise<void>;
  onDeleteRow: (row: MisRow) => Promise<void>;
  initialTab?: 'mis' | 'rawdata' | 'entry';
  onBack?: () => void;
}

type MisTab = 'mis' | 'rawdata' | 'entry' | 'history';

export function MisScreen({
  actor,
  rows,
  search,
  onSearchChange,
  onExportCsv,
  onImportCsv,
  importPreview,
  onCommitImport,
  onCancelImport,
  onDeleteSelected,
  history,
  onAddRow,
  onUpdateRow,
  onDeleteRow,
  initialTab = 'mis',
  onBack,
}: MisScreenProps) {
  const [activeTab, setActiveTab] = useState<MisTab>(initialTab);
  const [selectedRowDetail, setSelectedRowDetail] = useState<MisRow | null>(null);

  // Edit / Add Modal Form State
  const [showFormModal, setShowFormModal] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sap, setSap] = useState('');
  const [item, setItem] = useState('HP DEF - 1X20L');
  const [ea, setEa] = useState('10');
  const [selectedRow, setSelectedRow] = useState<MisRow | null>(null);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete Confirmation State
  const [rowToDelete, setRowToDelete] = useState<MisRow | null>(null);
  const [selectedRows, setSelectedRows] = useState<Map<number, MisRow>>(new Map());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);

  const editable = canEditMis(actor);

  function toggleSelection(row: MisRow) {
    setSelectedRows(previous => {
      const next = new Map(previous);
      if (next.has(row.id)) next.delete(row.id); else next.set(row.id, row);
      return next;
    });
    setBulkError('');
  }

  function openAddModal() {
    setSelectedRow(null);
    setDate(new Date().toISOString().slice(0, 10));
    setSap('');
    setItem('HP DEF - 1X20L');
    setEa('10');
    setFormError('');
    setShowFormModal(true);
  }

  function openEditModal(row: MisRow) {
    setSelectedRow(row);
    setDate(row.d);
    setSap(row.sap);
    setItem(row.item);
    setEa(row.ea);
    setFormError('');
    setShowFormModal(true);
  }

  function closeModal() {
    setShowFormModal(false);
    setSelectedRow(null);
    setFormError('');
  }

  async function handleSaveRow() {
    setFormError('');
    setIsSubmitting(true);
    try {
      if (selectedRow) {
        await onUpdateRow(selectedRow, date, ea);
      } else {
        await onAddRow(date, sap, item, ea);
      }
      closeModal();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      {onBack ? (
        <View style={styles.backRow}>
          <SecondaryButton title="‹ Back to Modules" onPress={onBack} size="sm" />
        </View>
      ) : null}

      {/* Screen Header Bar */}
      <View style={[styles.headerCard, shadows.subtle]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.screenTitle}>
              {activeTab === 'rawdata'
                ? 'Raw Data Feed (PAGE: rawdata)'
                : activeTab === 'entry'
                ? 'Direct Data Entry (PAGE: entry)'
                : 'MIS Management (PAGE: mis)'}
            </Text>
            <Text style={styles.screenSubtitle}>
              {rows.length} scoped records · Litres: {rows.reduce((s, r) => s + Number(r.litres || 0), 0).toFixed(0)} L
            </Text>
          </View>

          <View style={styles.headerActions}>
            <SecondaryButton
              title="📥 CSV"
              onPress={onExportCsv}
              size="sm"
            />
            {editable ? (
              <SecondaryButton
                title="📤 Import"
                onPress={() => { void onImportCsv().catch(error => setImportError(error instanceof Error ? error.message : String(error))); }}
                size="sm"
              />
            ) : null}
          </View>
        </View>

        {/* Tab Selector */}
        <View style={styles.tabBar}>
          <Pressable
            onPress={() => setActiveTab('mis')}
            style={[styles.tabItem, activeTab === 'mis' && styles.tabItemActive]}
          >
            <Text style={[styles.tabText, activeTab === 'mis' && styles.tabTextActive]}>
              MIS Cards ({rows.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('rawdata')}
            style={[styles.tabItem, activeTab === 'rawdata' && styles.tabItemActive]}
          >
            <Text style={[styles.tabText, activeTab === 'rawdata' && styles.tabTextActive]}>
              Raw Data Feed
            </Text>
          </Pressable>

          {editable ? (
            <Pressable
              onPress={() => {
                setActiveTab('entry');
                openAddModal();
              }}
              style={[styles.tabItem, activeTab === 'entry' && styles.tabItemActive]}
            >
              <Text style={[styles.tabText, activeTab === 'entry' && styles.tabTextActive]}>
                ＋ Add Entry
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setActiveTab('history')}
            style={[styles.tabItem, activeTab === 'history' && styles.tabItemActive]}
          >
            <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>History</Text>
          </Pressable>
        </View>
      </View>

      {importError ? <Text style={styles.errorText}>{importError}</Text> : null}

      {/* Search Bar */}
      <SearchBar
        value={search}
        onChangeText={onSearchChange}
        placeholder="Filter by date, outlet, SAP, or product..."
      />

      {/* VIEW: MIS CARDS VIEW */}
      {activeTab === 'mis' ? (
        <View style={styles.cardsList}>
          {editable ? (
            <View style={styles.headerActions}>
              <Text style={styles.screenSubtitle}>{selectedRows.size} selected</Text>
              {selectedRows.size ? <PrimaryButton title="Delete Selected" onPress={() => setBulkConfirm(true)} size="sm" /> : null}
            </View>
          ) : null}
          {bulkError ? <Text style={styles.errorText}>{bulkError}</Text> : null}
          {rows.length === 0 ? (
            <EmptyState
              title="No MIS Records Found"
              description={
                search
                  ? 'No records match your filter criteria.'
                  : 'There are no active MIS rows recorded in your assigned region.'
              }
              actionTitle={editable ? '＋ Add MIS Record' : undefined}
              onActionPress={openAddModal}
            />
          ) : (
            rows.map(row => (
              <MisRowCard
                key={row.id}
                row={row}
                actor={actor}
                onEdit={openEditModal}
                onDelete={r => setRowToDelete(r)}
                selected={selectedRows.has(row.id)}
                onToggleSelect={toggleSelection}
              />
            ))
          )}
        </View>
      ) : null}

      {/* VIEW: RAW DATA FEED (PAGE ID: rawdata) */}
      {activeTab === 'rawdata' ? (
        <View style={styles.rawContainer}>
          <View style={styles.rawNotice}>
            <Text style={styles.rawNoticeText}>
              Viewing complete raw unaggregated rows from `portal_mis_rows`. Tap any row to inspect all
              metadata fields.
            </Text>
          </View>

          {rows.length === 0 ? (
            <EmptyState
              title="No Raw Records"
              description="No raw transactions recorded in your scope."
            />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.tableScroll}>
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.th, { width: 50 }]}>#ID</Text>
                  <Text style={[styles.th, { width: 85 }]}>DATE</Text>
                  <Text style={[styles.th, { width: 140 }]}>OUTLET NAME</Text>
                  <Text style={[styles.th, { width: 75 }]}>SAP</Text>
                  <Text style={[styles.th, { width: 130 }]}>ITEM SKU</Text>
                  <Text style={[styles.th, { width: 55, textAlign: 'right' }]}>EA</Text>
                  <Text style={[styles.th, { width: 75, textAlign: 'right' }]}>LITRES</Text>
                  <Text style={[styles.th, { width: 70 }]}>SRC</Text>
                  <Text style={[styles.th, { width: 80 }]}>ZONE</Text>
                  <Text style={[styles.th, { width: 80 }]}>RO</Text>
                  <Text style={[styles.th, { width: 90 }]}>STATE</Text>
                </View>

                {rows.slice(0, 100).map((row, idx) => (
                  <Pressable
                    key={row.id}
                    onPress={() => setSelectedRowDetail(row)}
                    style={({ pressed }) => [
                      styles.tr,
                      idx % 2 === 1 && styles.trEven,
                      pressed && styles.trPressed,
                    ]}
                  >
                    <Text style={[styles.tdMuted, { width: 50 }]}>#{row.id}</Text>
                    <Text style={[styles.td, { width: 85 }]}>{row.d}</Text>
                    <Text style={[styles.tdBold, { width: 140 }]} numberOfLines={1}>
                      {row.outlet}
                    </Text>
                    <Text style={[styles.td, { width: 75 }]}>{row.sap}</Text>
                    <Text style={[styles.td, { width: 130 }]} numberOfLines={1}>
                      {row.item}
                    </Text>
                    <Text style={[styles.tdBold, { width: 55, textAlign: 'right' }]}>
                      {row.ea}
                    </Text>
                    <Text style={[styles.td, { width: 75, textAlign: 'right' }]}>
                      {Number(row.litres || 0).toFixed(1)}
                    </Text>
                    <Text style={[styles.tdTag, { width: 70 }]}>{row.src}</Text>
                    <Text style={[styles.tdMuted, { width: 80 }]} numberOfLines={1}>
                      {row.zone || '—'}
                    </Text>
                    <Text style={[styles.tdMuted, { width: 80 }]} numberOfLines={1}>
                      {row.ro || '—'}
                    </Text>
                    <Text style={[styles.tdMuted, { width: 90 }]} numberOfLines={1}>
                      {row.state || '—'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      ) : null}

      {activeTab === 'history' ? (
        <View style={styles.cardsList}>
          {history.length === 0 ? <EmptyState title="No MIS History" description="MIS changes in your region will appear here." /> : history.map(event => (
            <View key={event.id} style={[styles.headerCard, shadows.subtle]}>
              <Text style={styles.tdBold}>{event.action} · Record #{event.row_id ?? '—'}</Text>
              <Text style={styles.screenSubtitle}>{event.at} · {event.actor} · {event.source}</Text>
              <Text style={styles.td}>{event.summary}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Add / Edit MIS Modal Form */}
      <Modal
        visible={showFormModal}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, shadows.modal]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedRow ? `Edit Record #${selectedRow.id}` : 'Add MIS Record'}
              </Text>
              <Pressable onPress={closeModal} style={styles.closeBtn} hitSlop={8}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            <Text style={styles.modalSub}>
              {selectedRow
                ? 'Update quantity or date for this verified MIS row.'
                : 'Direct volume entries are logged to local SQLite and verified in scope.'}
            </Text>

            {formError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠ {formError}</Text>
              </View>
            ) : null}

            <FormField
              label="DATE (YYYY-MM-DD)"
              value={date}
              onChangeText={setDate}
              placeholder="e.g. 2026-11-22"
              required
            />

            {!selectedRow ? (
              <>
                <FormField
                  label="OUTLET SAP NUMBER (6-12 DIGITS)"
                  value={sap}
                  onChangeText={setSap}
                  placeholder="e.g. 90000001"
                  keyboardType="numeric"
                  required
                />
                <FormField
                  label="PRODUCT ITEM"
                  value={item}
                  onChangeText={setItem}
                  placeholder="e.g. HP DEF - 1X20L"
                  required
                />
              </>
            ) : (
              <View style={styles.lockedBox}>
                <Text style={styles.lockedLabel}>LOCKED ATTRIBUTES</Text>
                <Text style={styles.lockedText}>Outlet: {selectedRow.outlet}</Text>
                <Text style={styles.lockedText}>SAP: {selectedRow.sap} · Item: {selectedRow.item}</Text>
              </View>
            )}

            <FormField
              label="PACKS QUANTITY (EA)"
              value={ea}
              onChangeText={setEa}
              keyboardType="numeric"
              placeholder="e.g. 10"
              helperText={`Calculated Volume: ${(Number(ea || 0) * 20).toFixed(1)} Litres`}
              required
            />

            <View style={styles.modalActions}>
              <SecondaryButton title="Cancel" onPress={closeModal} size="sm" />
              <PrimaryButton
                title={selectedRow ? 'Update Record' : 'Save Record'}
                onPress={handleSaveRow}
                loading={isSubmitting}
                size="sm"
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Raw Row Inspection Modal */}
      <Modal
        visible={selectedRowDetail !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedRowDetail(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, shadows.modal]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Row #{selectedRowDetail?.id} Inspector</Text>
              <Pressable onPress={() => setSelectedRowDetail(null)} style={styles.closeBtn}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            {selectedRowDetail ? (
              <ScrollView style={styles.inspectorScroll}>
                <View style={styles.inspectRow}><Text style={styles.inspectKey}>Date</Text><Text style={styles.inspectVal}>{selectedRowDetail.d}</Text></View>
                <View style={styles.inspectRow}><Text style={styles.inspectKey}>Outlet Name</Text><Text style={styles.inspectVal}>{selectedRowDetail.outlet}</Text></View>
                <View style={styles.inspectRow}><Text style={styles.inspectKey}>SAP Code</Text><Text style={styles.inspectVal}>{selectedRowDetail.sap}</Text></View>
                <View style={styles.inspectRow}><Text style={styles.inspectKey}>Item SKU</Text><Text style={styles.inspectVal}>{selectedRowDetail.item}</Text></View>
                <View style={styles.inspectRow}><Text style={styles.inspectKey}>Packs (EA)</Text><Text style={styles.inspectValBold}>{selectedRowDetail.ea} EA</Text></View>
                <View style={styles.inspectRow}><Text style={styles.inspectKey}>Volume (L)</Text><Text style={styles.inspectValBold}>{Number(selectedRowDetail.litres || 0).toFixed(1)} L</Text></View>
                <View style={styles.inspectRow}><Text style={styles.inspectKey}>Source Type</Text><Text style={styles.inspectVal}>{selectedRowDetail.src}</Text></View>
                <View style={styles.inspectRow}><Text style={styles.inspectKey}>Zone</Text><Text style={styles.inspectVal}>{selectedRowDetail.zone}</Text></View>
                <View style={styles.inspectRow}><Text style={styles.inspectKey}>Region (RO)</Text><Text style={styles.inspectVal}>{selectedRowDetail.ro}</Text></View>
                <View style={styles.inspectRow}><Text style={styles.inspectKey}>Sales Area</Text><Text style={styles.inspectVal}>{selectedRowDetail.sales_area}</Text></View>
                <View style={styles.inspectRow}><Text style={styles.inspectKey}>State</Text><Text style={styles.inspectVal}>{selectedRowDetail.state}</Text></View>
                <View style={styles.inspectRow}><Text style={styles.inspectKey}>Row Version</Text><Text style={styles.inspectVal}>v{selectedRowDetail.ver}</Text></View>
              </ScrollView>
            ) : null}

            <View style={styles.modalActions}>
              <PrimaryButton title="Done" onPress={() => setSelectedRowDetail(null)} size="sm" />
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        visible={rowToDelete !== null}
        title="Delete MIS Record?"
        message={`This will permanently remove the ${rowToDelete?.ea} EA record for ${rowToDelete?.outlet} from active MIS calculations.`}
        confirmTitle="Delete Record"
        isDestructive
        onConfirm={async () => {
          if (rowToDelete) {
            await onDeleteRow(rowToDelete);
            setRowToDelete(null);
          }
        }}
        onCancel={() => setRowToDelete(null)}
      />
      <ConfirmationDialog
        visible={bulkConfirm}
        title="Delete selected MIS records?"
        message={`Remove ${selectedRows.size} selected records from active MIS? Order-derived rows will be hidden; their orders remain unchanged.`}
        confirmTitle="Delete Selected"
        isDestructive
        onConfirm={async () => {
          try {
            await onDeleteSelected([...selectedRows.values()]);
            setSelectedRows(new Map());
            setBulkError('');
          } catch (error) {
            setBulkError(error instanceof Error ? error.message : String(error));
          } finally {
            setBulkConfirm(false);
          }
        }}
        onCancel={() => setBulkConfirm(false)}
      />
      <Modal visible={importPreview !== null} transparent animationType="slide" onRequestClose={onCancelImport}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, shadows.modal]}>
            <Text style={styles.modalTitle}>CSV import preview</Text>
            <Text style={styles.modalSub}>Append import: repeated rows are retained. Any invalid or out-of-scope row blocks the entire import.</Text>
            <Text style={styles.td}>Valid: {importPreview?.valid ?? 0} · Skipped blank: {importPreview?.skipped ?? 0} · Rejected: {importPreview?.issues.length ?? 0}</Text>
            {importPreview?.issues.length ? (
              <ScrollView style={styles.inspectorScroll}>
                {importPreview.issues.map((issue, index) => <Text key={`${issue.row}-${index}`} style={styles.errorText}>Row {issue.row}: {issue.reason}</Text>)}
              </ScrollView>
            ) : null}
            {importError ? <Text style={styles.errorText}>{importError}</Text> : null}
            <View style={styles.modalActions}>
              <SecondaryButton title="Cancel" onPress={() => { setImportError(''); onCancelImport(); }} size="sm" />
              {importPreview && importPreview.issues.length === 0 && importPreview.valid > 0 ? (
                <PrimaryButton title="Import" loading={importing} size="sm" onPress={async () => {
                  if (importing) return;
                  setImporting(true);
                  setImportError('');
                  try { await onCommitImport(); } catch (error) { setImportError(error instanceof Error ? error.message : String(error)); }
                  finally { setImporting(false); }
                }} />
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  screenTitle: {
    ...typography.headingSm,
    fontSize: 14,
    color: colors.primaryDark,
  },
  screenSubtitle: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    fontSize: 11,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 2,
  },
  tabItem: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  tabItemActive: {
    backgroundColor: colors.surface,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  cardsList: {
    gap: spacing.sm,
  },
  rawContainer: {
    gap: spacing.sm,
  },
  rawNotice: {
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.xs + 2,
    borderRadius: radius.sm,
  },
  rawNoticeText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  tableScroll: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  table: {
    padding: spacing.xs,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: 4,
  },
  th: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textSecondary,
    paddingHorizontal: 4,
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  trEven: {
    backgroundColor: colors.surfaceSubtle,
  },
  trPressed: {
    backgroundColor: colors.primarySubtle,
  },
  td: {
    fontSize: 11,
    color: colors.textPrimary,
    paddingHorizontal: 4,
  },
  tdBold: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryDark,
    paddingHorizontal: 4,
  },
  tdMuted: {
    fontSize: 10,
    color: colors.textMuted,
    paddingHorizontal: 4,
  },
  tdTag: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    paddingHorizontal: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    ...typography.headingSm,
    fontSize: 15,
    color: colors.primaryDark,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  closeText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  modalSub: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: -2,
  },
  errorBox: {
    backgroundColor: colors.dangerLight,
    padding: spacing.xs + 2,
    borderRadius: radius.xs,
  },
  errorText: {
    fontSize: 11,
    color: colors.danger,
  },
  lockedBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 1,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  lockedLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
  },
  lockedText: {
    fontSize: 11,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  inspectorScroll: {
    maxHeight: 220,
  },
  inspectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  inspectKey: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  inspectVal: {
    fontSize: 11,
    color: colors.textPrimary,
  },
  inspectValBold: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryDark,
  },
});
