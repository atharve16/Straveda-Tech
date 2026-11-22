import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';
import { FormField } from '../common/Inputs';
import { PrimaryButton, SecondaryButton } from '../common/Buttons';

interface PasswordChangeModalProps {
  visible: boolean;
  username: string;
  onClose: () => void;
  onSubmit: (curr: string, next: string) => Promise<void>;
}

export function PasswordChangeModal({
  visible,
  username,
  onClose,
  onSubmit,
}: PasswordChangeModalProps) {
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  function close() {
    setCurrentPass('');
    setNewPass('');
    setConfirmPass('');
    setError('');
    setSuccess(false);
    onClose();
  }

  async function handleSubmit() {
    if (loading) return;
    setError('');
    setSuccess(false);

    if (!currentPass || !newPass || !confirmPass) {
      setError('Please fill in all password fields.');
      return;
    }
    if (newPass.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPass !== confirmPass) {
      setError('New password and confirmation do not match.');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(currentPass, newPass);
      setSuccess(true);
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
      setTimeout(close, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Password update failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={[styles.card, shadows.modal]}>
          <View style={styles.header}>
            <Text style={styles.title}>Change Password</Text>
            <Pressable onPress={close} style={styles.closeBtn} hitSlop={8}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            Update account security credentials for {username}.
          </Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠ {error}</Text>
            </View>
          ) : null}

          {success ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>✓ Password successfully updated.</Text>
            </View>
          ) : null}

          <FormField
            label="CURRENT PASSWORD"
            value={currentPass}
            onChangeText={setCurrentPass}
            placeholder="••••••••••••"
            secureTextEntry
            required
          />

          <FormField
            label="NEW PASSWORD (MIN 8 CHARACTERS)"
            value={newPass}
            onChangeText={setNewPass}
            placeholder="••••••••••••"
            secureTextEntry
            required
          />

          <FormField
            label="CONFIRM NEW PASSWORD"
            value={confirmPass}
            onChangeText={setConfirmPass}
            placeholder="••••••••••••"
            secureTextEntry
            required
          />

          <View style={styles.actions}>
            <SecondaryButton title="Cancel" onPress={close} size="sm" />
            <PrimaryButton
              title={loading ? 'Updating…' : 'Update Password'}
              onPress={handleSubmit}
              loading={loading}
              size="sm"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm + 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    ...typography.headingMd,
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
  subtitle: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: -4,
  },
  errorBox: {
    backgroundColor: colors.dangerLight,
    padding: spacing.xs + 2,
    borderRadius: radius.xs,
  },
  errorText: {
    fontSize: 11,
    color: colors.danger,
    fontWeight: '600',
  },
  successBox: {
    backgroundColor: colors.successLight,
    padding: spacing.xs + 2,
    borderRadius: radius.xs,
  },
  successText: {
    fontSize: 11,
    color: colors.success,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
