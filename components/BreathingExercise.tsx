
import React, { useState, useEffect } from 'react';
import { Language } from '../types';
import { translations } from '../translations';
import { RotateCcw, Play, Pause } from 'lucide-react';

interface BreathingExerciseProps {
  onBack: () => void;
  lang: Language;
}

type BreathPhase = 'INHALE' | 'HOLD_FULL' | 'EXHALE' | 'HOLD_EMPTY';

const BreathingExercise: React.FC<BreathingExerciseProps> = ({ onBack, lang }) => {
  const [phase, setPhase] = useState<BreathPhase>('INHALE');
  const [timer, setTimer] = useState(4);
  const [isActive, setIsActive] = useState(false);
  const t = translations[lang];

  useEffect(() => {
    let interval: any;
    if (isActive) {
      interval = setInterval(() => {
        setTimer((prev) => {
          if (prev === 1) {
            switch (phase) {
              case 'INHALE': setPhase('HOLD_FULL'); return 4;
              case 'HOLD_FULL': setPhase('EXHALE'); return 4;
              case 'EXHALE': setPhase('HOLD_EMPTY'); return 4;
              case 'HOLD_EMPTY': setPhase('INHALE'); return 4;
            }
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, phase]);

  const getPhaseText = () => {
    switch (phase) {
      case 'INHALE': return t.inhale;
      case 'HOLD_FULL': return t.holdFull;
      case 'EXHALE': return t.exhale;
      case 'HOLD_EMPTY': return t.holdEmpty;
    }
  };

  const getVisuals = () => {
    switch (phase) {
      case 'INHALE':
        return { scale: 'scale-110', color: 'bg-blue-400', ringScale: 'scale-125', opacity: 'opacity-90', shadow: 'shadow-blue-400/40', pulse: '' };
      case 'HOLD_FULL':
        return { scale: 'scale-110', color: 'bg-[#233DFF]', ringScale: 'scale-150', opacity: 'opacity-100', shadow: 'shadow-blue-600/60', pulse: 'animate-pulse' };
      case 'EXHALE':
        return { scale: 'scale-75', color: 'bg-indigo-600', ringScale: 'scale-90', opacity: 'opacity-60', shadow: 'shadow-indigo-500/30', pulse: '' };
      case 'HOLD_EMPTY':
        return { scale: 'scale-75', color: 'bg-indigo-900', ringScale: 'scale-80', opacity: 'opacity-40', shadow: 'shadow-indigo-900/20', pulse: 'animate-pulse' };
    }
  };

  const v = getVisuals();

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#121212] animate-in fade-in w-full overflow-hidden">
      {/* Upper Phase Indicator */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-50 dark:border-white/5">
        <span className="font-medium uppercase tracking-wide text-[10px] text-[#233DFF] dark:text-blue-400">
          {t.labels.boxBreathingPhase}
        </span>
        <button 
          onClick={() => { setIsActive(false); setTimer(4); setPhase('INHALE'); }} 
          className="w-9 h-9 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm active:rotate-180"
          aria-label="Reset timer"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Responsive Visual Center */}
      <div className="flex-1 flex flex-col items-center justify-center py-2 px-4 min-h-0">

        {/* Breathing Orb Container */}
        <div className="relative w-full max-w-[180px] sm:max-w-[240px] aspect-square flex items-center justify-center mb-6">
           <div className={`absolute inset-0 border-2 border-[#233DFF]/10 rounded-full transition-all duration-[4000ms] ease-in-out transform-gpu ${v.ringScale}`}></div>
           <div className={`absolute inset-0 border border-dashed border-[#233DFF]/20 rounded-full transition-all duration-[3000ms] animate-[spin_30s_linear_infinite] transform-gpu ${v.scale}`}></div>
           
           <div className={`w-4/5 h-4/5 rounded-full transition-all duration-[4000ms] ease-in-out shadow-2xl flex items-center justify-center transform-gpu ${v.color} ${v.scale} ${v.opacity} ${v.shadow} ${v.pulse} z-10`}>
              <div className="text-6xl sm:text-8xl font-[900] tabular-nums leading-none text-white drop-shadow-lg">
                {timer}
              </div>
           </div>
        </div>

        {/* Textual Guidance and Primary Control */}
        <div className="flex flex-col items-center gap-4 w-full max-w-[300px] text-center">
          <div className="space-y-1">
            <h3 className="text-3xl sm:text-4xl font-normal tracking-normal leading-none text-black dark:text-white transition-all duration-700 font-display">
              {getPhaseText()}
            </h3>
            <p className="text-gray-400 dark:text-gray-500 font-medium text-[9px] uppercase tracking-wide">
              {t.labels.steadyLungs}
            </p>
          </div>

          <button
            onClick={() => setIsActive(!isActive)}
            className={`w-full h-14 sm:h-16 rounded-full font-normal text-base flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl ${isActive ? 'bg-white dark:bg-white/10 text-[#1a1a1a] dark:text-white border border-[#0f0f0f] dark:border-white' : 'bg-[#233dff] text-white border border-[#233dff] shadow-blue-500/20'}`}
          >
            {isActive ? (
              <><Pause size={18} fill="currentColor" /> {t.pauseSession}</>
            ) : (
              <><Play size={18} fill="currentColor" className="ml-0.5" /> {t.labels.beginSession}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BreathingExercise;
