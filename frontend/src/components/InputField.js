import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';

/**
 * Shared, reusable text input — label + input + optional hint/error/char-count, themed via
 * useAppTheme(). Use this everywhere a labeled input is needed instead of hand-rolling a
 * TextInput per screen.
 *
 * `isPassword` adds a show/hide toggle instead of a plain `secureTextEntry` field. `glow` adds a
 * focus-glow shadow (off by default, so existing screens keep their current look). `hint` renders
 * a muted caption under the label; `maxLength` + `showCharCount` render a "n/max" counter next to
 * it. `inputStyle` sizes the input itself (width/height/...); `style` sizes the outer wrapper.
 */
export default function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  hint,
  secureTextEntry,
  isPassword,
  keyboardType = 'default',
  autoCapitalize = 'none',
  autoCorrect,
  multiline,
  monospace,
  maxLength,
  showCharCount,
  glow,
  style,
  inputStyle,
}) {
  const { colors } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);

  const borderColor = error
    ? colors.error
    : focused
      ? colors.inputFocusBorder
      : colors.inputBorder;

  return (
    <View style={[styles.wrapper, style]}>
      {label || showCharCount ? (
        <View style={styles.labelRow}>
          {label ? (
            <Text style={[styles.label, { color: colors.textMuted }]}>
              {label}
            </Text>
          ) : null}
          {showCharCount ? (
            <Text
              style={[
                styles.charCount,
                {
                  color:
                    value.length > maxLength ? colors.error : colors.textMuted,
                },
              ]}
            >
              {value.length}/{maxLength}
            </Text>
          ) : null}
        </View>
      ) : null}
      {hint ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text>
      ) : null}
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={isPassword ? !reveal : secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          multiline={multiline}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.input,
            isPassword && styles.inputWithToggle,
            multiline && styles.inputMultiline,
            monospace && styles.inputMonospace,
            {
              backgroundColor: colors.inputBg,
              borderColor,
              color: colors.text,
            },
            glow && {
              shadowColor: focused ? colors.primary : 'transparent',
              shadowOpacity: 0.4,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 0 },
            },
            inputStyle,
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
      {error ? (
        <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  charCount: {
    fontSize: 11,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
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
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top', // Android: multiline text starts at the top, not vertically centered
  },
  inputMonospace: {
    fontFamily: 'monospace',
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
