import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { Theme } from '../theme';

interface Props {
  theme: Theme;
  visible: boolean;
  onPress: () => void;
  unread?: number;
}

export const ScrollToLatestBtn: React.FC<Props> = ({ theme, visible, onPress, unread }) => {
  if (!visible) return null;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: pressed ? '#7df7ff' : theme.accent.primary,
          shadowColor: theme.accent.primary,
        },
      ]}
    >
      <Text style={[styles.text, { color: theme.text.inverse, fontFamily: theme.font.mono }]}>
        {unread ? `▼ ${unread} NEW` : '▼ NEW'}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    right: 18,
    bottom: 96,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 3,
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 14,
    elevation: 6,
    zIndex: 50,
  },
  text: { fontSize: 10.5, fontWeight: '700', letterSpacing: 1.2 },
});
