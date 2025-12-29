import { type ReactNode, type RefObject } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

export type ScreenContainerProps = {
  children: ReactNode;
  edges?: Edge[];
  keyboardBehavior?: 'padding' | 'height' | 'position' | undefined;
  scrollViewProps?: Omit<ScrollViewProps, 'contentContainerStyle' | 'contentContainerClassName'>;
  scrollViewRef?: RefObject<ScrollView>;
  className?: string;
  contentClassName?: string;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  showScrollIndicator?: boolean;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
  /** Whether to wrap content in ScrollView. Default: true */
  scrollable?: boolean;
  /** Whether to use KeyboardAvoidingView. Default: true */
  enableKeyboardAvoiding?: boolean;
};

/**
 * Reusable screen container with SafeAreaView, optional KeyboardAvoidingView, and optional ScrollView
 * Consolidates common screen layout patterns for better token efficiency
 */
export function ScreenContainer({
  children,
  edges = [],
  keyboardBehavior = Platform.OS === 'ios' ? 'padding' : undefined,
  scrollViewProps,
  scrollViewRef,
  className = '',
  contentClassName = '',
  contentContainerStyle,
  showScrollIndicator = false,
  keyboardShouldPersistTaps = 'handled',
  scrollable = true,
  enableKeyboardAvoiding = true,
}: ScreenContainerProps) {
  const content = scrollable ? (
    <ScrollView
      ref={scrollViewRef}
      showsVerticalScrollIndicator={showScrollIndicator}
      className="flex-1"
      contentContainerClassName={contentClassName || 'flex-grow'}
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...scrollViewProps}>
      {children}
    </ScrollView>
  ) : (
    <View className={`flex-1 ${contentClassName}`} style={contentContainerStyle}>
      {children}
    </View>
  );

  const wrappedContent = enableKeyboardAvoiding ? (
    <KeyboardAvoidingView behavior={keyboardBehavior} className="flex-1">
      {content}
    </KeyboardAvoidingView>
  ) : (
    content
  );

  return (
    <SafeAreaView edges={edges} className={`flex-1 ${className}`}>
      {wrappedContent}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
});
