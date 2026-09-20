import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../theme';
import type { LiveAgentState } from '../api/types';

interface Props {
  theme: Theme;
  liveAgent: LiveAgentState;
}

export const QueueWidget: React.FC<Props> = ({ theme, liveAgent }) => {
  const { queueState, queuePosition, queueTotal, estimatedWaitMin, agentName, isNext } = liveAgent;

  let title = '';
  let subtitle = '';
  let dotColor = theme.accent.primary;
  let dotPulse = false;

  if (queueState === 'queued') {
    if (isNext) {
      title = 'You\'re next';
      subtitle = `${queueTotal} in queue · agent will pick up shortly`;
    } else {
      title = `Position ${queuePosition} of ${queueTotal}`;
      subtitle = `Estimated wait ~${estimatedWaitMin} min`;
    }
    dotPulse = true;
  } else if (queueState === 'active') {
    title = `${agentName || 'Live agent'} connected`;
    subtitle = 'Send a message and the agent will reply';
    dotColor = theme.accent.online;
  } else if (queueState === 'ended') {
    title = 'Chat ended';
    subtitle = 'Tap "Chat with a live agent" to start a new one';
    dotColor = theme.accent.alert;
  } else {
    title = 'Connecting...';
    subtitle = 'Reaching the support team';
  }

  return (
    <View style={[styles.wrap, { backgroundColor: 'rgba(0,224,255,0.03)', borderColor: theme.border.strong }]}>
      <View style={[styles.dot, { backgroundColor: dotColor, opacity: dotPulse ? 0.85 : 1, shadowColor: dotColor }]} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: theme.text.primary, fontFamily: theme.font.heading }]}>{title}</Text>
        <Text style={[styles.sub, { color: theme.text.muted, fontFamily: theme.font.mono }]}>{subtitle}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 20,
    marginTop: 10,
    padding: 13,
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    shadowOpacity: 0.7,
    shadowRadius: 6,
  },
  text: { flex: 1 },
  title: { fontSize: 13.5, fontWeight: '600' },
  sub: { fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 3 },
});
