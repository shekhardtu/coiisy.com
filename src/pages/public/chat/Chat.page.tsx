import { useMessageWebSocket } from "@/contexts/MessageWebSocket.context";
import { useWebSocket } from "@/contexts/WebSocketContext";
import { local } from "@/lib/utils";
import { WS_MESSAGE_TYPES } from "@/lib/webSocket.config";

import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";

import { CurrentUserInterface } from "../coEditor/components/Editor.types";
import { useOnlineUsers } from "../coEditor/hooks/useOnlineUsers";
import "./chat.style.css";
import ChatHeader from "./components/ChatHeader";
import ChatInput from "./components/ChatInput";
import ChatMessages from "./components/ChatMessages";
interface NavigatorWithVirtualKeyboard extends Navigator {
  virtualKeyboard?: {
    show: () => void
    overlaysContent: boolean
  }
}

const ChatPage: React.FC = () => {
  // Get the context from outlet

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { sessionId } = useParams();
  const {
    status,
    tryConnect,
    setSessionId,
    userJoinedSession,
  } = useWebSocket()

  const { sessionStatus } = useMessageWebSocket()

  const { userIdentifier } =
    local("json", sessionId).get(`sessionIdentifier`) || {}
  const currentUser: CurrentUserInterface = userIdentifier

  // Virtual Keyboard setup
  useEffect(() => {
    const virtualKeyboard = (navigator as NavigatorWithVirtualKeyboard)
      .virtualKeyboard
    if (!virtualKeyboard) return
    virtualKeyboard.overlaysContent = true
  }, [])






  useEffect(() => {
    if (sessionId) {
      setSessionId(sessionId)
    }

    if (sessionId && status === "connected" && currentUser?.userId) {
      userJoinedSession({
        type: WS_MESSAGE_TYPES.CLIENT_USER_JOINED_SESSION,
        sessionId,
        userId: currentUser.userId,
        fullName: currentUser.fullName || "",
      })
    }
  }, [
    sessionId,
    userJoinedSession,
    status,
    currentUser?.userId,
    currentUser?.fullName,
    setSessionId,
  ])


  const { activeUsers } = useOnlineUsers()


  const scrollToBottom = useCallback((force = false) => {
    if (!chatContainerRef.current) return

    const container = chatContainerRef.current
    const { scrollHeight, scrollTop, clientHeight } = container
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100

    if (isNearBottom || force) {
      // Add a small delay to ensure the last message is fully rendered
      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        })
      })
    }
  }, [])

  useEffect(() => {
    const styleSheet = document.createElement("style")
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
    `
    document.head.appendChild(styleSheet)

    return () => {
      document.head.removeChild(styleSheet)
    }
  }, [])

  // Add viewport height adjustment effect
  useEffect(() => {
    const setViewportHeight = () => {
      document.documentElement.style.setProperty(
        "--100vh",
        `${window.innerHeight}px`
      );
    }

    // Set initial height
    setViewportHeight()

    // Debounced resize handler
    let timeoutId: NodeJS.Timeout
    const handleResize = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(setViewportHeight, 100)
    }

    window.addEventListener("resize", handleResize)

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [])

  // Memoize values passed to ChatHeader
  const headerProps = useMemo(() => ({
    status,
    tryConnect,
    activeUsers,
    guestUsers: activeUsers.filter(user => user.userId !== currentUser?.userId)
  }), [status, tryConnect, activeUsers, currentUser?.userId]);

  const chatInputRef = useRef<HTMLDivElement>(null);



  return (
    <div className="chat_container overflow-hidden" role="main" aria-label="Chat interface">
      <ChatHeader {...headerProps} />

      <div
        ref={chatContainerRef}
        className="messages overflow-y-scroll"
        role="log"
        aria-live="polite"
      >
        <ChatMessages
          currentUser={currentUser}
          chatContainerRef={chatContainerRef}
          scrollToBottom={scrollToBottom}
        />
      </div>

      <div className="compose" role="form" aria-label="Message composition" ref={chatInputRef}>
        <ChatInput
          sessionStatus={sessionStatus}
          status={status}
          scrollToBottom={scrollToBottom}
          tryConnect={tryConnect}
          chatInputRef={chatInputRef}
        />
      </div>
    </div>
  )
}

export default memo(ChatPage)
