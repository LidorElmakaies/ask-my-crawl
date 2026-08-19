import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';

/**
 * Shared, reusable text input — label + input + optional error text, themed via useAppTheme()
 * like everything else. Use this everywhere a labeled input is needed (URL/query submission,
 * register, login, ...) instead of hand-rolling a TextInput per screen.
 *
 * Pass `isPassword` for the password-specific variant (register/login) — same component, adds a
 * show/hide toggle instead of a plain `secureTextEntry` field with no way to check what you typed.
 * Don't pass both `isPassword` and `secureTextEntry` — `isPassword` manages visibility itself.
 */
export default function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secureTextEntry,
  isPassword,
  keyboardType = 'default',
  autoCapitalize = 'none',
  style,
}) {
  const { colors } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);

  const borderColor = error ? colors.error : focused ? colors.inputFocusBorder : colors.inputBorder;

  return (
    <View style={[styles.wrapper, style]}>
      {label ? <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text> : null}
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={isPassword ? !reveal : secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.input,
            isPassword && styles.inputWithToggle,
            { backgroundColor: colors.inputBg, borderColor, color: colors.text },
          ]}
        />
        {isPassword ? (
          <TouchableOpacity
            onPress={() => setReveal((r) => !r)}
            style={styles.toggle}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={reveal ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  inputWithToggle: {
    paddingRight: 44,
  },
  toggle: {
    position: 'absolute',
    right: 14,
  },
  error: {
    fontSize: 12,
    fontWeight: '600',
  },
});
