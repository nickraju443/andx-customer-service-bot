import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import type { Theme } from './theme';
import { Header } from './components/Header';
import { MessagesList } from './components/MessagesList';
import { Composer } from './components/Composer';
import { WelcomeScreen } from './components/WelcomeScreen';
import { HandoffEmailGate } from './components/HandoffEmailGate';
import { QueueWidget } from './components/QueueWidget';
import { ReplyPreview } from './components/ReplyPreview';
import { useChat, useLiveAgent, useHeartbeat, useAgentReplyPolling } from './state/hooks';
import { getAgentStatus } from './api/ask';
import type { Message } from './api/types';

interface Props {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
  pageContext?: string;
  prefillEmail?: string;
  prefillName?: string;
  onLiveAgentConnected?: (agentName: string) => void;
}

type View = 'welcome' | 'chat' | 'email-gate' | 'queue';

export const ChatPanel: React.FC<Props> = ({
  theme,
  visible,
  onClose,
  pageContext,
  prefillEmail,
  prefillName,
  onLiveAgentConnected,
}) => {
  const { messages, isStreaming, askQuestion, retryLast, clearChat, pendingReplyTo, setReplyTo } = useChat();
  const { liveAgent, startSession, sendMessage: sendAgentMessage, endSession } = useLiveAgent();

  // Polling lifecycle — only when panel visible
  useAgentReplyPolling(visible);
  useHeartbeat();

  const [currentView, setCurrentView] = useState<View>('welcome');
  const [agentsAvailable, setAgentsAvailable] = useState<boolean | null>(null);

  // Decide which subview to show
  useEffect(() => {
    if (liveAgent.active && liveAgent.queueState !== 'ended') setCurrentView('chat');
    else if (currentView === 'email-gate') return;
    else if (messages.length > 0) setCurrentView('chat');
    else setCurrentView('welcome');
  }, [liveAgent.active, liveAgent.queueState, messages.length, currentView]);

  // Fetch live-agent availability on mount
  useEffect(() => {
    if (!visible) return;
    getAgentStatus().then(s => setAgentsAvailable(s.available)).catch(() => setAgentsAvailable(false));
  }, [visible]);

  // Notify host on agent connect
  useEffect(() => {
    if (liveAgent.queueState === 'active' && liveAgent.agentName) {
      onLiveAgentConnected?.(liveAgent.agentName);
    }
  }, [liveAgent.queueState, liveAgent.agentName, onLiveAgentConnected]);

  const handleSend = (text: string) => {
    if (liveAgent.active) {
      sendAgentMessage(text, pendingReplyTo || undefined);
      setReplyTo(null);
    } else {
      askQuestion(text);
    }
  };

  const handleWelcomeChip = (text: string) => {
    if (text.toLowerCase().includes('live agent')) {
      setCurrentView('email-gate');
      return;
    }
    askQuestion(text);
  };

  const handleReply = (m: Message) => {
    setReplyTo({ id: m.id, role: m.role, text: m.text.slice(0, 280) });
  };

  const handleStartLiveAgent = async (email: string, name: string, firstMessage: string) => {
    await startSession(email, name || undefined, firstMessage, pageContext);
    setCurrentView('chat');
  };

  return (
    <View style={[styles.panel, { backgroundColor: theme.bg.panel, borderColor: theme.border.strong }]}>
      <Header
        theme={theme}
        liveAgentActive={liveAgent.active}
        agentName={liveAgent.agentName}
        onClose={onClose}
        onClear={clearChat}
        onEndLive={liveAgent.active ? endSession : undefined}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        {currentView === 'welcome' && (
          <WelcomeScreen
            theme={theme}
            onChipPress={handleWelcomeChip}
            chips={
              agentsAvailable
                ? ['What is ANDX?', 'How do I sign up?', 'Is ANDX free to use?', 'Chat with a live agent']
                : ['What is ANDX?', 'How do I sign up?', 'Is ANDX free to use?', 'How do I deposit?']
            }
          />
        )}

        {currentView === 'email-gate' && (
          <HandoffEmailGate
            theme={theme}
            initialEmail={prefillEmail}
            initialName={prefillName}
            onSubmit={handleStartLiveAgent}
            onCancel={() => setCurrentView(messages.length > 0 ? 'chat' : 'welcome')}
          />
        )}

        {currentView === 'chat' && (
          <View style={styles.flex}>
            {liveAgent.active && <QueueWidget theme={theme} liveAgent={liveAgent} />}
            <MessagesList
              theme={theme}
              messages={messages}
              isStreaming={isStreaming}
              onReply={handleReply}
              onRetry={retryLast}
            />
            {pendingReplyTo && (
              <ReplyPreview theme={theme} replyTo={pendingReplyTo} onClose={() => setReplyTo(null)} />
            )}
            <Composer
              theme={theme}
              placeholder={liveAgent.active ? 'Message the live agent…' : 'Ask XORE anything…'}
              onSend={handleSend}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  flex: { flex: 1 },
});
