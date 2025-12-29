import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/use-theme-color';
import { ActivityIndicator, Pressable, type PressableProps } from 'react-native';

type ButtonProps = PressableProps & {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline';
  isLoading?: boolean;
  fullWidth?: boolean;
};

export function ThemedButton({
  title,
  variant = 'primary',
  isLoading = false,
  fullWidth = false,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const tintColor = useThemeColor({ light: '#800020', dark: '#A0002A' }, 'tint');
  const baseStyles = 'px-8 py-6 rounded-xl items-center justify-center shadow-lg min-h-[60px]';
  const variantStyles = {
    primary: 'bg-[#800020] active:bg-[#5C0015] dark:bg-[#A0002A] dark:active:bg-[#800020]',
    secondary: 'bg-gray-200 dark:bg-gray-700 active:bg-gray-300 dark:active:bg-gray-600',
    outline: 'border-2 border-[#800020] dark:border-[#A0002A] bg-transparent',
  };
  const disabledStyles = 'opacity-50';
  const widthStyles = fullWidth ? 'w-full' : '';

  return (
    <Pressable
      className={`${baseStyles} ${variantStyles[variant]} ${disabled || isLoading ? disabledStyles : ''} ${widthStyles} ${className || ''}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'outline' ? tintColor : '#fff'} size="small" />
      ) : (
        <ThemedText
          className={`font-bold text-lg tracking-wide ${
            variant === 'outline' ? 'text-[#800020] dark:text-[#A0002A]' : 'text-white'
          }`}
        >
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}

