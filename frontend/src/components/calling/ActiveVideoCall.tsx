import React, { useRef, useState, useEffect } from 'react';
import { ShieldCheck, Radio, Minimize2, Link2, UserPlus, Tv } from 'lucide-react';
import { CallControls } from './CallControls';

interface ActiveVideoCallProps {
  partnerName: string;
  partnerConnectId?: string;
  durationSeconds: number;
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  hasRemoteVideo: boolean;
  hasScreenShare: boolean;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  screenShareRef: React.RefObject<HTMLVideoElement | null>;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onSwitchCamera?: () => void;
  onSelectSpeaker?: (deviceId: string) => void;
  onMinimize: () => void;
  onHangup: () => void;
  onInviteTeammate?: () => void;
}

export const ActiveVideoCall: React.FC<ActiveVideoCallProps> = ({
  partnerName,
  partnerConnectId,
  durationSeconds,
  isMuted,
  isVideoOn,
  isScreenSharing,
  hasRemoteVideo,
  hasScreenShare,
  remoteVideoRef,
  localVideoRef,
  screenShareRef,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onSwitchCamera,
  onSelectSpeaker,
  onMinimize,
  onHangup,
  onInviteTeammate,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isSwapped, setIsSwapped] = useState(false);

  const formatTime = (secs: number) => {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleTogglePiP = async () => {
    const video = isSwapped ? localVideoRef.current : remoteVideoRef.current;
    if (video && 'requestPictureInPicture' in video) {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      } catch (e) {
        console.warn('PiP warning:', e);
      }
    }
  };

  const initials = (partnerName || 'User').slice(0, 2).toUpperCase();

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex flex-col bg-[#070a1e] text-white overflow-hidden select-none"
    >
      {/* 1. Top Glassmorphism Header Bar */}
      <div className="absolute top-0 inset-x-0 h-16 sm:h-20 px-4 sm:px-6 z-20 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-400 flex items-center justify-center font-bold text-sm text-white shadow-lg">
            {initials}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white leading-tight truncate">
                {partnerName}
              </h3>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <ShieldCheck className="w-3 h-3" /> LiveKit Encrypted
              </span>
            </div>
            <p className="text-[11px] text-slate-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono">{formatTime(durationSeconds)}</span>
              {partnerConnectId && <span className="text-slate-400">@{partnerConnectId}</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quality Indicator Badge */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 border border-white/15 text-[11px] font-medium text-blue-300 backdrop-blur-md">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>4K UHD / 2K • 48kHz HD</span>
          </div>

          {onInviteTeammate && (
            <button
              type="button"
              onClick={onInviteTeammate}
              title="Add participant to call"
              className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md"
            >
              <UserPlus className="w-4 h-4 text-blue-400" />
              <span className="hidden sm:inline">Invite</span>
            </button>
          )}

          <button
            type="button"
            onClick={onMinimize}
            title="Minimize call"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 transition-all cursor-pointer backdrop-blur-md"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Main Video Presentation Area */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center bg-[#070a1e] overflow-hidden">
        {/* Remote Participant Container (Full Screen OR Swapped PiP) */}
        <div
          onClick={isSwapped && !hasScreenShare ? () => setIsSwapped(false) : undefined}
          title={isSwapped && !hasScreenShare ? 'Click to swap views' : undefined}
          className={
            isSwapped && !hasScreenShare
              ? 'absolute right-4 sm:right-6 bottom-24 sm:bottom-28 w-28 sm:w-44 h-40 sm:h-60 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-black/80 z-20 cursor-pointer transition-transform transform hover:scale-105 active:scale-95 flex items-center justify-center'
              : 'w-full h-full flex items-center justify-center'
          }
        >
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              hasRemoteVideo && !hasScreenShare ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
            }`}
          />

          {/* Remote Camera Off Placeholder */}
          {!hasRemoteVideo && !hasScreenShare && (
            <div className="flex flex-col items-center justify-center text-center animate-in fade-in duration-300 p-2">
              <div className={isSwapped ? 'w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-400 flex items-center justify-center text-white text-base font-extrabold shadow-lg mb-1' : 'w-32 h-32 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-400 flex items-center justify-center text-white text-4xl font-extrabold shadow-2xl ring-4 ring-white/10 mb-4'}>
                {initials}
              </div>
              {!isSwapped && <h4 className="text-xl font-bold text-white mb-1">{partnerName}</h4>}
              <span className="text-[10px] sm:text-xs text-slate-400">Camera off</span>
            </div>
          )}
        </div>

        {/* Screen Share Display */}
        <div className={`w-full h-full flex flex-col items-center justify-center ${hasScreenShare ? 'block' : 'hidden'}`}>
          <video
            ref={screenShareRef}
            autoPlay
            playsInline
            className="w-full h-full object-contain bg-black"
          />
          <span className="absolute top-20 left-6 px-3 py-1 bg-black/70 backdrop-blur-md border border-white/15 rounded-lg text-xs font-semibold text-blue-300">
            Shared Screen
          </span>
        </div>

        {/* 3. Local Camera Container (Floating PiP OR Full Screen when Swapped) */}
        <div
          onClick={!isSwapped ? () => setIsSwapped(true) : undefined}
          title={!isSwapped ? 'Click to swap views' : undefined}
          className={
            isSwapped && !hasScreenShare
              ? 'w-full h-full flex items-center justify-center bg-[#070a1e]'
              : 'absolute right-4 sm:right-6 bottom-24 sm:bottom-28 w-28 sm:w-44 h-40 sm:h-60 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-black/80 z-20 cursor-pointer transition-transform transform hover:scale-105 active:scale-95 group'
          }
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transform -scale-x-100 ${isVideoOn ? 'block' : 'hidden'}`}
          />
          {!isVideoOn && (
            <div className="w-full h-full flex flex-col items-center justify-center text-center p-2 bg-[#0d1438]">
              <div className={isSwapped ? 'w-28 h-28 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-3xl mb-3' : 'w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs mb-1'}>
                You
              </div>
              <span className="text-[10px] sm:text-xs text-slate-400">Camera off</span>
            </div>
          )}
          {!isSwapped && (
            <span className="absolute bottom-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
              You (Swap)
            </span>
          )}
        </div>
      </div>

      {/* 4. Floating WhatsApp-Style Bottom Controls Bar */}
      <div className="absolute bottom-6 inset-x-0 z-30 flex justify-center px-4 pointer-events-auto">
        <CallControls
          isMuted={isMuted}
          isVideoOn={isVideoOn}
          isScreenSharing={isScreenSharing}
          callType="video"
          onToggleMute={onToggleMute}
          onToggleVideo={onToggleVideo}
          onToggleScreenShare={onToggleScreenShare}
          onSwitchCamera={onSwitchCamera}
          onToggleFullscreen={handleToggleFullscreen}
          onTogglePiP={handleTogglePiP}
          onSelectSpeaker={onSelectSpeaker}
          onHangup={onHangup}
        />
      </div>
    </div>
  );
};
