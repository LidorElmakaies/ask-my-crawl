import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import CountrySelect from '../../src/components/CountrySelect';
import GlowCard from '../../src/components/GlowCard';
import GradientButton from '../../src/components/GradientButton';
import InputField from '../../src/components/InputField';
import SpaceBackground from '../../src/components/SpaceBackground';
import { useAppTheme } from '../../src/hooks/useAppTheme';
import { clearAuthError, registerUser } from '../../src/store/slices/authSlice';
import {
  DEFAULT_PHONE_COUNTRY,
  formatNationalNumber,
  getPhoneErrorMessage,
  isValidPhoneForCountry,
  toE164,
} from '../../src/utils/phoneCountries';
import { getPasswordError, isValidEmail } from '../../src/utils/validation';

// Post-register redirect into the app is handled centrally by AuthGate (app/_layout.js), which
// reacts to authSlice.accessToken app-wide — this screen doesn't duplicate that navigation.
export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [phoneNumber, setPhoneNumber] = useState('');
  // One flag, set on the first submit attempt, gates every field's error text — same idea as the
  // single touchedPassword flag before, just covering all three validated fields now.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const dispatch = useDispatch();
  const router = useRouter();
  const { status, error } = useSelector((state) => state.auth);
  const { colors } = useAppTheme();

  const emailError = email.trim().length > 0 && !isValidEmail(email) ? 'Enter a valid email address' : null;
  const phoneError =
    phoneNumber.trim().length > 0 && !isValidPhoneForCountry(phoneCountry, phoneNumber)
      ? getPhoneErrorMessage(phoneCountry, phoneNumber)
      : null;
  const passwordError = getPasswordError(password);

  const canSubmit =
    email.trim().length > 0 && isValidEmail(email) && !passwordError && !phoneError;

  const handleSubmit = () => {
    setSubmitAttempted(true);
    if (!canSubmit) return;
    dispatch(
      registerUser({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
        phoneNumber: phoneNumber.trim() ? toE164(phoneCountry, phoneNumber) : undefined,
      })
    );
  };

  return (
    <SpaceBackground>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={[styles.heading, { color: colors.text }]}>Create account</Text>
          <Text style={[styles.subheading, { color: colors.textMuted }]}>
            Register to get started
          </Text>
        </View>

        <GlowCard>
          <View style={styles.fields}>
            <InputField
              label="Name (optional)"
              value={name}
              onChangeText={setName}
              placeholder="Jane Doe"
              autoCapitalize="words"
            />
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
              placeholder="At least 8 characters"
              isPassword
              error={submitAttempted ? passwordError : null}
            />
            <View style={styles.phoneField}>
              <Text style={[styles.phoneLabel, { color: colors.textMuted }]}>
                Phone (optional)
              </Text>
              <View style={styles.phoneRow}>
                <CountrySelect value={phoneCountry} onChange={setPhoneCountry} />
                <InputField
                  value={phoneNumber}
                  onChangeText={(text) => setPhoneNumber(formatNationalNumber(phoneCountry, text))}
                  placeholder={phoneCountry.example}
                  keyboardType="phone-pad"
                  error={submitAttempted ? phoneError : null}
                  style={styles.phoneInput}
                />
              </View>
            </View>
          </View>

          <GradientButton
            label="Register"
            onPress={handleSubmit}
            loading={status === 'loading'}
            disabled={status === 'loading'}
            style={styles.submit}
          />
        </GlowCard>

        {status === 'failed' && error && (
          <View
            style={[
              styles.feedback,
              { backgroundColor: colors.errorBg, borderColor: colors.errorBorder },
            ]}
          >
            <Text style={[styles.feedbackTitle, { color: colors.error }]}>✗ Error</Text>
            <Text style={[styles.feedbackBody, { color: colors.text }]}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={() => {
            dispatch(clearAuthError());
            router.push('/login');
          }}
          style={styles.switchLink}
        >
          <Text style={[styles.switchText, { color: colors.textMuted }]}>
            Already have an account?{' '}
            <Text style={[styles.switchTextBold, { color: colors.primary }]}>Log in</Text>
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
  phoneField: {
    gap: 6,
  },
  phoneLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  phoneInput: {
    flex: 1,
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
