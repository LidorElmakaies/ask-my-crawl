import { Stack } from 'expo-router';

// Mirrors the root layout's Stack (headerShown: false) — same pattern, just scoped to the
// unauthenticated login/register routes.
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
