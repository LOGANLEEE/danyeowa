import useAuth from '@/hooks/useAuth';
import { Redirect } from 'expo-router';

export default function Index() {
  // Redirect to the auth flow
  const {isAuthenticated} = useAuth();

  return <Redirect href={isAuthenticated ? '/(tabs)/home' : '/auth/index'} />;
  // return <Redirect href={__DEV__ ? '/(tabs)/home' : '/auth/login'} />;
}
