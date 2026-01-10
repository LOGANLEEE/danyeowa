import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

export interface BiometricType {
  available: boolean;
  type: LocalAuthentication.AuthenticationType[];
  hasHardware: boolean;
  isEnrolled: boolean;
}

export interface BiometricAuthResult {
  success: boolean;
  error: Error | null;
  warning?: string;
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
      const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        LocalAuthentication.supportedAuthenticationTypesAsync(),
      ]);

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

  const authenticate = async (
    options?: LocalAuthentication.LocalAuthenticationOptions,
  ): Promise<BiometricAuthResult> => {
    try {
      // Check if biometric is available before attempting authentication
      if (!biometricInfo.available) {
        return {
          success: false,
          error: new Error('Biometric authentication is not available'),
        };
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to sign in',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
        ...options,
      });

      if (result.success) {
        return {
          success: true,
          error: null,
        };
      }

      // Handle specific error cases
      let errorMessage = 'Biometric authentication failed';
      if (result.error) {
        switch (result.error) {
          case 'user_cancel':
            errorMessage = 'User canceled authentication';
            break;
          case 'user_fallback':
            errorMessage = 'User chose to use passcode';
            break;
          case 'system_cancel':
            errorMessage = 'Authentication was cancelled by the system';
            break;
          case 'app_cancel':
            errorMessage = 'Authentication was cancelled by the app';
            break;
          case 'not_enrolled':
            errorMessage = 'No biometric data enrolled';
            break;
          case 'not_available':
            errorMessage = 'Biometric authentication is not available';
            break;
          case 'lockout':
            errorMessage = 'Too many failed attempts. Please try again later';
            break;
          case 'passcode_not_set':
            errorMessage = 'Device passcode is not set';
            break;
          case 'authentication_failed':
            errorMessage = 'Authentication failed. Please try again';
            break;
          case 'timeout':
            errorMessage = 'Authentication timed out. Please try again';
            break;
          case 'unable_to_process':
            errorMessage = 'Unable to process authentication';
            break;
          case 'invalid_context':
            errorMessage = 'Invalid authentication context';
            break;
          default:
            errorMessage = result.error;
        }
      }

      return {
        success: false,
        error: new Error(errorMessage),
        warning: 'warning' in result ? result.warning : undefined,
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

  const cancelAuthentication = async (): Promise<void> => {
    try {
      if (Platform.OS === 'android') {
        await LocalAuthentication.cancelAuthenticate();
      }
    } catch (error) {
      console.error('[Biometric] Error cancelling authentication:', error);
    }
  };

  return {
    ...biometricInfo,
    isLoading,
    authenticate,
    getBiometricName,
    cancelAuthentication,
    refresh: checkBiometricAvailability,
  };
}

