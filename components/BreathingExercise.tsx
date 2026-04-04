
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

const BreathingExercise: React.FC<BreathingExerciseProps> = ({ onBack, lang }) => {
  const [mode, setMode] = useState<BreathingMode>('physiological');
  const [phase, setPhase] = useState<BreathPhase>('PHYS_INHALE_1');
  const [timer, setTimer] = useState(2);
  const [isActive, setIsActive] = useState(false);
  const [cycles, setCycles] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const prevPhaseRef = useRef<BreathPhase | null>(null);
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

  // Speak the phase instruction via Web Speech API
  const speak = useCallback((text: string) => {
    if (!audioEnabled) return;
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.85;
    utt.pitch = 1.0;
    utt.volume = 0.9;
    utt.lang = lang === 'es' ? 'es-US' : 'en-US';
    window.speechSynthesis.speak(utt);
  }, [audioEnabled, lang]);

  // Keep screen awake during active breathing session
  useEffect(() => {
    if (isActive) {
      startKeepAlive();
      requestWakeLock();
    } else {
      stopKeepAlive();
      releaseWakeLock();
    }
    return () => { stopKeepAlive(); releaseWakeLock(); window.speechSynthesis?.cancel(); };
  }, [isActive]);

  // Speak + tone on phase change
  useEffect(() => {
    if (!isActive) return;
    if (prevPhaseRef.current === phase) return;
    prevPhaseRef.current = phase;
    const text = getPhaseText();
    if (audioEnabled) {
      playTone(PHASE_TONES[phase]);
      // Small delay so tone plays before voice
      setTimeout(() => speak(text), 200);
    }
  }, [phase, isActive, audioEnabled]);

  // Reset phase/timer when switching modes
  const switchMode = (newMode: BreathingMode) => {
    window.speechSynthesis?.cancel();
    setIsActive(false);
    setCycles(0);
    prevPhaseRef.current = null;
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
        case 'PHYS_INHALE_2': return (t as any).physioInhale2 || 'INHALE again — top it off';
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
            className={`flex-1 py-2.5 rounded-xl text-[11px] font-semibold uppercase tracking-wide transition-all ${
              mode === 'physiological'
                ? 'bg-[#233DFF] text-white shadow-lg shadow-blue-500/20'
                : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400'
            }`}
          >
            {lang === 'es' ? 'Alivio Rápido' : 'Quick Relief'}
          </button>
          <button
            onClick={() => switchMode('box')}
            className={`flex-1 py-2.5 rounded-xl text-[11px] font-semibold uppercase tracking-wide transition-all ${
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
              if (audioEnabled) window.speechSynthesis?.cancel();
            }}
            className="w-11 h-11 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm"
            aria-label={audioEnabled ? 'Mute audio guidance' : 'Enable audio guidance'}
          >
            {audioEnabled ? <Volume2 size={18} /> : <VolumeX size={18} className="text-gray-300" />}
          </button>
          <button
            onClick={() => {
              window.speechSynthesis?.cancel();
              setIsActive(false);
              setCycles(0);
              prevPhaseRef.current = null;
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
                window.speechSynthesis?.cancel();
                setIsActive(false);
              } else {
                prevPhaseRef.current = null; // trigger speak on next phase
                setIsActive(true);
              }
            }}
            className={`w-full h-16 rounded-full font-normal text-base flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl ${isActive ? 'bg-white dark:bg-white/10 text-[#1a1a1a] dark:text-white border border-[#0f0f0f] dark:border-white' : 'bg-[#233dff] text-white border border-[#233dff] shadow-blue-500/20'}`}
          >
            {isActive ? (
              <><Pause size={20} fill="currentColor" /> {t.pauseSession}</>
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
