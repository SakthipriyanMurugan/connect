import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Mic } from 'lucide-react';

interface VoiceNotePlayerProps {
  audioUrl: string;
  duration?: string;
  isMe?: boolean;
}

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({ audioUrl, duration, isMe }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      setTotalDuration(audio.duration || 0);
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const formatSecs = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  // Waveform heights mock
  const waveBars = [35, 60, 85, 45, 95, 75, 40, 65, 90, 50, 80, 60, 40, 70, 90, 65, 45, 85, 55, 30];

  return (
    <div className="flex items-center gap-3 py-1 min-w-[220px]">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* Play / Pause Circular Button */}
      <button
        type="button"
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 cursor-pointer shrink-0 ${
          isMe
            ? 'bg-white text-[#182044] hover:bg-white/90'
            : 'bg-[var(--accent)] text-white hover:brightness-110 shadow-[var(--accent)]/30'
        }`}
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>

      {/* Waveform Visualizer & Progress */}
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-[2px] h-7 cursor-pointer" onClick={(e) => {
          if (!audioRef.current || totalDuration === 0) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const newTime = (clickX / rect.width) * totalDuration;
          audioRef.current.currentTime = newTime;
          setCurrentTime(newTime);
        }}>
          {waveBars.map((height, i) => {
            const barProgress = (i / waveBars.length) * 100;
            const isFilled = barProgress <= progressPercent;
            return (
              <span
                key={i}
                style={{ height: `${height}%` }}
                className={`w-1 rounded-full transition-all duration-100 ${
                  isFilled
                    ? isMe ? 'bg-white' : 'bg-[var(--accent)]'
                    : isMe ? 'bg-white/40' : 'bg-black/20 dark:bg-white/20'
                }`}
              />
            );
          })}
        </div>

        {/* Time display */}
        <div className={`flex items-center justify-between text-[10px] font-semibold ${isMe ? 'text-white/80' : 'text-[#6f7899] dark:text-[#aeb8dc]'}`}>
          <span>{formatSecs(currentTime)}</span>
          <span className="flex items-center gap-1">
            <Mic className="w-2.5 h-2.5 opacity-70" />
            {duration || (totalDuration > 0 ? formatSecs(totalDuration) : 'Voice note')}
          </span>
        </div>
      </div>
    </div>
  );
};
