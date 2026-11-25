import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { PhoneOff, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Sidebar, MobileBottomNav, NavPage } from './Sidebar';
import { Topbar } from './Topbar';
import { CustomizerDrawer } from './CustomizerDrawer';
import { CallBar } from '../calling/CallBar';
import type { ActiveCallSession, CallEndStats, CallControlsHandle } from '../calling/CallModal';
import { IncomingCallModal, IncomingCallData } from '../calling/IncomingCallModal';
import type { MeetingIntelligenceReport } from '../../types';
import { API_BASE_URL, WS_BASE_URL } from '../../config/api';
import { stopOutgoingRingtone, stopRingtone } from '../../services/livekit';
import { callService } from '../../services/calling/callService';

// Code-split pages for sub-second initial load
const MessagesPage = lazy(() => import('../pages/MessagesPage').then(m => ({ default: m.MessagesPage })));
const MeetingsPage = lazy(() => import('../pages/MeetingsPage').then(m => ({ default: m.MeetingsPage })));
const IntelligencePage = lazy(() => import('../pages/IntelligencePage').then(m => ({ default: m.IntelligencePage })));
const TeamsPage = lazy(() => import('../pages/TeamsPage').then(m => ({ default: m.TeamsPage })));
const FilesPage = lazy(() => import('../pages/FilesPage').then(m => ({ default: m.FilesPage })));
const AnalyticsPage = lazy(() => import('../pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const SettingsPage = lazy(() => import('../pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const CallModal = lazy(() => import('../calling/CallModal').then(m => ({ default: m.CallModal })));
const CallHistoryModal = lazy(() => import('../calling/CallHistoryModal').then(m => ({ default: m.CallHistoryModal })));
const MeetingIntelligenceModal = lazy(() => import('../calling/MeetingIntelligenceModal').then(m => ({ default: m.MeetingIntelligenceModal })));

const PageLoaderFallback = () => (
  <div className="flex-1 h-full min-h-[300px] flex items-center justify-center text-slate-400">
    <div className="flex flex-col items-center gap-2">
      <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      <span className="text-xs text-slate-500 font-medium">Loading workspace…</span>
    </div>
  </div>
);

export const MainLayout: React.FC = () => {
  const { user } = useAuth();
  const [currentPage, setCurrentPage] = useState<NavPage>('messages');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);

  // Active Calling & LiveKit Session State
  const [activeCallSession, setActiveCallSession] = useState<ActiveCallSession | null>(null);
  const [isCallMinimized, setIsCallMinimized] = useState<boolean>(false);
  const [isCallHistoryOpen, setIsCallHistoryOpen] = useState<boolean>(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [intelligenceReport, setIntelligenceReport] = useState<MeetingIntelligenceReport | null>(null);
  const [offlineCallModal, setOfflineCallModal] = useState<{
    isOpen: boolean;
    name: string;
    connectId?: string;
  }>({ isOpen: false, name: '' });

  // Synced CallBar state + live control ref
  const callControlRef = useRef<CallControlsHandle | null>(null);
  const [callBarState, setCallBarState] = useState({
    isMuted: false,
    isVideoOn: true,
    isScreenSharing: false,
    durationSeconds: 0,
  });

  // Global WebSocket for Call Signaling
  const wsRef = useRef<WebSocket | null>(null);
  const activeCallRef = useRef<ActiveCallSession | null>(null);
  activeCallRef.current = activeCallSession;
  const incomingCallRef = useRef<IncomingCallData | null>(null);
  incomingCallRef.current = incomingCall;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3000);
  };

  // Deep-link meeting / call room auto-join (/?room=... or /meet/...)
  useEffect(() => {
    if (!user?.id || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const qRoom = params.get('room');
    const pathMatch = window.location.pathname.match(/^\/meet\/([^/]+)/);
    const pendingRoom = sessionStorage.getItem('vertex_pending_room');
    const targetRoom = qRoom || (pathMatch ? decodeURIComponent(pathMatch[1]) : null) || pendingRoom;

    if (targetRoom) {
      sessionStorage.removeItem('vertex_pending_room');
      try {
        window.history.replaceState({}, '', '/');
      } catch {}
      setActiveCallSession({
        roomName: targetRoom,
        title: `Invited Room (${targetRoom.slice(0, 14)})`,
        callType: 'video',
      });
      setIsCallMinimized(false);
      showToast(`Joining shared room: ${targetRoom}`);
    }
  }, [user?.id]);

  // Unified signaling dispatcher (handles both WebSocket and Serverless Edge KV Signals)
  const processIncomingSignal = (data: any) => {
    if (!data || !data.type) return;

    if (data.type === 'incoming_call') {
      // If already in an active call or already ringing same room, ignore duplicate or notify busy
      if (activeCallRef.current) {
        return;
      }
      if (incomingCallRef.current?.room_name === data.room_name) {
        return;
      }
      setIncomingCall({
        caller_id: data.caller_id,
        caller_name: data.caller_name || 'Teammate',
        caller_connect_id: data.caller_connect_id,
        caller_avatar: data.caller_avatar,
        room_name: data.room_name,
        call_type: data.call_type || 'video',
      });

      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(`VERTEX CONNECT: Incoming ${data.call_type === 'audio' || data.call_type === 'voice' ? 'voice' : 'video'} call`, {
            body: `Incoming call from ${data.caller_name || 'Teammate'}${data.caller_connect_id ? ` (@${data.caller_connect_id})` : ''}`,
            icon: '/favicon.svg',
          });
        } catch {}
      }
    } else if (data.type === 'call_response') {
      if (!data.accepted) {
        stopOutgoingRingtone();
        showToast('Call was declined.');
        setActiveCallSession(null);
        setIsCallMinimized(false);
      } else {
        stopOutgoingRingtone();
        showToast('Call accepted! Connected.');
        window.dispatchEvent(new CustomEvent('vertex_call_accepted', { detail: data }));
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
    } else if (data.type === 'call_timeout' || data.type === 'call:timeout' || data.type === 'call:missed') {
      stopOutgoingRingtone();
      stopRingtone();
      setIncomingCall(null);
      setActiveCallSession(null);
      setIsCallMinimized(false);
      showToast('Missed call (no answer)');
    } else if (data.type === 'call_ended' || data.type === 'call:end' || data.type === 'call:cancel') {
      stopOutgoingRingtone();
      stopRingtone();
      setIncomingCall(null);
      setActiveCallSession(null);
      setIsCallMinimized(false);
      showToast('Call ended.');
    } else if (data.type === 'call_busy' || data.type === 'call:busy') {
      stopOutgoingRingtone();
      stopRingtone();
      setActiveCallSession(null);
      setIsCallMinimized(false);
      showToast(`${data.caller_name || 'Teammate'} is busy on another call.`);
    } else if (data.type === 'connection_request' || data.type === 'connection_accepted') {
      window.dispatchEvent(new CustomEvent('vertex_connection_signal', { detail: data }));
    } else if (data.type === 'device_limit_exceeded') {
      showToast('⚠️ Maximum active devices reached. Please disconnect another session.');
    }
  };

  // 1. Connect global WebSocket for local/dedicated backend signaling
  useEffect(() => {
    if (!user?.id || !WS_BASE_URL) return;

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
            processIncomingSignal(data);
          } catch (e) {
            console.warn('WS call signaling parse error:', e);
          }
        };

        ws.onerror = (e) => console.warn('WebSocket signaling error:', e);
        ws.onclose = (event: CloseEvent) => {
          wsRef.current = null;
          if (event.code === 4003) {
            showToast('⚠️ Device Limit Reached.');
            return;
          }
          reconnectTimeout = setTimeout(connectWS, 3000);
        };
      } catch (e) {
        console.warn('Failed to establish signaling socket:', e);
      }
    };

    connectWS();

    const handleSignalingEvent = (e: any) => {
      if (e?.detail) processIncomingSignal(e.detail);
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

  // 2. Serverless Edge Signal Polling (Works 24/7 on Cloudflare Pages even without WebSocket server!)
  useEffect(() => {
    if (!user?.id || WS_BASE_URL) return;

    const poll = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const res = await callService.pollSignals(user.id);
      if (Array.isArray(res.signals)) {
        for (const sig of res.signals) {
          processIncomingSignal(sig);
        }
      }
      if (Array.isArray(res.typing)) {
        window.dispatchEvent(new CustomEvent('vertex_edge_typing', { detail: res.typing }));
      }
    };

    poll();
    const timer = setInterval(poll, 1300);
    return () => clearInterval(timer);
  }, [user?.id]);

  // Start outgoing call (WebSocket + Persistent REST API + Edge KV Signaling)
  const handleStartCall = async (
    title: string,
    callType: 'video' | 'audio' | 'voice' | 'group' = 'video',
    targetUserId?: string,
    targetConnectId?: string,
    customRoomName?: string
  ) => {
    const roomName =
      customRoomName ||
      (targetUserId
        ? `call_${[user?.id || 'anon', targetUserId].sort().join('_')}_${Date.now()}`
        : `meet_${Date.now()}`);

    const sessionObj: ActiveCallSession = {
      roomName,
      title,
      callType,
      targetUserId,
      targetConnectId,
    };

    setActiveCallSession(sessionObj);
    setIsCallMinimized(false);

    // 1. Send via WebSocket if active
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
      showToast(`Calling ${title}…`);
    } else if (targetUserId) {
      showToast(`Calling ${title}…`);
    } else {
      showToast(`Joining room: ${title}…`);
    }

    // 2. Always persist in DB & dispatch Edge KV signal!
    if (user?.id) {
      const apiType = (callType === 'audio' || callType === 'voice') ? 'voice' : callType === 'group' ? 'group' : 'video';
      const initRes = await callService.initiateCall(user.id, targetUserId, apiType, roomName, title);
      if (initRes && initRes.success === false && initRes.reason === 'busy') {
        stopOutgoingRingtone();
        setActiveCallSession(null);
        showToast(initRes.message || `${title} is busy on another call.`);
      }
    }
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

    if (user?.id) {
      callService.respondCall(incomingCall.room_name, user.id, true);
    }

    setActiveCallSession({
      roomName: incomingCall.room_name,
      title: incomingCall.caller_name,
      callType: incomingCall.call_type,
      targetUserId: incomingCall.caller_id,
      targetConnectId: incomingCall.caller_connect_id,
      isIncoming: true,
    });
    setIsCallMinimized(false);
    setIncomingCall(null);
  };

  // Decline or auto-timeout incoming call
  const handleDeclineIncomingCall = (isTimeout = false) => {
    if (!incomingCall) return;

    if (isTimeout) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'call_timeout',
            target_user_id: incomingCall.caller_id,
            room_name: incomingCall.room_name,
          })
        );
      }
      if (user?.id) {
        callService.timeoutCall(incomingCall.room_name, incomingCall.caller_id, user.id);
      }
      setIncomingCall(null);
      showToast('Missed call');
      return;
    }

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

    if (user?.id) {
      callService.respondCall(incomingCall.room_name, user.id, false);
    }

    setIncomingCall(null);
    showToast('Call declined.');
  };

  // Handle outgoing 35s timeout (Missed Call)
  const handleOutgoingTimeout = () => {
    const current = activeCallSession;
    if (!current) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call_timeout',
          target_user_id: current.targetUserId,
          room_name: current.roomName,
        })
      );
    }
    if (user?.id) {
      callService.timeoutCall(current.roomName, user.id, current.targetUserId);
    }
    setActiveCallSession(null);
    setIsCallMinimized(false);
  };

  // End active call and trigger AI Meeting Intelligence ONLY for connected calls > 3s
  const handleEndCall = async (stats?: CallEndStats) => {
    const currentSession = activeCallSession;
    if (currentSession && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call_ended',
          target_user_id: currentSession.targetUserId,
          room_name: currentSession.roomName,
        })
      );
    }
    if (currentSession && user?.id) {
      callService.endCall(
        currentSession.roomName,
        user.id,
        stats?.duration_seconds || 0,
        currentSession.targetUserId
      );
    }

    setActiveCallSession(null);
    setIsCallMinimized(false);

    if (stats && stats.was_connected && stats.duration_seconds >= 3) {
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

  return (
    <div className="flex h-screen overflow-hidden text-slate-800 bg-[#f8fafc]">
      {/* Sidebar - Vertex Connect Executive Dock */}
      <Sidebar
        currentPage={currentPage}
        unreadCount={unreadChatCount}
        onPageChange={(p) => {
          setCurrentPage(p);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden pb-14 md:pb-0">
        {currentPage !== 'messages' && (
          <Topbar
            searchQuery={searchQuery}
            onSearchChange={(q) => setSearchQuery(q)}
            onNavigatePage={(p) => setCurrentPage(p)}
            onOpenCallHistory={() => setIsCallHistoryOpen(true)}
            onShowNotificationToast={showToast}
          />
        )}

        <main className={`flex-1 w-full h-full overflow-hidden ${currentPage === 'messages' ? 'p-0' : 'p-2 sm:p-5 md:p-8 max-w-[1600px] mx-auto overflow-y-auto'}`}>
          <Suspense fallback={<PageLoaderFallback />}>
            {currentPage === 'messages' && (
              <MessagesPage
                onStartCall={(name, callType, targetUserId, targetConnectId) =>
                  handleStartCall(name, callType || 'video', targetUserId, targetConnectId)
                }
                onOpenCallHistory={() => setIsCallHistoryOpen(true)}
                onUnreadCountChange={(n) => setUnreadChatCount(n)}
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
            {currentPage === 'teams' && (
              <TeamsPage
                onStartCall={(title, roomName) =>
                  handleStartCall(title, 'group', undefined, undefined, roomName)
                }
                onShowToast={showToast}
              />
            )}
            {currentPage === 'files' && <FilesPage onShowToast={showToast} />}
            {currentPage === 'analytics' && <AnalyticsPage />}
            {currentPage === 'settings' && <SettingsPage onShowToast={showToast} />}
          </Suspense>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        currentPage={currentPage}
        unreadCount={unreadChatCount}
        onPageChange={(page) => setCurrentPage(page)}
      />

      {/* Floating Theme Customizer Drawer */}
      <CustomizerDrawer />

      <Suspense fallback={null}>
        {/* Live Video / Audio Call Modal (Kept mounted when minimized so audio/video stays live!) */}
        {activeCallSession && (
          <CallModal
            session={activeCallSession}
            currentUser={{
              id: user?.id || 'anon',
              name: user?.name || 'You',
              connect_id: user?.connect_id,
            }}
            isMinimized={isCallMinimized}
            controlRef={callControlRef}
            onSyncState={(s) => setCallBarState(s)}
            onEndCall={(stats) => handleEndCall(stats)}
            onTimeout={handleOutgoingTimeout}
            onMinimize={() => setIsCallMinimized(true)}
            onShowToast={showToast}
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

        {/* WhatsApp-Style Call History & Redial Modal */}
        {isCallHistoryOpen && (
          <CallHistoryModal
            userId={user?.id || ''}
            isOpen={isCallHistoryOpen}
            onClose={() => setIsCallHistoryOpen(false)}
            onRedial={(name, callType, targetUserId, targetConnectId) => {
              setIsCallHistoryOpen(false);
              handleStartCall(name, callType, targetUserId, targetConnectId);
            }}
          />
        )}
      </Suspense>

      {/* Persistent Floating CallBar (when minimized) */}
      {activeCallSession && isCallMinimized && (
        <CallBar
          activeCallTitle={activeCallSession.title}
          callType={activeCallSession.callType}
          durationSeconds={callBarState.durationSeconds}
          isMuted={callBarState.isMuted}
          isVideoOn={callBarState.isVideoOn}
          isScreenSharing={callBarState.isScreenSharing}
          onToggleMute={() => callControlRef.current?.toggleMute()}
          onToggleVideo={() => callControlRef.current?.toggleVideo()}
          onToggleScreenShare={() => callControlRef.current?.toggleScreenShare()}
          onEndCall={() => callControlRef.current?.hangup() || handleEndCall()}
          onExpand={() => setIsCallMinimized(false)}
          onShowToast={showToast}
        />
      )}

      {/* Incoming Call Popup Modal with Ringtone */}
      {incomingCall && (
        <IncomingCallModal
          call={incomingCall}
          onAccept={handleAcceptIncomingCall}
          onDecline={(isTimeout) => handleDeclineIncomingCall(isTimeout)}
        />
      )}

      {/* Offline Teammate Notification Modal */}
      {offlineCallModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm p-6 overflow-hidden text-center rounded-3xl bg-[#141b43]/95 border border-red-500/30 text-white shadow-2xl backdrop-blur-2xl">
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 bg-red-500/20 rounded-full blur-2xl pointer-events-none animate-pulse" />

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
