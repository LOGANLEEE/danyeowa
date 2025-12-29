import { useColorScheme } from '@/hooks/use-color-scheme';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

// Burgundy color palette
const BURGUNDY_PRIMARY = '#800020';
const BURGUNDY_DARK = '#5C0015';
const BURGUNDY_LIGHT = '#A0002A';
const BURGUNDY_ACCENT = '#B80035';
const BURGUNDY_DEEP = '#4A0010';

export function AnimatedWelcomeBackground() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Shared values for animations
  const cloud1X = useSharedValue(0);
  const cloud2X = useSharedValue(0);
  const cloud3X = useSharedValue(0);
  const planeY = useSharedValue(height * 0.3);
  const planeX = useSharedValue(-100);
  const bean1Rotation = useSharedValue(0);
  const bean2Rotation = useSharedValue(0);
  const bean3Rotation = useSharedValue(0);
  const waveOffset = useSharedValue(0);
  const particle1Y = useSharedValue(height * 0.6);
  const particle2Y = useSharedValue(height * 0.7);
  const particle3Y = useSharedValue(height * 0.65);

  useEffect(() => {
    // Continuous rotation for coffee beans
    bean1Rotation.value = withRepeat(
      withTiming(360, {
        duration: 15000,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    bean2Rotation.value = withRepeat(
      withTiming(-360, {
        duration: 18000,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    bean3Rotation.value = withRepeat(
      withTiming(360, {
        duration: 17000,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    // Floating clouds
    cloud1X.value = withRepeat(
      withTiming(width + 200, {
        duration: 30000,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    cloud2X.value = withRepeat(
      withTiming(width + 200, {
        duration: 35000,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    cloud3X.value = withRepeat(
      withTiming(width + 200, {
        duration: 40000,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    // Flying plane animation
    planeX.value = withRepeat(
      withTiming(width + 200, {
        duration: 25000,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      false,
    );

    planeY.value = withRepeat(
      withTiming(height * 0.3 + 50, {
        duration: 3000,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );

    // Wave animation
    waveOffset.value = withRepeat(
      withTiming(360, {
        duration: 4000,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    // Floating particles (roasting smoke/steam)
    particle1Y.value = withRepeat(
      withTiming(-100, {
        duration: 8000,
        easing: Easing.out(Easing.ease),
      }),
      -1,
      false,
    );

    particle2Y.value = withRepeat(
      withTiming(-100, {
        duration: 10000,
        easing: Easing.out(Easing.ease),
      }),
      -1,
      false,
    );

    particle3Y.value = withRepeat(
      withTiming(-100, {
        duration: 9000,
        easing: Easing.out(Easing.ease),
      }),
      -1,
      false,
    );
  }, []);

  // Animated styles
  const cloud1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: cloud1X.value }],
    opacity: interpolate(
      cloud1X.value,
      [-200, 0, width, width + 200],
      [0, 0.3, 0.3, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const cloud2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: cloud2X.value }],
    opacity: interpolate(
      cloud2X.value,
      [-200, 0, width, width + 200],
      [0, 0.25, 0.25, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const cloud3Style = useAnimatedStyle(() => ({
    transform: [{ translateX: cloud3X.value }],
    opacity: interpolate(
      cloud3X.value,
      [-200, 0, width, width + 200],
      [0, 0.2, 0.2, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const planeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: planeX.value },
      { translateY: planeY.value },
      { rotate: `${interpolate(planeY.value, [height * 0.3, height * 0.35], [0, -5], Extrapolation.CLAMP)}deg` },
    ],
    opacity: interpolate(
      planeX.value,
      [-100, 0, width, width + 200],
      [0, 0.8, 0.8, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const bean1Style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${bean1Rotation.value}deg` }],
  }));

  const bean2Style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${bean2Rotation.value}deg` }],
  }));

  const bean3Style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${bean3Rotation.value}deg` }],
  }));

  const particle1Style = useAnimatedStyle(() => ({
    transform: [{ translateY: particle1Y.value }],
    opacity: interpolate(
      particle1Y.value,
      [height * 0.6, height * 0.3, -100],
      [0, 0.6, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const particle2Style = useAnimatedStyle(() => ({
    transform: [{ translateY: particle2Y.value }],
    opacity: interpolate(
      particle2Y.value,
      [height * 0.7, height * 0.35, -100],
      [0, 0.5, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const particle3Style = useAnimatedStyle(() => ({
    transform: [{ translateY: particle3Y.value }],
    opacity: interpolate(
      particle3Y.value,
      [height * 0.65, height * 0.32, -100],
      [0, 0.55, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const waveStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          waveOffset.value,
          [0, 360],
          [0, width],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <LinearGradient
      colors={
        isDark
          ? [BURGUNDY_DEEP, BURGUNDY_DARK, BURGUNDY_PRIMARY]
          : [BURGUNDY_PRIMARY, BURGUNDY_LIGHT, BURGUNDY_ACCENT]
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}>
      {/* Animated Clouds */}
      <Animated.View style={[styles.cloud, styles.cloud1, cloud1Style]}>
        <CloudSVG size={120} opacity={0.4} />
      </Animated.View>
      <Animated.View style={[styles.cloud, styles.cloud2, cloud2Style]}>
        <CloudSVG size={100} opacity={0.3} />
      </Animated.View>
      <Animated.View style={[styles.cloud, styles.cloud3, cloud3Style]}>
        <CloudSVG size={140} opacity={0.35} />
      </Animated.View>

      {/* Flying Plane */}
      <Animated.View style={[styles.plane, planeStyle]}>
        <PlaneSVG size={60} />
      </Animated.View>

      {/* Rotating Coffee Beans */}
      <Animated.View style={[styles.bean, styles.bean1, bean1Style]}>
        <CoffeeBeanSVG size={80} />
      </Animated.View>
      <Animated.View style={[styles.bean, styles.bean2, bean2Style]}>
        <CoffeeBeanSVG size={70} />
      </Animated.View>
      <Animated.View style={[styles.bean, styles.bean3, bean3Style]}>
        <CoffeeBeanSVG size={75} />
      </Animated.View>

      {/* Floating Particles (Roasting Steam) */}
      <Animated.View style={[styles.particle, styles.particle1, particle1Style]}>
        <ParticleSVG size={40} />
      </Animated.View>
      <Animated.View style={[styles.particle, styles.particle2, particle2Style]}>
        <ParticleSVG size={35} />
      </Animated.View>
      <Animated.View style={[styles.particle, styles.particle3, particle3Style]}>
        <ParticleSVG size={45} />
      </Animated.View>

      {/* Animated Wave Pattern */}
      <Animated.View style={[styles.waveContainer, waveStyle]}>
        <WavePatternSVG width={width * 2} height={height} />
      </Animated.View>
    </LinearGradient>
  );
}

// SVG Components
function CloudSVG({ size, opacity = 0.5 }: { size: number; opacity?: number }) {
  return (
    <Animated.View
      style={{
        width: size,
        height: size * 0.6,
        opacity,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderRadius: size / 2,
      }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size * 0.6,
          height: size * 0.6,
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          borderRadius: size * 0.3,
          left: -size * 0.2,
          top: -size * 0.1,
        }}
      />
      <Animated.View
        style={{
          position: 'absolute',
          width: size * 0.5,
          height: size * 0.5,
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          borderRadius: size * 0.25,
          right: -size * 0.15,
          top: -size * 0.1,
        }}
      />
    </Animated.View>
  );
}

function PlaneSVG({ size }: { size: number }) {
  return (
    <Animated.View style={{ width: size, height: size }}>
      {/* Plane body */}
      <Animated.View
        style={{
          width: size * 0.6,
          height: size * 0.15,
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          borderRadius: size * 0.075,
          position: 'absolute',
          left: size * 0.2,
          top: size * 0.425,
        }}
      />
      {/* Wings */}
      <Animated.View
        style={{
          width: size * 0.4,
          height: size * 0.1,
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          borderRadius: size * 0.05,
          position: 'absolute',
          left: size * 0.3,
          top: size * 0.45,
          transform: [{ rotate: '-45deg' }],
        }}
      />
      <Animated.View
        style={{
          width: size * 0.4,
          height: size * 0.1,
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          borderRadius: size * 0.05,
          position: 'absolute',
          left: size * 0.3,
          bottom: size * 0.45,
          transform: [{ rotate: '45deg' }],
        }}
      />
      {/* Tail */}
      <Animated.View
        style={{
          width: size * 0.15,
          height: size * 0.3,
          backgroundColor: 'rgba(255, 255, 255, 0.7)',
          borderRadius: size * 0.075,
          position: 'absolute',
          right: size * 0.1,
          top: size * 0.35,
        }}
      />
    </Animated.View>
  );
}

function CoffeeBeanSVG({ size }: { size: number }) {
  return (
    <Animated.View
      style={{
        width: size,
        height: size * 0.7,
        backgroundColor: 'rgba(60, 30, 15, 0.6)',
        borderRadius: size * 0.35,
        borderWidth: 2,
        borderColor: 'rgba(139, 69, 19, 0.8)',
        position: 'relative',
      }}>
      {/* Bean crack line */}
      <Animated.View
        style={{
          width: size * 0.6,
          height: 2,
          backgroundColor: 'rgba(139, 69, 19, 0.9)',
          position: 'absolute',
          left: size * 0.2,
          top: size * 0.35,
          borderRadius: 1,
        }}
      />
    </Animated.View>
  );
}

function ParticleSVG({ size }: { size: number }) {
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.5)',
      }}
    />
  );
}

function WavePatternSVG({ width, height }: { width: number; height: number }) {
  return (
    <Animated.View
      style={{
        width,
        height,
        opacity: 0.1,
      }}>
      {/* Wave pattern using multiple curved lines */}
      {Array.from({ length: 5 }).map((_, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            width: '100%',
            height: 2,
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
            top: (height / 6) * (i + 1),
            borderRadius: 1,
          }}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cloud: {
    position: 'absolute',
  },
  cloud1: {
    top: height * 0.1,
    left: -200,
  },
  cloud2: {
    top: height * 0.25,
    left: -200,
  },
  cloud3: {
    top: height * 0.15,
    left: -200,
  },
  plane: {
    position: 'absolute',
    left: -100,
  },
  bean: {
    position: 'absolute',
  },
  bean1: {
    left: width * 0.1,
    top: height * 0.5,
  },
  bean2: {
    right: width * 0.15,
    top: height * 0.6,
  },
  bean3: {
    left: width * 0.5,
    bottom: height * 0.2,
  },
  particle: {
    position: 'absolute',
  },
  particle1: {
    left: width * 0.2,
    top: height * 0.6,
  },
  particle2: {
    left: width * 0.6,
    top: height * 0.7,
  },
  particle3: {
    left: width * 0.4,
    top: height * 0.65,
  },
  waveContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});

