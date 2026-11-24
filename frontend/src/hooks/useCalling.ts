import { useState, useRef, useEffect, useCallback } from 'react';
import type { ActiveCallSession, CallEndStats } from '../components/calling/CallModal';
import type { IncomingCallData } from '../components/calling/IncomingCallModal';
import { callService } from '../services/calling/callService';
import { stopOutgoingRingtone, stopRingtone } from '../services/livekit';
import { API_BASE_URL } from '../config/api';

export interface UseCallingProps {
  currentUser: { id: string; name: string; connect_id?: string } | null;
  wsRef?: React.RefObject<WebSocket | null>;
  onShowToast: (msg: string) => void;
}

export function useCalling({ currentUser, wsRef, onShowToast }: UseCallingProps) {
  const [activeCallSession, setActiveCallSession] = useState<ActiveCallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [isCallMinimized, setIsCallMinimized] = useState<boolean>(false);
  const [isCallHistoryOpen, setIsCallHistoryOpen] = useState<boolean>(false);
  const [callWaitingItem, setCallWaitingItem] = useState<IncomingCallData | null>(null);

  // Start outgoing call (voice, video, group)
  const startCall = useCallback(
    async (
      title: string,
      callType: 'video' | 'audio' | 'group' = 'video',
      targetUserId?: string,
      targetConnectId?: string,
      customRoomName?: string
    ) => {
      const roomName =
        customRoomName ||
        (targetUserId && currentUser?.id
          ? `call_${[currentUser.id, targetUserId].sort().join('_')}_${Date.now()}`
          : `meet_${Date.now()}`);

      // 1. Send WebSocket Signaling Invite
      if (targetUserId && wsRef?.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'call_invite',
            target_user_id: targetUserId,
            caller_name: currentUser?.name || 'Teammate',
            caller_connect_id: currentUser?.connect_id || '',
            room_name: roomName,
            call_type: callType,
          })
        );
        onShowToast(`Calling ${title}... WhatsApp dial tone ringing.`);
      } else {
        onShowToast(`Joining room: ${title}. Connecting secure stream...`);
      }

      // 2. Persist in database
      if (currentUser?.id) {
        callService.initiateCall(
          currentUser.id,
          targetUserId,
          callType === 'audio' ? 'voice' : (callType as any),
          roomName,
          title
        );
      }

      setActiveCallSession({
        roomName,
        title,
        callType,
        targetUserId,
        targetConnectId,
      });
      setIsCallMinimized(false);
    },
    [currentUser, wsRef, onShowToast]
  );

  // Accept incoming call
  const acceptCall = useCallback(() => {
    if (!incomingCall) return;

    if (wsRef?.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call_response',
          target_user_id: incomingCall.caller_id,
          accepted: true,
          room_name: incomingCall.room_name,
        })
      );
    }

    if (currentUser?.id) {
      callService.respondCall(incomingCall.room_name, currentUser.id, true);
    }

    setActiveCallSession({
      roomName: incomingCall.room_name,
      title: incomingCall.caller_name,
      callType: incomingCall.call_type === 'voice' ? 'audio' : incomingCall.call_type,
      targetUserId: incomingCall.caller_id,
      targetConnectId: incomingCall.caller_connect_id,
      isIncoming: true,
    });
    setIsCallMinimized(false);
    setIncomingCall(null);
  }, [incomingCall, currentUser, wsRef]);

  // Decline incoming call
  const declineCall = useCallback(() => {
    if (!incomingCall) return;

    if (wsRef?.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call_response',
          target_user_id: incomingCall.caller_id,
          accepted: false,
          room_name: incomingCall.room_name,
        })
      );
    }

    if (currentUser?.id) {
      callService.respondCall(incomingCall.room_name, currentUser.id, false);
    }

    setIncomingCall(null);
    onShowToast('Call declined.');
  }, [incomingCall, currentUser, wsRef, onShowToast]);

  // End active call
  const endCall = useCallback(
    async (stats?: CallEndStats) => {
      const current = activeCallSession;
      if (current && wsRef?.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'call_ended',
            target_user_id: current.targetUserId,
            room_name: current.roomName,
          })
        );
      }

      if (current && currentUser?.id) {
        callService.endCall(current.roomName, currentUser.id, stats?.duration_seconds || 0);
      }

      setActiveCallSession(null);
      setIsCallMinimized(false);
      stopOutgoingRingtone();
      stopRingtone();

      onShowToast(stats && stats.duration_seconds > 0 ? `Call ended (${stats.duration_seconds}s)` : 'Call ended.');
    },
    [activeCallSession, currentUser, wsRef, onShowToast]
  );

  return {
    activeCallSession,
    incomingCall,
    isCallMinimized,
    isCallHistoryOpen,
    callWaitingItem,
    setActiveCallSession,
    setIncomingCall,
    setIsCallMinimized,
    setIsCallHistoryOpen,
    startCall,
    acceptCall,
    declineCall,
    endCall,
  };
}
