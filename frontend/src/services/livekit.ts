// LiveKit Cloud Service Helper

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
  const res = await fetch('http://localhost:8000/api/v1/livekit/token', {
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
let audioCtx: AudioContext | null = null;

export const playRingtone = () => {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const playBeep = () => {
      if (!audioCtx) return;
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
      osc2.frequency.setValueAtTime(480, audioCtx.currentTime); // European dial tone harmony

      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(audioCtx.currentTime + 1.2);
      osc2.stop(audioCtx.currentTime + 1.2);
    };

    playBeep();
    ringtoneInterval = setInterval(playBeep, 2400);
  } catch (e) {
    console.warn('AudioContext ringtone warning:', e);
  }
};

export const stopRingtone = () => {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
  if (audioCtx && audioCtx.state !== 'closed') {
    try {
      audioCtx.close();
    } catch {}
    audioCtx = null;
  }
};
