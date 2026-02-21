
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Volume2, VolumeX, SkipForward, SkipBack, Play, Pause, Gauge } from 'lucide-react';

interface ProctorTTSProps {
  /** The plain text to read aloud — extracted from htmlContent or iframe */
  textContent: string;
  /** Compact mode for the HUD bar */
  compact?: boolean;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2];

const ProctorTTS: React.FC<ProctorTTSProps> = ({ textContent, compact }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentSentence, setCurrentSentence] = useState(0);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const sentencesRef = useRef<string[]>([]);

  // Split text into sentences
  useEffect(() => {
    if (!textContent) {
      sentencesRef.current = [];
      return;
    }
    // Split on sentence-ending punctuation followed by whitespace
    const sentences = textContent
      .replace(/\n+/g, '. ')
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 2);
    sentencesRef.current = sentences;
    setCurrentSentence(0);
  }, [textContent]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  }, []);

  const speakSentence = useCallback((index: number) => {
    const sentences = sentencesRef.current;
    if (index < 0 || index >= sentences.length) {
      setIsPlaying(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(sentences[index]);
    utterance.rate = speed;
    utterance.onend = () => {
      const next = index + 1;
      if (next < sentences.length) {
        setCurrentSentence(next);
        speakSentence(next);
      } else {
        setIsPlaying(false);
      }
    };
    utterance.onerror = () => {
      setIsPlaying(false);
    };
    utteranceRef.current = utterance;
    setCurrentSentence(index);
    window.speechSynthesis.speak(utterance);
  }, [speed]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      stopSpeaking();
    } else {
      setIsPlaying(true);
      speakSentence(currentSentence);
    }
  }, [isPlaying, currentSentence, speakSentence, stopSpeaking]);

  const handlePrev = useCallback(() => {
    const prev = Math.max(0, currentSentence - 1);
    setCurrentSentence(prev);
    if (isPlaying) {
      speakSentence(prev);
    }
  }, [currentSentence, isPlaying, speakSentence]);

  const handleNext = useCallback(() => {
    const next = Math.min(sentencesRef.current.length - 1, currentSentence + 1);
    setCurrentSentence(next);
    if (isPlaying) {
      speakSentence(next);
    }
  }, [currentSentence, isPlaying, speakSentence]);

  const handleSpeedChange = useCallback((newSpeed: number) => {
    setSpeed(newSpeed);
    setShowSpeedMenu(false);
    if (isPlaying) {
      // Restart current sentence at new speed
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(sentencesRef.current[currentSentence]);
      utterance.rate = newSpeed;
      utterance.onend = () => {
        const next = currentSentence + 1;
        if (next < sentencesRef.current.length) {
          setCurrentSentence(next);
          speakSentence(next);
        } else {
          setIsPlaying(false);
        }
      };
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    }
  }, [isPlaying, currentSentence, speakSentence]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  if (!textContent || sentencesRef.current.length === 0) return null;

  if (compact) {
    return (
      <button
        onClick={handlePlayPause}
        className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border uppercase font-bold tracking-widest transition-colors cursor-pointer ${
          isPlaying
            ? 'text-amber-300 bg-amber-500/20 border-amber-500/30 hover:bg-amber-500/30'
            : 'text-purple-300 bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20'
        }`}
        title={isPlaying ? 'Stop Reading' : 'Read Aloud'}
      >
        {isPlaying ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
        {isPlaying ? 'Stop Reading' : 'Read Aloud'}
      </button>
    );
  }

  const totalSentences = sentencesRef.current.length;
  const progress = totalSentences > 0 ? ((currentSentence + 1) / totalSentences) * 100 : 0;

  return (
    <div className="flex items-center gap-2 bg-black/40 rounded-xl px-3 py-2 border border-white/10">
      {/* Play/Pause */}
      <button
        onClick={handlePlayPause}
        className={`p-1.5 rounded-lg transition ${isPlaying ? 'bg-amber-500/20 text-amber-400' : 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'}`}
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>

      {/* Prev/Next */}
      <button onClick={handlePrev} disabled={currentSentence === 0} className="p-1 text-gray-500 hover:text-white disabled:opacity-30 transition">
        <SkipBack className="w-3.5 h-3.5" />
      </button>
      <button onClick={handleNext} disabled={currentSentence >= totalSentences - 1} className="p-1 text-gray-500 hover:text-white disabled:opacity-30 transition">
        <SkipForward className="w-3.5 h-3.5" />
      </button>

      {/* Progress bar */}
      <div className="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden">
        <div
          className="h-1.5 rounded-full bg-purple-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Sentence counter */}
      <span className="text-[9px] text-gray-500 font-mono min-w-[3rem] text-center">
        {currentSentence + 1}/{totalSentences}
      </span>

      {/* Speed control */}
      <div className="relative">
        <button
          onClick={() => setShowSpeedMenu(!showSpeedMenu)}
          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white bg-white/5 px-2 py-1 rounded-lg border border-white/10 transition"
        >
          <Gauge className="w-3 h-3" />
          {speed}x
        </button>
        {showSpeedMenu && (
          <div className="absolute bottom-full right-0 mb-1 bg-[#1a1b26] border border-white/10 rounded-lg shadow-lg overflow-hidden z-50">
            {SPEED_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => handleSpeedChange(s)}
                className={`block w-full text-left px-3 py-1.5 text-xs transition ${
                  speed === s ? 'bg-purple-600/30 text-purple-300' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProctorTTS;
