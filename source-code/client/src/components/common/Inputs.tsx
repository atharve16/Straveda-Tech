import React, { useState } from 'react';
import {
  KeyboardTypeOptions,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export interface FormFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  error?: string;
  helperText?: string;
  editable?: boolean;
  required?: boolean;
}

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  error,
  helperText,
  editable = true,
  required = false,
}: FormFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(!secureTextEntry);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      </View>

      <View
        style={[
          styles.inputContainer,
          isFocused && styles.inputFocused,
          error ? styles.inputError : null,
          !editable && styles.inputDisabled,
        ]}
      >
        <TextInput
          style={[styles.input, !editable && styles.inputTextDisabled]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secureTextEntry && !isPasswordVisible}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={editable}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setIsPasswordVisible(!isPasswordVisible)}
            style={styles.eyeButton}
            hitSlop={8}
            accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
          >
            <Text style={styles.eyeText}>{isPasswordVisible ? '👁' : '👁‍🗨'}</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search...',
  onClear,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onClear?: () => void;
}) {
  return (
    <View style={styles.searchContainer}>
      <Text style={styles.searchIcon}>🔍</Text>
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
      {value ? (
        <Pressable
          onPress={() => {
            onChangeText('');
            if (onClear) onClear();
          }}
          style={styles.clearButton}
          hitSlop={8}
          accessibilityLabel="Clear search"
        >
          <Text style={styles.clearText}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SelectField({
  label,
  value,
  options,
  onSelect,
  placeholder = 'Select an option...',
  helperText,
}: {
  label: string;
  value: string;
  options: { label: string; value: string; hint?: string }[];
  onSelect: (value: string) => void;
  placeholder?: string;
  helperText?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find(o => o.value === value);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setIsOpen(!isOpen)}
        style={[styles.inputContainer, styles.selectTrigger]}
      >
        <Text style={[styles.selectValue, !value && styles.selectPlaceholder]} numberOfLines={1}>
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
        <Text style={styles.dropdownArrow}>{isOpen ? '▲' : '▼'}</Text>
      </Pressable>

      {isOpen ? (
        <View style={styles.optionsList}>
          {options.map(option => (
            <Pressable
              key={option.value}
              onPress={() => {
                onSelect(option.value);
                setIsOpen(false);
              }}
              style={[
                styles.optionItem,
                option.value === value && styles.optionItemSelected,
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.optionLabel,
                    option.value === value && styles.optionLabelSelected,
                  ]}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
                {option.hint ? (
                  <Text style={styles.optionHint} numberOfLines={1}>
                    {option.hint}
                  </Text>
                ) : null}
              </View>
              {option.value === value ? (
                <Text style={styles.checkmark}>✓</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 3,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  required: {
    color: colors.danger,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 42,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 0,
    height: '100%',
  },
  inputFocused: {
    borderColor: colors.primary,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
  },
  inputError: {
    borderColor: colors.danger,
  },
  inputDisabled: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
  },
  inputTextDisabled: {
    color: colors.textSecondary,
  },
  eyeButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  eyeText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  errorText: {
    ...typography.captionRegular,
    color: colors.danger,
    marginTop: 1,
    fontSize: 11,
  },
  helperText: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    marginTop: 1,
    fontSize: 11,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 40,
    gap: spacing.sm,
  },
  searchIcon: {
    fontSize: 13,
    color: colors.textMuted,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
    paddingVertical: 0,
    height: '100%',
  },
  clearButton: {
    padding: spacing.xs,
  },
  clearText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '700',
  },
  selectTrigger: {
    justifyContent: 'space-between',
    height: 42,
  },
  selectValue: {
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
  },
  selectPlaceholder: {
    color: colors.textMuted,
  },
  dropdownArrow: {
    fontSize: 10,
    color: colors.textSecondary,
    marginLeft: 6,
  },
  optionsList: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    marginTop: spacing.xs,
    overflow: 'hidden',
    maxHeight: 180,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  optionItemSelected: {
    backgroundColor: colors.primarySubtle,
  },
  optionLabel: {
    ...typography.bodyMedium,
    fontSize: 13,
  },
  optionLabelSelected: {
    fontWeight: '700',
    color: colors.primaryDark,
  },
  optionHint: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    fontSize: 11,
  },
  checkmark: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
});
