import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppearanceProvider } from './context/AppearanceContext';
import { AuthPage } from './components/auth/AuthPage';
import { Sidebar, NavPage } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { CustomizerDrawer } from './components/layout/CustomizerDrawer';
import { CallBar } from './components/calling/CallBar';
import { CallModal, ActiveCallSession } from './components/calling/CallModal';
import { IncomingCallModal, IncomingCallData } from './components/calling/IncomingCallModal';
import { MessagesPage } from './components/pages/MessagesPage';
import { MeetingsPage } from './components/pages/MeetingsPage';
import { IntelligencePage } from './components/pages/IntelligencePage';
import { TeamsPage } from './components/pages/TeamsPage';
import { FilesPage } from './components/pages/FilesPage';
import { AnalyticsPage } from './components/pages/AnalyticsPage';
import { SettingsPage } from './components/pages/SettingsPage';

const MainLayout: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const [currentPage, setCurrentPage] = useState<NavPage>('messages');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active Calling & LiveKit Session State
  const [activeCallSession, setActiveCallSession] = useState<ActiveCallSession | null>(null);
  const [isCallMinimized, setIsCallMinimized] = useState<boolean>(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);

  // Global WebSocket for Call Signaling
  const wsRef = useRef<WebSocket | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3000);
  };

  // Connect global WebSocket for call invites & signaling
  useEffect(() => {
    if (!user?.id) return;

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(`ws://localhost:8000/api/v1/ws/${user.id}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'incoming_call') {
            setIncomingCall({
              caller_id: data.caller_id,
              caller_name: data.caller_name || 'Teammate',
              caller_connect_id: data.caller_connect_id,
              caller_avatar: data.caller_avatar,
              room_name: data.room_name,
              call_type: data.call_type || 'video',
            });
          } else if (data.type === 'call_response') {
            if (!data.accepted) {
              showToast('Call was declined by teammate.');
              setActiveCallSession(null);
            } else {
              showToast('Call accepted! Connecting LiveKit WebRTC stream…');
            }
          } else if (data.type === 'call_ended') {
            showToast('Call ended by participant.');
            setActiveCallSession(null);
            setIsCallMinimized(false);
          }
        } catch (e) {
          console.warn('WS call signaling parse error:', e);
        }
      };

      ws.onerror = (e) => console.warn('WebSocket signaling error:', e);
      ws.onclose = () => {
        wsRef.current = null;
      };
    } catch (e) {
      console.warn('Failed to establish signaling socket:', e);
    }

    return () => {
      if (ws) {
        ws.close();
        wsRef.current = null;
      }
    };
  }, [user?.id]);

  // Start outgoing call
  const handleStartCall = (
    title: string,
    callType: 'video' | 'audio' = 'video',
    targetUserId?: string,
    targetConnectId?: string,
    customRoomName?: string
  ) => {
    const roomName =
      customRoomName ||
      (targetUserId
        ? `call_${[user?.id || 'anon', targetUserId].sort().join('_')}_${Date.now()}`
        : `meet_${Date.now()}`);

    // If calling a specific teammate, send WebSocket call_invite
    if (targetUserId && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call_invite',
          target_user_id: targetUserId,
          caller_name: user?.name || 'Teammate',
          caller_connect_id: user?.connect_id || '',
          caller_avatar: user?.avatar || '',
          room_name: roomName,
          call_type: callType,
        })
      );
      showToast(`Calling ${title}… Ringing teammate.`);
    } else {
      showToast(`Joining room: ${title}. Connecting LiveKit cloud…`);
    }

    setActiveCallSession({
      roomName,
      title,
      callType,
    });
    setIsCallMinimized(false);
  };

  // Accept incoming call
  const handleAcceptIncomingCall = () => {
    if (!incomingCall) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call_response',
          target_user_id: incomingCall.caller_id,
          accepted: true,
          room_name: incomingCall.room_name,
        })
      );
    }

    setActiveCallSession({
      roomName: incomingCall.room_name,
      title: incomingCall.caller_name,
      callType: incomingCall.call_type,
      isIncoming: true,
    });
    setIsCallMinimized(false);
    setIncomingCall(null);
  };

  // Decline incoming call
  const handleDeclineIncomingCall = () => {
    if (!incomingCall) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call_response',
          target_user_id: incomingCall.caller_id,
          accepted: false,
          room_name: incomingCall.room_name,
        })
      );
    }

    setIncomingCall(null);
    showToast('Call declined.');
  };

  // End active call
  const handleEndCall = () => {
    if (activeCallSession && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call_ended',
          room_name: activeCallSession.roomName,
        })
      );
    }
    setActiveCallSession(null);
    setIsCallMinimized(false);
    showToast('Call ended. Generating AI Call Scorecard review…');
  };

  if (!isAuthenticated) {
    return <AuthPage onSuccess={() => showToast('Welcome to Vertex Connect!')} />;
  }

  return (
    <div className="flex min-h-screen text-[var(--ink)]">
      {/* Sidebar */}
      <Sidebar
        currentPage={currentPage}
        onPageChange={(p) => {
          setCurrentPage(p);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          searchQuery={searchQuery}
          onSearchChange={(q) => setSearchQuery(q)}
          onShowNotificationToast={showToast}
        />

        <main className="flex-1 p-6 sm:p-8 max-w-[1600px] w-full mx-auto">
          {currentPage === 'messages' && (
            <MessagesPage
              onStartCall={(name, callType, targetUserId, targetConnectId) =>
                handleStartCall(name, callType || 'video', targetUserId, targetConnectId)
              }
              onShowToast={showToast}
            />
          )}
          {currentPage === 'meetings' && (
            <MeetingsPage
              onStartCall={(title, roomName) =>
                handleStartCall(title, 'video', undefined, undefined, roomName)
              }
              onShowToast={showToast}
            />
          )}
          {currentPage === 'intelligence' && <IntelligencePage onShowToast={showToast} />}
          {currentPage === 'teams' && <TeamsPage onShowToast={showToast} />}
          {currentPage === 'files' && <FilesPage onShowToast={showToast} />}
          {currentPage === 'analytics' && <AnalyticsPage />}
          {currentPage === 'settings' && <SettingsPage onShowToast={showToast} />}
        </main>
      </div>

      {/* Slide-out Customizer Drawer */}
      <CustomizerDrawer />

      {/* Live Video / Audio Call Modal (LiveKit WebRTC Cloud) */}
      {activeCallSession && !isCallMinimized && (
        <CallModal
          session={activeCallSession}
          currentUser={{
            id: user?.id || 'anon',
            name: user?.name || 'You',
            connect_id: user?.connect_id,
          }}
          onEndCall={handleEndCall}
          onMinimize={() => setIsCallMinimized(true)}
          onShowToast={showToast}
        />
      )}

      {/* Persistent Floating CallBar (when minimized) */}
      {activeCallSession && isCallMinimized && (
        <CallBar
          activeCallTitle={activeCallSession.title}
          onEndCall={handleEndCall}
          onExpand={() => setIsCallMinimized(false)}
          onShowToast={showToast}
        />
      )}

      {/* Incoming Call Popup Modal with Ringtone */}
      {incomingCall && (
        <IncomingCallModal
          call={incomingCall}
          onAccept={handleAcceptIncomingCall}
          onDecline={handleDeclineIncomingCall}
        />
      )}

      {/* Global Toast Alert */}
      {toastMessage && (
        <div className="fixed top-24 right-8 z-50 px-4 py-3 rounded-2xl bg-[#141b43]/95 border border-white/20 text-white text-xs font-semibold shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppearanceProvider>
        <MainLayout />
      </AppearanceProvider>
    </AuthProvider>
  );
}
