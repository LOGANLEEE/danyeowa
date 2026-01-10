import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { IconButton, Modal, Portal, Surface, Text, useTheme } from 'react-native-paper';

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
 * Uses react-native-paper components for consistent theming
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
  const theme = useTheme();

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onClose}
        contentContainerStyle={styles.modalContent}
        dismissable={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
          style={styles.keyboardView}>
          <Pressable style={styles.backdrop} onPress={onClose}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <Surface
                style={[
                  styles.surface,
                  {
                    backgroundColor: theme.colors.surface,
                    borderTopLeftRadius: 24,
                    borderTopRightRadius: 24,
                  },
                ]}
                elevation={1}>
                {(title || subtitle || showCloseButton) && (
                  <View style={styles.header}>
                    <View style={styles.headerContent}>
                      {title && (
                        <Text variant="titleLarge" style={styles.title}>
                          {title}
                        </Text>
                      )}
                      {subtitle && (
                        <Text
                          variant="bodyMedium"
                          style={[styles.subtitle, {color: theme.colors.onSurfaceVariant}]}>
                          {subtitle}
                        </Text>
                      )}
                    </View>
                    {showCloseButton && (
                      <IconButton
                        icon="close"
                        size={24}
                        iconColor={theme.colors.onSurfaceVariant}
                        onPress={onClose}
                      />
                    )}
                  </View>
                )}
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.scrollContent}>
                  {children}
                </ScrollView>
              </Surface>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  keyboardView: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  surface: {
    padding: 24,
    paddingBottom: 32,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  scrollContent: {
    // flexGrow: 1,
    height: '100%',
    // minHeight: 300,
  },
});
