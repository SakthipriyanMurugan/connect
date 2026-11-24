import React, { useState, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  SwitchCamera,
  ScreenShare,
  PhoneOff,
  Volume2,
  Maximize2,
  Minimize2,
  Tv,
} from 'lucide-react';

interface CallControlsProps {
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  callType: 'voice' | 'video' | 'group';
  hasFrontBackCamera?: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onSwitchCamera?: () => void;
  onToggleFullscreen?: () => void;
  onTogglePiP?: () => void;
  onSelectSpeaker?: (deviceId: string) => void;
  onHangup: () => void;
}

export const CallControls: React.FC<CallControlsProps> = ({
  isMuted,
  isVideoOn,
  isScreenSharing,
  callType,
  hasFrontBackCamera = true,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onSwitchCamera,
  onToggleFullscreen,
  onTogglePiP,
  onSelectSpeaker,
  onHangup,
}) => {
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [showSpeakerMenu, setShowSpeakerMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const outputs = devices.filter((d) => d.kind === 'audiooutput');
        setAudioOutputs(outputs);
      }).catch(() => {});
    }

    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  return (
    <div className="relative flex items-center justify-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-3xl bg-[#090d24]/90 backdrop-blur-2xl border border-white/15 shadow-2xl z-30 transition-all">
      {/* 1. Mute / Unmute Microphone */}
      <button
        type="button"
        onClick={onToggleMute}
        title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-lg ${
          isMuted
            ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30'
            : 'bg-white/15 hover:bg-white/25 text-white'
        }`}
      >
        {isMuted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
      </button>

      {/* 2. Video Camera Toggle */}
      {callType !== 'voice' && (
        <button
          type="button"
          onClick={onToggleVideo}
          title={isVideoOn ? 'Turn off camera' : 'Turn on camera'}
          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-lg ${
            !isVideoOn
              ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30'
              : 'bg-white/15 hover:bg-white/25 text-white'
          }`}
        >
          {isVideoOn ? <Video className="w-5 h-5 sm:w-6 sm:h-6" /> : <VideoOff className="w-5 h-5 sm:w-6 sm:h-6" />}
        </button>
      )}

      {/* 3. Camera Flip (Front / Back switch) */}
      {callType !== 'voice' && onSwitchCamera && (
        <button
          type="button"
          onClick={onSwitchCamera}
          title="Flip camera (front / rear)"
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-lg"
        >
          <SwitchCamera className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
      )}

      {/* 4. Screen Share Toggle */}
      {onToggleScreenShare && (
        <button
          type="button"
          onClick={onToggleScreenShare}
          title={isScreenSharing ? 'Stop screen sharing' : 'Share screen'}
          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-lg ${
            isScreenSharing
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/30'
              : 'bg-white/15 hover:bg-white/25 text-white'
          }`}
        >
          <ScreenShare className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
      )}

      {/* 5. Speaker Selection (where supported) */}
      {audioOutputs.length > 0 && onSelectSpeaker && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSpeakerMenu(!showSpeakerMenu)}
            title="Audio output speaker"
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-lg"
          >
            <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          {showSpeakerMenu && (
            <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-48 p-2 rounded-2xl bg-[#090d24] border border-white/20 text-white shadow-2xl text-xs space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1 block">Audio Output</span>
              {audioOutputs.map((d) => (
                <button
                  key={d.deviceId}
                  type="button"
                  onClick={() => {
                    onSelectSpeaker(d.deviceId);
                    setShowSpeakerMenu(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/15 truncate block text-[11px]"
                >
                  {d.label || 'Speaker Device'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. Picture-in-Picture (PiP) */}
      {callType !== 'voice' && onTogglePiP && (
        <button
          type="button"
          onClick={onTogglePiP}
          title="Picture-in-Picture mode"
          className="hidden md:flex w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/15 hover:bg-white/25 text-white items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-lg"
        >
          <Tv className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
      )}

      {/* 7. Fullscreen Toggle */}
      {onToggleFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Exit full screen' : 'Full screen'}
          className="hidden sm:flex w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/15 hover:bg-white/25 text-white items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-lg"
        >
          {isFullscreen ? <Minimize2 className="w-5 h-5 sm:w-6 sm:h-6" /> : <Maximize2 className="w-5 h-5 sm:w-6 sm:h-6" />}
        </button>
      )}

      {/* 8. End Call (WhatsApp-style Big Red Button) */}
      <button
        type="button"
        onClick={onHangup}
        title="End call"
        className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center transition-transform transform active:scale-90 hover:scale-105 cursor-pointer shadow-xl shadow-rose-600/40 ml-1"
      >
        <PhoneOff className="w-6 h-6 sm:w-7 sm:h-7" />
      </button>
    </div>
  );
};
