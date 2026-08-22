import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useSelector } from 'react-redux';

// Role-gates every screen under /admin/* (dashboard tiles, users list, the generic webview
// screen) — one check protecting the whole subtree, mirroring how AuthGate (app/_layout.js) gates
// the whole (tabs) group from its own layout rather than per-screen. Required per frontend.md:
// "gate these on the decoded JWT's role claim, not just on hiding a tab (a hidden tab is not
// access control; the backend enforces the real boundary)" — every /admin/* Gateway route is
// already @Roles('admin')-guarded independently, so this doesn't grant anything; it only spares a
// non-admin an ugly failed-fetch/blank-webview state by bouncing them out before they see one.
export default function AdminLayout() {
  const router = useRouter();
  const role = useSelector((state) => state.auth.user?.role);

  useEffect(() => {
    if (role !== 'admin') {
      router.replace('/');
    }
  }, [role, router]);

  if (role !== 'admin') return null;

  return <Stack screenOptions={{ headerShown: false }} />;
}
