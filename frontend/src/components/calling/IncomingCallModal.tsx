import React, { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { playRingtone, stopRingtone } from '../../services/livekit';

export interface IncomingCallData {
  caller_id: string;
  caller_name: string;
  caller_connect_id?: string;
  caller_avatar?: string;
  room_name: string;
  call_type: 'video' | 'audio' | 'voice' | 'group';
}

interface IncomingCallModalProps {
  call: IncomingCallData;
  onAccept: () => void;
  onDecline: (isTimeout?: boolean) => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  call,
  onAccept,
  onDecline,
}) => {
  const respondedRef = useRef(false);

  useEffect(() => {
    playRingtone();

    // 35-Second Auto Missed-Call Timeout
    const autoTimeout = setTimeout(() => {
      if (respondedRef.current) return;
      respondedRef.current = true;
      stopRingtone();
      onDecline(true);
    }, 35000);

    return () => {
      clearTimeout(autoTimeout);
      stopRingtone();
    };
  }, []);

  const handleAccept = () => {
    if (respondedRef.current) return;
    respondedRef.current = true;
    stopRingtone();
    onAccept();
  };

  const handleDecline = () => {
    if (respondedRef.current) return;
    respondedRef.current = true;
    stopRingtone();
    onDecline(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm p-6 overflow-hidden text-center rounded-3xl bg-[#141b43]/95 border border-white/20 text-white shadow-2xl backdrop-blur-2xl">
        {/* Pulsing Aura */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 bg-gradient-to-r from-[#8cf4ff]/30 to-[#d6a2ff]/30 rounded-full blur-2xl pointer-events-none animate-pulse" />

        {/* Caller Avatar */}
        <div className="relative mx-auto mb-4 w-24 h-24 rounded-full flex items-center justify-center bg-gradient-to-tr from-[#8cf4ff] via-[#8d8cff] to-[#d6a2ff] text-[#171a42] text-3xl font-extrabold shadow-xl">
          <span className="relative z-10">
            {call.caller_name ? call.caller_name.slice(0, 2).toUpperCase() : 'VC'}
          </span>
          <div className="absolute inset-0 rounded-full border-4 border-[#8cf4ff] animate-ping opacity-50" />
        </div>

        {/* Caller Info */}
        <h3 className="text-xl font-bold text-white mb-1 truncate">{call.caller_name}</h3>
        {call.caller_connect_id && (
          <p className="text-xs font-semibold text-[#8cf4ff] mb-2">@{call.caller_connect_id}</p>
        )}
        <p className="text-xs text-[#b6c5dd] mb-6 flex items-center justify-center gap-1.5 font-medium">
          {call.call_type === 'video' || call.call_type === 'group' ? (
            <Video className="w-3.5 h-3.5 text-[#8cf4ff]" />
          ) : (
            <Phone className="w-3.5 h-3.5 text-[#12a878]" />
          )}
          Incoming {call.call_type === 'group' ? 'Group' : call.call_type === 'video' ? 'Video' : 'Voice'} Call…
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-6">
          {/* Decline Button */}
          <button
            type="button"
            onClick={handleDecline}
            className="group flex flex-col items-center gap-1.5 cursor-pointer"
          >
            <div className="w-14 h-14 rounded-full bg-[#f04454] hover:bg-[#d93040] text-white flex items-center justify-center shadow-lg transition-transform transform active:scale-95 group-hover:scale-105">
              <PhoneOff className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-semibold text-[#fca5a5]">Decline</span>
          </button>

          {/* Accept Button */}
          <button
            type="button"
            onClick={handleAccept}
            className="group flex flex-col items-center gap-1.5 cursor-pointer"
          >
            <div className="w-14 h-14 rounded-full bg-[#12a878] hover:bg-[#0f8c64] text-white flex items-center justify-center shadow-lg transition-transform transform active:scale-95 group-hover:scale-105 animate-bounce">
              {call.call_type === 'video' ? <Video className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
            </div>
            <span className="text-[11px] font-semibold text-[#86efac]">Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
};
