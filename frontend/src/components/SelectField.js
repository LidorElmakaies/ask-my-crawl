import { useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';

// Approx height of one row (padding + text) — caps the list to ~3 visible rows before it scrolls.
const ROW_HEIGHT = 46;
const VISIBLE_ROWS = 3;

/**
 * Generic labeled dropdown — a pressable field showing the selected option's label, opens a small
 * list anchored directly below it (measured via measureInWindow, since Modal portals outside the
 * normal view tree) instead of a full-screen bottom sheet.
 */
export default function SelectField({
  label,
  hint,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  style,
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const triggerRef = useRef(null);
  const { colors } = useAppTheme();
  const selected = options.find((o) => o.value === value);

  const handleOpen = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y: y + height + 4, width });
      setOpen(true);
    });
  };

  return (
    <View style={[styles.wrapper, style]}>
      {label ? (
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      ) : null}
      {hint ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text>
      ) : null}

      <TouchableOpacity
        ref={triggerRef}
        onPress={handleOpen}
        style={[
          styles.trigger,
          { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
        ]}
      >
        <Text
          style={[
            styles.triggerText,
            { color: selected ? colors.text : colors.textMuted },
          ]}
        >
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {anchor ? (
            <View
              style={[
                styles.dropdown,
                {
                  top: anchor.y,
                  left: anchor.x,
                  width: anchor.width,
                  backgroundColor: colors.card,
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              <FlatList
                data={options}
                keyExtractor={(item) => String(item.value)}
                style={{ maxHeight: ROW_HEIGHT * VISIBLE_ROWS }}
                getItemLayout={(_, index) => ({
                  length: ROW_HEIGHT,
                  offset: ROW_HEIGHT * index,
                  index,
                })}
                renderItem={({ item }) => {
                  const isSelected = item.value === value;
                  return (
                    <TouchableOpacity
                      onPress={() => {
                        onChange(item.value);
                        setOpen(false);
                      }}
                      style={[
                        styles.row,
                        isSelected && { backgroundColor: colors.cardGlow },
                      ]}
                    >
                      <Text style={[styles.rowText, { color: colors.text }]}>
                        {item.label}
                      </Text>
                      {isSelected ? (
                        <Ionicons
                          name="checkmark"
                          size={18}
                          color={colors.primary}
                        />
                      ) : null}
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          ) : null}
        </Pressable>
      </Modal>
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
  hint: {
    fontSize: 12,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  triggerText: {
    fontSize: 15,
  },
  backdrop: {
    flex: 1,
  },
  dropdown: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: ROW_HEIGHT,
    paddingHorizontal: 12,
  },
  rowText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
