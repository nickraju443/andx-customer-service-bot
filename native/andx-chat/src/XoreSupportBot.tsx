import React, { useContext, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { ChatProvider, ChatContext } from './state/ChatContext';
import { ChatPanel } from './ChatPanel';
import { XoreSphere } from './components/XoreSphere';
import { defaultTheme, mergeTheme, Theme } from './theme';

export interface XoreSupportBotProps {
  /** Where to dock the floating sphere. Defaults to bottom-right with safe insets. */
  fabPosition?: { bottom?: number; right?: number; left?: number; top?: number };

  /** Skip the email gate by passing a known email (e.g. from your auth). */
  userEmail?: string;
  userName?: string;

  /** Optional context string shown to live agents (e.g. "Portfolio screen"). */
  pageContext?: string;

  /** Initial mode. Currently affects /api/ask depth only. */
  initialMode?: 'beginner' | 'pro';

  /** Theme override (deep-merged with defaultTheme). */
  theme?: Partial<Theme>;

  /** Called when an agent picks up the ticket. Useful for analytics. */
  onLiveAgentConnected?: (agentName: string) => void;

  /** Called when the panel opens/closes. */
  onOpenChange?: (open: boolean) => void;

  /** Hide the FAB if you want to render the panel from your own button. */
  hideFab?: boolean;

  /**
   * When you mount this component imperatively, pass `openOnMount` to launch
   * the panel immediately (e.g. from a push notification deep-link).
   */
  openOnMount?: boolean;
}

export const XoreSupportBot: React.FC<XoreSupportBotProps> = (props) => {
  return (
    <ChatProvider initialEmail={props.userEmail}>
      <XoreSupportBotInner {...props} />
    </ChatProvider>
  );
};

const XoreSupportBotInner: React.FC<XoreSupportBotProps> = ({
  fabPosition,
  userEmail,
  userName,
  pageContext,
  theme: themeOverride,
  onLiveAgentConnected,
  onOpenChange,
  hideFab,
  openOnMount,
}) => {
  const theme = mergeTheme(defaultTheme, themeOverride);
  const { state, dispatch } = useContext(ChatContext);
  const [open, setOpen] = useState(!!openOnMount);

  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
  useEffect(() => { if (open) dispatch({ type: 'CLEAR_UNREAD' }); }, [open, dispatch]);

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const fabBottom = fabPosition?.bottom ?? 26;
  const fabRight = fabPosition?.right ?? 26;

  return (
    <>
      {!hideFab && (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <Pressable
            onPress={handleOpen}
            style={({ pressed }) => [
              styles.fab,
              {
                bottom: fabBottom,
                right: fabRight,
                shadowColor: theme.accent.primary,
                transform: [{ scale: pressed ? 0.94 : 1 }],
                backgroundColor: theme.bg.deep,
                borderColor: theme.border.strong,
              },
            ]}
            accessibilityLabel="Open ANDX support chat"
            accessibilityRole="button"
          >
            <XoreSphere size={62} />
            {state.unreadCount > 0 && (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: theme.accent.alert,
                    borderColor: theme.bg.panel,
                  },
                ]}
              >
                <Text style={[styles.badgeText, { color: theme.text.inverse, fontFamily: theme.font.mono }]}>
                  {state.unreadCount > 9 ? '9+' : String(state.unreadCount)}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      )}

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
        onRequestClose={handleClose}
        statusBarTranslucent
      >
        <StatusBar barStyle="light-content" backgroundColor={theme.bg.panel} />
        <View style={[styles.modalRoot, { backgroundColor: theme.bg.panel }]}>
          <ChatPanel
            theme={theme}
            visible={open}
            onClose={handleClose}
            pageContext={pageContext}
            prefillEmail={userEmail || state.email}
            prefillName={userName}
            onLiveAgentConnected={onLiveAgentConnected}
          />
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
    elevation: 10,
    overflow: 'visible',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  modalRoot: { flex: 1 },
});
