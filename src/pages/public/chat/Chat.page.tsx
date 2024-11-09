import { useWebSocket } from '@/contexts/WebSocketContext';
import { getCurrentTimeStamp, local } from "@/lib/utils";
import { WS_MESSAGE_TYPES } from '@/lib/webSocket.config';
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { AuthMessageInterface, ChatMessageInterface, ServerChatMessageInterface, ServerSessionMessagesInterface } from '../coEditor/components/Editor.types';
import useEditorContext from '../coEditor/hooks/useEditor.contexthook';
import { CurrentUserInterface } from './components/chat.types';
import ChatHeader from './components/ChatHeader';
import ChatInput from './components/ChatInput';
import ChatMessages from './components/ChatMessages';



export interface ChatPageProps {
  onSendMessage: (message: string) => void;
}

const ChatPage: React.FC<ChatPageProps> = ({ onSendMessage }) => {
  const [messages, setMessages] = useState<ChatMessageInterface[]>([]);

  const chatContainerRef = useRef<HTMLDivElement>(null);

  const { sessionId } = useParams();
    const {  isJoinModalOpen } = useEditorContext();
  const { status, tryConnect, sendMessage, subscribe, setSessionId, sendAuthMessage, userJoinedSession } = useWebSocket();

  const { guestIdentifier } = local("json", "key").get(`sessionIdentifier-${sessionId}`) || {};
  const currentUser: CurrentUserInterface = guestIdentifier;

  const [keyboardVisible, setKeyboardVisible] = useState(true);

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!isJoinModalOpen) {
      tryConnect();
    }
  }, [isJoinModalOpen, tryConnect]);

  useEffect(() => {
    setSessionId(sessionId || null);
  }, [sessionId, setSessionId]);

  useEffect(() => {
    if (currentUser && sessionId) {
      const authMessage: AuthMessageInterface = {
        type: WS_MESSAGE_TYPES.CLIENT_AUTH,
        sessionId,
        userId: currentUser.userId, // This is
      };

      sendAuthMessage(authMessage);
    }
  }, [currentUser, sendAuthMessage, sessionId]);

  useEffect(() => {
    if (sessionId && status === 'connected' && currentUser?.userId) {
      userJoinedSession({
        type: WS_MESSAGE_TYPES.CLIENT_USER_JOINED_SESSION,
        sessionId,
        userId: currentUser.userId,
        fullName: currentUser.fullName,
      });
    }
  }, [sessionId, userJoinedSession, status, currentUser?.userId, currentUser?.fullName]);

  useEffect(() => {
    const unsubscribeSessionReload = subscribe<ServerSessionMessagesInterface>(
      WS_MESSAGE_TYPES.SERVER_SESSION_MESSAGES,
      (data) => {
        setMessages(prevMessages => {
          const updatedMessages = [...prevMessages, ...data.messages] as ChatMessageInterface[];




          local("json", "key").set(`sessionIdentifier-${sessionId}`, {
            guestIdentifier: {
              ...currentUser,
              messages: updatedMessages
            }
          });

          return updatedMessages;
        });
      }
    );

    const unsubscribe = subscribe<ServerChatMessageInterface>(
      WS_MESSAGE_TYPES.SERVER_CHAT,
      (message) => {
        setMessages(prevMessages => {
          const existingMessageIndex = prevMessages.findIndex(msg => msg.messageId === message.messageId);


          if (existingMessageIndex !== -1) {
            // Update existing message state
            const updatedMessages = [...prevMessages];
            updatedMessages[existingMessageIndex] = message;
            return updatedMessages;
          }

          // Add new message
          const newMessages = [...prevMessages, { ...message, state: 'sent' as const }];

          local("json", "key").set(`sessionIdentifier-${sessionId}`, {
            guestIdentifier: {
              ...currentUser,
              messages: newMessages
            }
          });

          return newMessages;
        });
      }
    );

    return () => {
      unsubscribe();
      unsubscribeSessionReload();
    };
  }, [status, subscribe, sessionId, currentUser]);

  useEffect(() => {
    const sessionData = local("json", "key").get(`sessionIdentifier-${sessionId}`);
    if (sessionData && sessionData?.guestIdentifier?.messages) {
      setMessages(sessionData.guestIdentifier.messages);
    }
  }, [sessionId]);

  const scrollToBottom = useCallback((force = false) => {
    if (!chatContainerRef.current) return;

    const container = chatContainerRef.current;
    const { scrollHeight, scrollTop, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

    if (isNearBottom || force) {
      container.scrollTo({
        top: scrollHeight,
        behavior: 'smooth',
      });
    }
  }, []);

  useEffect(() => {
    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
      @keyframes slideUp {
        0% {
          opacity: 0;
          transform: translateY(20px);
        }
        100% {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .animate-slideUp {
        animation: slideUp 0.3s ease-out forwards;
      }
    `;
    document.head.appendChild(styleSheet);

    return () => {
      document.head.removeChild(styleSheet);
    };
  }, []);


  useEffect(() => {
    // Initial viewport dimensions
    let initialHeight = window.innerHeight;
    const MIN_KEYBOARD_HEIGHT = 150;
    const VIEWPORT_UPDATE_DEBOUNCE = 100;

    let resizeTimeout: NodeJS.Timeout | null = null;

    const handleResize = () => {
      // Clear existing timeout to debounce rapid updates
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      resizeTimeout = setTimeout(() => {
        // Ensure visualViewport is supported
        if (!window.visualViewport) {
          const newHeight = window.innerHeight;
          const heightDiff = initialHeight - newHeight;

          setKeyboardVisible(heightDiff > MIN_KEYBOARD_HEIGHT);
          setKeyboardHeight(heightDiff > MIN_KEYBOARD_HEIGHT ? heightDiff : 0);
          return;
        }

        // Use visualViewport when available
        const newViewportHeight = window.visualViewport.height;
        const heightDiff = Math.abs(initialHeight - newViewportHeight);
        const isKeyboard = heightDiff > MIN_KEYBOARD_HEIGHT;

        // Update state only if there's a significant change
        setKeyboardVisible(isKeyboard);
        setKeyboardHeight((prev) => {
          const newHeight = isKeyboard ? heightDiff : 0;
          return Math.abs(prev - newHeight) > 1 ? newHeight : prev;
        });

      }, VIEWPORT_UPDATE_DEBOUNCE);
    };

    // Handle orientation changes
    const handleOrientationChange = () => {
      // Reset initial height after orientation change
      setTimeout(() => {
        initialHeight = window.innerHeight;
        handleResize();
      }, 300); // Wait for orientation change to complete
    };

    // Handle page visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        initialHeight = window.innerHeight;
        handleResize();
      }
    };

    // Add event listeners
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
    } else {
      window.addEventListener('resize', handleResize);
    }

    window.addEventListener('orientationchange', handleOrientationChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial setup
    handleResize();

    // Cleanup
    return () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
      } else {
        window.removeEventListener('resize', handleResize);
      }

      window.removeEventListener('orientationchange', handleOrientationChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // Empty dependency array since we don't need any external values

  const handleSendMessage = (messageContent: string) => {


    if (!messageContent) return;
    if (!currentUser) return;
    const messageId = uuidv4(); // Generate unique ID for the message
    const messageData: ChatMessageInterface = {
      messageId, // Add this to your interface if not already present
      type: WS_MESSAGE_TYPES.CLIENT_CHAT,
      sessionId: sessionId || '',
      userId: currentUser.userId,
      fullName: currentUser.fullName || '',
      content: messageContent,
      createdAt: getCurrentTimeStamp(),
    };

    setMessages(prev => [...prev, { ...messageData, state: 'sending' as const }]);
    sendMessage(messageData);
    scrollToBottom(true);
    onSendMessage(messageContent);
  };


  useEffect(() => {
    console.log('keyboardHeight', keyboardHeight);
  }, [keyboardHeight, currentUser]);

  return (
    <div className="flex flex-col h-[100dvh] fixed inset-0">
      <ChatHeader
        status={status}
        tryConnect={tryConnect}
        className="flex-none border-b border-border"
      />
      <div className="flex-1 overflow-hidden relative">
        <ChatMessages
          messages={messages}
          currentUser={currentUser}
          scrollToBottom={scrollToBottom}
          chatContainerRef={chatContainerRef}
          keyboardVisible={keyboardVisible}
          keyboardHeight={keyboardHeight}
          className="absolute inset-0 overflow-y-auto px-4"
        />
      </div>
      <ChatInput
        status={status}
        onSendMessage={handleSendMessage}
        keyboardVisible={keyboardVisible}
        keyboardHeight={keyboardHeight}
        className="flex-none border-t border-border bottom-10 sticky"
      />
    </div>
  );
};

export default ChatPage;