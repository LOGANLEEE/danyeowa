import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type ModalContainerProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  showCloseButton?: boolean;
  className?: string;
  contentClassName?: string;
};

/**
 * Reusable modal container with backdrop, rounded top corners, and close button
 * Consolidates modal patterns for better token efficiency
 */
export function ModalContainer({
  visible,
  onClose,
  title,
  subtitle,
  children,
  showCloseButton = true,
  className = '',
  contentClassName = '',
}: ModalContainerProps) {
  const colorScheme = useColorScheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <View className="flex-1 bg-black/50 justify-end">
          <ThemedView className={`rounded-t-3xl p-6 pb-8 ${contentClassName}`}>
            {(title || subtitle || showCloseButton) && (
              <View className="flex-row items-center justify-between mb-6">
                <View className="flex-1">
                  {title && (
                    <ThemedText type="subtitle" className="text-xl font-semibold mb-1">
                      {title}
                    </ThemedText>
                  )}
                  {subtitle && (
                    <ThemedText className="text-sm text-gray-500 dark:text-gray-400">
                      {subtitle}
                    </ThemedText>
                  )}
                </View>
                {showCloseButton && (
                  <TouchableOpacity onPress={onClose} className="p-2">
                    <Ionicons
                      name="close"
                      size={28}
                      color={colorScheme === 'dark' ? '#9BA1A6' : '#687076'}
                    />
                  </TouchableOpacity>
                )}
              </View>
            )}
            {children}
          </ThemedView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

