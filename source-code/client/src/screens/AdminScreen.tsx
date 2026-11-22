import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme/tokens';
import { ScreenContainer } from '../components/common/ScreenContainer';
import { SecondaryButton } from '../components/common/Buttons';
import type { Actor } from '../domain';
import type { InventoryOutlet } from '../inventory';

interface AdminScreenProps {
  actor: Actor;
  outlets: InventoryOutlet[];
  loading: boolean;
  error: string;
  initialTab?: 'zones' | 'team' | 'outlets' | 'perms';
  onBack?: () => void;
}

type AdminTab = 'zones' | 'team' | 'outlets' | 'perms';

const DEMO_ZONES = [
  {
    name: 'Central Zone',
    org: 'rohan',
    regions: ['Indore Region (4 sales areas)', 'Bhopal Region (3 sales areas)'],
    states: ['Madhya Pradesh'],
    zo: 'demo_rohan_zo',
  },
  {
    name: 'North Central Retail',
    org: 'rohan',
    regions: ['Kanpur Region (3 sales areas)', 'Lucknow Region (2 sales areas)'],
    states: ['Uttar Pradesh'],
    zo: 'demo_rohan_zo_up',
  },
  {
    name: 'Western Zone',
    org: 'hpcl',
    regions: ['Mumbai Region', 'Pune Region'],
    states: ['Maharashtra', 'Goa'],
    zo: 'demo_hpcl_zo',
  },
];

const DEMO_TEAM = [
  { user: 'demo_super', name: 'Super Admin', role: 'Super Admin', org: 'Rohan Energy', scope: 'All Zones (Unrestricted)' },
  { user: 'demo_hpcl_super', name: 'HPCL Super Admin', role: 'Super Admin', org: 'HPCL', scope: 'HPCL Organization-wide' },
  { user: 'demo_rohan_zo', name: 'Central Zone Officer', role: 'Zone Officer', org: 'Rohan Energy', scope: 'Central Zone' },
  { user: 'demo_rohan_ro', name: 'Indore Regional Officer', role: 'Regional Officer', org: 'Rohan Energy', scope: 'Indore Region' },
  { user: 'demo_rohan_ro2', name: 'Bhopal Regional Officer', role: 'Regional Officer', org: 'Rohan Energy', scope: 'Bhopal Region' },
  { user: 'demo_hpcl_zo', name: 'HPCL Zonal Coordinator', role: 'Level 3 Coordinator', org: 'HPCL', scope: 'Western Zone' },
  { user: 'demo_hpcl_rm', name: 'HPCL Regional Manager', role: 'Level 2 Manager', org: 'HPCL', scope: 'Indore Region' },
  { user: 'demo_hpcl_so', name: 'HPCL Sales Officer', role: 'Level 1 Sales Officer', org: 'HPCL', scope: 'Indore-1 & 2' },
];

const PAGE_PERMISSIONS = [
  { id: 'dashboard', name: 'Dashboard', desc: 'KPI metrics, summary charts and recent activity' },
  { id: 'neworder', name: 'New Order', desc: 'Creation and draft submission of sales orders' },
  { id: 'myorders', name: 'My Orders', desc: 'Orders created by current logged in officer' },
  { id: 'allorders', name: 'All Orders', desc: 'Scoped regional order registry' },
  { id: 'approvals', name: 'Approvals Desk', desc: 'Order decision and awaiting queue' },
  { id: 'rawdata', name: 'Raw MIS Data', desc: 'Full sheet view of historical sales transactions' },
  { id: 'mis', name: 'MIS Data Table', desc: 'Scoped tabular MIS entries with CSV export' },
  { id: 'entry', name: 'Data Entry', desc: 'Direct single-entry form for volume reports' },
  { id: 'returns', name: 'Order Returns', desc: 'Credit note and delivery return management' },
  { id: 'inventory', name: 'Inventory & Prices', desc: 'Product wholesale pricing and stock controls' },
  { id: 'foc', name: 'FOC Schemes', desc: 'Free-of-cost product scheme thresholds' },
  { id: 'sap', name: 'SAP Master Data', desc: 'Retail outlet SAP mapping and directory' },
  { id: 'roreport', name: 'RO Reports', desc: 'Regional office performance metrics' },
  { id: 'zones', name: 'Zones Management', desc: 'Geographic zone and territory structure' },
  { id: 'team', name: 'Team Management', desc: 'Officer hierarchy and reporting assignments' },
  { id: 'outlets', name: 'Outlet Management', desc: 'Outlet profile registration and password resets' },
  { id: 'perms', name: 'User Permissions', desc: 'Per-user page visibility controls' },
];

export function AdminScreen({
  actor,
  outlets,
  loading,
  error,
  initialTab = 'zones',
  onBack,
}: AdminScreenProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);

  return (
    <ScreenContainer>
      {onBack ? (
        <View style={styles.backRow}>
          <SecondaryButton title="‹ Back to Modules" onPress={onBack} size="sm" />
        </View>
      ) : null}

      {/* Segment Bar */}
      <View style={styles.segmentBar}>
        <Pressable
          onPress={() => setActiveTab('zones')}
          style={[styles.segmentItem, activeTab === 'zones' && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, activeTab === 'zones' && styles.segmentTextActive]}>
            Zones & Regions
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('team')}
          style={[styles.segmentItem, activeTab === 'team' && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, activeTab === 'team' && styles.segmentTextActive]}>
            Team & Officers
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('outlets')}
          style={[styles.segmentItem, activeTab === 'outlets' && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, activeTab === 'outlets' && styles.segmentTextActive]}>
            Outlets
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('perms')}
          style={[styles.segmentItem, activeTab === 'perms' && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, activeTab === 'perms' && styles.segmentTextActive]}>
            Permissions
          </Text>
        </Pressable>
      </View>

      {/* Specification Status Banner */}
      <View style={[styles.statusBanner, shadows.subtle]}>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>AUDITED MASTER DATA</Text>
        </View>
        <Text style={styles.statusBannerTitle}>Administrative Management Console</Text>
        <Text style={styles.statusBannerNotice}>
          Outlet records below come from local SQLite and follow your account scope. Zone, team and
          permission lists are audited previews. Editing those records is unavailable in this prototype.
        </Text>
      </View>

      {/* VIEW: ZONES & REGIONS */}
      {activeTab === 'zones' ? (
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Geographic Master Structure (Preview)</Text>
          {DEMO_ZONES.map(z => (
            <View key={z.name} style={[styles.zoneCard, shadows.subtle]}>
              <View style={styles.zoneCardHeader}>
                <View>
                  <Text style={styles.zoneName}>{z.name}</Text>
                  <Text style={styles.zoneOrg}>
                    {z.org === 'rohan' ? 'Rohan Energy Network' : 'HPCL Network'}
                  </Text>
                </View>
                <View style={styles.zoneOfficerPill}>
                  <Text style={styles.zoneOfficerText}>ZO: {z.zo}</Text>
                </View>
              </View>

              <View style={styles.zoneDivider} />

              <Text style={styles.subLabel}>COVERED REGIONAL OFFICES (RO):</Text>
              {z.regions.map(r => (
                <View key={r} style={styles.bulletItem}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{r}</Text>
                </View>
              ))}

              <Text style={[styles.subLabel, { marginTop: spacing.xs }]}>STATES COVERED:</Text>
              <Text style={styles.statesText}>{z.states.join(', ')}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* VIEW: TEAM & OFFICERS */}
      {activeTab === 'team' ? (
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Officer Directory & Hierarchy (Preview)</Text>
          <View style={[styles.card, shadows.subtle]}>
            {DEMO_TEAM.map((member, idx) => (
              <View
                key={member.user}
                style={[
                  styles.teamRow,
                  idx < DEMO_TEAM.length - 1 && styles.teamRowDivider,
                ]}
              >
                <View style={styles.teamAvatar}>
                  <Text style={styles.avatarText}>{member.user.slice(5, 7).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.teamNameRow}>
                    <Text style={styles.teamName}>{member.name}</Text>
                    <View style={styles.roleTag}>
                      <Text style={styles.roleTagText}>{member.role}</Text>
                    </View>
                  </View>
                  <Text style={styles.teamUser}>Username: {member.user} · {member.org}</Text>
                  <Text style={styles.teamScope}>Jurisdiction: {member.scope}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* VIEW: OUTLETS */}
      {activeTab === 'outlets' ? (
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Authorized Retail Outlets (portal_outlets)</Text>
          <View style={[styles.card, shadows.subtle]}>
            <Text style={styles.outletNotice}>
              Each outlet authenticates via their 8-digit SAP code. Passwords are local bcrypt hashes.
            </Text>
            {loading ? <Text style={styles.outletNotice}>Loading local outlets…</Text> : error ? <Text style={styles.outletNotice}>{error}</Text> : outlets.length === 0 ? <Text style={styles.outletNotice}>No outlets are available in your assigned area.</Text> : outlets.map((o, idx) => (
              <View
                key={o.sap_code}
                style={[
                  styles.outletItem,
                  idx < outlets.length - 1 && styles.outletItemDivider,
                ]}
              >
                <View>
                  <Text style={styles.outletSap}>SAP: {o.sap_code}</Text>
                  <Text style={styles.outletName}>{o.outlet_name}</Text>
                  <Text style={styles.outletRo}>{o.ro} · {o.state}</Text>
                </View>
                <View style={styles.verifiedTag}>
                  <Text style={styles.verifiedText}>LOCAL MASTER</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* VIEW: USER PERMISSIONS */}
      {activeTab === 'perms' ? (
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Page Permission Matrix (auth.php PAGE_IDS)</Text>
          <View style={[styles.card, shadows.subtle]}>
            <Text style={styles.permsExplainer}>
              In the web portal, Super Admins can toggle individual page visibility via `hidden_pages`.
              Per the audit, page hiding governs UI navigation visibility, while domain authorization
              strictly enforces execution boundaries.
            </Text>

            <View style={styles.permList}>
              {PAGE_PERMISSIONS.map(p => (
                <View key={p.id} style={styles.permItem}>
                  <View style={styles.permHeader}>
                    <Text style={styles.permCode}>ID: {p.id}</Text>
                    <Text style={styles.permName}>{p.name}</Text>
                  </View>
                  <Text style={styles.permDesc}>{p.desc}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  segmentBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  segmentItemActive: {
    backgroundColor: colors.primarySubtle,
  },
  segmentText: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    fontSize: 10,
  },
  segmentTextActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  statusBanner: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  statusBadge: {
    backgroundColor: colors.warningLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.warning,
  },
  statusBannerTitle: {
    ...typography.headingSm,
    color: colors.primaryDark,
  },
  statusBannerNotice: {
    ...typography.captionRegular,
    color: colors.textSecondary,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    ...typography.headingSm,
    color: colors.primaryDark,
  },
  zoneCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  zoneCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  zoneName: {
    ...typography.bodyBold,
    fontSize: 15,
    color: colors.primaryDark,
  },
  zoneOrg: {
    ...typography.captionRegular,
    color: colors.textSecondary,
  },
  zoneOfficerPill: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  zoneOfficerText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  zoneDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.xs,
  },
  subLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  bulletDot: {
    color: colors.primary,
    fontSize: 14,
  },
  bulletText: {
    ...typography.captionMedium,
    color: colors.textPrimary,
  },
  statesText: {
    ...typography.captionRegular,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  teamRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  teamAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySubtle,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.primaryDark,
    fontWeight: '800',
    fontSize: 12,
  },
  teamNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamName: {
    ...typography.bodyBold,
    fontSize: 13,
  },
  roleTag: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  roleTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  teamUser: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    fontSize: 11,
  },
  teamScope: {
    ...typography.captionRegular,
    color: colors.textMuted,
    fontSize: 10,
  },
  outletNotice: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  outletItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  outletItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  outletSap: {
    ...typography.bodyBold,
    color: colors.primary,
    fontSize: 13,
  },
  outletName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  outletRo: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    fontSize: 11,
  },
  verifiedTag: {
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  verifiedText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  permsExplainer: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  permList: {
    gap: spacing.xs,
  },
  permItem: {
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: 1,
  },
  permHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  permCode: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: 4,
    borderRadius: radius.xs,
  },
  permName: {
    ...typography.bodyBold,
    fontSize: 13,
  },
  permDesc: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    fontSize: 11,
  },
});
