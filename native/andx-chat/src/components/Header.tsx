import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../theme';

interface Props {
  theme: Theme;
  liveAgentActive: boolean;
  agentName?: string | null;
  onClose: () => void;
  onClear: () => void;
  onEndLive?: () => void;
}

export const Header: React.FC<Props> = ({ theme, liveAgentActive, agentName, onClose, onClear, onEndLive }) => {
  return (
    <View style={[styles.wrap, { borderBottomColor: theme.border.subtle, backgroundColor: 'rgba(0,224,255,0.02)' }]}>
      <View style={styles.textCol}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.text.primary, fontFamily: theme.font.heading }]}>
            ANDX <Text style={{ color: theme.accent.primary }}>Intelligence</Text>
          </Text>
        </View>
        <View style={styles.subRow}>
          <View style={[styles.dot, { backgroundColor: liveAgentActive ? theme.accent.alert : theme.accent.online }]} />
          <Text style={[styles.sub, { color: theme.text.secondary, fontFamily: theme.font.mono }]}>
            {liveAgentActive ? `LIVE · ${agentName || 'AGENT'}` : 'ONLINE'}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {liveAgentActive && onEndLive && (
          <Pressable
            onPress={onEndLive}
            style={({ pressed }) => [
              styles.endBtn,
              { borderColor: theme.accent.alert, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.endText, { color: theme.accent.alert, fontFamily: theme.font.mono }]}>End</Text>
          </Pressable>
        )}
        {/* Clear = text button, outlined. Close = icon-only, filled subtle. */}
        <Pressable
          onPress={onClear}
          style={({ pressed }) => [
            styles.clearBtn,
            { borderColor: theme.accent.primary, opacity: pressed ? 0.7 : 1 },
          ]}
          hitSlop={6}
        >
          <Text style={[styles.clearText, { color: theme.accent.primary, fontFamily: theme.font.mono }]}>Clear</Text>
        </Pressable>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            styles.closeBtn,
            { backgroundColor: pressed ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)' },
          ]}
          hitSlop={6}
          accessibilityLabel="Close chat"
        >
          <Text style={[styles.closeIcon, { color: theme.text.secondary }]}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  textCol: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  sub: { fontSize: 10, letterSpacing: 1.2, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  clearBtn: {
    minWidth: 68,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: { fontSize: 16, fontWeight: '600' },
  endBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endText: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
});
