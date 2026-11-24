/**
 * WebRTC Direct Peer-to-Peer Service
 * Implements standard RTCPeerConnection with STUN/TURN, SDP Offer/Answer,
 * ICE candidate exchange, audio/video track management, camera flip, and screen sharing.
 */

export interface WebRTCConfig {
  iceServers?: RTCIceServer[];
}

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private facingMode: 'user' | 'environment' = 'user';
  private onRemoteStreamCallback: ((stream: MediaStream) => void) | null = null;
  private onIceCandidateCallback: ((candidate: RTCIceCandidate) => void) | null = null;
  private onConnectionStateChangeCallback: ((state: RTCPeerConnectionState) => void) | null = null;

  constructor(private config: WebRTCConfig = {}) {
    this.config.iceServers = this.config.iceServers || DEFAULT_ICE_SERVERS;
  }

  /**
   * Initializes RTCPeerConnection with event listeners
   */
  public initPeerConnection(): RTCPeerConnection {
    if (this.peerConnection) {
      this.close();
    }

    this.peerConnection = new RTCPeerConnection({
      iceServers: this.config.iceServers,
      iceCandidatePoolSize: 10,
    });

    this.remoteStream = new MediaStream();

    this.peerConnection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
      } else if (event.track) {
        this.remoteStream?.addTrack(event.track);
      }
      if (this.onRemoteStreamCallback && this.remoteStream) {
        this.onRemoteStreamCallback(this.remoteStream);
      }
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidateCallback) {
        this.onIceCandidateCallback(event.candidate);
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection && this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(this.peerConnection.connectionState);
      }
    };

    return this.peerConnection;
  }

  /**
   * Captures local audio and/or video stream
   */
  public async startLocalStream(
    callType: 'voice' | 'video' = 'video',
    facingMode: 'user' | 'environment' = 'user'
  ): Promise<MediaStream> {
    this.facingMode = facingMode;
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 2,
      },
      video:
        callType === 'video'
          ? {
              facingMode: this.facingMode,
              width: { ideal: 1920, max: 3840 },
              height: { ideal: 1080, max: 2160 },
              frameRate: { ideal: 30, max: 60 },
            }
          : false,
    };

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      // Fallback with lower constraints if 1080p is unavailable
      constraints.video = callType === 'video' ? { facingMode: this.facingMode } : false;
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    }

    if (this.peerConnection) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection?.addTrack(track, this.localStream!);
      });
    }

    return this.localStream;
  }

  /**
   * Switch between Front and Back camera (mobile & webcams)
   */
  public async switchCamera(): Promise<MediaStream | null> {
    if (!this.localStream) return null;
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.stop();
      this.localStream.removeTrack(videoTrack);
    }

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: this.facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (newVideoTrack) {
        this.localStream.addTrack(newVideoTrack);

        // Replace track in peer connection
        if (this.peerConnection) {
          const sender = this.peerConnection.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(newVideoTrack);
          } else {
            this.peerConnection.addTrack(newVideoTrack, this.localStream);
          }
        }
      }
      return this.localStream;
    } catch (e) {
      console.warn('Switch camera fallback warning:', e);
      return this.localStream;
    }
  }

  /**
   * Creates SDP Offer
   */
  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) this.initPeerConnection();
    const offer = await this.peerConnection!.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await this.peerConnection!.setLocalDescription(offer);
    return offer;
  }

  /**
   * Handles incoming SDP Offer and generates SDP Answer
   */
  public async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) this.initPeerConnection();
    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);
    return answer;
  }

  /**
   * Handles incoming SDP Answer
   */
  public async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  /**
   * Adds received ICE Candidate
   */
  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.peerConnection) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('Error adding ICE candidate:', e);
      }
    }
  }

  /**
   * Toggles local microphone mute/unmute
   */
  public setAudioEnabled(enabled: boolean): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Toggles local camera video on/off
   */
  public setVideoEnabled(enabled: boolean): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Starts screen sharing via getDisplayMedia
   */
  public async startScreenShare(): Promise<MediaStream | null> {
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as any,
        audio: false,
      });

      const screenTrack = this.screenStream.getVideoTracks()[0];
      if (this.peerConnection && screenTrack) {
        const sender = this.peerConnection.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        }
        screenTrack.onended = () => {
          this.stopScreenShare();
        };
      }
      return this.screenStream;
    } catch (e) {
      console.warn('Screen share cancelled:', e);
      return null;
    }
  }

  /**
   * Stops screen share and restores local camera track
   */
  public stopScreenShare(): void {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }

    if (this.peerConnection && this.localStream) {
      const camTrack = this.localStream.getVideoTracks()[0];
      const sender = this.peerConnection.getSenders().find((s) => s.track?.kind === 'video');
      if (sender && camTrack) {
        sender.replaceTrack(camTrack);
      }
    }
  }

  /**
   * Sets audio output sink device (e.g. speakers or headphones where supported)
   */
  public async setAudioOutputDevice(element: HTMLAudioElement | HTMLVideoElement, deviceId: string): Promise<boolean> {
    if ('setSinkId' in element) {
      try {
        await (element as any).setSinkId(deviceId);
        return true;
      } catch (e) {
        console.warn('setSinkId warning:', e);
        return false;
      }
    }
    return false;
  }

  /**
   * Callbacks registration
   */
  public onRemoteStream(callback: (stream: MediaStream) => void): void {
    this.onRemoteStreamCallback = callback;
  }

  public onIceCandidate(callback: (candidate: RTCIceCandidate) => void): void {
    this.onIceCandidateCallback = callback;
  }

  public onConnectionStateChange(callback: (state: RTCPeerConnectionState) => void): void {
    this.onConnectionStateChangeCallback = callback;
  }

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  /**
   * Cleanup and close all streams and connection
   */
  public close(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remoteStream = null;
  }
}
