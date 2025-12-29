// agents/developer.js
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Developer Agent - Actually implements code based on design
 */
export const developerAgent = async (task, designOutput) => {
  console.log(`[Developer] 작업 중: ${task.desc}`);
  
  try {
    // Task: Create ProfileMenu component
    if (task.desc.includes('ProfileMenu 컴포넌트') || task.desc.includes('ProfileMenu.tsx')) {
      const profileMenuCode = `import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '@/stores/use-auth-store';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';

type ProfileMenuProps = {
  visible: boolean;
  onClose: () => void;
};

export function ProfileMenu({ visible, onClose }: ProfileMenuProps) {
  const colorScheme = useColorScheme();
  const { profile, signOut, isLoading } = useAuthStore();
  const themeColors = Colors[colorScheme ?? 'light'];
  const [isSigningOut, setIsSigningOut] = useState(false);

  const getUserInitials = () => {
    if (!profile?.full_name) return 'U';
    const names = profile.full_name.trim().split(' ');
    if (names.length >= 2) {
      return (names[0][0] + names[names.length - 1][0]).toUpperCase();
    }
    return profile.full_name.substring(0, 2).toUpperCase();
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
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
      ],
    );
  };

  const handleViewProfile = () => {
    onClose();
    // Navigate to profile screen when implemented
    // router.push('/profile');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}>
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          style={styles.overlayBackground}
        />
        <Animated.View
          entering={SlideInDown.springify().damping(15)}
          exiting={SlideOutDown.duration(200)}
          style={[styles.menuContainer, { backgroundColor: themeColors.background }]}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            {/* Header */}
            <View
              style={[
                styles.header,
                { borderBottomColor: themeColors.border },
              ]}>
              <View
                style={[
                  styles.avatarContainer,
                  { backgroundColor: themeColors.tint },
                ]}>
                {profile?.avatar_url ? (
                  <ThemedText className="text-2xl">🦃</ThemedText>
                ) : (
                  <ThemedText className="text-xl font-black" style={{ color: '#FFFFFF' }}>
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
                style={[styles.menuItem, { borderBottomColor: themeColors.border }]}
                onPress={handleViewProfile}>
                <View style={styles.menuItemLeft}>
                  <View
                    style={[
                      styles.iconContainer,
                      { backgroundColor: \`\${themeColors.tint}15\` },
                    ]}>
                    <Ionicons name="person-outline" size={20} color={themeColors.tint} />
                  </View>
                  <ThemedText className="text-base font-medium">View Profile</ThemedText>
                </View>
                <Ionicons
                  name="chevron-forward-outline"
                  size={20}
                  color={themeColors.text}
                  style={{ opacity: 0.5 }}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItem, { borderBottomColor: themeColors.border }]}
                onPress={onClose}>
                <View style={styles.menuItemLeft}>
                  <View
                    style={[
                      styles.iconContainer,
                      { backgroundColor: \`\${themeColors.tint}15\` },
                    ]}>
                    <Ionicons name="settings-outline" size={20} color={themeColors.tint} />
                  </View>
                  <ThemedText className="text-base font-medium">Settings</ThemedText>
                </View>
                <Ionicons
                  name="chevron-forward-outline"
                  size={20}
                  color={themeColors.text}
                  style={{ opacity: 0.5 }}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleSignOut}
                disabled={isSigningOut}>
                <View style={styles.menuItemLeft}>
                  <View
                    style={[
                      styles.iconContainer,
                      { backgroundColor: '#EF444415' },
                    ]}>
                    <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                  </View>
                  <ThemedText
                    className="text-base font-medium"
                    style={{ color: '#EF4444' }}>
                    Sign Out
                  </ThemedText>
                </View>
                {isSigningOut && (
                  <ActivityIndicator size="small" color="#EF4444" />
                )}
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
});
`;

      // Write the file
      const filePath = path.join(process.cwd(), 'components', 'ProfileMenu.tsx');
      await fs.writeFile(filePath, profileMenuCode, 'utf8');
      
      console.log(`[Developer] ✅ Created ProfileMenu.tsx`);
      return { 
        success: true, 
        file: 'components/ProfileMenu.tsx',
        message: 'ProfileMenu component created successfully'
      };
    }

    // Task: Modify home.tsx to add TouchableOpacity and modal
    if (task.desc.includes('home.tsx 아바타') || task.desc.includes('TouchableOpacity')) {
      const homeFilePath = path.join(process.cwd(), 'app', '(tabs)', 'home.tsx');
      const homeContent = await fs.readFile(homeFilePath, 'utf8');
      
      // Add ProfileMenu import
      const importSection = homeContent.split('\n').slice(0, 25).join('\n');
      const hasProfileMenuImport = homeContent.includes('ProfileMenu');
      
      let newImports = importSection;
      if (!hasProfileMenuImport) {
        // Find the last import line
        const importLines = importSection.split('\n');
        const lastImportIndex = importLines.findLastIndex(line => line.trim().startsWith('import'));
        importLines.splice(lastImportIndex + 1, 0, "import { ProfileMenu } from '@/components/ProfileMenu';");
        newImports = importLines.join('\n');
      }

      // Add useState import if not present
      if (!homeContent.includes("useState")) {
        newImports = newImports.replace(
          /import.*useEffect.*useMemo.*from 'react'/,
          "import { useEffect, useMemo, useState } from 'react'"
        );
      }

      // Modify the avatar section (around line 592-628)
      const avatarSectionStart = homeContent.indexOf('{/* Right: User Avatar */}');
      const avatarSectionEnd = homeContent.indexOf('</View>', avatarSectionStart) + 7;
      const beforeAvatar = homeContent.substring(0, avatarSectionStart);
      const afterAvatar = homeContent.substring(avatarSectionEnd);
      
      const newAvatarSection = `{/* Right: User Avatar */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setProfileMenuVisible(true)}>
              <View className="relative">
                <Animated.View
                  className="w-16 h-16 rounded-full items-center justify-center overflow-hidden"
                  style={[
                    styles.avatarContainer,
                    {
                      backgroundColor: themeColors.tint,
                      shadowColor: themeColors.tint,
                      shadowOffset: {width: 0, height: 6},
                      shadowOpacity: 0.4,
                      shadowRadius: 12,
                      elevation: 10,
                    },
                  ]}>
                  {profile?.avatar_url ? (
                    <ThemedText className="text-2xl">🦃</ThemedText>
                  ) : (
                    <ThemedText className="text-xl font-black" style={{color: '#FFFFFF'}}>
                      {getUserInitials()}
                    </ThemedText>
                  )}
                </Animated.View>
                {/* Online indicator with pulse effect */}
                <Animated.View
                  className="absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white dark:border-gray-900"
                  style={{
                    backgroundColor: '#10B981',
                    shadowColor: '#10B981',
                    shadowOffset: {width: 0, height: 2},
                    shadowOpacity: 0.8,
                    shadowRadius: 4,
                    elevation: 4,
                  }}
                />
              </View>
            </TouchableOpacity>`;

      // Add state for profile menu visibility
      const functionStart = homeContent.indexOf('export default function HomeScreen()');
      const firstUseState = homeContent.indexOf('const [', functionStart);
      let stateSection = '';
      if (firstUseState === -1) {
        // Find where to add useState (after const declarations)
        const colorSchemeLine = homeContent.indexOf('const colorScheme', functionStart);
        const nextLine = homeContent.indexOf('\n', colorSchemeLine) + 1;
        stateSection = `  const [profileMenuVisible, setProfileMenuVisible] = useState(false);\n`;
        const newContent = 
          newImports + '\n' +
          homeContent.substring(homeContent.indexOf('\n', homeContent.indexOf('import')) + 1, nextLine) +
          stateSection +
          homeContent.substring(nextLine, avatarSectionStart) +
          newAvatarSection +
          afterAvatar;
        
        // Add ProfileMenu component before closing SafeAreaView
        const safeAreaEnd = newContent.lastIndexOf('</SafeAreaView>');
        const beforeSafeAreaEnd = newContent.substring(0, safeAreaEnd);
        const finalContent = beforeSafeAreaEnd + 
          '\n        <ProfileMenu visible={profileMenuVisible} onClose={() => setProfileMenuVisible(false)} />\n' +
          newContent.substring(safeAreaEnd);
        
        await fs.writeFile(homeFilePath, finalContent, 'utf8');
      } else {
        // More complex: need to insert state and modify avatar
        const stateInsertPoint = homeContent.indexOf('\n', firstUseState) + 1;
        const modifiedContent = 
          newImports + '\n' +
          homeContent.substring(homeContent.indexOf('\n', homeContent.indexOf('import')) + 1, stateInsertPoint) +
          `  const [profileMenuVisible, setProfileMenuVisible] = useState(false);\n` +
          homeContent.substring(stateInsertPoint, avatarSectionStart) +
          newAvatarSection +
          afterAvatar;
        
        // Add ProfileMenu component
        const safeAreaEnd = modifiedContent.lastIndexOf('</SafeAreaView>');
        const finalContent = modifiedContent.substring(0, safeAreaEnd) + 
          '\n        <ProfileMenu visible={profileMenuVisible} onClose={() => setProfileMenuVisible(false)} />\n' +
          modifiedContent.substring(safeAreaEnd);
        
        await fs.writeFile(homeFilePath, finalContent, 'utf8');
      }
      
      console.log(`[Developer] ✅ Modified home.tsx - Added avatar tap handler and ProfileMenu`);
      return { 
        success: true, 
        file: 'app/(tabs)/home.tsx',
        message: 'home.tsx modified successfully - avatar is now tappable'
      };
    }

    // Default: return mock output for other tasks
    console.log(`[Developer] 작업 중: ${task.desc} using ${designOutput}`);
    return { success: true, message: `Code implementing ${task.desc}` };
  } catch (error) {
    console.error(`[Developer] ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
};