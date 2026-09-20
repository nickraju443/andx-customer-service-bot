import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../theme';
import type { ReplyToContext } from '../api/types';

interface Props {
  theme: Theme;
  replyTo: ReplyToContext;
  onClose: () => void;
}

export const ReplyPreview: React.FC<Props> = ({ theme, replyTo, onClose }) => {
  return (
    <View style={[styles.wrap, { backgroundColor: 'rgba(0,224,255,0.06)', borderLeftColor: theme.accent.primary }]}>
      <Text style={[styles.icon, { color: theme.accent.primary, fontFamily: theme.font.mono }]}>↳</Text>
      <Text
        style={[styles.text, { color: theme.text.secondary, fontFamily: theme.font.body }]}
        numberOfLines={1}
      >
        Replying to: {replyTo.text}
      </Text>
      <Pressable onPress={onClose} hitSlop={8}>
        <Text style={[styles.close, { color: theme.text.muted }]}>×</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginHorizontal: 20,
    marginBottom: 6,
    borderLeftWidth: 2,
    borderRadius: 3,
  },
  icon: { fontSize: 14, fontWeight: '700' },
  text: { flex: 1, fontSize: 12, fontStyle: 'italic' },
  close: { fontSize: 18, lineHeight: 18 },
});
