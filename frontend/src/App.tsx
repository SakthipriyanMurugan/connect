import React, { useState, useEffect, useRef } from 'react';
import { PhoneOff } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppearanceProvider } from './context/AppearanceContext';
import { AuthPage } from './components/auth/AuthPage';
import { Sidebar, NavPage } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { CustomizerDrawer } from './components/layout/CustomizerDrawer';
import { CallBar } from './components/calling/CallBar';
import { CallModal, ActiveCallSession, CallEndStats } from './components/calling/CallModal';
import { IncomingCallModal, IncomingCallData } from './components/calling/IncomingCallModal';
import { MeetingIntelligenceModal } from './components/calling/MeetingIntelligenceModal';
import type { MeetingIntelligenceReport } from './types';
import { API_BASE_URL, WS_BASE_URL } from './config/api';
import { stopOutgoingRingtone, stopRingtone } from './services/livekit';
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
  const [intelligenceReport, setIntelligenceReport] = useState<MeetingIntelligenceReport | null>(null);
  const [offlineCallModal, setOfflineCallModal] = useState<{
    isOpen: boolean;
    name: string;
    connectId?: string;
  }>({ isOpen: false, name: '' });

  // Global WebSocket for Call Signaling
  const wsRef = useRef<WebSocket | null>(null);

  // Register Service Worker for Web Push & request Notification permission
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW register notice:', e));
    }
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

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
    let reconnectTimeout: any = null;

    const connectWS = () => {
      try {
        ws = new WebSocket(`${WS_BASE_URL}/api/v1/ws/${user.id}`);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[Signaling WS] Connected for user:', user.id);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'incoming_call') {
              console.log('[Signaling WS] Incoming call event received:', data);
              setIncomingCall({
                caller_id: data.caller_id,
                caller_name: data.caller_name || 'Teammate',
                caller_connect_id: data.caller_connect_id,
                caller_avatar: data.caller_avatar,
                room_name: data.room_name,
                call_type: data.call_type || 'video',
              });

              // Trigger Native Web Push / Desktop Notification if in background
              if ('Notification' in window && Notification.permission === 'granted') {
                try {
                  new Notification(`VERTEX CONNECT: Incoming ${data.call_type || 'video'} call`, {
                    body: `Incoming call from ${data.caller_name || 'Teammate'} (@${data.caller_connect_id})`,
                    icon: '/favicon.ico',
                  });
                } catch (e) {
                  console.warn('Native notification notice:', e);
                }
              }
            } else if (data.type === 'call_response') {
              if (!data.accepted) {
                stopOutgoingRingtone();
                showToast('Call was declined by teammate.');
                setActiveCallSession(null);
              } else {
                stopOutgoingRingtone();
                showToast('Call accepted! Connecting LiveKit WebRTC stream…');
              }
            } else if (data.type === 'call_failed') {
              stopOutgoingRingtone();
              stopRingtone();
              setActiveCallSession(null);
              setIsCallMinimized(false);
              if (data.reason === 'offline') {
                setOfflineCallModal({
                  isOpen: true,
                  name: data.caller_name || 'Teammate',
                  connectId: data.target_connect_id || '',
                });
              } else {
                showToast(data.message || 'Call failed');
              }
            } else if (data.type === 'call_timeout') {
              stopOutgoingRingtone();
              stopRingtone();
              setIncomingCall(null);
              setActiveCallSession(null);
              setIsCallMinimized(false);
              showToast('Call timed out (Missed Call)');
            } else if (data.type === 'call_ended') {
              stopOutgoingRingtone();
              stopRingtone();
              showToast('Call ended by participant.');
              setActiveCallSession(null);
              setIsCallMinimized(false);
            } else if (data.type === 'device_limit_exceeded') {
              showToast('⚠️ Maximum 3 devices active for your account. Please disconnect another device.');
            }
          } catch (e) {
            console.warn('WS call signaling parse error:', e);
          }
        };

        ws.onerror = (e) => console.warn('WebSocket signaling error:', e);
        ws.onclose = (event: CloseEvent) => {
          wsRef.current = null;
          if (event.code === 4003) {
            // Device limit exceeded policy code: do NOT spam auto-reconnect
            showToast('⚠️ Device Limit Reached: Maximum 3 devices allowed simultaneously.');
            return;
          }
          // Auto reconnect after 3 seconds if user still logged in
          reconnectTimeout = setTimeout(connectWS, 3000);
        };
      } catch (e) {
        console.warn('Failed to establish signaling socket:', e);
      }
    };

    connectWS();

    // Listen to fallback signaling events from window
    const handleSignalingEvent = (e: any) => {
      const data = e.detail;
      if (!data) return;
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
          stopOutgoingRingtone();
          showToast('Call was declined by teammate.');
          setActiveCallSession(null);
        } else {
          stopOutgoingRingtone();
          showToast('Call accepted! Connecting LiveKit WebRTC stream…');
        }
      } else if (data.type === 'call_failed') {
        stopOutgoingRingtone();
        stopRingtone();
        setActiveCallSession(null);
        setIsCallMinimized(false);
        if (data.reason === 'offline') {
          setOfflineCallModal({
            isOpen: true,
            name: data.caller_name || 'Teammate',
            connectId: data.target_connect_id || '',
          });
        } else {
          showToast(data.message || 'Call failed');
        }
      } else if (data.type === 'call_timeout') {
        stopOutgoingRingtone();
        stopRingtone();
        setIncomingCall(null);
        setActiveCallSession(null);
        setIsCallMinimized(false);
        showToast('Call timed out (Missed Call)');
      } else if (data.type === 'call_ended') {
        stopOutgoingRingtone();
        stopRingtone();
        showToast('Call ended by participant.');
        setActiveCallSession(null);
        setIsCallMinimized(false);
      }
    };

    window.addEventListener('vertex_call_signaling', handleSignalingEvent);

    return () => {
      window.removeEventListener('vertex_call_signaling', handleSignalingEvent);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.close();
        wsRef.current = null;
      }
      stopOutgoingRingtone();
      stopRingtone();
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
      targetUserId,
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
      targetUserId: incomingCall.caller_id,
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

  // End active call and trigger AI Meeting Intelligence
  const handleEndCall = async (stats?: CallEndStats) => {
    if (activeCallSession && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call_ended',
          target_user_id: activeCallSession.targetUserId,
          room_name: activeCallSession.roomName,
        })
      );
    }
    const currentSession = activeCallSession;
    setActiveCallSession(null);
    setIsCallMinimized(false);

    // Auto-generate AI Call Scorecard & Intelligence Report
    if (stats && stats.duration_seconds > 0) {
      showToast('Generating AI Meeting Intelligence Report…');
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/intelligence/summarize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_name: stats.room_name || currentSession?.roomName,
            title: stats.title || currentSession?.title || 'Team Synchronization',
            caller_id: user?.id,
            duration_seconds: stats.duration_seconds,
            participants: stats.participants || [user?.name || 'Teammate'],
            meeting_type: currentSession?.callType || 'video',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.report) {
            setIntelligenceReport(data.report);
            showToast('AI Intelligence Scorecard ready!');
          }
        }
      } catch (e) {
        console.warn('AI Intelligence generation notice:', e);
      }
    } else {
      showToast('Call ended.');
    }
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

      {/* AI Meeting Intelligence Scorecard & Summary Modal */}
      {intelligenceReport && (
        <MeetingIntelligenceModal
          report={intelligenceReport}
          onClose={() => setIntelligenceReport(null)}
          onShowToast={showToast}
        />
      )}

      {/* Offline Teammate Notification & Animation Modal */}
      {offlineCallModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm p-6 overflow-hidden text-center rounded-3xl bg-[#141b43]/95 border border-red-500/30 text-white shadow-2xl backdrop-blur-2xl">
            {/* Red Pulsing Aura */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 bg-red-500/20 rounded-full blur-2xl pointer-events-none animate-pulse" />

            {/* Offline Icon */}
            <div className="relative mx-auto mb-4 w-20 h-20 rounded-full flex items-center justify-center bg-red-500/10 border-2 border-red-500/30 text-red-400 text-3xl shadow-xl">
              <PhoneOff className="w-8 h-8 animate-bounce text-red-400" />
            </div>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold mb-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              USER OFFLINE
            </span>

            <h3 className="text-xl font-bold text-white mb-1 truncate">{offlineCallModal.name}</h3>
            {offlineCallModal.connectId && (
              <p className="text-xs font-semibold text-[#8cf4ff] mb-2">@{offlineCallModal.connectId}</p>
            )}

            <p className="text-xs text-[#b6c5dd] mb-6 leading-relaxed">
              This teammate is not currently connected to the network. Your call could not be placed.
            </p>

            <button
              type="button"
              onClick={() => setOfflineCallModal({ isOpen: false, name: '' })}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white text-xs font-bold transition-all cursor-pointer shadow-lg active:scale-95"
            >
              OK, Got it
            </button>
          </div>
        </div>
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
