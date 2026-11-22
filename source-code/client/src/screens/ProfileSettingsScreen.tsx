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
import { PrimaryButton, SecondaryButton } from '../components/common/Buttons';
import { PasswordChangeModal } from '../components/domain/PasswordChangeModal';
import type { Actor } from '../domain';

interface ProfileSettingsScreenProps {
  actor: Actor;
  onChangePassword: (current: string, next: string) => Promise<void>;
  onLogout: () => void;
  onBack?: () => void;
  initialShowPasswordModal?: boolean;
}

const DEMO_ROLES = [
  { username: 'demo_super', label: 'Super Admin (Rohan Energy)', org: 'rohan', role: 'Super Admin', desc: 'Full access to all zones, users, stock, prices, FOC & approvals' },
  { username: 'demo_hpcl_super', label: 'HPCL Super Admin', org: 'hpcl', role: 'Super Admin', desc: 'HPCL organization supervisor & order approvals' },
  { username: 'demo_rohan_zo', label: 'Central Zone Officer', org: 'rohan', role: 'Zone Officer', desc: 'Manages Indore & Bhopal regions; approves zone orders' },
  { username: 'demo_rohan_ro', label: 'Indore Regional Officer', org: 'rohan', role: 'Regional Officer', desc: 'Indore region (4 sales areas); creates order drafts' },
  { username: 'demo_hpcl_rm', label: 'HPCL Regional Manager (L2)', org: 'hpcl', role: 'Regional Manager', desc: 'Indore region; decides outlet orders' },
  { username: 'demo_hpcl_so', label: 'HPCL Sales Officer (L1)', org: 'hpcl', role: 'Sales Officer', desc: 'Indore-1 & 2 sales areas' },
  { username: '90000001', label: 'Retail Outlet SAP 90000001', org: 'outlet', role: 'Retail Outlet', desc: 'Indore Auto Service outlet profile' },
];

export function ProfileSettingsScreen({
  actor,
  onChangePassword,
  onLogout,
  onBack,
  initialShowPasswordModal = false,
}: ProfileSettingsScreenProps) {
  const [showResetModal, setShowResetModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(initialShowPasswordModal);

  return (
    <ScreenContainer>
      {onBack ? (
        <View style={styles.backRow}>
          <SecondaryButton title="‹ Back to Modules" onPress={onBack} size="sm" />
        </View>
      ) : null}

      {/* User Profile Card */}
      <View style={[styles.profileCard, shadows.card]}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>
              {actor.username.slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{actor.label || actor.username}</Text>
            <Text style={styles.userRole}>
              {actor.org.toUpperCase()} · {actor.role.toUpperCase()}
            </Text>
            <View style={styles.scopeTag}>
              <Text style={styles.scopeTagText}>
                {actor.zone ? `Zone: ${actor.zone}` : 'Unrestricted State Scope'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.detailsGrid}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>USERNAME / SAP</Text>
            <Text style={styles.detailValue}>{actor.username}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>ORGANIZATION</Text>
            <Text style={styles.detailValue}>{actor.org.toUpperCase()}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>LEVEL DESIGNATION</Text>
            <Text style={styles.detailValue}>{actor.level || actor.role}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>REGIONS (RO)</Text>
            <Text style={styles.detailValue}>
              {actor.ros.length ? actor.ros.join(', ') : 'All mapped'}
            </Text>
          </View>
        </View>

        <View style={styles.cardActions}>
          <SecondaryButton
            title="🔑 Change Password"
            onPress={() => setShowPasswordModal(true)}
            size="sm"
          />
        </View>
      </View>

      {/* Organization Details Card */}
      <View style={[styles.card, shadows.subtle]}>
        <Text style={styles.sectionTitle}>Organization Details (Demo Preview)</Text>
        <Text style={styles.sectionSubtitle}>
          Enterprise entity mapping and distributor network metadata.
        </Text>

        <View style={styles.orgTable}>
          <View style={styles.orgRow}>
            <Text style={styles.orgKey}>Distributor</Text>
            <Text style={styles.orgVal}>Rohan Energy Solutions Pvt. Ltd.</Text>
          </View>
          <View style={styles.orgRow}>
            <Text style={styles.orgKey}>Principal Partner</Text>
            <Text style={styles.orgVal}>Hindustan Petroleum Corporation Ltd. (HPCL)</Text>
          </View>
          <View style={styles.orgRow}>
            <Text style={styles.orgKey}>Registered GSTIN</Text>
            <Text style={styles.orgVal}>23AABCR1234F1Z8</Text>
          </View>
          <View style={styles.orgRow}>
            <Text style={styles.orgKey}>Plant / Depot</Text>
            <Text style={styles.orgVal}>Sector 2, Pithampur Industrial Area, MP</Text>
          </View>
          <View style={styles.orgRow}>
            <Text style={styles.orgKey}>Sync Status</Text>
            <Text style={styles.orgValSuccess}>Standalone Offline (No Server Connection)</Text>
          </View>
        </View>
      </View>

      {/* Demo Role Switcher Section */}
      <View style={[styles.card, shadows.subtle]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Demo Account Examples</Text>
          <Text style={styles.sectionSubtitle}>
            These examples are not a live account directory. Sign out, then enter the chosen account password on the login screen.
          </Text>
        </View>

        <View style={styles.rolesList}>
          {DEMO_ROLES.map(role => {
            const isCurrent =
              actor.username.toLowerCase() === role.username.toLowerCase() &&
              actor.org.toLowerCase() === role.org.toLowerCase();

            return (
              <Pressable
                key={role.username}
                onPress={() => !isCurrent && onLogout()}
                style={({ pressed }) => [
                  styles.roleItem,
                  isCurrent && styles.roleItemCurrent,
                  pressed && !isCurrent && styles.pressed,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.roleTitleRow}>
                    <Text
                      style={[
                        styles.roleLabel,
                        isCurrent && styles.roleLabelCurrent,
                      ]}
                    >
                      {role.label}
                    </Text>
                    {isCurrent ? (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>ACTIVE</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.roleDesc}>{role.desc}</Text>
                </View>
                {!isCurrent ? (
                  <View style={styles.switchButton}>
                    <Text style={styles.switchButtonText}>
                      Sign out ›
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Reset Demo Data Architecture Card */}
      <View style={[styles.card, shadows.subtle]}>
        <Text style={styles.sectionTitle}>Reset Demo Data</Text>
        <Text style={styles.sectionSubtitle}>
          The application uses a bundled SQLite seed with strict foreign key integrity.
        </Text>

        <View style={styles.resetExplainer}>
          <Text style={styles.explainerNotice}>
            As designed in ARCHITECTURE.md, an atomic reset sequence requires:
          </Text>
          <Text style={styles.explainerStep}>1. Verification of bundled seed checksum & version.</Text>
          <Text style={styles.explainerStep}>2. Atomic backup of current database & files to rollback path.</Text>
          <Text style={styles.explainerStep}>3. Seed replacement & foreign key validation before commit.</Text>
          <Text style={styles.explainerStep}>4. Clearing session & returning to clean login state.</Text>
        </View>

        <SecondaryButton
          title="Review Reset Procedure"
          onPress={() => setShowResetModal(true)}
          size="sm"
        />
      </View>

      {/* Application Technical Info */}
      <View style={[styles.card, shadows.subtle]}>
        <Text style={styles.sectionTitle}>Application Information</Text>
        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Application ID</Text>
            <Text style={styles.infoVal}>in.rohanenergy.offline</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Expo Slug</Text>
            <Text style={styles.infoVal}>rohan-energy-offline</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>EAS Project ID</Text>
            <Text style={styles.infoVal}>1588b446-83d5-4a51-b162-d97e425ea5c6</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Runtime Platform</Text>
            <Text style={styles.infoVal}>Expo SDK 58 / React Native 0.88.1</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Network Boundary</Text>
            <Text style={styles.infoValSuccess}>Offline Enforced (No Network)</Text>
          </View>
        </View>
      </View>

      {/* Logout Action */}
      <View style={styles.logoutSection}>
        <PrimaryButton
          title="Sign Out of Session"
          onPress={onLogout}
          size="md"
          fullWidth
        />
      </View>

      {/* Password Change Modal */}
      <PasswordChangeModal
        visible={showPasswordModal}
        username={actor.username}
        onClose={() => setShowPasswordModal(false)}
        onSubmit={onChangePassword}
      />

      {/* Reset Procedure Modal */}
      <Modal
        visible={showResetModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowResetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, shadows.modal]}>
            <Text style={styles.modalTitle}>Reset Demo Data Procedure</Text>
            <Text style={styles.modalBody}>
              In accordance with ARCHITECTURE.md, resetting demo data must follow a verified
              transactional recovery adapter to avoid leaving mismatched accounts, orders or MIS
              records.
            </Text>
            <Text style={styles.modalBody}>
              To preserve local testing safety and avoid unexpected file corruption during UI development,
              direct database destruction is guarded.
            </Text>
            <View style={styles.modalActions}>
              <PrimaryButton
                title="Understood"
                onPress={() => setShowResetModal(false)}
                size="sm"
              />
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
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarLarge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLargeText: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 18,
  },
  userName: {
    ...typography.headingSm,
    fontSize: 16,
    color: colors.primaryDark,
  },
  userRole: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    fontSize: 11,
  },
  scopeTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.xs,
    marginTop: 2,
  },
  scopeTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  detailsGrid: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.xs + 2,
    gap: 4,
  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
  },
  detailValue: {
    fontSize: 11,
    color: colors.textPrimary,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionHeader: {
    gap: 2,
  },
  sectionTitle: {
    ...typography.headingSm,
    fontSize: 14,
    color: colors.primaryDark,
  },
  sectionSubtitle: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    fontSize: 11,
  },
  orgTable: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.xs,
    overflow: 'hidden',
  },
  orgRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  orgKey: {
    fontSize: 11,
    color: colors.textSecondary,
    width: 100,
  },
  orgVal: {
    fontSize: 11,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'right',
  },
  orgValSuccess: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
    flex: 1,
    textAlign: 'right',
  },
  rolesList: {
    gap: spacing.xs,
  },
  roleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  roleItemCurrent: {
    backgroundColor: colors.primarySubtle,
    borderColor: colors.primaryLight,
  },
  roleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  roleLabel: {
    ...typography.bodyBold,
    fontSize: 12,
  },
  roleLabelCurrent: {
    color: colors.primaryDark,
  },
  roleDesc: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 1,
  },
  currentBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  currentBadgeText: {
    color: colors.textInverse,
    fontSize: 8,
    fontWeight: '800',
  },
  switchButton: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  switchButtonText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '700',
  },
  resetExplainer: {
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.sm,
    borderRadius: radius.sm,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  explainerNotice: {
    fontSize: 11,
    color: colors.primaryDark,
    fontWeight: '700',
    marginBottom: 1,
  },
  explainerStep: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    fontSize: 10,
  },
  infoList: {
    gap: 3,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  infoKey: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  infoVal: {
    fontSize: 11,
    color: colors.textPrimary,
  },
  infoValSuccess: {
    fontSize: 11,
    color: colors.success,
    fontWeight: '700',
  },
  logoutSection: {
    marginTop: spacing.xs,
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
  modalTitle: {
    ...typography.headingSm,
    fontSize: 15,
  },
  modalBody: {
    ...typography.bodyRegular,
    color: colors.textSecondary,
    fontSize: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
  },
  pressed: {
    opacity: 0.8,
  },
});
