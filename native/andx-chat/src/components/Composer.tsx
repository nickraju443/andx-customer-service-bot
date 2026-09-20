import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Theme } from '../theme';

interface Props {
  theme: Theme;
  placeholder?: string;
  disabled?: boolean;
  onSend: (text: string) => void;
}

export const Composer: React.FC<Props> = ({ theme, placeholder, disabled, onSend }) => {
  const [value, setValue] = useState('');
  const ready = value.trim().length > 0 && !disabled;

  const send = () => {
    const t = value.trim();
    if (!t || disabled) return;
    onSend(t);
    setValue('');
  };

  return (
    <View style={[styles.bar, { borderTopColor: theme.border.subtle, backgroundColor: 'rgba(0,0,0,0.5)' }]}>
      <Text style={[styles.prefix, { color: theme.accent.primary, fontFamily: theme.font.mono }]}>{'>'}</Text>
      <TextInput
        style={[styles.input, { color: theme.text.primary, fontFamily: theme.font.body }]}
        placeholder={placeholder || 'Type a message...'}
        placeholderTextColor={theme.text.muted}
        value={value}
        onChangeText={setValue}
        onSubmitEditing={send}
        returnKeyType="send"
        editable={!disabled}
        multiline
        blurOnSubmit
        cursorColor={theme.accent.primary}
        selectionColor={theme.accent.primary}
      />
      <Pressable
        onPress={send}
        disabled={!ready}
        style={({ pressed }) => [
          styles.send,
          {
            backgroundColor: ready ? theme.accent.primary : 'transparent',
            borderColor: theme.border.strong,
            opacity: pressed ? 0.8 : disabled ? 0.35 : 1,
            transform: [{ scale: pressed && ready ? 1.05 : 1 }],
          },
        ]}
      >
        <Text style={[styles.sendText, { color: ready ? theme.text.inverse : theme.accent.primary, fontFamily: theme.font.mono }]}>
          ▶
        </Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  prefix: { fontSize: 14, fontWeight: '700' },
  input: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
    maxHeight: 100,
  },
  send: {
    width: 34,
    height: 34,
    borderRadius: 3,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { fontSize: 12, fontWeight: '700' },
});
