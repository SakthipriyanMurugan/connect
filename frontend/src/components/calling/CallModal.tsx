import React, { useEffect, useRef, useState } from 'react';
import { 
  Room, 
  RoomEvent, 
  Track, 
  RemoteParticipant, 
  RemoteTrackPublication, 
  RemoteTrack,
  VideoPresets,
  AudioPresets,
  ScreenSharePresets,
  Participant
} from 'livekit-client';
import { fetchLiveKitToken, playOutgoingRingtone, stopOutgoingRingtone } from '../../services/livekit';
import { ActiveVoiceCall } from './ActiveVoiceCall';
import { ActiveVideoCall } from './ActiveVideoCall';
import { GroupCall, ParticipantInfo } from './GroupCall';
import { OutgoingCallScreen } from './OutgoingCallScreen';

export interface ActiveCallSession {
  roomName: string;
  title: string;
  callType: 'video' | 'audio' | 'voice' | 'group';
  targetUserId?: string;
  targetConnectId?: string;
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
  const [isVideoOn, setIsVideoOn] = useState(session.callType !== 'audio' && session.callType !== 'voice');
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
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [participantsList, setParticipantsList] = useState<ParticipantInfo[]>([]);

  // Video & Audio Element Refs
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenShareRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<any>(null);

  // Dedicated Video Track Attacher
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

  // Duration Timer
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync Remote Participants List for Group View
  const syncParticipants = (activeRoom: Room) => {
    const list: ParticipantInfo[] = [];
    activeRoom.remoteParticipants.forEach((p) => {
      list.push({
        identity: p.identity,
        name: p.name || p.identity,
        isSpeaking: p.isSpeaking,
        isAudioMuted: !p.isMicrophoneEnabled,
        isVideoOff: !p.isCameraEnabled,
      });
    });
    setParticipantsList(list);
    setParticipantCount(activeRoom.numParticipants + 1);
  };

  // Connect to LiveKit Room
  useEffect(() => {
    let activeRoom: Room | null = null;
    let isCancelled = false;

    const connectToLiveKit = async () => {
      try {
        setIsConnecting(true);
        const tokenData = await fetchLiveKitToken(
          session.roomName,
          currentUser.id,
          currentUser.name
        );

        if (isCancelled) return;

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
            resolution: VideoPresets.h2160.resolution,
            facingMode: 'user',
          },
          publishDefaults: {
            videoSimulcastLayers: [
              VideoPresets.h540,
              VideoPresets.h720,
              VideoPresets.h1080,
              VideoPresets.h1440,
              VideoPresets.h2160,
            ],
            audioPreset: AudioPresets.musicHighQualityStereo,
            forceStereo: true,
            screenShareEncoding: ScreenSharePresets.h1080fps30.encoding,
            red: true,
            dtx: false,
          },
        });
        activeRoom = newRoom;
        setRoom(newRoom);

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
            syncParticipants(newRoom);
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
            syncParticipants(newRoom);
          }
        );

        newRoom.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
          syncParticipants(newRoom);
          setRemoteName(p.name || p.identity);
          onShowToast(`${p.name || 'Participant'} joined the call`);
        });

        newRoom.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
          syncParticipants(newRoom);
          onShowToast(`${p.name || 'Participant'} left the call`);
        });

        newRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
          syncParticipants(newRoom);
        });

        await newRoom.connect(tokenData.url, tokenData.token);
        setIsConnecting(false);

        // Scan existing tracks
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
        syncParticipants(newRoom);

        // Enable microphone
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

        // Enable camera if video call
        if (session.callType !== 'audio') {
          try {
            await newRoom.localParticipant.setCameraEnabled(true, {
              resolution: VideoPresets.h2160.resolution,
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
        resolution: VideoPresets.h2160.resolution,
      });
      setIsVideoOn(nextVideo);
      if (nextVideo) {
        const camTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
        if (camTrack && localVideoRef.current) camTrack.attach(localVideoRef.current);
      }
      onShowToast(nextVideo ? 'Camera turned on (4K UHD / 2K)' : 'Camera turned off');
    } catch (e: any) {
      onShowToast(`Failed to toggle camera: ${e.message}`);
    }
  };

  // Camera Flip (Front / Rear)
  const handleSwitchCamera = async () => {
    if (!room) return;
    try {
      const nextFacing = facingMode === 'user' ? 'environment' : 'user';
      setFacingMode(nextFacing);
      await room.localParticipant.setCameraEnabled(false);
      await room.localParticipant.setCameraEnabled(true, {
        facingMode: nextFacing,
        resolution: VideoPresets.h1080.resolution,
      });
      const camTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
      if (camTrack && localVideoRef.current) camTrack.attach(localVideoRef.current);
      onShowToast(`Switched to ${nextFacing === 'user' ? 'Front' : 'Rear'} camera`);
    } catch (e: any) {
      console.warn('Switch camera warning:', e);
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
      onShowToast('Screen share cancelled');
    }
  };

  // Speaker Device Selection
  const handleSelectSpeaker = async (deviceId: string) => {
    if (remoteAudioRef.current && 'setSinkId' in remoteAudioRef.current) {
      try {
        await (remoteAudioRef.current as any).setSinkId(deviceId);
        onShowToast('Audio output speaker changed');
      } catch (e) {
        console.warn('setSinkId error:', e);
      }
    }
  };

  // Copy Conference Link
  const handleCopyInviteLink = () => {
    const link = `${window.location.origin}/?room=${session.roomName}`;
    navigator.clipboard.writeText(link);
    onShowToast('Conference room link copied! Send to teammates to join.');
  };

  // Hangup Call
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6 bg-black/85 backdrop-blur-2xl animate-in fade-in duration-200">
      {/* Hidden Audio Element for remote sound */}
      <audio ref={remoteAudioRef} autoPlay />

      <div className="relative w-full max-w-5xl h-full sm:h-[88vh] sm:max-h-[850px] rounded-none sm:rounded-3xl bg-[#070a1e] border-0 sm:border border-white/20 text-white shadow-2xl flex flex-col overflow-hidden backdrop-blur-3xl">
        {isRinging ? (
          // 1. WhatsApp-Style Outgoing Calling Screen
          <OutgoingCallScreen
            targetName={session.title}
            targetConnectId={session.targetConnectId}
            callType={session.callType}
            timeoutCountdown={timeoutCountdown}
            isMuted={isMuted}
            isVideoOn={isVideoOn}
            onToggleMute={handleToggleMute}
            onToggleVideo={handleToggleVideo}
            onCancelCall={handleHangup}
          />
        ) : (session.callType === 'audio' || session.callType === 'voice') ? (
          // 2. WhatsApp-Style Active Voice Call Screen (with animated waveform)
          <ActiveVoiceCall
            partnerName={remoteName || session.title}
            partnerConnectId={session.targetConnectId}
            durationSeconds={seconds}
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            onSelectSpeaker={handleSelectSpeaker}
            onHangup={handleHangup}
            onInviteTeammate={handleCopyInviteLink}
          />
        ) : participantCount > 2 || session.callType === 'group' ? (
          // 3. Multi-User Responsive Group Call Screen
          <GroupCall
            roomTitle={session.title}
            roomName={session.roomName}
            durationSeconds={seconds}
            participants={participantsList}
            currentUserName={currentUser.name}
            isMuted={isMuted}
            isVideoOn={isVideoOn}
            isScreenSharing={isScreenSharing}
            hasScreenShare={hasScreenShare}
            screenShareRef={screenShareRef}
            onToggleMute={handleToggleMute}
            onToggleVideo={handleToggleVideo}
            onToggleScreenShare={handleToggleScreenShare}
            onSwitchCamera={handleSwitchCamera}
            onSelectSpeaker={handleSelectSpeaker}
            onHangup={handleHangup}
            onCopyInviteLink={handleCopyInviteLink}
          />
        ) : (
          // 4. WhatsApp-Style Active Video Call Screen (Full-screen remote + floating local PIP + controls)
          <ActiveVideoCall
            partnerName={remoteName || session.title}
            partnerConnectId={session.targetConnectId}
            durationSeconds={seconds}
            isMuted={isMuted}
            isVideoOn={isVideoOn}
            isScreenSharing={isScreenSharing}
            hasRemoteVideo={hasRemoteVideo}
            hasScreenShare={hasScreenShare}
            remoteVideoRef={remoteVideoRef}
            localVideoRef={localVideoRef}
            screenShareRef={screenShareRef}
            onToggleMute={handleToggleMute}
            onToggleVideo={handleToggleVideo}
            onToggleScreenShare={handleToggleScreenShare}
            onSwitchCamera={handleSwitchCamera}
            onSelectSpeaker={handleSelectSpeaker}
            onMinimize={onMinimize}
            onHangup={handleHangup}
            onInviteTeammate={handleCopyInviteLink}
          />
        )}
      </div>
    </div>
  );
};
