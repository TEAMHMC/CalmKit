
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, RefreshCcw, Volume2, Loader2, Pause, Play, Square } from 'lucide-react';
import { Language, BackgroundSound } from '../types';
import { translations } from '../translations';
import { generateMeditationScript } from '../geminiService';
import { getAudioContext, destroyAudioContext, startKeepAlive, stopKeepAlive, requestWakeLock, releaseWakeLock, fullCleanup } from '../audioManager';

const TTS_PROXY_URL = 'https://volunteer.healthmatters.clinic/api/calmkit/tts';

interface MeditationProps {
  onBack: () => void;
  lang: Language;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// --- Background sound generators ---

interface BgSoundNodes {
  nodes: AudioNode[];
  gain: GainNode;
  timers: number[];
}

function createRain(ctx: AudioContext): BgSoundNodes {
  const bufferSize = 2 * ctx.sampleRate;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 1000;
  bandpass.Q.value = 0.5;

  // Gentle volume modulation
  const modGain = ctx.createGain();
  modGain.gain.value = 0.8;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.3;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.2;
  lfo.connect(lfoGain);
  lfoGain.connect(modGain.gain);

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0;

  noise.connect(bandpass);
  bandpass.connect(modGain);
  modGain.connect(masterGain);

  noise.start();
  lfo.start();

  return { nodes: [noise, lfo, bandpass, modGain, lfoGain], gain: masterGain, timers: [] };
}

function createOcean(ctx: AudioContext): BgSoundNodes {
  const bufferSize = 2 * ctx.sampleRate;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 500;
  lowpass.Q.value = 1;

  // Slow volume oscillation for wave effect
  const modGain = ctx.createGain();
  modGain.gain.value = 0.5;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.08; // slow waves
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.5;
  lfo.connect(lfoGain);
  lfoGain.connect(modGain.gain);

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0;

  noise.connect(lowpass);
  lowpass.connect(modGain);
  modGain.connect(masterGain);

  noise.start();
  lfo.start();

  return { nodes: [noise, lfo, lowpass, modGain, lfoGain], gain: masterGain, timers: [] };
}

function createForest(ctx: AudioContext): BgSoundNodes {
  // Gentle background noise at very low volume
  const bufferSize = 2 * ctx.sampleRate;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 800;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.15;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0;

  noise.connect(lowpass);
  lowpass.connect(noiseGain);
  noiseGain.connect(masterGain);

  noise.start();

  // Bird chirps at random intervals
  const timers: number[] = [];
  function scheduleChirp() {
    const delay = 2000 + Math.random() * 5000;
    const timer = window.setTimeout(() => {
      if (ctx.state === 'closed') return;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const baseFreq = 2000 + Math.random() * 2000;
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.3, ctx.currentTime + 0.05);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.9, ctx.currentTime + 0.1);

      const chirpGain = ctx.createGain();
      chirpGain.gain.setValueAtTime(0, ctx.currentTime);
      chirpGain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      chirpGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.12);

      osc.connect(chirpGain);
      chirpGain.connect(masterGain);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);

      scheduleChirp();
    }, delay);
    timers.push(timer);
  }
  scheduleChirp();

  return { nodes: [noise, lowpass, noiseGain], gain: masterGain, timers };
}

function createZen(ctx: AudioContext): BgSoundNodes {
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.value = 220;

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = 330;

  const padGain = ctx.createGain();
  padGain.gain.value = 0.5;

  // Very slow tremolo
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.15;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.15;
  lfo.connect(lfoGain);
  lfoGain.connect(padGain.gain);

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0;

  osc1.connect(padGain);
  osc2.connect(padGain);
  padGain.connect(masterGain);

  osc1.start();
  osc2.start();
  lfo.start();

  return { nodes: [osc1, osc2, lfo, padGain, lfoGain], gain: masterGain, timers: [] };
}

const Meditation: React.FC<MeditationProps> = ({ onBack, lang }) => {
  const [script, setScript] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [bgSound, setBgSound] = useState<BackgroundSound>('NONE');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);
  const [ttsUnavailable, setTtsUnavailable] = useState(false);
  const [bgSoundActive, setBgSoundActive] = useState(false);

  const t = translations[lang];
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const bgGainRef = useRef<GainNode | null>(null);
  const bgSoundNodesRef = useRef<BgSoundNodes | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const progressIntervalRef = useRef<any>(null);

  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  };

  const initAudio = async () => {
    const ctx = await getAudioContext(24000);
    audioContextRef.current = ctx;
    return ctx;
  };

  // --- Background sound management ---

  const cleanupBgSound = useCallback(() => {
    if (bgSoundNodesRef.current) {
      const { nodes, gain, timers } = bgSoundNodesRef.current;
      // 1. Clear all timers immediately
      timers.forEach(t => clearTimeout(t));
      // 2. Stop all AudioNode sources immediately (synchronous, no fade/setTimeout)
      nodes.forEach(n => {
        try { (n as any).stop?.(); } catch (_) {}
        try { n.disconnect(); } catch (_) {}
      });
      // 3. Disconnect gain immediately
      try { gain.disconnect(); } catch (_) {}
      // 4. Null the ref and update state
      bgSoundNodesRef.current = null;
      setBgSoundActive(false);
    }
  }, []);

  const startBgSound = useCallback((sound: BackgroundSound) => {
    cleanupBgSound();
    if (sound === 'NONE') return;
    const ctx = audioContextRef.current;
    if (!ctx || ctx.state === 'closed') return;

    let bgNodes: BgSoundNodes;
    switch (sound) {
      case 'RAIN': bgNodes = createRain(ctx); break;
      case 'OCEAN': bgNodes = createOcean(ctx); break;
      case 'FOREST': bgNodes = createForest(ctx); break;
      case 'ZEN': bgNodes = createZen(ctx); break;
      default: return;
    }

    bgNodes.gain.connect(ctx.destination);
    // Fade in over 1 second
    bgNodes.gain.gain.setValueAtTime(0, ctx.currentTime);
    bgNodes.gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 1);

    bgSoundNodesRef.current = bgNodes;
    setBgSoundActive(true);
  }, [cleanupBgSound]);

  // React to bgSound changes
  useEffect(() => {
    // Only start if we have an audio context (session has begun)
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      startBgSound(bgSound);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgSound]);

  const stopAll = useCallback(() => {
    // 1. Stop narration source
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch(e) {}
      sourceNodeRef.current = null;
    }
    // 2. Clear progress interval
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    // 3. Stop background sound synchronously
    cleanupBgSound();
    // 4. Stop keepalive and wake lock
    stopKeepAlive();
    releaseWakeLock();
    // 5. Reset all state
    setIsAudioPlaying(false);
    setIsPaused(false);
    setProgress(0);
  }, [cleanupBgSound]);

  // Keep stopAudio as an alias for backward compat within this component
  const stopAudio = stopAll;

  const togglePause = useCallback(async () => {
    const ctx = audioContextRef.current;
    if (!ctx || ctx.state === 'closed') return;

    if (isPaused) {
      // Resume
      try { await ctx.resume(); } catch (_) {}
      setIsPaused(false);
    } else {
      // Pause - suspends entire AudioContext (narration + background)
      try { await ctx.suspend(); } catch (_) {}
      setIsPaused(true);
    }
  }, [isPaused]);

  const playMeditationAudio = async (text: string) => {
    // Stop any existing narration source, but don't kill bg sound
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch(e) {}
      sourceNodeRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    setProgress(0);
    setTtsUnavailable(false);

    try {
      const ctx = await initAudio();
      // Make sure context is running (in case it was suspended)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      setIsAudioPlaying(true);
      setIsPaused(false);
      startKeepAlive();
      await requestWakeLock();

      // Start background sound if one is selected
      if (bgSound !== 'NONE' && !bgSoundNodesRef.current) {
        startBgSound(bgSound);
      }

      // TTS via server-side proxy — API key never touches the browser
      const ttsPromise = fetch(TTS_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang, voice: 'Kore' }),
      }).then(r => { if (!r.ok) throw new Error('TTS proxy failed'); return r.json(); });

      const response = await withTimeout(ttsPromise, 15000, 'TTS');

      const base64Audio = response.audio;
      if (base64Audio) {
        const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);

        setDuration(audioBuffer.duration);
        startTimeRef.current = ctx.currentTime;

        progressIntervalRef.current = setInterval(() => {
          if (ctx.state === 'running') {
            const current = ctx.currentTime - startTimeRef.current;
            setProgress(Math.min((current / audioBuffer.duration) * 100, 100));
          }
        }, 100);

        source.onended = () => {
          setIsAudioPlaying(false);
          setIsPaused(false);
          clearInterval(progressIntervalRef.current);
          // Background sound keeps playing until explicitly stopped or component unmounts
        };
        sourceNodeRef.current = source;
        source.start();
      } else {
        // No audio data returned - show read-along
        setTtsUnavailable(true);
        setIsAudioPlaying(false);
      }
    } catch (e) {
      console.error("TTS failed", e);
      // Don't snap back - keep the script visible, show TTS unavailable message
      setTtsUnavailable(true);
      setIsAudioPlaying(false);
      setIsPaused(false);
    }
  };

  const loadScript = async () => {
    setIsLoading(true);
    setError(false);
    setTtsUnavailable(false);
    await initAudio();
    try {
      const s = await withTimeout(generateMeditationScript(lang), 10000, 'Script generation');
      setScript(s);
      setIsLoading(false);
      await playMeditationAudio(s);
    } catch (e) {
      console.error("Script generation failed", e);
      const fallback = lang === 'en'
        ? "Breathe in slowly... hold gently... breathe out completely. Feel your body relax with each breath. Let go of tension in your shoulders, your jaw, your hands. You are safe here. You are present. Continue breathing slowly, in and out, finding your natural rhythm of peace."
        : "Inhala lentamente... sostén suavemente... exhala completamente. Siente cómo tu cuerpo se relaja con cada respiración. Deja ir la tensión en tus hombros, tu mandíbula, tus manos. Estás a salvo aquí. Estás presente. Continúa respirando lentamente, encontrando tu ritmo natural de paz.";
      setScript(fallback);
      setIsLoading(false);
      // Try TTS on fallback, but don't error out if it also fails
      await playMeditationAudio(fallback);
    }
  };

  useEffect(() => {
    return () => {
      // Forcefully stop ALL audio sources first (synchronous), then destroy context
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch(e) {}
        sourceNodeRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      // cleanupBgSound is synchronous now — no delayed setTimeout
      cleanupBgSound();
      stopKeepAlive();
      releaseWakeLock();
      // Now safe to destroy the AudioContext
      fullCleanup();
      audioContextRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex-1 flex flex-col px-5 py-3 animate-in fade-in overflow-hidden bg-white dark:bg-[#121212]">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex flex-col">
          <span className="font-medium uppercase tracking-wide text-xs text-[#233DFF]">{t.nav.meditate}</span>
        </div>
        {script && !isLoading && (
          <button
            onClick={() => { stopAll(); loadScript(); }}
            className="w-10 h-10 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center active:scale-95 transition-all"
          >
            <RefreshCcw size={16} className="text-gray-400" />
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center overflow-y-auto scrollbar-hide min-h-0 gap-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-5 animate-in fade-in zoom-in">
            <div className="w-20 h-20 bg-gray-50 dark:bg-white/5 rounded-[28px] flex items-center justify-center relative shadow-inner">
               <Loader2 size={36} className="text-[#233DFF] animate-spin" />
            </div>
            <p className="text-xs font-medium uppercase tracking-wide text-[#233DFF] animate-pulse">{t.loadingMeditation}</p>
          </div>
        ) : (
          <>
            {/* Sparkle icon — smaller to save space */}
            <div className="w-16 h-16 bg-[#233DFF]/5 rounded-[24px] flex items-center justify-center relative flex-shrink-0">
              <div className={`absolute inset-0 bg-[#233DFF]/10 rounded-[24px] transition-all duration-[2500ms] ${isAudioPlaying && !isPaused ? 'animate-ping' : ''}`}></div>
              <Sparkles size={28} className={`text-[#233DFF] transition-all duration-700 ${isAudioPlaying && !isPaused ? 'scale-110 rotate-6' : 'scale-100'}`} />
            </div>

            {/* Progress bar — only show during playback */}
            {(isAudioPlaying || progress > 0) && (
              <div className="w-full max-w-[220px] h-1.5 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#233DFF] transition-all duration-100 ease-linear rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            {/* Script text */}
            <div className="px-2 flex-shrink overflow-hidden min-h-0">
              {script ? (
                <p className="text-sm font-medium italic text-gray-500 dark:text-gray-400 leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-700 line-clamp-6">
                  {script}
                </p>
              ) : (
                <p className="text-xs font-medium text-gray-300 uppercase tracking-wide opacity-60">{t.labels.tapToStart}</p>
              )}
            </div>

            {/* TTS unavailable — compact inline message */}
            {(ttsUnavailable || (error && !ttsUnavailable)) && script && (
              <button
                onClick={() => playMeditationAudio(script)}
                className="px-4 py-2 bg-amber-50 dark:bg-amber-500/10 rounded-full text-xs font-medium text-amber-700 dark:text-amber-400 active:scale-95 transition-all flex-shrink-0"
              >
                {lang === 'es' ? 'Audio no disponible — toca para reintentar' : 'Audio unavailable — tap to retry'}
              </button>
            )}

            {/* Background Sound Selector */}
            <div className="flex items-center justify-center gap-1.5 flex-shrink-0 flex-wrap">
              <span className="text-[9px] font-medium uppercase tracking-wide text-gray-300 dark:text-gray-500 mr-0.5">{t.bgSound}</span>
              {(['NONE', 'RAIN', 'OCEAN', 'FOREST', 'ZEN'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setBgSound(s)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-medium uppercase tracking-wide transition-all active:scale-95 ${bgSound === s ? 'bg-[#233DFF] text-white' : 'bg-gray-50 dark:bg-white/5 text-gray-400 dark:text-gray-500'}`}
                >
                  {t.sounds[s]}
                </button>
              ))}
            </div>

            {/* ── CONTROLS: Clear Start / Pause / Stop ── */}
            <div className="flex flex-col gap-2 w-full max-w-xs flex-shrink-0 pb-1">
              {!script ? (
                /* BEGIN SESSION — initial state */
                <button
                  onClick={loadScript}
                  className="w-full h-14 bg-[#233dff] text-white rounded-full border border-[#233dff] font-normal text-base shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Play size={18} />
                  {t.labels.beginSession}
                </button>
              ) : (isAudioPlaying || bgSoundActive) ? (
                /* PAUSE + STOP — during playback */
                <div className="flex gap-2">
                  <button
                    onClick={togglePause}
                    className="flex-1 h-14 rounded-full font-normal text-sm transition-all flex items-center justify-center gap-2 active:scale-95 bg-white dark:bg-white/10 text-[#1a1a1a] dark:text-white border border-[#0f0f0f] dark:border-white"
                  >
                    {isPaused ? <Play size={16} /> : <Pause size={16} />}
                    {isPaused ? (lang === 'es' ? 'Continuar' : 'Resume') : (lang === 'es' ? 'Pausa' : 'Pause')}
                  </button>
                  <button
                    onClick={stopAll}
                    className="h-14 px-6 rounded-full font-normal text-sm transition-all flex items-center justify-center gap-2 active:scale-95 bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-white/10"
                  >
                    <Square size={14} />
                    {lang === 'es' ? 'Parar' : 'Stop'}
                  </button>
                </div>
              ) : (
                /* PLAY AGAIN — after session ends or stopped */
                <button
                  onClick={() => playMeditationAudio(script)}
                  className="w-full h-14 rounded-full font-normal text-base transition-all flex items-center justify-center gap-3 active:scale-95 bg-black dark:bg-white text-white dark:text-black border border-[#0f0f0f] dark:border-white shadow-xl"
                >
                  <Play size={18} />
                  {lang === 'es' ? 'Reproducir' : 'Play'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Meditation;
