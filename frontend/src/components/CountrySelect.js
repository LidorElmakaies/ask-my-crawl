import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import { PHONE_COUNTRIES } from '../utils/phoneCountries';

/**
 * Country-code picker for phone number fields — a pressable pill showing the selected country's
 * flag + calling code, opens a modal list to change it. Only one entry exists today
 * (src/utils/phoneCountries.js), but the picker itself doesn't assume that — adding a second
 * country to that list is all it takes for this to show a real choice.
 */
export default function CountrySelect({ value, onChange, style }) {
  const [open, setOpen] = useState(false);
  const { colors } = useAppTheme();

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[
          styles.pill,
          { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
          style,
        ]}
      >
        <Text style={[styles.pillText, { color: colors.text }]}>
          {value.flag} +{value.callingCode}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
            onPress={() => {}} // swallow taps so they don't fall through to the backdrop's close
          >
            <Text style={[styles.sheetTitle, { color: colors.textMuted }]}>
              Country
            </Text>
            <FlatList
              data={PHONE_COUNTRIES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => {
                const selected = item.code === value.code;
                return (
                  <TouchableOpacity
                    onPress={() => {
                      onChange(item);
                      setOpen(false);
                    }}
                    style={[
                      styles.row,
                      selected && { backgroundColor: colors.cardGlow },
                    ]}
                  >
                    <Text style={styles.rowFlag}>{item.flag}</Text>
                    <Text style={[styles.rowName, { color: colors.text }]}>
                      {item.name}
                    </Text>
                    <Text style={[styles.rowCode, { color: colors.textMuted }]}>
                      +{item.callingCode}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: 'center',
    minHeight: 50,
  },
  pillText: {
    fontSize: 15,
    fontWeight: '600',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '60%',
  },
  sheetTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  rowFlag: {
    fontSize: 20,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  rowCode: {
    fontSize: 14,
  },
});
