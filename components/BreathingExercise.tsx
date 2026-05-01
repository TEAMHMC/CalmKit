
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Language } from '../types';
import { translations } from '../translations';
import { RotateCcw, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { startKeepAlive, stopKeepAlive, requestWakeLock, releaseWakeLock, getAudioContext } from '../audioManager';


interface BreathingExerciseProps {
  onBack: () => void;
  lang: Language;
}

type BreathingMode = 'physiological' | 'box';
type BreathPhase = 'PHYS_INHALE_1' | 'PHYS_INHALE_2' | 'PHYS_EXHALE' | 'INHALE' | 'HOLD_FULL' | 'EXHALE' | 'HOLD_EMPTY';

// ---------------------------------------------------------------------------
// Web Speech API fallback — speaks a phrase immediately with no network call.
// Used when static WAV files are missing or the AudioContext is unavailable.
// ---------------------------------------------------------------------------
function speakFallback(text: string): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  // Cancel any in-flight speech immediately — critical for short phases
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.85;
  utt.pitch = 1.0;
  utt.volume = 1.0;
  // Prefer a calm English/Spanish voice if one is available
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(
    (v) =>
      v.lang.startsWith('en') &&
      (/samantha|karen|moira|daniel|susan|zoe/i.test(v.name))
  ) || voices.find((v) => v.lang.startsWith('en')) || null;
  if (preferred) utt.voice = preferred;
  window.speechSynthesis.speak(utt);
}

function speakFallbackEs(text: string): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.85;
  utt.pitch = 1.0;
  utt.volume = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(
    (v) => v.lang.startsWith('es') && (/mónica|paulina|jorge|juan/i.test(v.name))
  ) || voices.find((v) => v.lang.startsWith('es')) || null;
  if (preferred) utt.voice = preferred;
  window.speechSynthesis.speak(utt);
}

const BreathingExercise: React.FC<BreathingExerciseProps> = ({ onBack, lang }) => {
  const [mode, setMode] = useState<BreathingMode>('physiological');
  const [phase, setPhase] = useState<BreathPhase>('PHYS_INHALE_1');
  const [timer, setTimer] = useState(2);
  const [isActive, setIsActive] = useState(false);
  const [cycles, setCycles] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [cacheReady, setCacheReady] = useState(false);
  const prevPhaseRef = useRef<BreathPhase | null>(null);
  const audioCacheRef = useRef<Map<BreathPhase, AudioBuffer>>(new Map());
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const voiceDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = translations[lang];

  // Tone frequencies per phase (Hz) — inhale rises, exhale falls, hold holds
  const PHASE_TONES: Record<BreathPhase, number> = {
    PHYS_INHALE_1: 330,
    PHYS_INHALE_2: 396,
    PHYS_EXHALE:   220,
    INHALE:        330,
    HOLD_FULL:     396,
    EXHALE:        220,
    HOLD_EMPTY:    180,
  };

  // Play a soft chime using AudioContext — gentle sine wave, ~0.6s fade
  const playTone = useCallback(async (freq: number) => {
    try {
      const ctx = await getAudioContext(44100);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.75);
    } catch { /* audio unavailable — fail silently */ }
  }, []);

  // Map each phase to calm, spoken-word text (used for Web Speech API fallback)
  const PHASE_TTS: Record<BreathPhase, { en: string; es: string }> = {
    PHYS_INHALE_1: { en: 'Inhale',                            es: 'Inhala' },
    PHYS_INHALE_2: { en: 'Inhale again',                      es: 'Inhala de nuevo' },
    PHYS_EXHALE:   { en: 'Long exhale through your mouth',    es: 'Exhala lentamente por la boca' },
    INHALE:        { en: 'Inhale',                             es: 'Inhala' },
    HOLD_FULL:     { en: 'Hold',                               es: 'Sostén' },
    EXHALE:        { en: 'Exhale',                             es: 'Exhala' },
    HOLD_EMPTY:    { en: 'Rest',                               es: 'Descansa' },
  };

  // Static audio file map — plays instantly from local public directory
  const STATIC_AUDIO: Record<BreathPhase, Record<Language, string>> = {
    PHYS_INHALE_1: { en: '/audio/breathing/en_phys_inhale_1.wav', es: '/audio/breathing/es_phys_inhale_1.wav' },
    PHYS_INHALE_2: { en: '/audio/breathing/en_phys_inhale_2.wav', es: '/audio/breathing/es_phys_inhale_2.wav' },
    PHYS_EXHALE:   { en: '/audio/breathing/en_phys_exhale.wav',   es: '/audio/breathing/es_phys_exhale.wav'   },
    INHALE:        { en: '/audio/breathing/en_inhale.wav',        es: '/audio/breathing/es_inhale.wav'        },
    HOLD_FULL:     { en: '/audio/breathing/en_hold.wav',          es: '/audio/breathing/es_hold.wav'          },
    EXHALE:        { en: '/audio/breathing/en_exhale.wav',        es: '/audio/breathing/es_exhale.wav'        },
    HOLD_EMPTY:    { en: '/audio/breathing/en_rest.wav',          es: '/audio/breathing/es_rest.wav'          },
  };

  // Tracks which phases successfully cached a WAV buffer so we know when to
  // fall back to Web Speech API instead of playing silence.
  const cachedPhasesRef = useRef<Set<BreathPhase>>(new Set());

  // Stop any currently-playing AudioBufferSourceNode immediately and clean up.
  // Must be called before starting a new source to prevent overlap.
  const stopCurrentSource = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.onended = null;
        currentSourceRef.current.stop();
      } catch { /* already ended — ignore */ }
      currentSourceRef.current = null;
    }
  }, []);

  // Cancel pending voice-delay timer without stopping a source that may have
  // already started playing.
  const cancelVoiceTimer = useCallback(() => {
    if (voiceDelayTimerRef.current !== null) {
      clearTimeout(voiceDelayTimerRef.current);
      voiceDelayTimerRef.current = null;
    }
  }, []);

  // Load static WAV files into AudioBuffers — fetches from local CDN.
  // Falls back gracefully: any phase that fails to cache will use Web Speech API.
  const preCachePhaseAudio = useCallback(async () => {
    const phases: BreathPhase[] = mode === 'physiological'
      ? ['PHYS_INHALE_1', 'PHYS_INHALE_2', 'PHYS_EXHALE']
      : ['INHALE', 'HOLD_FULL', 'EXHALE', 'HOLD_EMPTY'];

    // Full stop before clearing the cache
    cancelVoiceTimer();
    stopCurrentSource();
    // Also cancel any in-flight Web Speech so mode switches are clean
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    audioCacheRef.current.clear();
    cachedPhasesRef.current.clear();
    setCacheReady(false);

    let ctx: AudioContext;
    try {
      ctx = await getAudioContext(44100);
    } catch {
      // AudioContext unavailable — set ready anyway so the button unlocks;
      // Web Speech API will handle all voice cues.
      setCacheReady(true);
      return;
    }

    await Promise.all(phases.map(async (p) => {
      try {
        const res = await fetch(STATIC_AUDIO[p][lang]);
        if (!res.ok) return; // WAV missing — Web Speech fallback will be used
        const arrayBuffer = await res.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        audioCacheRef.current.set(p, audioBuffer);
        cachedPhasesRef.current.add(p);
      } catch { /* tones + Web Speech still play as fallback */ }
    }));

    setCacheReady(true);
  }, [mode, lang, cancelVoiceTimer, stopCurrentSource]);

  // Play cached WAV audio for the current phase (300 ms after the chime).
  // Stops the previous source BEFORE starting the new one — no overlap.
  // Falls back to Web Speech API immediately if the buffer is missing.
  const playPhaseAudio = useCallback((p: BreathPhase) => {
    // Always cancel any pending timer first so stale callbacks can't fire
    cancelVoiceTimer();

    const buffer = audioCacheRef.current.get(p);
    const ttsText = PHASE_TTS[p][lang];

    if (!buffer) {
      // WAV not cached — use Web Speech API immediately (no timer delay needed,
      // speech synthesis has its own tiny internal latency)
      if (lang === 'es') {
        speakFallbackEs(ttsText);
      } else {
        speakFallback(ttsText);
      }
      return;
    }

    // WAV buffer available — play it 300 ms after the chime
    voiceDelayTimerRef.current = setTimeout(async () => {
      voiceDelayTimerRef.current = null;

      let ctx: AudioContext;
      try {
        ctx = await getAudioContext(44100);
      } catch {
        // AudioContext failed mid-session — fall back to Web Speech
        if (lang === 'es') speakFallbackEs(ttsText);
        else speakFallback(ttsText);
        return;
      }

      if (ctx.state === 'closed') {
        if (lang === 'es') speakFallbackEs(ttsText);
        else speakFallback(ttsText);
        return;
      }

      // Stop the previous source NOW (inside the timer callback) to prevent
      // overlap when a new phase fires while the previous audio is still playing.
      stopCurrentSource();

      // Also cancel any Web Speech that might be running from a previous fallback
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      try {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.start();
        currentSourceRef.current = src;
        src.onended = () => { currentSourceRef.current = null; };
      } catch {
        // Source creation failed — fall back to Web Speech
        currentSourceRef.current = null;
        if (lang === 'es') speakFallbackEs(ttsText);
        else speakFallback(ttsText);
      }
    }, 300);
  }, [lang, cancelVoiceTimer, stopCurrentSource]);

  // Pre-cache audio on mount and whenever mode/lang changes.
  useEffect(() => {
    preCachePhaseAudio();
  }, [preCachePhaseAudio]);

  // Keep screen awake during active breathing session
  useEffect(() => {
    if (isActive) {
      startKeepAlive();
      requestWakeLock();
    } else {
      stopKeepAlive();
      releaseWakeLock();
    }
    return () => {
      // Full stop on unmount: cancel timers, stop audio, cancel speech
      cancelVoiceTimer();
      stopCurrentSource();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      stopKeepAlive();
      releaseWakeLock();
    };
  }, [isActive, cancelVoiceTimer, stopCurrentSource]);

  // Tone + voice on phase change
  useEffect(() => {
    if (!isActive) return;
    if (prevPhaseRef.current === phase) return;
    prevPhaseRef.current = phase;
    if (audioEnabled) {
      playTone(PHASE_TONES[phase]);
      playPhaseAudio(phase);
    }
  }, [phase, isActive, audioEnabled, playTone, playPhaseAudio]);

  // Reset phase/timer when switching modes
  const switchMode = (newMode: BreathingMode) => {
    setIsActive(false);
    setCycles(0);
    setCacheReady(false);
    prevPhaseRef.current = null;
    cancelVoiceTimer();
    stopCurrentSource();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    audioCacheRef.current.clear();
    cachedPhasesRef.current.clear();
    if (newMode === 'physiological') {
      setPhase('PHYS_INHALE_1');
      setTimer(2);
    } else {
      setPhase('INHALE');
      setTimer(4);
    }
    setMode(newMode);
  };

  useEffect(() => {
    let interval: any;
    if (isActive) {
      interval = setInterval(() => {
        setTimer((prev) => {
          if (prev === 1) {
            switch (phase) {
              // Physiological sigh: 2s inhale → 2s top-up inhale → 8s slow exhale
              case 'PHYS_INHALE_1': setPhase('PHYS_INHALE_2'); return 2;
              case 'PHYS_INHALE_2': setPhase('PHYS_EXHALE'); return 8;
              case 'PHYS_EXHALE': setPhase('PHYS_INHALE_1'); setCycles(c => c + 1); return 2;
              // Box breathing: 4-4-4-4
              case 'INHALE': setPhase('HOLD_FULL'); return 4;
              case 'HOLD_FULL': setPhase('EXHALE'); return 4;
              case 'EXHALE': setPhase('HOLD_EMPTY'); return 4;
              case 'HOLD_EMPTY': setPhase('INHALE'); setCycles(c => c + 1); return 4;
            }
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, phase]);

  const getPhaseText = (): string => {
    if (mode === 'physiological') {
      switch (phase) {
        case 'PHYS_INHALE_1': return (t as any).physioInhale1 || 'INHALE through your nose';
        case 'PHYS_INHALE_2': return (t as any).physioInhale2 || 'INHALE again';
        case 'PHYS_EXHALE': return (t as any).physioExhale || 'LONG exhale through your mouth';
        default: return '';
      }
    }
    switch (phase) {
      case 'INHALE': return t.inhale;
      case 'HOLD_FULL': return t.holdFull;
      case 'EXHALE': return t.exhale;
      case 'HOLD_EMPTY': return t.holdEmpty;
      default: return '';
    }
  };

  const getVisuals = () => {
    switch (phase) {
      case 'PHYS_INHALE_1':
        return { scale: 'scale-100', color: 'bg-blue-400', ringScale: 'scale-110', opacity: 'opacity-80', shadow: 'shadow-blue-400/40', pulse: '' };
      case 'PHYS_INHALE_2':
        return { scale: 'scale-110', color: 'bg-[#233DFF]', ringScale: 'scale-130', opacity: 'opacity-95', shadow: 'shadow-blue-600/50', pulse: '' };
      case 'PHYS_EXHALE':
        return { scale: 'scale-75', color: 'bg-indigo-500', ringScale: 'scale-75', opacity: 'opacity-50', shadow: 'shadow-indigo-400/20', pulse: '' };
      case 'INHALE':
        return { scale: 'scale-110', color: 'bg-blue-400', ringScale: 'scale-125', opacity: 'opacity-90', shadow: 'shadow-blue-400/40', pulse: '' };
      case 'HOLD_FULL':
        return { scale: 'scale-110', color: 'bg-[#233DFF]', ringScale: 'scale-150', opacity: 'opacity-100', shadow: 'shadow-blue-600/60', pulse: 'animate-pulse' };
      case 'EXHALE':
        return { scale: 'scale-75', color: 'bg-indigo-600', ringScale: 'scale-90', opacity: 'opacity-60', shadow: 'shadow-indigo-500/30', pulse: '' };
      case 'HOLD_EMPTY':
        return { scale: 'scale-75', color: 'bg-indigo-900', ringScale: 'scale-[0.80]', opacity: 'opacity-40', shadow: 'shadow-indigo-900/20', pulse: 'animate-pulse' };
      default:
        return { scale: 'scale-100', color: 'bg-blue-400', ringScale: 'scale-110', opacity: 'opacity-80', shadow: 'shadow-blue-400/40', pulse: '' };
    }
  };

  const v = getVisuals();
  const modeLabel = mode === 'physiological'
    ? ((t.labels as any).quickRelief || 'QUICK RELIEF')
    : t.labels.boxBreathingPhase;

  const physioDesc = lang === 'es'
    ? 'Doble inhalación + exhale largo — calma tu cuerpo en segundos'
    : 'Double inhale + long exhale — calms your body fast';
  const boxDesc = lang === 'es'
    ? 'Respira lento y en ciclos — ayuda a sentirte más tranquilo'
    : 'Slow, steady cycles — helps you feel calm and in control';

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#121212] animate-in fade-in w-full overflow-hidden">
      {/* Mode Selector */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2">
        <div className="flex gap-2">
          <button
            onClick={() => switchMode('physiological')}
            className={`flex-1 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-wide transition-all ${
              mode === 'physiological'
                ? 'bg-[#233DFF] text-white shadow-lg shadow-blue-500/20'
                : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400'
            }`}
          >
            {lang === 'es' ? 'Alivio Rápido' : 'Quick Relief'}
          </button>
          <button
            onClick={() => switchMode('box')}
            className={`flex-1 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-wide transition-all ${
              mode === 'box'
                ? 'bg-[#233DFF] text-white shadow-lg shadow-blue-500/20'
                : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400'
            }`}
          >
            {lang === 'es' ? 'Caja 4-4-4-4' : 'Box Breathing'}
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 px-1">
          {mode === 'physiological' ? physioDesc : boxDesc}
        </p>
      </div>

      {/* Upper Phase Indicator */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-50 dark:border-white/5">
        <span className="font-medium uppercase tracking-wide text-xs text-[#233DFF] dark:text-blue-400">
          {modeLabel}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setAudioEnabled(e => !e);
            }}
            className="w-11 h-11 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm"
            aria-label={audioEnabled ? 'Mute audio guidance' : 'Enable audio guidance'}
          >
            {audioEnabled ? <Volume2 size={18} /> : <VolumeX size={18} className="text-gray-300" />}
          </button>
          <button
            onClick={() => {
              setIsActive(false);
              setCycles(0);
              prevPhaseRef.current = null;
              // Cancel pending timer, stop playing audio, and cancel speech
              cancelVoiceTimer();
              stopCurrentSource();
              if (typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.cancel();
              }
              audioCacheRef.current.clear();
              cachedPhasesRef.current.clear();
              if (mode === 'physiological') { setPhase('PHYS_INHALE_1'); setTimer(2); }
              else { setPhase('INHALE'); setTimer(4); }
            }}
            className="w-11 h-11 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm active:rotate-180"
            aria-label="Reset timer"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </div>

      {/* Responsive Visual Center */}
      <div className="flex-1 flex flex-col items-center justify-center py-4 px-6 min-h-0">

        {/* Breathing Orb Container */}
        <div className="relative w-full max-w-[220px] sm:max-w-[260px] aspect-square flex items-center justify-center mb-8">
           <div className={`absolute inset-0 border-2 border-[#233DFF]/10 rounded-full transition-all duration-[4000ms] ease-in-out transform-gpu ${v.ringScale}`}></div>
           <div className={`absolute inset-0 border border-dashed border-[#233DFF]/20 rounded-full transition-all duration-[3000ms] animate-[spin_30s_linear_infinite] transform-gpu ${v.scale}`}></div>

           <div className={`w-4/5 h-4/5 rounded-full transition-all duration-[4000ms] ease-in-out shadow-2xl flex items-center justify-center transform-gpu ${v.color} ${v.scale} ${v.opacity} ${v.shadow} ${v.pulse} z-10`}>
              <div className="text-7xl sm:text-8xl font-[900] tabular-nums leading-none text-white drop-shadow-lg">
                {timer}
              </div>
           </div>
        </div>

        {/* Textual Guidance and Primary Control */}
        <div className="flex flex-col items-center gap-5 w-full max-w-[320px] text-center">
          <div className="space-y-2">
            <h3 aria-live="assertive" aria-atomic="true" className="text-3xl font-normal tracking-normal leading-tight text-black dark:text-white transition-all duration-700 font-display">
              {getPhaseText()}
            </h3>
            <p className="text-gray-400 dark:text-gray-500 font-medium text-[11px] uppercase tracking-wide">
              {isActive && cycles > 0
                ? `${cycles} ${cycles === 1 ? (lang === 'es' ? 'CICLO' : 'CYCLE') : (lang === 'es' ? 'CICLOS' : 'CYCLES')}`
                : t.labels.steadyLungs}
            </p>
          </div>

          <button
            onClick={() => {
              if (isActive) {
                setIsActive(false);
                // Stop everything when pausing
                cancelVoiceTimer();
                stopCurrentSource();
                if (typeof window !== 'undefined' && window.speechSynthesis) {
                  window.speechSynthesis.cancel();
                }
              } else {
                // Force re-trigger audio on the current phase by clearing prevPhaseRef
                prevPhaseRef.current = null;
                setIsActive(true);
              }
            }}
            disabled={!isActive && !cacheReady}
            className={`w-full h-16 rounded-full font-normal text-base flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl disabled:opacity-50 ${isActive ? 'bg-white dark:bg-white/10 text-[#1a1a1a] dark:text-white border border-black/10 dark:border-white/20' : 'bg-[#233dff] text-white shadow-blue-500/20'}`}
          >
            {isActive ? (
              <><Pause size={20} fill="currentColor" /> {t.pauseSession}</>
            ) : !cacheReady ? (
              <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Getting ready...</>
            ) : (
              <><Play size={20} fill="currentColor" className="ml-0.5" /> {t.labels.beginSession}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BreathingExercise;
