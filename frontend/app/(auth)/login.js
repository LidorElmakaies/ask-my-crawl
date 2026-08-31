import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import GlowCard from '../../src/components/GlowCard';
import GradientButton from '../../src/components/GradientButton';
import InputField from '../../src/components/InputField';
import SpaceBackground from '../../src/components/SpaceBackground';
import { useAppTheme } from '../../src/hooks/useAppTheme';
import { clearAuthError, loginUser } from '../../src/store/slices/authSlice';
import { isValidEmail } from '../../src/utils/validation';

// Post-login redirect into the app is handled centrally by AuthGate (app/_layout.js), which
// reacts to authSlice.accessToken app-wide — this screen doesn't duplicate that navigation.
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const dispatch = useDispatch();
  const router = useRouter();
  const { status, error } = useSelector((state) => state.auth);
  const { colors } = useAppTheme();

  // Format only, no complexity check — an existing account's password may predate the register
  // screen's complexity rule, login just needs to know both fields were filled in and look sane.
  const emailError =
    email.trim().length > 0 && !isValidEmail(email)
      ? 'Enter a valid email address'
      : null;
  const canSubmit =
    email.trim().length > 0 && isValidEmail(email) && password.length > 0;

  const handleSubmit = () => {
    setSubmitAttempted(true);
    if (!canSubmit) return;
    dispatch(loginUser({ email: email.trim(), password }));
  };

  return (
    <SpaceBackground>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.heading, { color: colors.text }]}>
            Welcome back
          </Text>
          <Text style={[styles.subheading, { color: colors.textMuted }]}>
            Log in to continue
          </Text>
        </View>

        <GlowCard>
          <View style={styles.fields}>
            <InputField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              error={submitAttempted ? emailError : null}
            />
            <InputField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              isPassword
            />
          </View>

          <GradientButton
            label="Log In"
            onPress={handleSubmit}
            loading={status === 'loading'}
            disabled={!canSubmit}
            style={styles.submit}
          />
        </GlowCard>

        {status === 'failed' && error && (
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
          </View>
        )}

        <TouchableOpacity
          onPress={() => {
            dispatch(clearAuthError());
            router.push('/register');
          }}
          style={styles.switchLink}
        >
          <Text style={[styles.switchText, { color: colors.textMuted }]}>
            Don&apos;t have an account?{' '}
            <Text style={[styles.switchTextBold, { color: colors.primary }]}>
              Register
            </Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SpaceBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 24,
    gap: 20,
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    gap: 4,
    marginBottom: 4,
  },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subheading: {
    fontSize: 14,
  },
  fields: {
    gap: 16,
    marginBottom: 16,
  },
  submit: {
    marginTop: 0,
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
  switchLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchText: {
    fontSize: 14,
    textAlign: 'center',
  },
  switchTextBold: {
    fontWeight: '700',
  },
});
