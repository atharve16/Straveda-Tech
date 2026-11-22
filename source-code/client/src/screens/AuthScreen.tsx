import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing, typography } from '../theme/tokens';
import { FormField } from '../components/common/Inputs';
import { PrimaryButton } from '../components/common/Buttons';
import { ErrorBanner } from '../components/common/Feedback';

interface AuthScreenProps {
  onLogin: (username: string, pass: string, org: string) => Promise<void>;
  loading: boolean;
  error: string;
  onErrorDismiss: () => void;
}

type OrgTab = 'rohan' | 'hpcl' | 'outlet';

interface DemoAccount {
  label: string;
  user: string;
  org: OrgTab;
  role: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { label: 'Rohan Super Admin', user: 'demo_super', org: 'rohan', role: 'Super Admin' },
  { label: 'HPCL Super Admin', user: 'demo_hpcl_super', org: 'hpcl', role: 'Super Admin' },
  { label: 'Rohan Zone Officer', user: 'demo_rohan_zo', org: 'rohan', role: 'Central Zone' },
  { label: 'Rohan Regional Officer', user: 'demo_rohan_ro', org: 'rohan', role: 'Indore RO' },
  { label: 'HPCL Regional Manager', user: 'demo_hpcl_rm', org: 'hpcl', role: 'Indore RM' },
  { label: 'Retail Outlet SAP', user: '90000001', org: 'outlet', role: 'Demo Outlet #1' },
];

export function AuthScreen({
  onLogin,
  loading,
  error,
  onErrorDismiss,
}: AuthScreenProps) {
  const insets = useSafeAreaInsets();
  const [org, setOrg] = useState<OrgTab>('rohan');
  const [username, setUsername] = useState('demo_super');
  const [password, setPassword] = useState('Demo@12345');

  function handleQuickLogin(account: DemoAccount) {
    setOrg(account.org);
    setUsername(account.user);
    setPassword('Demo@12345');
    onErrorDismiss();
  }

  function handleTabChange(newOrg: OrgTab) {
    setOrg(newOrg);
    onErrorDismiss();
    if (newOrg === 'outlet') {
      setUsername('90000001');
    } else if (newOrg === 'hpcl') {
      setUsername('demo_hpcl_super');
    } else {
      setUsername('demo_super');
    }
  }

  return (
    <View style={[styles.safeArea, { paddingTop: Math.max(insets.top, 0) }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand Header */}
          <View style={styles.brandContainer}>
            <View style={styles.brandLogo}>
              <Text style={styles.brandLogoText}>SE</Text>
            </View>
            <Text style={styles.brandTitle}>STRAVEDA</Text>
            <Text style={styles.brandSubtitle}>Rohan Energy Order & MIS Portal</Text>
            <View style={styles.offlineBadge}>
              <View style={styles.offlineDot} />
              <Text style={styles.offlineBadgeText}>STANDALONE OFFLINE SYSTEM</Text>
            </View>
          </View>

          {/* Login Card */}
          <View style={[styles.loginCard, shadows.card]}>
            <Text style={styles.cardHeader}>Sign in to your account</Text>

            {/* Organization Segment Tabs */}
            <View style={styles.tabBar}>
              <Pressable
                onPress={() => handleTabChange('rohan')}
                style={[styles.tabItem, org === 'rohan' && styles.tabItemActive]}
              >
                <Text style={[styles.tabText, org === 'rohan' && styles.tabTextActive]}>
                  Rohan Energy
                </Text>
              </Pressable>

              <Pressable
                onPress={() => handleTabChange('hpcl')}
                style={[styles.tabItem, org === 'hpcl' && styles.tabItemActive]}
              >
                <Text style={[styles.tabText, org === 'hpcl' && styles.tabTextActive]}>
                  HPCL
                </Text>
              </Pressable>

              <Pressable
                onPress={() => handleTabChange('outlet')}
                style={[styles.tabItem, org === 'outlet' && styles.tabItemActive]}
              >
                <Text style={[styles.tabText, org === 'outlet' && styles.tabTextActive]}>
                  Outlet (SAP)
                </Text>
              </Pressable>
            </View>

            {/* Error Banner */}
            {error ? (
              <ErrorBanner message={error} onDismiss={onErrorDismiss} />
            ) : null}

            {/* Form Fields */}
            <FormField
              label={org === 'outlet' ? 'SAP NUMBER (6-12 DIGITS)' : 'OFFICER USERNAME'}
              value={username}
              onChangeText={setUsername}
              placeholder={org === 'outlet' ? 'e.g. 90000001' : 'e.g. demo_super'}
              keyboardType={org === 'outlet' ? 'numeric' : 'default'}
              autoCapitalize="none"
              required
            />

            <FormField
              label="PASSWORD"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••••••"
              secureTextEntry
              required
            />

            <PrimaryButton
              title={loading ? 'Signing in…' : 'Sign in to Offline Portal'}
              onPress={() => onLogin(username, password, org)}
              loading={loading}
              fullWidth
              size="lg"
            />
          </View>

          {/* Quick Demo Sign In Helper */}
          <View style={[styles.demoCard, shadows.subtle]}>
            <View style={styles.demoHeaderRow}>
              <Text style={styles.demoTitle}>Quick Demo Switcher</Text>
              <Text style={styles.demoNotice}>All passwords: Demo@12345</Text>
            </View>
            <Text style={styles.demoSub}>
              Select any demo role to test approval flows and permission scopes:
            </Text>

            <View style={styles.chipGrid}>
              {DEMO_ACCOUNTS.map(acc => {
                const isCurrent =
                  org === acc.org && username.toLowerCase() === acc.user.toLowerCase();
                return (
                  <Pressable
                    key={acc.user}
                    onPress={() => handleQuickLogin(acc)}
                    style={({ pressed }) => [
                      styles.demoChip,
                      isCurrent && styles.demoChipActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.chipTop}>
                      <Text
                        style={[
                          styles.chipLabel,
                          isCurrent && styles.chipLabelActive,
                        ]}
                      >
                        {acc.label}
                      </Text>
                      <View
                        style={[
                          styles.orgPill,
                          acc.org === 'rohan'
                            ? styles.rohanPill
                            : acc.org === 'hpcl'
                            ? styles.hpclPill
                            : styles.outletPill,
                        ]}
                      >
                        <Text style={styles.orgPillText}>{acc.org.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={styles.chipUser}>{acc.user}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  brandContainer: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  brandLogo: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: spacing.xs,
  },
  brandLogoText: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 26,
    letterSpacing: -1,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.primaryDark,
    letterSpacing: 1,
  },
  brandSubtitle: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    fontSize: 13,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.successLight,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
    marginTop: spacing.xs,
  },
  offlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  offlineBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.success,
    letterSpacing: 0.6,
  },
  loginCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  cardHeader: {
    ...typography.headingMd,
    textAlign: 'center',
    color: colors.primaryDark,
    marginBottom: spacing.xs,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabItem: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  tabItemActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: {
    ...typography.captionMedium,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  demoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  demoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  demoTitle: {
    ...typography.headingSm,
    fontSize: 14,
    color: colors.primaryDark,
  },
  demoNotice: {
    ...typography.captionRegular,
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  demoSub: {
    ...typography.captionRegular,
    color: colors.textMuted,
  },
  chipGrid: {
    gap: spacing.xs + 2,
  },
  demoChip: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 2,
  },
  demoChipActive: {
    borderColor: colors.primaryLight,
    backgroundColor: colors.primarySubtle,
  },
  chipTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chipLabel: {
    ...typography.captionMedium,
    color: colors.textPrimary,
  },
  chipLabelActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  chipUser: {
    ...typography.captionRegular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  orgPill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  rohanPill: {
    backgroundColor: colors.primarySubtle,
  },
  hpclPill: {
    backgroundColor: '#FFEDD5',
  },
  outletPill: {
    backgroundColor: '#CCFBF1',
  },
  orgPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.75,
  },
});
