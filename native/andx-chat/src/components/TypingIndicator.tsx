import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import type { Theme } from '../theme';

interface Props {
  theme: Theme;
}

export const TypingIndicator: React.FC<Props> = ({ theme }) => {
  const dots = useRef([new Animated.Value(0.4), new Animated.Value(0.4), new Animated.Value(0.4)]).current;

  useEffect(() => {
    const animations = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(d, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.4, duration: 400, useNativeDriver: true }),
        ]),
      ),
    );
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, [dots]);

  return (
    <View style={styles.row}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: theme.accent.primary, opacity: d, transform: [{ scale: d }] },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 5, padding: 14, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
