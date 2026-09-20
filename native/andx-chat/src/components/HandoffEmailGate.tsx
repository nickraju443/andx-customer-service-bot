import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Theme } from '../theme';
import { isValidEmail } from '../utils/linkify';

interface Props {
  theme: Theme;
  initialEmail?: string;
  initialName?: string;
  onSubmit: (email: string, name: string, firstMessage: string) => Promise<void> | void;
  onCancel: () => void;
}

export const HandoffEmailGate: React.FC<Props> = ({ theme, initialEmail, initialName, onSubmit, onCancel }) => {
  const [email, setEmail] = useState(initialEmail || '');
  const [name, setName] = useState(initialName || '');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!isValidEmail(email)) {
      setError('Please enter a valid email so the agent can reach you.');
      return;
    }
    if (!message.trim()) {
      setError('Tell the agent what you need help with.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(email.trim(), name.trim(), message.trim());
    } catch (e: any) {
      setError(e?.message || 'Could not start chat. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: 'rgba(0,224,255,0.04)', borderColor: theme.border.strong }]}>
      <Text style={[styles.title, { color: theme.text.primary, fontFamily: theme.font.heading }]}>
        Chat with a live agent
      </Text>
      <Text style={[styles.sub, { color: theme.text.muted, fontFamily: theme.font.body }]}>
        We'll text you back here in the app, and also email a copy. Email is required so the agent can follow up.
      </Text>

      <Text style={[styles.label, { color: theme.accent.primary, fontFamily: theme.font.mono }]}>EMAIL</Text>
      <TextInput
        style={[styles.input, { color: theme.text.primary, fontFamily: theme.font.mono, backgroundColor: theme.bg.deep, borderColor: theme.border.default }]}
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={theme.text.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        cursorColor={theme.accent.primary}
        selectionColor={theme.accent.primary}
      />

      <Text style={[styles.label, { color: theme.accent.primary, fontFamily: theme.font.mono }]}>NAME (OPTIONAL)</Text>
      <TextInput
        style={[styles.input, { color: theme.text.primary, fontFamily: theme.font.mono, backgroundColor: theme.bg.deep, borderColor: theme.border.default }]}
        value={name}
        onChangeText={setName}
        placeholder="What should we call you?"
        placeholderTextColor={theme.text.muted}
        cursorColor={theme.accent.primary}
        selectionColor={theme.accent.primary}
      />

      <Text style={[styles.label, { color: theme.accent.primary, fontFamily: theme.font.mono }]}>MESSAGE</Text>
      <TextInput
        style={[styles.input, styles.textarea, { color: theme.text.primary, fontFamily: theme.font.body, backgroundColor: theme.bg.deep, borderColor: theme.border.default }]}
        value={message}
        onChangeText={setMessage}
        placeholder="What do you need help with?"
        placeholderTextColor={theme.text.muted}
        multiline
        numberOfLines={4}
        cursorColor={theme.accent.primary}
        selectionColor={theme.accent.primary}
      />

      {error && (
        <Text style={[styles.error, { color: theme.accent.alert, fontFamily: theme.font.mono }]}>{error}</Text>
      )}

      <Pressable
        onPress={handleSubmit}
        disabled={submitting}
        style={({ pressed }) => [
          styles.btn,
          {
            backgroundColor: theme.accent.primary,
            opacity: submitting ? 0.55 : pressed ? 0.85 : 1,
            shadowColor: theme.accent.primary,
          },
        ]}
      >
        {submitting ? (
          <ActivityIndicator color={theme.text.inverse} />
        ) : (
          <Text style={[styles.btnText, { color: theme.text.inverse, fontFamily: theme.font.mono }]}>START LIVE CHAT</Text>
        )}
      </Pressable>

      <Pressable
        onPress={onCancel}
        style={({ pressed }) => [
          styles.btnSecondary,
          { borderColor: theme.border.strong, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={[styles.btnSecondaryText, { color: theme.accent.primary, fontFamily: theme.font.mono }]}>CANCEL</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    margin: 20,
    padding: 16,
    borderRadius: 4,
    borderWidth: 1,
    gap: 9,
  },
  title: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 12, lineHeight: 18 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, marginTop: 4 },
  input: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 3,
    borderWidth: 1,
    fontSize: 13.5,
  },
  textarea: { minHeight: 82, textAlignVertical: 'top' },
  error: { fontSize: 12 },
  btn: {
    marginTop: 6,
    paddingVertical: 13,
    borderRadius: 3,
    alignItems: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  btnText: { fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  btnSecondary: {
    paddingVertical: 11,
    borderRadius: 3,
    borderWidth: 1,
    alignItems: 'center',
  },
  btnSecondaryText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.3 },
});
