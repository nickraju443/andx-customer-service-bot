import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../theme';
import type { Reaction } from '../api/types';

const EMOJIS: Reaction[] = ['👍', '❤️', '😂', '😮', '😢', '👎'];

interface Props {
  theme: Theme;
  onReact: (r: Reaction) => void;
  onReply: () => void;
  onClose: () => void;
}

export const ReactionPalette: React.FC<Props> = ({ theme, onReact, onReply, onClose }) => {
  return (
    <View style={[styles.wrap, { backgroundColor: theme.bg.elevated, borderColor: theme.border.strong }]}>
      {EMOJIS.map(e => (
        <Pressable
          key={e}
          onPress={() => { onReact(e); onClose(); }}
          style={({ pressed }) => [
            styles.btn,
            pressed && { backgroundColor: theme.border.subtle, transform: [{ scale: 1.15 }] },
          ]}
        >
          <Text style={styles.emoji}>{e}</Text>
        </Pressable>
      ))}
      <View style={[styles.divider, { backgroundColor: theme.border.subtle }]} />
      <Pressable
        onPress={() => { onReply(); onClose(); }}
        style={({ pressed }) => [
          styles.replyBtn,
          { backgroundColor: pressed ? theme.border.subtle : 'transparent', borderColor: theme.border.strong },
        ]}
      >
        <Text style={[styles.replyText, { color: theme.accent.primary, fontFamily: theme.font.mono }]}>REPLY</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 5,
    borderRadius: 6,
    borderWidth: 1,
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 12,
    zIndex: 1000,
  },
  btn: {
    width: 34,
    height: 34,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 19 },
  divider: { width: 1, height: 22, marginHorizontal: 4 },
  replyBtn: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 3, borderWidth: 1 },
  replyText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 1.2 },
});
