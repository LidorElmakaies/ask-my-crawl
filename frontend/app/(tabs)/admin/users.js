import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import GlowCard from '../../../src/components/GlowCard';
import GradientButton from '../../../src/components/GradientButton';
import InputField from '../../../src/components/InputField';
import SpaceBackground from '../../../src/components/SpaceBackground';
import { useAppTheme } from '../../../src/hooks/useAppTheme';
import {
  clearAdminError,
  fetchUsers,
  removeUser,
  updateUser,
} from '../../../src/store/slices/adminSlice';

const ROLES = ['user', 'admin'];

function RolePicker({ value, onChange, colors }) {
  return (
    <View style={styles.roleRow}>
      {ROLES.map((role) => {
        const active = value === role;
        return (
          <TouchableOpacity
            key={role}
            onPress={() => onChange(role)}
            style={[
              styles.rolePill,
              {
                backgroundColor: active ? colors.primary : colors.inputBg,
                borderColor: active ? colors.primary : colors.inputBorder,
              },
            ]}
          >
            <Text
              style={[
                styles.rolePillText,
                { color: active ? colors.onPrimary : colors.textMuted },
              ]}
            >
              {role}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function AdminUsersScreen() {
  const dispatch = useDispatch();
  const { colors } = useAppTheme();
  const { users, status, error } = useSelector((state) => state.admin);
  const currentUserId = useSelector((state) => state.auth.user?.id);

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    email: '',
    phone_number: '',
    role: 'user',
  });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

  const startEdit = (user) => {
    setConfirmDeleteId(null);
    setEditingId(user.id);
    setForm({
      email: user.email,
      phone_number: user.phone_number ?? '',
      role: user.role,
    });
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = (id) => {
    dispatch(
      updateUser({
        id,
        patch: {
          email: form.email.trim(),
          phone_number: form.phone_number.trim(),
          role: form.role,
        },
      }),
    ).then((action) => {
      if (!action.error) setEditingId(null);
    });
  };

  const isSaving = status === 'loading';

  return (
    <SpaceBackground>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.heading, { color: colors.text }]}>
          User Management
        </Text>

        {status === 'loading' && users.length === 0 && (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={styles.loader}
          />
        )}

        {error && (
          <View
            style={[
              styles.feedback,
              {
                backgroundColor: colors.errorBg,
                borderColor: colors.errorBorder,
              },
            ]}
          >
            <Text style={[styles.feedbackTitle, { color: colors.error }]}>
              ✗ Error
            </Text>
            <Text style={[styles.feedbackBody, { color: colors.text }]}>
              {error}
            </Text>
            <TouchableOpacity
              onPress={() => {
                dispatch(clearAdminError());
                dispatch(fetchUsers());
              }}
            >
              <Text style={[styles.retryText, { color: colors.primary }]}>
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {users.map((user) => {
          const isEditing = editingId === user.id;
          const isConfirmingDelete = confirmDeleteId === user.id;

          return (
            <GlowCard key={user.id} style={styles.row}>
              {isEditing ? (
                <View style={styles.editForm}>
                  <InputField
                    label="Email"
                    value={form.email}
                    onChangeText={(email) => setForm((f) => ({ ...f, email }))}
                    keyboardType="email-address"
                  />
                  <InputField
                    label="Phone"
                    value={form.phone_number}
                    onChangeText={(phone_number) =>
                      setForm((f) => ({ ...f, phone_number }))
                    }
                    keyboardType="phone-pad"
                  />
                  <View style={styles.wrapper}>
                    <Text
                      style={[styles.fieldLabel, { color: colors.textMuted }]}
                    >
                      Role
                    </Text>
                    <RolePicker
                      value={form.role}
                      onChange={(role) => setForm((f) => ({ ...f, role }))}
                      colors={colors}
                    />
                  </View>
                  <View style={styles.actionsRow}>
                    <GradientButton
                      label="Save"
                      onPress={() => saveEdit(user.id)}
                      loading={isSaving}
                      style={styles.actionButton}
                    />
                    <TouchableOpacity
                      onPress={cancelEdit}
                      style={styles.cancelButton}
                    >
                      <Text
                        style={[styles.cancelText, { color: colors.textMuted }]}
                      >
                        Cancel
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.readRow}>
                  <View style={styles.readInfo}>
                    <Text style={[styles.email, { color: colors.text }]}>
                      {user.email}
                    </Text>
                    <Text style={[styles.meta, { color: colors.textMuted }]}>
                      {user.phone_number || 'No phone'} ·{' '}
                      <Text
                        style={{
                          color:
                            user.role === 'admin'
                              ? colors.primary
                              : colors.textMuted,
                        }}
                      >
                        {user.role}
                      </Text>
                      {user.id === currentUserId ? ' · you' : ''}
                    </Text>
                  </View>

                  {isConfirmingDelete ? (
                    <View style={styles.confirmRow}>
                      <Text
                        style={[styles.confirmText, { color: colors.error }]}
                      >
                        Delete this user?
                      </Text>
                      <TouchableOpacity
                        onPress={() => dispatch(removeUser(user.id))}
                        style={[
                          styles.confirmButton,
                          { backgroundColor: colors.error },
                        ]}
                      >
                        <Text style={styles.confirmButtonText}>
                          Yes, delete
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setConfirmDeleteId(null)}
                      >
                        <Text
                          style={[
                            styles.cancelText,
                            { color: colors.textMuted },
                          ]}
                        >
                          Cancel
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        onPress={() => startEdit(user)}
                        style={styles.iconButton}
                      >
                        <Text
                          style={[
                            styles.iconButtonText,
                            { color: colors.primary },
                          ]}
                        >
                          Edit
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setConfirmDeleteId(user.id)}
                        style={styles.iconButton}
                      >
                        <Text
                          style={[
                            styles.iconButtonText,
                            { color: colors.error },
                          ]}
                        >
                          Delete
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </GlowCard>
          );
        })}

        {status === 'succeeded' && users.length === 0 && (
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            No users found.
          </Text>
        )}
      </ScrollView>
    </SpaceBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 24,
    gap: 16,
  },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  loader: {
    marginTop: 40,
  },
  row: {
    padding: 18,
  },
  readRow: {
    gap: 12,
  },
  readInfo: {
    gap: 2,
  },
  email: {
    fontSize: 15,
    fontWeight: '700',
  },
  meta: {
    fontSize: 13,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  actionButton: {
    flex: 1,
  },
  iconButton: {
    paddingVertical: 4,
  },
  iconButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  cancelButton: {
    paddingHorizontal: 8,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  confirmText: {
    fontSize: 13,
    fontWeight: '600',
  },
  confirmButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  confirmButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  editForm: {
    gap: 14,
  },
  wrapper: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  rolePill: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  rolePillText: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  feedback: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  feedbackTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  feedbackBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
});
