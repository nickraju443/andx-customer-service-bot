import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../theme';
import type { Message, Reaction } from '../api/types';
import { formatTime } from '../utils/time';
import { tokenize } from '../utils/linkify';
import { ReactionPalette } from './ReactionPalette';
import { useReactions } from '../state/hooks';

interface Props {
  theme: Theme;
  message: Message;
  onReply: (m: Message) => void;
  onRetry?: () => void;
}

export const MessageBubble: React.FC<Props> = ({ theme, message, onReply, onRetry }) => {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { reactions, react } = useReactions(message.id);
  const isUser = message.role === 'user';
  const isAgent = message.role === 'agent';

  const handleLongPress = () => {
    if (isUser) return;
    setPaletteOpen(true);
  };

  const handleReact = async (r: Reaction) => {
    await react(r, isAgent ? 'agent' : 'ai', message.text);
  };

  // ── User bubble (right side, gold-on-dark, cyan-tinted) ─────────────────
  if (isUser) {
    return (
      <View style={styles.rowRight}>
        <View style={styles.userCol}>
          {message.replyTo && (
            <View style={[styles.replyTag, { borderLeftColor: theme.accent.primary, backgroundColor: 'rgba(0,224,255,0.05)' }]}>
              <Text numberOfLines={1} style={[styles.replyTagText, { color: theme.text.muted }]}>
                ↳ {message.replyTo.text}
              </Text>
            </View>
          )}
          <View style={[styles.bubbleUser, { backgroundColor: 'rgba(0,224,255,0.12)', borderColor: theme.border.strong }]}>
            <Text style={[styles.text, { color: '#e8f8ff' }]}>{message.text}</Text>
          </View>
          <Text style={[styles.ts, styles.tsRight, { color: theme.text.muted, fontFamily: theme.font.mono }]}>
            {formatTime(message.ts)}
          </Text>
        </View>
      </View>
    );
  }

  // ── AI / Agent bubble (left side, dark panel with left rule) ────────────
  const avatarLabel = isAgent
    ? (message.agentName || 'LA').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'AI';
  const senderLabel = isAgent ? (message.agentName || 'Live Agent') : 'ANDX AI';
  const leftRuleColor = isAgent ? theme.accent.alert : theme.accent.primary;
  const bubbleBg = isAgent ? 'rgba(255,46,200,0.04)' : 'rgba(0,224,255,0.025)';

  return (
    <View style={styles.rowLeft}>
      <View
        style={[
          styles.avatar,
          {
            borderColor: isAgent ? theme.accent.alert : theme.border.strong,
            backgroundColor: isAgent ? theme.accent.alert : theme.bg.elevated,
          },
        ]}
      >
        <Text style={[styles.avatarText, { color: isAgent ? theme.text.inverse : theme.accent.primary, fontFamily: theme.font.mono }]}>
          {avatarLabel}
        </Text>
      </View>
      <View style={styles.aiCol}>
        <Text style={[styles.sender, { color: leftRuleColor, fontFamily: theme.font.mono }]}>
          {senderLabel.toUpperCase()}
        </Text>
        <Pressable
          onLongPress={handleLongPress}
          delayLongPress={350}
          style={({ pressed }) => [
            styles.bubbleAi,
            {
              backgroundColor: bubbleBg,
              borderColor: theme.border.default,
              borderLeftColor: leftRuleColor,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          {tokenize(message.text).map((seg, i) =>
            seg.type === 'link' ? (
              <Text
                key={i}
                onPress={() => Linking.openURL(seg.value).catch(() => {})}
                style={[styles.text, styles.link, { color: theme.accent.primary }]}
              >
                {seg.value}
              </Text>
            ) : (
              <Text key={i} style={[styles.text, { color: theme.text.primary }]}>{seg.value}</Text>
            ),
          )}
        </Pressable>

        {reactions.length > 0 && (
          <View style={[styles.reactionPill, { backgroundColor: theme.bg.elevated, borderColor: theme.border.strong }]}>
            <Text style={styles.reactionText}>{Array.from(new Set(reactions)).join('')}</Text>
          </View>
        )}

        {message.error && onRetry && (
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [
              styles.retry,
              { borderColor: pressed ? theme.accent.primary : theme.border.strong, backgroundColor: pressed ? 'rgba(0,224,255,0.1)' : 'transparent' },
            ]}
          >
            <Text style={[styles.retryText, { color: theme.accent.primary, fontFamily: theme.font.mono }]}>↻ RETRY</Text>
          </Pressable>
        )}

        <Text style={[styles.ts, { color: theme.text.muted, fontFamily: theme.font.mono }]}>
          {formatTime(message.ts)}
        </Text>

        {paletteOpen && (
          <View style={styles.paletteAnchor}>
            <ReactionPalette
              theme={theme}
              onReact={handleReact}
              onReply={() => onReply(message)}
              onClose={() => setPaletteOpen(false)}
            />
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  rowLeft: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  rowRight: { flexDirection: 'row-reverse', gap: 8 },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  avatarText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  aiCol: { flex: 1, gap: 4, minWidth: 0 },
  userCol: { alignItems: 'flex-end', gap: 4, maxWidth: '80%' },
  sender: { fontSize: 9, fontWeight: '600', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 1 },
  bubbleAi: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderLeftWidth: 2,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  bubbleUser: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 2,
    borderWidth: 1,
  },
  text: { fontSize: 14, lineHeight: 22 },
  link: { textDecorationLine: 'underline' },
  ts: { fontSize: 9, letterSpacing: 0.8, marginTop: 2 },
  tsRight: { textAlign: 'right' },
  reactionPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 3,
  },
  reactionText: { fontSize: 12, letterSpacing: 1 },
  retry: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 3,
    borderWidth: 1,
  },
  retryText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 1.2 },
  replyTag: {
    borderLeftWidth: 2,
    paddingLeft: 8,
    paddingVertical: 4,
    marginBottom: 4,
    maxWidth: '100%',
  },
  replyTagText: { fontSize: 11, fontStyle: 'italic' },
  paletteAnchor: { position: 'absolute', top: -42, left: 0 },
});
