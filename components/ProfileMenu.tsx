import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ThemedInput } from '@/components/ui/ThemedInput';
import { Colors } from '@/constants/theme';
import { useFlightPrefix } from '@/hooks/add-monthly.hooks';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '@/stores/use-auth-store';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown } from 'react-native-reanimated';

type ProfileMenuProps = {
  visible: boolean;
  onClose: () => void;
};

export function ProfileMenu({visible, onClose}: ProfileMenuProps) {
  const colorScheme = useColorScheme();
  const {profile, signOut, isLoading} = useAuthStore();
  const themeColors = Colors[colorScheme ?? 'light'];
  const [isSigningOut, setIsSigningOut] = useState(false);
  const {prefix, isLoading: isLoadingPrefix, updatePrefix} = useFlightPrefix();

  const getUserInitials = () => {
    if (!profile?.full_name) return 'U';
    const names = profile.full_name.trim().split(' ');
    if (names.length >= 2) {
      return (names[0][0] + names[names.length - 1][0]).toUpperCase();
    }
    return profile.full_name.substring(0, 2).toUpperCase();
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setIsSigningOut(true);
          try {
            await signOut();
            router.replace('/auth/welcome');
          } catch (error) {
            console.error('[ProfileMenu] Sign out error:', error);
            Alert.alert('Error', 'Failed to sign out. Please try again.');
          } finally {
            setIsSigningOut(false);
            onClose();
          }
        },
      },
    ]);
  };

  const handleViewProfile = () => {
    onClose();
    // Navigate to profile screen when implemented
    // router.push('/profile');
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          style={styles.overlayBackground}
        />
        <Animated.View
          entering={FadeInDown.duration(200)}
          exiting={FadeOutDown.duration(200)}
          style={[styles.menuContainer, {backgroundColor: themeColors.background}]}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            {/* Header */}
            <View style={[styles.header, {borderBottomColor: themeColors.border}]}>
              <View style={[styles.avatarContainer, {backgroundColor: themeColors.tint}]}>
                {profile?.avatar_url ? (
                  <ThemedText className="text-2xl">🦃</ThemedText>
                ) : (
                  <ThemedText className="text-xl font-black" style={{color: '#FFFFFF'}}>
                    {getUserInitials()}
                  </ThemedText>
                )}
              </View>
              <View style={styles.userInfo}>
                <ThemedText className="text-lg font-bold">
                  {profile?.full_name || 'User'}
                </ThemedText>
                <ThemedText className="text-sm text-gray-500 dark:text-gray-400">
                  {profile?.email || ''}
                </ThemedText>
              </View>
            </View>

            {/* Menu Items */}
            <View style={styles.menuItems}>
              <TouchableOpacity
                style={[styles.menuItem, {borderBottomColor: themeColors.border}]}
                onPress={handleViewProfile}>
                <View style={styles.menuItemLeft}>
                  <View style={[styles.iconContainer, {backgroundColor: `${themeColors.tint}15`}]}>
                    <Ionicons name="person-outline" size={20} color={themeColors.tint} />
                  </View>
                  <ThemedText className="text-base font-medium">View Profile</ThemedText>
                </View>
                <Ionicons
                  name="chevron-forward-outline"
                  size={20}
                  color={themeColors.text}
                  style={{opacity: 0.5}}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItem, {borderBottomColor: themeColors.border}]}
                onPress={onClose}>
                <View style={styles.menuItemLeft}>
                  <View style={[styles.iconContainer, {backgroundColor: `${themeColors.tint}15`}]}>
                    <Ionicons name="settings-outline" size={20} color={themeColors.tint} />
                  </View>
                  <ThemedText className="text-base font-medium">Settings</ThemedText>
                </View>
                <Ionicons
                  name="chevron-forward-outline"
                  size={20}
                  color={themeColors.text}
                  style={{opacity: 0.5}}
                />
              </TouchableOpacity>

              {/* Flight Code Prefix Setting */}
              <ThemedView
                className="px-4 py-4 border-b"
                style={{
                  borderBottomColor: themeColors.border,
                  borderRadius: 0,
                  backgroundColor: 'transparent',
                }}>
                <View className="flex-row items-center mb-2 gap-3">
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center"
                    style={{backgroundColor: `${themeColors.tint}15`}}>
                    <Ionicons name="airplane-outline" size={20} color={themeColors.tint} />
                  </View>
                  <View className="flex-1 flex-row items-center justify-between">
                    <ThemedText className="text-base font-semibold">Flight Code Prefix</ThemedText>
                    {!isLoadingPrefix && (
                      <ThemedText
                        className="text-sm font-mono px-2 py-1 rounded"
                        style={{
                          backgroundColor: prefix
                            ? `${themeColors.tint}15`
                            : themeColors.background,
                          color: prefix ? themeColors.tint : themeColors.text,
                          opacity: prefix ? 1 : 0.5,
                        }}>
                        {prefix || 'Not set'}
                      </ThemedText>
                    )}
                  </View>
                </View>
                {!isLoadingPrefix && (
                  <View className="gap-2">
                    <ThemedInput
                      label="Airline Code"
                      placeholder="e.g., EK, SQ, CX"
                      value={prefix || ''}
                      onChangeText={async (text) => {
                        try {
                          await updatePrefix(text);
                        } catch (error) {
                          console.error('[ProfileMenu] Error updating prefix:', error);
                          Alert.alert('Error', 'Failed to save prefix. Please try again.');
                        }
                      }}
                      autoCapitalize="characters"
                      maxLength={3}
                      containerClassName="mt-1"
                      className="font-mono text-xl tracking-wide"
                    />
                    {!!prefix && (
                      <View className="flex-row items-center mt-1 gap-1">
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color={themeColors.tint}
                          style={{marginRight: 4}}
                        />
                        <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                          Prefix: <ThemedText className="font-semibold">{prefix}</ThemedText> (will
                          be prepended to flight numbers)
                        </ThemedText>
                      </View>
                    )}
                  </View>
                )}
              </ThemedView>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleSignOut}
                disabled={isSigningOut}>
                <View style={styles.menuItemLeft}>
                  <View style={[styles.iconContainer, {backgroundColor: '#EF444415'}]}>
                    <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                  </View>
                  <ThemedText className="text-base font-medium" style={{color: '#EF4444'}}>
                    Sign Out
                  </ThemedText>
                </View>
                {isSigningOut && <ActivityIndicator size="small" color="#EF4444" />}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlayBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  menuContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  userInfo: {
    flex: 1,
  },
  menuItems: {
    paddingVertical: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  prefixSection: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingVertical: 16,
  },
  prefixHeader: {
    width: '100%',
  },
  prefixInputContainer: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  prefixInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
});
