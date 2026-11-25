// LiveKit Cloud Service Helper
import { API_BASE_URL } from '../config/api';

export interface LiveKitTokenResponse {
  success: boolean;
  token: string;
  url: string;
  room_name: string;
  participant_identity: string;
}

export const fetchLiveKitToken = async (
  roomName: string,
  identity: string,
  name?: string
): Promise<LiveKitTokenResponse> => {
  const res = await fetch(`${API_BASE_URL}/api/v1/livekit/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room_name: roomName,
      participant_identity: identity,
      participant_name: name || identity,
      can_publish: true,
      can_subscribe: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to generate LiveKit access token');
  }

  return res.json();
};

// Web Audio API Ringtone Synthesizer (0 external audio files needed)
let ringtoneInterval: any = null;
let outgoingToneInterval: any = null;
let audioCtx: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

// 1. Incoming Call Ringtone
export const playRingtone = () => {
  try {
    const ctx = getAudioContext();

    const playBeep = () => {
      if (!ctx || ctx.state === 'closed') return;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(440, ctx.currentTime);
      osc2.frequency.setValueAtTime(480, ctx.currentTime);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 1.2);
      osc2.stop(ctx.currentTime + 1.2);
    };

    playBeep();
    ringtoneInterval = setInterval(playBeep, 2400);
  } catch (e) {
    console.warn('AudioContext incoming ringtone warning:', e);
  }
};

export const stopRingtone = () => {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
};

// 2. Outgoing WhatsApp-style Ringing Dialtone ("Tring... Tring...")
export const playOutgoingRingtone = () => {
  try {
    stopOutgoingRingtone();
    const ctx = getAudioContext();

    const playDialTone = () => {
      if (!ctx || ctx.state === 'closed') return;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      // Soft WhatsApp dialtone harmonic frequencies
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(425, ctx.currentTime);
      osc2.frequency.setValueAtTime(450, ctx.currentTime);

      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.3);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 1.3);
      osc2.stop(ctx.currentTime + 1.3);
    };

    playDialTone();
    outgoingToneInterval = setInterval(playDialTone, 3000);
  } catch (e) {
    console.warn('AudioContext outgoing ringtone warning:', e);
  }
};

export const stopOutgoingRingtone = () => {
  if (outgoingToneInterval) {
    clearInterval(outgoingToneInterval);
    outgoingToneInterval = null;
  }
};

// 3. Subtle incoming message / notification pop chime
export const playMessageSound = () => {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch {}
};
