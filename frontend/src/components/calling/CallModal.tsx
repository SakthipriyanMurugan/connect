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
  ConnectionState,
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
  was_connected?: boolean;
}

export interface CallControlsHandle {
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => void;
  hangup: () => void;
}

interface CallModalProps {
  session: ActiveCallSession;
  currentUser: { id: string; name: string; connect_id?: string };
  isMinimized?: boolean;
  controlRef?: React.MutableRefObject<CallControlsHandle | null>;
  onSyncState?: (state: { isMuted: boolean; isVideoOn: boolean; isScreenSharing: boolean; durationSeconds: number }) => void;
  onEndCall: (stats?: CallEndStats) => void;
  onTimeout?: () => void;
  onMinimize: () => void;
  onShowToast: (msg: string) => void;
}

export const CallModal: React.FC<CallModalProps> = ({
  session,
  currentUser,
  isMinimized = false,
  controlRef,
  onSyncState,
  onEndCall,
  onTimeout,
  onMinimize,
  onShowToast,
}) => {
  const isAudioOnly = session.callType === 'audio' || session.callType === 'voice';

  const [room, setRoom] = useState<Room | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionStateLabel, setConnectionStateLabel] = useState<string>('Connecting...');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(!isAudioOnly);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [participantCount, setParticipantCount] = useState(1);
  const [acceptedByCallee, setAcceptedByCallee] = useState(false);
  const [remoteName, setRemoteName] = useState<string>('');
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [hasScreenShare, setHasScreenShare] = useState(false);
  const [localVideoTrack, setLocalVideoTrack] = useState<any>(null);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<RemoteTrack | null>(null);
  const [remoteScreenTrack, setRemoteScreenTrack] = useState<RemoteTrack | null>(null);
  const [timeoutCountdown, setTimeoutCountdown] = useState<number>(35);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [participantsList, setParticipantsList] = useState<ParticipantInfo[]>([]);

  const isConnected = Boolean(
    session.isIncoming || !session.targetUserId || participantCount >= 2 || acceptedByCallee
  );
  const isRinging = !isConnected;

  // Video & Audio Element Refs
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenShareRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<any>(null);
  const isConnectedRef = useRef(isConnected);
  isConnectedRef.current = isConnected;
  const userMutedRef = useRef(false);

  // Sync live state to minimized CallBar
  useEffect(() => {
    onSyncState?.({
      isMuted,
      isVideoOn,
      isScreenSharing,
      durationSeconds: seconds,
    });
  }, [isMuted, isVideoOn, isScreenSharing, seconds]);

  // Listen for immediate call_response accepted signal from MainLayout
  useEffect(() => {
    const onAccepted = (e: any) => {
      if (!e?.detail?.room_name || e.detail.room_name === session.roomName) {
        setAcceptedByCallee(true);
      }
    };
    window.addEventListener('vertex_call_accepted', onAccepted);
    return () => window.removeEventListener('vertex_call_accepted', onAccepted);
  }, [session.roomName]);

  // Dedicated Local Camera Track Attacher (re-runs whenever UI transitions from Ringing to ActiveVideoCall!)
  useEffect(() => {
    const el = localVideoRef.current;
    if (localVideoTrack && el && !isRinging && isVideoOn) {
      try {
        localVideoTrack.attach(el);
      } catch {}
      return () => {
        try {
          if (el) localVideoTrack.detach(el);
        } catch {}
      };
    }
  }, [localVideoTrack, isRinging, isVideoOn, participantCount, hasScreenShare]);

  // Dedicated Remote Video Track Attacher
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (remoteVideoTrack && el) {
      try {
        remoteVideoTrack.attach(el);
      } catch {}
      return () => {
        try {
          if (el) remoteVideoTrack.detach(el);
        } catch {}
      };
    }
  }, [remoteVideoTrack, isRinging, participantCount]);

  // Dedicated Screen Share Attacher
  useEffect(() => {
    const el = screenShareRef.current;
    if (remoteScreenTrack && el) {
      try {
        remoteScreenTrack.attach(el);
      } catch {}
      return () => {
        try {
          if (el) remoteScreenTrack.detach(el);
        } catch {}
      };
    }
  }, [remoteScreenTrack, hasScreenShare, isRinging]);

  // Keep latest timeout handler ref
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;
  const roomRef = useRef<Room | null>(null);
  roomRef.current = room;

  // Outgoing Call Ringtone & Auto-Timeout (35 seconds)
  useEffect(() => {
    if (isRinging && !session.isIncoming && session.targetUserId) {
      playOutgoingRingtone();
      setTimeoutCountdown(35);

      const countdownInterval = setInterval(() => {
        setTimeoutCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            stopOutgoingRingtone();
            if (roomRef.current) {
              roomRef.current.disconnect();
            }
            onShowToast('Teammate did not answer (Missed Call).');
            if (onTimeoutRef.current) {
              onTimeoutRef.current();
            } else {
              onEndCall({
                duration_seconds: 0,
                participants: [currentUser.name],
                title: session.title,
                room_name: session.roomName,
                was_connected: false,
              });
            }
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
      if (timeoutRef.current) clearInterval(timeoutRef.current);
    }
  }, [isRinging, session.isIncoming, session.targetUserId]);

  // Enable microphone ONLY once connected (prevents sending audio while ringing outgoing call!)
  useEffect(() => {
    if (!room || !isConnected || userMutedRef.current) return;
    room.localParticipant
      .setMicrophoneEnabled(true, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 2,
        sampleRate: 48000,
      })
      .catch(() => {});
  }, [room, isConnected]);

  // Duration Timer (ONLY starts once connected, not while ringing!)
  useEffect(() => {
    if (!isConnected) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isConnected]);

  // Sync Remote Participants List (excludes same user identity so multiple tabs never falsely trigger answer!)
  const syncParticipants = (activeRoom: Room) => {
    const list: ParticipantInfo[] = [];
    activeRoom.remoteParticipants.forEach((p) => {
      if (p.identity === currentUser.id) return;
      const camPub = p.getTrackPublication(Track.Source.Camera);
      list.push({
        identity: p.identity,
        name: p.name || p.identity,
        isSpeaking: p.isSpeaking,
        isAudioMuted: !p.isMicrophoneEnabled,
        isVideoOff: !p.isCameraEnabled,
        videoTrack: camPub?.isSubscribed ? camPub.track : undefined,
      });
    });
    setParticipantsList(list);
    setParticipantCount(list.length + 1);
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
            resolution: VideoPresets.h1080.resolution,
            facingMode: 'user',
          },
          publishDefaults: {
            videoSimulcastLayers: [
              VideoPresets.h540,
              VideoPresets.h720,
              VideoPresets.h1080,
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

        newRoom.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          if (state === ConnectionState.Reconnecting) {
            setConnectionStateLabel('Reconnecting...');
            onShowToast('Network unstable — reconnecting call...');
          } else if (state === ConnectionState.Connected) {
            setConnectionStateLabel('Connected');
          }
        });

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

        newRoom.on(RoomEvent.TrackMuted, () => syncParticipants(newRoom));
        newRoom.on(RoomEvent.TrackUnmuted, () => syncParticipants(newRoom));

        newRoom.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
          if (p.identity === currentUser.id) return;
          syncParticipants(newRoom);
          setRemoteName(p.name || p.identity);
          setAcceptedByCallee(true);
          onShowToast(`${p.name || 'Participant'} joined the call`);
        });

        newRoom.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
          if (p.identity === currentUser.id) return;
          syncParticipants(newRoom);
          onShowToast(`${p.name || 'Participant'} left the call`);
        });

        newRoom.on(RoomEvent.ActiveSpeakersChanged, () => {
          syncParticipants(newRoom);
        });

        await newRoom.connect(tokenData.url, tokenData.token);
        setIsConnecting(false);
        setConnectionStateLabel('Connected');

        // Scan existing tracks (ignoring self identity; if real remote already present, mark connected)
        for (const p of newRoom.remoteParticipants.values()) {
          if (p.identity === currentUser.id) continue;
          setAcceptedByCallee(true);
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

        // Enable microphone immediately ONLY if already connected (incoming accept or open meeting); otherwise hold until answered
        if (isConnectedRef.current && !userMutedRef.current) {
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
        }

        // Enable camera ONLY if video / group call
        if (!isAudioOnly) {
          try {
            await newRoom.localParticipant.setCameraEnabled(true, {
              resolution: VideoPresets.h1080.resolution,
            });
            setIsVideoOn(true);
            const camTrack = newRoom.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
            if (camTrack) {
              setLocalVideoTrack(camTrack);
              if (localVideoRef.current) camTrack.attach(localVideoRef.current);
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
      userMutedRef.current = nextMuted;
      if (isConnectedRef.current || nextMuted) {
        await room.localParticipant.setMicrophoneEnabled(!nextMuted, {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 2,
          sampleRate: 48000,
        });
      }
      setIsMuted(nextMuted);
      onShowToast(nextMuted ? 'Microphone muted' : 'Microphone unmuted');
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
        resolution: VideoPresets.h1080.resolution,
        facingMode,
      });
      setIsVideoOn(nextVideo);
      if (nextVideo) {
        const camTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
        if (camTrack) {
          setLocalVideoTrack(camTrack);
          if (localVideoRef.current) camTrack.attach(localVideoRef.current);
        }
      } else {
        setLocalVideoTrack(null);
      }
      onShowToast(nextVideo ? 'Camera turned on' : 'Camera turned off');
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
      if (camTrack) {
        setLocalVideoTrack(camTrack);
        if (localVideoRef.current) camTrack.attach(localVideoRef.current);
      }
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
    } catch {
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
    const link = `${window.location.origin}/?room=${encodeURIComponent(session.roomName)}`;
    navigator.clipboard.writeText(link);
    onShowToast('Invite link copied! Share with teammates to join this call.');
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
      duration_seconds: isConnectedRef.current ? seconds : 0,
      participants: pNames,
      title: session.title,
      room_name: session.roomName,
      was_connected: isConnectedRef.current,
    });
  };

  // Expose live track controls to minimized CallBar
  useEffect(() => {
    if (controlRef) {
      controlRef.current = {
        toggleMute: handleToggleMute,
        toggleVideo: handleToggleVideo,
        toggleScreenShare: handleToggleScreenShare,
        hangup: handleHangup,
      };
    }
  });

  return (
    <>
      {/* Hidden Audio Element ALWAYS stays mounted even when minimized so voice never cuts out */}
      <audio ref={remoteAudioRef} autoPlay />

      <div
        className={
          isMinimized
            ? 'hidden pointer-events-none'
            : 'fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6 bg-black/85 backdrop-blur-2xl animate-in fade-in duration-200'
        }
      >
        <div className="relative w-full max-w-5xl h-full sm:h-[88vh] sm:max-h-[850px] rounded-none sm:rounded-3xl bg-[#070a1e] border-0 sm:border border-white/20 text-white shadow-2xl flex flex-col overflow-hidden backdrop-blur-3xl">
          {isConnecting && !isRinging && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1 rounded-full bg-black/70 border border-white/15 text-[11px] font-semibold text-blue-300">
              {connectionStateLabel}
            </div>
          )}

          {isRinging ? (
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
          ) : isAudioOnly ? (
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
            <GroupCall
              roomTitle={session.title}
              roomName={session.roomName}
              durationSeconds={seconds}
              participants={participantsList}
              currentUserName={currentUser.name}
              localVideoTrack={localVideoTrack}
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
    </>
  );
};
