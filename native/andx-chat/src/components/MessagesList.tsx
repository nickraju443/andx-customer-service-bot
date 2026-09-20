import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, StyleSheet, View } from 'react-native';
import type { Theme } from '../theme';
import type { Message } from '../api/types';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { ScrollToLatestBtn } from './ScrollToLatestBtn';

interface Props {
  theme: Theme;
  messages: Message[];
  isStreaming: boolean;
  onReply: (m: Message) => void;
  onRetry?: () => void;
}

export const MessagesList: React.FC<Props> = ({ theme, messages, isStreaming, onReply, onRetry }) => {
  const ref = useRef<FlatList<Message>>(null);
  const [showLatestBtn, setShowLatestBtn] = useState(false);
  const stickToBottomRef = useRef(true);

  // Whenever a new message arrives, scroll if we're already near the bottom
  useEffect(() => {
    if (stickToBottomRef.current && ref.current) {
      requestAnimationFrame(() => ref.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length, isStreaming]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    const nearBottom = distanceFromBottom < 60;
    stickToBottomRef.current = nearBottom;
    setShowLatestBtn(!nearBottom && messages.length > 4);
  }, [messages.length]);

  const goToLatest = useCallback(() => {
    ref.current?.scrollToEnd({ animated: true });
    setShowLatestBtn(false);
    stickToBottomRef.current = true;
  }, []);

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={ref}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={({ item }) => <MessageBubble theme={theme} message={item} onReply={onReply} onRetry={onRetry} />}
        contentContainerStyle={styles.content}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        ListFooterComponent={isStreaming ? <TypingIndicator theme={theme} /> : null}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      />
      <ScrollToLatestBtn theme={theme} visible={showLatestBtn} onPress={goToLatest} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 20, gap: 16 },
});
