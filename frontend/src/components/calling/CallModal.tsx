import React, { useEffect, useRef, useState } from 'react';
import { 
  Room, 
  RoomEvent, 
  Track, 
  RemoteParticipant, 
  RemoteTrackPublication, 
  RemoteTrack,
  VideoPresets,
  AudioPresets
} from 'livekit-client';
import { 
  Mic, 
  MicOff, 
  Video as VideoIcon, 
  VideoOff, 
  ScreenShare, 
  PhoneOff, 
  Minimize2, 
  Maximize2,
  Users,
  ShieldCheck,
  Sparkles,
  Link2,
  Copy,
  PhoneCall,
  Radio
} from 'lucide-react';
import { fetchLiveKitToken, playOutgoingRingtone, stopOutgoingRingtone } from '../../services/livekit';

export interface ActiveCallSession {
  roomName: string;
  title: string;
  callType: 'video' | 'audio';
  targetUserId?: string;
  isIncoming?: boolean;
}

export interface CallEndStats {
  duration_seconds: number;
  participants: string[];
  title: string;
  room_name: string;
}

interface CallModalProps {
  session: ActiveCallSession;
  currentUser: { id: string; name: string; connect_id?: string };
  onEndCall: (stats?: CallEndStats) => void;
  onMinimize: () => void;
  onShowToast: (msg: string) => void;
}

export const CallModal: React.FC<CallModalProps> = ({
  session,
  currentUser,
  onEndCall,
  onMinimize,
  onShowToast,
}) => {
  const [room, setRoom] = useState<Room | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(session.callType === 'video');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [participantCount, setParticipantCount] = useState(1);
  const [remoteName, setRemoteName] = useState<string>('');
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [hasScreenShare, setHasScreenShare] = useState(false);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<RemoteTrack | null>(null);
  const [remoteScreenTrack, setRemoteScreenTrack] = useState<RemoteTrack | null>(null);
  const [isRinging, setIsRinging] = useState<boolean>(!session.isIncoming && !!session.targetUserId);
  const [timeoutCountdown, setTimeoutCountdown] = useState<number>(35);

  // Video Element Refs
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenShareRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<any>(null);

  // Dedicated Video Track Attacher (eliminates React DOM mounting race conditions)
  useEffect(() => {
    if (remoteVideoTrack && remoteVideoRef.current) {
      remoteVideoTrack.attach(remoteVideoRef.current);
      return () => {
        try {
          if (remoteVideoRef.current) remoteVideoTrack.detach(remoteVideoRef.current);
        } catch (e) {}
      };
    }
  }, [remoteVideoTrack]);

  // Dedicated Screen Share Attacher
  useEffect(() => {
    if (remoteScreenTrack && screenShareRef.current) {
      remoteScreenTrack.attach(screenShareRef.current);
      return () => {
        try {
          if (screenShareRef.current) remoteScreenTrack.detach(screenShareRef.current);
        } catch (e) {}
      };
    }
  }, [remoteScreenTrack]);

  // Outgoing Call Ringtone & Auto-Timeout (35 seconds)
  useEffect(() => {
    if (!session.isIncoming && session.targetUserId && participantCount < 2) {
      playOutgoingRingtone();
      setIsRinging(true);

      const countdownInterval = setInterval(() => {
        setTimeoutCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            stopOutgoingRingtone();
            setIsRinging(false);
            onShowToast('Teammate did not answer. Call timed out (Missed Call).');
            handleHangup();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      timeoutRef.current = countdownInterval;

      return () => {
        clearInterval(countdownInterval);
        stopOutgoingRingtone();
      };
    } else {
      stopOutgoingRingtone();
      setIsRinging(false);
    }
  }, [participantCount, session.targetUserId]);

  // Timer
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (secs: number) => {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  // Initialize and connect to LiveKit room
  useEffect(() => {
    let activeRoom: Room | null = null;
    let isCancelled = false;

    const connectToLiveKit = async () => {
      try {
        setIsConnecting(true);
        // 1. Get token from backend
        const tokenData = await fetchLiveKitToken(
          session.roomName,
          currentUser.id,
          currentUser.name
        );

        if (isCancelled) return;

        // 2. Instantiate LiveKit Room with Studio HD Audio (48kHz) and 2K/1080p Video Presets
        const newRoom = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 2,
            sampleRate: 48000,
          },
          videoCaptureDefaults: {
            resolution: VideoPresets.h1440.resolution, // 2560x1440 2K QHD
            facingMode: 'user',
          },
          publishDefaults: {
            videoSimulcastLayers: [
              VideoPresets.h360,
              VideoPresets.h720,
              VideoPresets.h1080,
              VideoPresets.h1440,
            ],
            audioPreset: AudioPresets.musicHighQualityStereo,
            red: true,
            dtx: false,
          },
        });
        activeRoom = newRoom;
        setRoom(newRoom);

        // 3. Set up track subscription event handlers
        newRoom.on(
          RoomEvent.TrackSubscribed,
          (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
            setRemoteName(participant.name || participant.identity);
            if (track.kind === Track.Kind.Video) {
              if (publication.source === Track.Source.ScreenShare) {
                setHasScreenShare(true);
                setRemoteScreenTrack(track);
                if (screenShareRef.current) track.attach(screenShareRef.current);
              } else {
                setHasRemoteVideo(true);
                setRemoteVideoTrack(track);
                if (remoteVideoRef.current) track.attach(remoteVideoRef.current);
              }
            } else if (track.kind === Track.Kind.Audio) {
              if (remoteAudioRef.current) track.attach(remoteAudioRef.current);
              else track.attach();
            }
          }
        );

        newRoom.on(
          RoomEvent.TrackUnsubscribed,
          (track: RemoteTrack, publication: RemoteTrackPublication) => {
            track.detach();
            if (publication.source === Track.Source.ScreenShare) {
              setHasScreenShare(false);
              setRemoteScreenTrack(null);
            } else if (track.kind === Track.Kind.Video) {
              setHasRemoteVideo(false);
              setRemoteVideoTrack(null);
            }
          }
        );

        newRoom.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
          setParticipantCount(newRoom.numParticipants + 1);
          setRemoteName(p.name || p.identity);
          onShowToast(`${p.name || 'Participant'} joined the call`);
        });

        newRoom.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
          setParticipantCount(newRoom.numParticipants + 1);
          onShowToast(`${p.name || 'Participant'} left the call`);
        });

        // 4. Connect to Cloud
        await newRoom.connect(tokenData.url, tokenData.token);
        setIsConnecting(false);

        // Scan already published remote tracks in case receiver joined after publication
        for (const p of newRoom.remoteParticipants.values()) {
          setRemoteName(p.name || p.identity);
          for (const pub of p.trackPublications.values()) {
            if (pub.isSubscribed && pub.track) {
              if (pub.track.kind === Track.Kind.Video) {
                if (pub.source === Track.Source.ScreenShare) {
                  setHasScreenShare(true);
                  setRemoteScreenTrack(pub.track);
                  if (screenShareRef.current) pub.track.attach(screenShareRef.current);
                } else {
                  setHasRemoteVideo(true);
                  setRemoteVideoTrack(pub.track);
                  if (remoteVideoRef.current) pub.track.attach(remoteVideoRef.current);
                }
              } else if (pub.track.kind === Track.Kind.Audio) {
                if (remoteAudioRef.current) pub.track.attach(remoteAudioRef.current);
                else pub.track.attach();
              }
            }
          }
        }

        // 5. Enable Local Devices (Microphone + Camera with 2K QHD & 48kHz HD Audio)
        try {
          await newRoom.localParticipant.setMicrophoneEnabled(true, {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 2,
            sampleRate: 48000,
          });
        } catch (e) {
          console.warn('Microphone permission:', e);
        }

        if (session.callType === 'video') {
          try {
            await newRoom.localParticipant.setCameraEnabled(true, {
              resolution: VideoPresets.h1440.resolution,
            });
            setIsVideoOn(true);
            const camTrack = newRoom.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
            if (camTrack && localVideoRef.current) {
              camTrack.attach(localVideoRef.current);
            }
          } catch (e) {
            console.warn('Camera permission:', e);
            setIsVideoOn(false);
          }
        }
      } catch (err: any) {
        console.error('LiveKit connection error:', err);
        onShowToast(`Call connection error: ${err.message || 'Check network'}`);
        setIsConnecting(false);
      }
    };

    connectToLiveKit();

    return () => {
      isCancelled = true;
      if (activeRoom) {
        activeRoom.disconnect();
      }
    };
  }, [session.roomName]);

  // Toggle Microphone
  const handleToggleMute = async () => {
    if (!room) return;
    try {
      const nextMuted = !isMuted;
      await room.localParticipant.setMicrophoneEnabled(!nextMuted, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 2,
        sampleRate: 48000,
      });
      setIsMuted(nextMuted);
      onShowToast(nextMuted ? 'Microphone muted' : 'Microphone unmuted (Opus 48kHz HD)');
    } catch (e: any) {
      onShowToast(`Failed to toggle mic: ${e.message}`);
    }
  };

  // Toggle Camera
  const handleToggleVideo = async () => {
    if (!room) return;
    try {
      const nextVideo = !isVideoOn;
      await room.localParticipant.setCameraEnabled(nextVideo, {
        resolution: VideoPresets.h1440.resolution,
      });
      setIsVideoOn(nextVideo);
      if (nextVideo) {
        const camTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
        if (camTrack && localVideoRef.current) camTrack.attach(localVideoRef.current);
      }
      onShowToast(nextVideo ? 'Camera turned on (2K QHD)' : 'Camera turned off');
    } catch (e: any) {
      onShowToast(`Failed to toggle camera: ${e.message}`);
    }
  };

  // Toggle Screen Share
  const handleToggleScreenShare = async () => {
    if (!room) return;
    try {
      const nextShare = !isScreenSharing;
      await room.localParticipant.setScreenShareEnabled(nextShare);
      setIsScreenSharing(nextShare);
      onShowToast(nextShare ? 'Screen sharing started' : 'Screen sharing stopped');
    } catch (e: any) {
      setIsScreenSharing(false);
      onShowToast(`Screen share cancelled or not allowed`);
    }
  };

  const handleHangup = () => {
    stopOutgoingRingtone();
    if (timeoutRef.current) clearInterval(timeoutRef.current);
    if (room) {
      room.disconnect();
    }
    const pNames = [currentUser.name];
    if (remoteName && !pNames.includes(remoteName)) pNames.push(remoteName);
    onEndCall({
      duration_seconds: seconds,
      participants: pNames,
      title: session.title,
      room_name: session.roomName,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
      <audio ref={remoteAudioRef} autoPlay />

      <div className="relative w-full max-w-5xl h-[85vh] max-h-[820px] rounded-3xl bg-[#0e1333]/95 border border-white/20 text-white shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl">
        {/* Top Header Bar */}
        <div className="h-16 px-6 border-b border-white/10 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#8cf4ff] to-[#d6a2ff] flex items-center justify-center font-bold text-xs text-[#171a42]">
              {session.title.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                {session.title}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#12a878]/20 text-[#8df0d4] font-medium border border-[#12a878]/40 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> LiveKit Encrypted
                </span>
              </h3>
              <p className="text-[11px] text-[#b6c5dd] flex items-center gap-2">
                {isRinging ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-[#8cf4ff] animate-ping" />
                    <span className="text-[#8cf4ff] font-semibold flex items-center gap-1.5">
                      <Radio className="w-3 h-3 animate-pulse" />
                      Ringing teammate ({timeoutCountdown}s)…
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-[#12a878] animate-pulse" />
                    {isConnecting ? 'Connecting to LiveKit cloud…' : `Connected · ${formatTime(seconds)}`}
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Copy Conference Meeting Link */}
            <button
              type="button"
              onClick={() => {
                const link = `${window.location.origin}/?room=${session.roomName}`;
                navigator.clipboard.writeText(link);
                onShowToast('Conference room link copied! Send to teammates to join.');
              }}
              title="Copy meeting link to invite teammates"
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[#cbd4ff] hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            >
              <Link2 className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Invite Link</span>
            </button>

            <button
              type="button"
              onClick={onMinimize}
              title="Minimize to floating bar"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-[#cbd4ff] transition-all cursor-pointer"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video Stage Area */}
        <div className="relative flex-1 bg-[#090d24] flex items-center justify-center p-4 overflow-hidden">
          {/* Main Remote Video Track (Always mounted to guarantee track.attach() succeeds without race conditions) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-cover rounded-2xl ${hasRemoteVideo && !hasScreenShare ? 'block' : 'hidden'}`}
          />

          {/* Main Screen Share Track (Always mounted) */}
          <div className={`w-full h-full flex flex-col items-center justify-center ${hasScreenShare ? 'block' : 'hidden'}`}>
            <video
              ref={screenShareRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain rounded-2xl bg-black"
            />
            <span className="absolute top-6 left-6 px-3 py-1 bg-black/60 backdrop-blur-md rounded-lg text-xs font-semibold text-[#8cf4ff]">
              🖥️ Shared Screen
            </span>
          </div>

          {/* Quality Badge */}
          <div className="absolute top-6 right-6 z-10 flex items-center gap-2 px-3 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-full text-[11px] font-semibold text-[#8cf4ff] shadow-lg">
            <Radio className="w-3 h-3 text-[#52fa9a] animate-pulse" />
            <span>2K FHD • Studio 48kHz</span>
          </div>

          {/* Outgoing Ringing Screen or Audio Avatar Placeholder (Visible when no video or screen share) */}
          {!hasRemoteVideo && !hasScreenShare && (
            isRinging ? (
              // WhatsApp-Style Outgoing Ringing Screen
              <div className="flex flex-col items-center justify-center text-center animate-in fade-in duration-300">
                <div className="relative mb-6">
                  <div className="absolute -inset-8 rounded-full border-2 border-[#8cf4ff]/20 animate-ping opacity-60 pointer-events-none" />
                  <div className="absolute -inset-4 rounded-full border-2 border-[#8cf4ff]/40 animate-pulse pointer-events-none" />
                  <div className="relative w-32 h-32 rounded-full bg-gradient-to-tr from-[#8cf4ff] via-[#8d8cff] to-[#d6a2ff] flex items-center justify-center text-[#171a42] text-4xl font-black shadow-2xl">
                    <span>{session.title.slice(0, 2).toUpperCase()}</span>
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#8cf4ff]/15 border border-[#8cf4ff]/30 text-[#8cf4ff] text-xs font-bold mb-2">
                  <PhoneCall className="w-3.5 h-3.5 animate-bounce" />
                  <span>RINGING…</span>
                </div>
                <h4 className="text-2xl font-black text-white mb-2 tracking-tight">
                  Calling {session.title}
                </h4>
                <p className="text-xs text-[#b6c5dd] max-w-xs mx-auto mb-1">
                  Waiting for teammate to answer. Dial tone ringing…
                </p>
                <p className="text-[11px] text-[#8491a5] font-mono">
                  Auto-disconnects in {timeoutCountdown}s if no answer
                </p>
              </div>
            ) : (
              // Audio-Only Waveform View or Waiting Screen
              <div className="flex flex-col items-center justify-center text-center">
                <div className="relative w-28 h-28 rounded-full bg-gradient-to-tr from-[#8cf4ff] via-[#8d8cff] to-[#d6a2ff] flex items-center justify-center text-[#171a42] text-3xl font-extrabold shadow-2xl mb-4">
                  <span>{remoteName ? remoteName.slice(0, 2).toUpperCase() : session.title.slice(0, 2).toUpperCase()}</span>
                  <div className="absolute inset-0 rounded-full border-2 border-[#8cf4ff] animate-ping opacity-30" />
                </div>
                <h4 className="text-lg font-bold text-white mb-1">
                  {remoteName || session.title}
                </h4>
                <p className="text-xs text-[#b6c5dd]">
                  {isConnecting ? 'Establishing secure connection…' : 'Audio Call Active (Studio Opus 48kHz HD)'}
                </p>
              </div>
            )
          )}

          {/* Local Self-View (Picture-in-Picture) */}
          <div className="absolute bottom-6 right-6 w-36 sm:w-48 aspect-video rounded-2xl overflow-hidden bg-black/60 border border-white/20 shadow-2xl backdrop-blur-md">
            {isVideoOn ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-[#171d45] text-white">
                <VideoOff className="w-5 h-5 text-white/50 mb-1" />
                <span className="text-[10px] text-white/60">Camera Off</span>
              </div>
            )}
            <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-bold text-white">
              You
            </span>
          </div>
        </div>

        {/* Bottom Control Bar */}
        <div className="h-20 px-6 border-t border-white/10 flex items-center justify-center gap-4 bg-white/5">
          {/* Mute Mic */}
          <button
            type="button"
            onClick={handleToggleMute}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg active:scale-95 ${
              isMuted ? 'bg-[#f04454] text-white' : 'bg-[#293556] hover:bg-[#394975] text-white'
            }`}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Toggle Video */}
          <button
            type="button"
            onClick={handleToggleVideo}
            title={isVideoOn ? 'Turn off camera' : 'Turn on camera'}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg active:scale-95 ${
              !isVideoOn ? 'bg-[#f04454] text-white' : 'bg-[#293556] hover:bg-[#394975] text-white'
            }`}
          >
            {isVideoOn ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          {/* Screen Share */}
          <button
            type="button"
            onClick={handleToggleScreenShare}
            title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg active:scale-95 ${
              isScreenSharing ? 'bg-[#7a7cff] text-white ring-4 ring-[#7a7cff]/30' : 'bg-[#293556] hover:bg-[#394975] text-white'
            }`}
          >
            <ScreenShare className="w-5 h-5" />
          </button>

          {/* End Call Button */}
          <button
            type="button"
            onClick={handleHangup}
            title="End call"
            className="w-14 h-12 rounded-full bg-[#f04454] hover:bg-[#d93040] text-white flex items-center justify-center transition-all cursor-pointer shadow-xl active:scale-95"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};
