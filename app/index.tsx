import { useAuthStore } from '@/stores/use-auth-store';
import { Redirect } from 'expo-router';

export default function Index() {
  const {isAuthenticated} = useAuthStore();

  return <Redirect href={isAuthenticated ? '/(tabs)/home' : '/auth/welcome'} />;
}
