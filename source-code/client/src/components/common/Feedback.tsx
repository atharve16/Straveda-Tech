import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';
import { DangerButton, PrimaryButton, SecondaryButton } from './Buttons';

export function EmptyState({
  title,
  description,
  icon = '📋',
  actionTitle,
  onActionPress,
}: {
  title: string;
  description: string;
  icon?: string;
  actionTitle?: string;
  onActionPress?: () => void;
}) {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.iconCircle}>
        <Text style={styles.emptyIcon}>{icon}</Text>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {actionTitle && onActionPress ? (
        <View style={styles.actionWrap}>
          <PrimaryButton title={actionTitle} onPress={onActionPress} size="sm" />
        </View>
      ) : null}
    </View>
  );
}

export function LoadingState({
  message = 'Loading data...',
}: {
  message?: string;
}) {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

export function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  if (!message) return null;
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorIcon}>⚠</Text>
      <Text style={styles.errorText}>{message}</Text>
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={8}>
          <Text style={styles.dismissText}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ConfirmationDialog({
  visible,
  title,
  message,
  confirmTitle = 'Confirm',
  cancelTitle = 'Cancel',
  isDestructive = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmTitle?: string;
  cancelTitle?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={[styles.dialogCard, shadows.modal]}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.dialogMessage}>{message}</Text>
          <View style={styles.dialogActions}>
            <SecondaryButton title={cancelTitle} onPress={onCancel} size="sm" />
            {isDestructive ? (
              <DangerButton title={confirmTitle} onPress={onConfirm} size="sm" />
            ) : (
              <PrimaryButton title={confirmTitle} onPress={onConfirm} size="sm" />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: spacing.sm,
    gap: spacing.sm,
  },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyIcon: {
    fontSize: 26,
  },
  emptyTitle: {
    ...typography.headingSm,
    textAlign: 'center',
  },
  emptyDescription: {
    ...typography.captionRegular,
    textAlign: 'center',
    maxWidth: 280,
  },
  actionWrap: {
    marginTop: spacing.sm,
  },
  loadingContainer: {
    padding: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.captionMedium,
    color: colors.textSecondary,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerLight,
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  errorIcon: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    flex: 1,
    ...typography.captionMedium,
    color: colors.danger,
  },
  dismissText: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  dialogTitle: {
    ...typography.headingMd,
  },
  dialogMessage: {
    ...typography.bodyRegular,
    color: colors.textSecondary,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
