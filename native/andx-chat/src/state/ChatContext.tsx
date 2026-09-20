import React, { createContext, useEffect, useReducer, useRef } from 'react';
import { reducer, INITIAL_STATE, Action } from './reducer';
import { loadPersisted, savePersisted } from './persistence';
import { newSessionId } from '../utils/id';
import type { ChatState } from '../api/types';

export interface ChatContextValue {
  state: ChatState;
  dispatch: React.Dispatch<Action>;
  hydrated: boolean;
}

export const ChatContext = createContext<ChatContextValue>({
  state: INITIAL_STATE,
  dispatch: () => {},
  hydrated: false,
});

export interface ChatProviderProps {
  children: React.ReactNode;
  initialEmail?: string;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({ children, initialEmail }) => {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const hydratedRef = useRef(false);
  const [hydrated, setHydrated] = React.useState(false);

  // Load persisted state on mount
  useEffect(() => {
    let cancelled = false;
    loadPersisted().then(persisted => {
      if (cancelled) return;
      const sessionId = persisted.sessionId || newSessionId();
      dispatch({
        type: 'HYDRATE',
        payload: {
          ...persisted,
          sessionId,
          email: initialEmail || persisted.email || '',
        },
      });
      hydratedRef.current = true;
      setHydrated(true);
    });
    return () => { cancelled = true; };
  }, [initialEmail]);

  // Persist on every change (debounced via microtask coalescing)
  useEffect(() => {
    if (!hydratedRef.current) return;
    savePersisted(state);
  }, [state]);

  return (
    <ChatContext.Provider value={{ state, dispatch, hydrated }}>
      {children}
    </ChatContext.Provider>
  );
};
