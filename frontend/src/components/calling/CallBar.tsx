import React from 'react';
import { Mic, MicOff, Video, VideoOff, ScreenShare, PhoneOff, Maximize2 } from 'lucide-react';

interface CallBarProps {
  activeCallTitle: string | null;
  callType?: 'video' | 'audio' | 'voice' | 'group';
  durationSeconds?: number;
  isMuted?: boolean;
  isVideoOn?: boolean;
  isScreenSharing?: boolean;
  onToggleMute?: () => void;
  onToggleVideo?: () => void;
  onToggleScreenShare?: () => void;
  onEndCall: () => void;
  onShowToast: (msg: string) => void;
  onExpand?: () => void;
}

export const CallBar: React.FC<CallBarProps> = ({
  activeCallTitle,
  callType = 'video',
  durationSeconds = 0,
  isMuted = false,
  isVideoOn = true,
  isScreenSharing = false,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onEndCall,
  onExpand,
}) => {
  if (!activeCallTitle) return null;

  const formatTime = (secs: number) => {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="fixed right-6 bottom-20 md:bottom-6 z-40 bg-[#141b43]/95 border border-white/20 rounded-2xl px-4 py-2.5 flex items-center gap-4 text-white shadow-2xl backdrop-blur-2xl animate-in fade-in slide-in-from-bottom-3 duration-300">
      <div
        onClick={onExpand}
        className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#8ff5ff] to-[#d6a0ff] flex items-center justify-center font-bold text-xs text-[#171d4c] shadow-md cursor-pointer"
      >
        {activeCallTitle.slice(0, 2).toUpperCase()}
      </div>

      <div
        onClick={onExpand}
        className="hidden sm:block min-w-[120px] cursor-pointer hover:opacity-90 transition-opacity"
        title="Click to expand video call"
      >
        <b className="text-xs font-bold block truncate max-w-[160px]">{activeCallTitle}</b>
        <small className="text-[10px] text-[#b6c5dd] flex items-center gap-1.5 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[#12a878] animate-pulse" />
          Connected · {formatTime(durationSeconds)} (Click to expand)
        </small>
      </div>

      <div className="flex items-center gap-2">
        {/* Mute */}
        <button
          type="button"
          onClick={onToggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            isMuted ? 'bg-[#f04454] text-white' : 'bg-[#34445e] hover:bg-[#435777] text-white'
          }`}
        >
          {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        {/* Camera */}
        {callType !== 'audio' && callType !== 'voice' && (
          <button
            type="button"
            onClick={onToggleVideo}
            title={isVideoOn ? 'Turn off camera' : 'Turn on camera'}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              !isVideoOn ? 'bg-[#dbe6f7] text-[#193458]' : 'bg-[#34445e] hover:bg-[#435777] text-white'
            }`}
          >
            {isVideoOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </button>
        )}

        {/* Screen Share */}
        {onToggleScreenShare && (
          <button
            type="button"
            onClick={onToggleScreenShare}
            title="Share screen"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              isScreenSharing ? 'bg-[#7a7cff] text-white' : 'bg-[#34445e] hover:bg-[#435777] text-white'
            }`}
          >
            <ScreenShare className="w-4 h-4" />
          </button>
        )}

        {/* Expand Modal */}
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            title="Expand call modal"
            className="w-8 h-8 rounded-full bg-[#34445e] hover:bg-[#435777] flex items-center justify-center text-white transition-all cursor-pointer"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}

        {/* End Call */}
        <button
          type="button"
          onClick={onEndCall}
          title="End call"
          className="w-8 h-8 rounded-full bg-[#ed4554] hover:bg-[#d63241] flex items-center justify-center text-white transition-all shadow-lg shadow-[#ed4554]/30 cursor-pointer ml-1"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
