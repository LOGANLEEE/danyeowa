import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

export interface BiometricType {
  available: boolean;
  type: LocalAuthentication.AuthenticationType[];
  hasHardware: boolean;
  isEnrolled: boolean;
}

/**
 * Hook to check biometric authentication availability and perform authentication
 */
export function useBiometric() {
  const [biometricInfo, setBiometricInfo] = useState<BiometricType>({
    available: false,
    type: [],
    hasHardware: false,
    isEnrolled: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkBiometricAvailability();
  }, []);

  const checkBiometricAvailability = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

      setBiometricInfo({
        available: hasHardware && isEnrolled,
        type: supportedTypes,
        hasHardware,
        isEnrolled,
      });
    } catch (error) {
      console.error('[Biometric] Error checking availability:', error);
      setBiometricInfo({
        available: false,
        type: [],
        hasHardware: false,
        isEnrolled: false,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const authenticate = async (options?: LocalAuthentication.LocalAuthenticationOptions) => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to sign in',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
        ...options,
      });

      return {
        success: result.success,
        error: result.error ? new Error(result.error) : null,
      };
    } catch (error) {
      console.error('[Biometric] Authentication error:', error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Biometric authentication failed'),
      };
    }
  };

  const getBiometricName = (): string => {
    if (!biometricInfo.available) {
      return 'Biometric';
    }

    if (Platform.OS === 'ios') {
      if (biometricInfo.type.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        return 'Face ID';
      }
      if (biometricInfo.type.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        return 'Touch ID';
      }
    }

    if (Platform.OS === 'android') {
      if (biometricInfo.type.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        return 'Fingerprint';
      }
      if (biometricInfo.type.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        return 'Face';
      }
      if (biometricInfo.type.includes(LocalAuthentication.AuthenticationType.IRIS)) {
        return 'Iris';
      }
    }

    return 'Biometric';
  };

  return {
    ...biometricInfo,
    isLoading,
    authenticate,
    getBiometricName,
    refresh: checkBiometricAvailability,
  };
}

