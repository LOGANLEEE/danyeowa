import { Easing, withSpring, withTiming, withSequence, withDelay } from 'react-native-reanimated';

/**
 * High-quality animation utilities for consistent animations across the app
 * All animations are optimized for performance and visual polish
 */

// Spring animation configurations - tuned for natural motion
export const springConfig = {
  damping: 15,
  stiffness: 150,
  mass: 1,
};

// Gentle spring - smooth, subtle motion
export const gentleSpringConfig = {
  damping: 20,
  stiffness: 120,
  mass: 0.8,
};

// Bouncy spring - playful, energetic motion
export const bouncySpringConfig = {
  damping: 10,
  stiffness: 200,
  mass: 1,
};

// Snappy spring - quick, responsive motion
export const snappySpringConfig = {
  damping: 18,
  stiffness: 300,
  mass: 0.5,
};

// Smooth spring - fluid, elegant motion
export const smoothSpringConfig = {
  damping: 22,
  stiffness: 180,
  mass: 0.6,
};

// Text spring - optimized for text animations
export const textSpringConfig = {
  damping: 22,
  stiffness: 180,
  mass: 0.5,
};

// View spring - optimized for view animations
export const viewSpringConfig = {
  damping: 18,
  stiffness: 120,
  mass: 0.8,
};

// Easing curves for timing animations
export const easingCurves = {
  // Smooth entrance
  easeOut: Easing.out(Easing.cubic),
  easeIn: Easing.in(Easing.cubic),
  easeInOut: Easing.inOut(Easing.cubic),
  // Natural motion
  easeOutCubic: Easing.out(Easing.cubic),
  easeInOutCubic: Easing.inOut(Easing.cubic),
  // Smooth and fast
  easeOutExpo: Easing.out(Easing.exp),
  // Elastic feel
  easeOutBack: Easing.out(Easing.back(1.5)),
};

/**
 * Fade in animation with smooth easing
 */
export const fadeIn = (duration = 400, delay = 0) => {
  if (delay > 0) {
    return withDelay(delay, withTiming(1, {
      duration,
      easing: easingCurves.easeOut,
    }));
  }
  return withTiming(1, {
    duration,
    easing: easingCurves.easeOut,
  });
};

/**
 * Fade out animation
 */
export const fadeOut = (duration = 300) => {
  return withTiming(0, {
    duration,
    easing: easingCurves.easeIn,
  });
};

/**
 * Bounce in animation with spring physics
 */
export const bounceIn = () => {
  return withSpring(1, bouncySpringConfig);
};

/**
 * Slide in from bottom with spring
 */
export const slideInUp = (distance = 30) => {
  return withSpring(0, {
    ...viewSpringConfig,
    damping: 20,
  });
};

/**
 * Slide in from top with spring
 */
export const slideInDown = (distance = 30) => {
  return withSpring(0, {
    ...viewSpringConfig,
    damping: 20,
  });
};

/**
 * Scale in with spring
 */
export const scaleIn = () => {
  return withSpring(1, smoothSpringConfig);
};

/**
 * Scale out animation
 */
export const scaleOut = (duration = 250) => {
  return withTiming(0.8, {
    duration,
    easing: easingCurves.easeIn,
  });
};

/**
 * Combined entrance animation: fade + slide + scale
 */
export const entranceAnimation = (delay = 0) => {
  return {
    opacity: delay > 0 
      ? withDelay(delay, withTiming(1, { duration: 450, easing: easingCurves.easeOut }))
      : withTiming(1, { duration: 450, easing: easingCurves.easeOut }),
    translateY: delay > 0
      ? withDelay(delay, withSpring(0, viewSpringConfig))
      : withSpring(0, viewSpringConfig),
    scale: delay > 0
      ? withDelay(delay, withSpring(1, smoothSpringConfig))
      : withSpring(1, smoothSpringConfig),
  };
};

/**
 * Text entrance animation - optimized for text
 */
export const textEntranceAnimation = (delay = 0) => {
  return {
    opacity: delay > 0
      ? withDelay(delay, withTiming(1, { duration: 450, easing: easingCurves.easeOut }))
      : withTiming(1, { duration: 450, easing: easingCurves.easeOut }),
    translateY: delay > 0
      ? withDelay(delay, withSpring(0, textSpringConfig))
      : withSpring(0, textSpringConfig),
    scale: delay > 0
      ? withDelay(delay, withSpring(1, textSpringConfig))
      : withSpring(1, textSpringConfig),
  };
};

/**
 * Stagger animation for lists - creates cascading effect
 */
export const staggerDelay = (index: number, baseDelay = 50) => {
  return index * baseDelay;
};

/**
 * Pulse animation - subtle breathing effect
 */
export const pulseAnimation = () => {
  return withSequence(
    withTiming(1.05, {
      duration: 600,
      easing: easingCurves.easeInOut,
    }),
    withTiming(1, {
      duration: 600,
      easing: easingCurves.easeInOut,
    })
  );
};

/**
 * Shake animation - for error states
 */
export const shakeAnimation = () => {
  return withSequence(
    withTiming(-5, { duration: 50 }),
    withTiming(5, { duration: 50 }),
    withTiming(-5, { duration: 50 }),
    withTiming(5, { duration: 50 }),
    withTiming(0, { duration: 50 })
  );
};

