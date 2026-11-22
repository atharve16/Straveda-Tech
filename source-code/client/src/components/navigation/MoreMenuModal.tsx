import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';

export type SubSectionId =
  | 'rawdata'
  | 'entry'
  | 'reports'
  | 'roreport'
  | 'history'
  | 'returns'
  | 'invoice_preview'
  | 'pod_upload'
  | 'inventory'
  | 'foc'
  | 'sap'
  | 'admin'
  | 'zones'
  | 'team'
  | 'outlets'
  | 'perms'
  | 'profile'
  | 'password_change'
  | 'settings';

interface MoreMenuItem {
  id: SubSectionId;
  pageId: string;
  label: string;
  description: string;
  icon: string;
  category: 'data' | 'orders' | 'catalog' | 'admin' | 'system';
  isImplemented?: boolean;
}

const MENU_ITEMS: MoreMenuItem[] = [
  // 1. Data & Analytics (Page IDs: rawdata, mis, entry, roreport)
  {
    id: 'rawdata',
    pageId: 'rawdata',
    label: 'Raw Data Feed',
    description: 'Complete unaggregated MIS records with all columns',
    icon: '📋',
    category: 'data',
    isImplemented: true,
  },
  {
    id: 'entry',
    pageId: 'entry',
    label: 'MIS Data Entry',
    description: 'Direct transaction volume entry form',
    icon: '✍',
    category: 'data',
    isImplemented: true,
  },
  {
    id: 'reports',
    pageId: 'dashboard',
    label: 'Reports & Analytics',
    description: 'Volume summaries, fulfillment and charts',
    icon: '📈',
    category: 'data',
    isImplemented: true,
  },
  {
    id: 'roreport',
    pageId: 'roreport',
    label: 'RO Performance Reports',
    description: 'Regional office performance metrics',
    icon: '📊',
    category: 'data',
    isImplemented: true,
  },
  {
    id: 'history',
    pageId: 'audit',
    label: 'Activity & Change Log',
    description: 'Audit log of actions recorded on this device',
    icon: '⏱',
    category: 'data',
    isImplemented: true,
  },

  // 2. Order Fulfillment & Documents (Page IDs: returns, invoice, pod)
  {
    id: 'invoice_preview',
    pageId: 'salesorder',
    label: 'Sales Order & Invoice Preview',
    description: 'Letterhead voucher PDF viewer (salesorder.js)',
    icon: '🧾',
    category: 'orders',
    isImplemented: true,
  },
  {
    id: 'returns',
    pageId: 'returns',
    label: 'Order Returns Management',
    description: 'Credit note and delivery return requests',
    icon: '↩',
    category: 'orders',
    isImplemented: true,
  },
  {
    id: 'pod_upload',
    pageId: 'pod',
    label: 'Proof of Delivery (POD)',
    description: 'Track and verify delivered order receipts',
    icon: '🚚',
    category: 'orders',
    isImplemented: true,
  },

  // 3. Catalog & Master Data (Page IDs: inventory, foc, sap)
  {
    id: 'inventory',
    pageId: 'inventory',
    label: 'Inventory & Prices',
    description: 'Product list, stock limits and pricing',
    icon: '📦',
    category: 'catalog',
    isImplemented: true,
  },
  {
    id: 'foc',
    pageId: 'foc',
    label: 'FOC Scheme Schemes',
    description: 'Free-of-cost quantity tier thresholds',
    icon: '🎁',
    category: 'catalog',
    isImplemented: true,
  },
  {
    id: 'sap',
    pageId: 'sap',
    label: 'SAP Master Data & Upload',
    description: 'Retail outlet SAP mapping and directory',
    icon: '🔢',
    category: 'catalog',
    isImplemented: true,
  },

  // 4. Enterprise Administration (Page IDs: admin, zones, team, outlets, perms)
  {
    id: 'admin',
    pageId: 'admin',
    label: 'Admin Overview',
    description: 'Administrative master data console',
    icon: '🏛',
    category: 'admin',
    isImplemented: true,
  },
  {
    id: 'zones',
    pageId: 'zones',
    label: 'Zones & Regions',
    description: 'Zone hierarchy, states and sales areas',
    icon: '🗺',
    category: 'admin',
    isImplemented: true,
  },
  {
    id: 'team',
    pageId: 'team',
    label: 'Team & Officers Directory',
    description: 'Hierarchy, assigned regions and reporting',
    icon: '👥',
    category: 'admin',
    isImplemented: true,
  },
  {
    id: 'outlets',
    pageId: 'outlets',
    label: 'Outlet Management',
    description: 'Retail outlet profiles and credentials',
    icon: '🏪',
    category: 'admin',
    isImplemented: true,
  },
  {
    id: 'perms',
    pageId: 'perms',
    label: 'Role Permissions Matrix',
    description: '18 PAGE_IDS access controls allowlist',
    icon: '🔒',
    category: 'admin',
    isImplemented: true,
  },

  // 5. Account & Security (Profile, Password Change, Settings)
  {
    id: 'profile',
    pageId: 'profile',
    label: 'User Profile & Identity',
    description: 'Identity, organization and assigned scope',
    icon: '👤',
    category: 'system',
    isImplemented: true,
  },
  {
    id: 'password_change',
    pageId: 'password',
    label: 'Change Password',
    description: 'Account security credential update',
    icon: '🔑',
    category: 'system',
    isImplemented: true,
  },
  {
    id: 'settings',
    pageId: 'settings',
    label: 'Settings & Demo Tools',
    description: 'Role switching & Reset Demo Data procedure',
    icon: '⚙',
    category: 'system',
    isImplemented: true,
  },
];

interface MoreMenuModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectSection: (id: SubSectionId) => void;
}

export function MoreMenuModal({ visible, onClose, onSelectSection }: MoreMenuModalProps) {
  const categories = [
    { key: 'data', title: 'Data & Analytics (MIS / Raw Data)' },
    { key: 'orders', title: 'Order Operations & Documents' },
    { key: 'catalog', title: 'Catalog & Master Schemes' },
    { key: 'admin', title: 'Enterprise Administration' },
    { key: 'system', title: 'Account Security & Demo Tools' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheetContainer, shadows.modal]}>
          <View style={styles.sheetHeader}>
            <View style={styles.dragHandle} />
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.sheetTitle}>Portal Modules Directory</Text>
                <Text style={styles.sheetSubtitle}>
                  All 18 specification modules & enterprise tools
                </Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {categories.map(cat => {
              const items = MENU_ITEMS.filter(item => item.category === cat.key);
              return (
                <View key={cat.key} style={styles.categoryBlock}>
                  <Text style={styles.categoryTitle}>{cat.title}</Text>
                  <View style={styles.itemsGrid}>
                    {items.map(item => (
                      <Pressable
                        key={item.id}
                        onPress={() => {
                          onClose();
                          onSelectSection(item.id);
                        }}
                        style={({ pressed }) => [
                          styles.menuItem,
                          pressed && styles.itemPressed,
                        ]}
                      >
                        <View style={styles.itemIconWrap}>
                          <Text style={styles.itemIcon}>{item.icon}</Text>
                        </View>
                        <View style={styles.itemTextWrap}>
                          <View style={styles.labelRow}>
                            <Text style={styles.itemLabel}>{item.label}</Text>
                            <View style={styles.pageIdTag}>
                              <Text style={styles.pageIdText}>PAGE: {item.pageId}</Text>
                            </View>
                          </View>
                          <Text style={styles.itemDescription} numberOfLines={1}>
                            {item.description}
                          </Text>
                        </View>
                        <Text style={styles.arrowIcon}>›</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '88%',
  },
  sheetHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    alignItems: 'center',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderDark,
    marginBottom: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  sheetTitle: {
    ...typography.headingMd,
    fontSize: 16,
    color: colors.primaryDark,
  },
  sheetSubtitle: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  closeButton: {
    padding: spacing.xs,
  },
  closeText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  categoryBlock: {
    gap: spacing.xs,
  },
  categoryTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  itemsGrid: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.md,
  },
  itemPressed: {
    backgroundColor: colors.primarySubtle,
  },
  itemIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIcon: {
    fontSize: 16,
  },
  itemTextWrap: {
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  itemLabel: {
    ...typography.bodyBold,
    fontSize: 13,
  },
  pageIdTag: {
    backgroundColor: colors.surface,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pageIdText: {
    fontSize: 8,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
  itemDescription: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  arrowIcon: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
