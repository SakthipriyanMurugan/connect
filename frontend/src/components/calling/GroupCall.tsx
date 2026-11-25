import React, { useEffect, useRef } from 'react';
import { Users, ShieldCheck, MicOff, Radio, Link2 } from 'lucide-react';
import { CallControls } from './CallControls';

export interface ParticipantInfo {
  identity: string;
  name: string;
  isSpeaking?: boolean;
  isAudioMuted?: boolean;
  isVideoOff?: boolean;
  videoTrack?: any;
}

const ParticipantVideoTile: React.FC<{
  track?: any;
  isLocal?: boolean;
  isVideoOff?: boolean;
  initials: string;
  label: string;
  isMuted?: boolean;
  isSpeaking?: boolean;
}> = ({ track, isLocal, isVideoOff, initials, label, isMuted, isSpeaking }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (track && el && !isVideoOff) {
      try {
        track.attach(el);
      } catch {}
      return () => {
        try {
          track.detach(el);
        } catch {}
      };
    }
  }, [track, isVideoOff]);

  return (
    <div
      className={`relative rounded-2xl overflow-hidden bg-[#0d1438] border-2 transition-all flex items-center justify-center min-h-[180px] ${
        isSpeaking
          ? 'border-emerald-400 ring-4 ring-emerald-400/30 shadow-lg shadow-emerald-400/20'
          : isLocal && !isMuted
          ? 'border-emerald-500/70'
          : 'border-white/10'
      }`}
    >
      {track && !isVideoOff ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full object-cover ${isLocal ? 'transform -scale-x-100' : ''}`}
        />
      ) : (
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-xl ${
            isLocal
              ? 'bg-gradient-to-tr from-blue-600 to-indigo-600'
              : 'bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500'
          }`}
        >
          {initials}
        </div>
      )}

      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-xs font-semibold">
        <span>{label}</span>
        {isMuted && <MicOff className="w-3 h-3 text-rose-400" />}
      </div>

      {isSpeaking && (
        <span className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-slate-900 shadow-sm animate-pulse">
          <Radio className="w-2.5 h-2.5" /> Speaking
        </span>
      )}
    </div>
  );
};

interface GroupCallProps {
  roomTitle: string;
  roomName: string;
  durationSeconds: number;
  participants: ParticipantInfo[];
  currentUserName: string;
  localVideoTrack?: any;
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  hasScreenShare: boolean;
  screenShareRef: React.RefObject<HTMLVideoElement | null>;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onSwitchCamera?: () => void;
  onSelectSpeaker?: (deviceId: string) => void;
  onHangup: () => void;
  onCopyInviteLink?: () => void;
}

export const GroupCall: React.FC<GroupCallProps> = ({
  roomTitle,
  roomName,
  durationSeconds,
  participants,
  currentUserName,
  localVideoTrack,
  isMuted,
  isVideoOn,
  isScreenSharing,
  hasScreenShare,
  screenShareRef,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onSwitchCamera,
  onSelectSpeaker,
  onHangup,
  onCopyInviteLink,
}) => {
  const formatTime = (secs: number) => {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const totalCount = participants.length + 1;

  const getGridClass = () => {
    if (hasScreenShare) return 'grid-cols-1';
    if (totalCount <= 2) return 'grid-cols-1 sm:grid-cols-2';
    if (totalCount <= 4) return 'grid-cols-2';
    if (totalCount <= 6) return 'grid-cols-2 sm:grid-cols-3';
    return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4';
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-[#070a1e] text-white overflow-hidden select-none">
      {/* Top Header */}
      <div className="h-16 px-4 sm:px-6 border-b border-white/10 flex items-center justify-between bg-white/5 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white shadow-md">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              {roomTitle || 'Group Conference'}
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> LiveKit SFU
              </span>
            </h3>
            <p className="text-[11px] text-slate-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{formatTime(durationSeconds)}</span>
              <span>• {totalCount} participants</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onCopyInviteLink && (
            <button
              type="button"
              onClick={onCopyInviteLink}
              title="Copy meeting invite link"
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            >
              <Link2 className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Invite Link</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid View */}
      <div className="relative flex-1 w-full h-full p-3 sm:p-5 overflow-y-auto">
        {hasScreenShare ? (
          <div className="w-full h-full flex flex-col items-center justify-center">
            <video
              ref={screenShareRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain rounded-2xl bg-black"
            />
          </div>
        ) : (
          <div className={`grid ${getGridClass()} gap-3 w-full h-full auto-rows-fr`}>
            {/* Local Participant Video Tile */}
            <ParticipantVideoTile
              track={localVideoTrack}
              isLocal
              isVideoOff={!isVideoOn}
              initials={currentUserName.slice(0, 2).toUpperCase()}
              label={`${currentUserName} (You)`}
              isMuted={isMuted}
            />

            {/* Remote Participants Video Tiles */}
            {participants.map((p) => (
              <ParticipantVideoTile
                key={p.identity}
                track={p.videoTrack}
                isVideoOff={p.isVideoOff}
                initials={(p.name || p.identity || 'U').slice(0, 2).toUpperCase()}
                label={p.name || p.identity}
                isMuted={p.isAudioMuted}
                isSpeaking={p.isSpeaking}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating Bottom Controls */}
      <div className="p-4 flex justify-center shrink-0 z-30">
        <CallControls
          isMuted={isMuted}
          isVideoOn={isVideoOn}
          isScreenSharing={isScreenSharing}
          callType="group"
          onToggleMute={onToggleMute}
          onToggleVideo={onToggleVideo}
          onToggleScreenShare={onToggleScreenShare}
          onSwitchCamera={onSwitchCamera}
          onSelectSpeaker={onSelectSpeaker}
          onHangup={onHangup}
        />
      </div>
    </div>
  );
};
