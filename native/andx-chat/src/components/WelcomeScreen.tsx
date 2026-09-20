import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../theme';
import { XoreSphere } from './XoreSphere';

const DEFAULT_CHIPS = [
  'What is ANDX?',
  'How do I sign up?',
  'Is ANDX free to use?',
  'Chat with a live agent',
];

interface Props {
  theme: Theme;
  onChipPress: (text: string) => void;
  chips?: string[];
}

export const WelcomeScreen: React.FC<Props> = ({ theme, onChipPress, chips }) => {
  const items = chips && chips.length ? chips : DEFAULT_CHIPS;
  return (
    <View style={styles.wrap}>
      <View style={styles.spherePad}>
        <XoreSphere size={84} glow />
      </View>
      <Text style={[styles.title, { color: theme.text.primary, fontFamily: theme.font.heading }]}>
        Talk to <Text style={[styles.em, { color: theme.accent.primary }]}>XORE</Text>
      </Text>
      <Text style={[styles.sub, { color: theme.text.secondary, fontFamily: theme.font.body }]}>
        Ask anything — platform, features, security, getting started. Available 24/7.
      </Text>

      <View style={styles.chips}>
        {items.map(text => (
          <Pressable
            key={text}
            onPress={() => onChipPress(text)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: pressed ? 'rgba(0,224,255,0.1)' : 'rgba(0,224,255,0.04)',
                borderColor: pressed ? theme.accent.primary : theme.border.default,
              },
            ]}
          >
            <Text style={[styles.chipArrow, { color: theme.accent.primary, fontFamily: theme.font.mono }]}>{'>'}</Text>
            <Text style={[styles.chipText, { color: theme.text.primary, fontFamily: theme.font.body }]}>{text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  spherePad: { marginBottom: 14 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  em: { fontWeight: '700' },
  sub: { fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 280 },
  chips: { width: '100%', maxWidth: 320, gap: 7, marginTop: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 3,
    borderWidth: 1,
  },
  chipArrow: { fontSize: 14, fontWeight: '700' },
  chipText: { fontSize: 13.5, fontWeight: '500' },
});
