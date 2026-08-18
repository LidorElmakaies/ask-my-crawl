import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

/**
 * Shared, reusable text input — label + input + optional error text, themed via useAppTheme()
 * like everything else. Use this everywhere a labeled input is needed (URL/query submission,
 * register, login, ...) instead of hand-rolling a TextInput per screen.
 */
export default function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secureTextEntry,
  keyboardType = 'default',
  autoCapitalize = 'none',
  style,
}) {
  const { colors } = useAppTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? colors.error : focused ? colors.inputFocusBorder : colors.inputBorder;

  return (
    <View style={[styles.wrapper, style]}>
      {label ? <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          { backgroundColor: colors.inputBg, borderColor, color: colors.text },
        ]}
      />
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
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  error: {
    fontSize: 12,
    fontWeight: '600',
  },
});
