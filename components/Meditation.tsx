
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
  bandpass.frequency.value = 3000;
  bandpass.Q.value = 1.5;

  // Faster patter modulation for rain (not ocean-like slow waves)
  const modGain = ctx.createGain();
  modGain.gain.value = 0.8;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.8;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.1;
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

const GREETING = {
  en: "Welcome. I'm glad you're here. Take a moment to settle in — wherever you are right now is exactly the right place. Gently close your eyes if that feels comfortable, and let's begin.",
  es: "Bienvenido. Me alegra que estés aquí. Tómate un momento para acomodarte — donde estés ahora mismo es exactamente el lugar correcto. Cierra suavemente los ojos si te sientes cómodo, y comencemos.",
};

const CLOSING = {
  en: "Take your time returning. Carry this stillness with you.",
  es: "Tómate tu tiempo para volver. Lleva contigo esta tranquilidad.",
};

const SPONSOR = {
  en: "This session is brought to you by L.A. Care Health Plan.",
  es: "Esta sesión fue presentada por L.A. Care Health Plan.",
};

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
  const [sessionComplete, setSessionComplete] = useState(false);

  const t = translations[lang];
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);  // keep buffer for pause/resume
  const bgGainRef = useRef<GainNode | null>(null);
  const bgSoundNodesRef = useRef<BgSoundNodes | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);        // seconds into buffer where we paused
  const progressIntervalRef = useRef<any>(null);
  const usingWebSpeechRef = useRef(false);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

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
    // 1. Stop Web Speech if active
    if (usingWebSpeechRef.current) {
      window.speechSynthesis?.cancel();
      usingWebSpeechRef.current = false;
      speechUtteranceRef.current = null;
    }
    // 2. Stop narration source
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch(e) {}
      sourceNodeRef.current = null;
    }
    // 3. Clear progress interval
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    // 4. Stop background sound synchronously
    cleanupBgSound();
    // 5. Stop keepalive and wake lock
    stopKeepAlive();
    releaseWakeLock();
    // 6. Reset all state
    setIsAudioPlaying(false);
    setIsPaused(false);
    setProgress(0);
  }, [cleanupBgSound]);

  // Keep stopAudio as an alias for backward compat within this component
  const stopAudio = stopAll;

  const togglePause = useCallback(async () => {
    // Web Speech path
    if (usingWebSpeechRef.current) {
      if (isPaused) {
        window.speechSynthesis?.resume();
        setIsPaused(false);
      } else {
        window.speechSynthesis?.pause();
        setIsPaused(true);
      }
      return;
    }

    const ctx = audioContextRef.current;
    if (!ctx || ctx.state === 'closed') return;

    if (isPaused) {
      // Resume — replay the buffer from where we paused
      const buffer = audioBufferRef.current;
      if (!buffer) { setIsPaused(false); return; }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const offset = pausedAtRef.current;
      startTimeRef.current = ctx.currentTime - offset;

      source.onended = () => {
        if (!isPaused) {
          setIsAudioPlaying(false);
          setIsPaused(false);
          clearInterval(progressIntervalRef.current);
          const bgNodes = bgSoundNodesRef.current;
          const fadCtx = audioContextRef.current;
          if (bgNodes && fadCtx && fadCtx.state !== 'closed') {
            const now = fadCtx.currentTime;
            bgNodes.gain.gain.setValueAtTime(bgNodes.gain.gain.value, now);
            bgNodes.gain.gain.linearRampToValueAtTime(0, now + 3);
            setTimeout(() => { cleanupBgSound(); setSessionComplete(true); const _gC = (window as any).gtag; if (_gC) _gC('event', 'calmkit_meditation_complete', { background_sound: bgSound, lang }); }, 3500);
          } else {
            setSessionComplete(true);
            const _gC = (window as any).gtag; if (_gC) _gC('event', 'calmkit_meditation_complete', { background_sound: bgSound, lang });
          }
        }
      };
      sourceNodeRef.current = source;
      source.start(0, offset);
      setIsPaused(false);
    } else {
      // Pause — stop the source and record current position
      const elapsed = ctx.currentTime - startTimeRef.current;
      pausedAtRef.current = Math.min(elapsed, audioBufferRef.current?.duration ?? elapsed);
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.onended = null; sourceNodeRef.current.stop(); } catch (_) {}
        sourceNodeRef.current = null;
      }
      setIsPaused(true);
    }
  }, [isPaused]);

  const playWithWebSpeech = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) {
      setTtsUnavailable(true);
      setIsAudioPlaying(false);
      return;
    }
    window.speechSynthesis.cancel();
    usingWebSpeechRef.current = true;
    setTtsUnavailable(false);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.82;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = lang === 'es' ? 'es-US' : 'en-US';

    // Prefer a calm female voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.lang.startsWith(lang === 'es' ? 'es' : 'en') &&
      (v.name.includes('Samantha') || v.name.includes('Karen') || v.name.includes('Moira') || v.name.includes('Ava'))
    ) || voices.find(v => v.lang.startsWith(lang === 'es' ? 'es' : 'en'));
    if (preferred) utterance.voice = preferred;

    setIsAudioPlaying(true);
    setIsPaused(false);

    utterance.onend = () => {
      usingWebSpeechRef.current = false;
      speechUtteranceRef.current = null;
      setIsAudioPlaying(false);
      setIsPaused(false);
      clearInterval(progressIntervalRef.current);
      const bgNodes = bgSoundNodesRef.current;
      const fadCtx = audioContextRef.current;
      if (bgNodes && fadCtx && fadCtx.state !== 'closed') {
        const now = fadCtx.currentTime;
        bgNodes.gain.gain.setValueAtTime(bgNodes.gain.gain.value, now);
        bgNodes.gain.gain.linearRampToValueAtTime(0, now + 3);
        setTimeout(() => { cleanupBgSound(); setSessionComplete(true); }, 3500);
      } else {
        setSessionComplete(true);
      }
    };

    utterance.onerror = (e) => {
      console.error('[Meditation] WebSpeech error:', e);
      usingWebSpeechRef.current = false;
      speechUtteranceRef.current = null;
      setTtsUnavailable(true);
      setIsAudioPlaying(false);
    };

    speechUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [lang, cleanupBgSound]);

  const playMeditationAudio = async (text: string, attempt = 0) => {
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
        body: JSON.stringify({ text, lang, voice: 'Kore', calm: true }),
      }).then(r => { if (!r.ok) throw new Error('TTS proxy failed'); return r.json(); });

      const response = await withTimeout(ttsPromise, 30000, 'TTS');

      const base64Audio = response.audio;
      if (base64Audio) {
        const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
        audioBufferRef.current = audioBuffer;  // save for pause/resume
        pausedAtRef.current = 0;               // fresh start

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);

        setDuration(audioBuffer.duration);
        startTimeRef.current = ctx.currentTime;

        progressIntervalRef.current = setInterval(() => {
          if (ctx.state !== 'closed') {
            const current = ctx.currentTime - startTimeRef.current;
            setProgress(Math.min((current / audioBuffer.duration) * 100, 100));
          }
        }, 100);

        source.onended = () => {
          setIsAudioPlaying(false);
          setIsPaused(false);
          clearInterval(progressIntervalRef.current);
          // Fade out bg sound gracefully, then show session complete
          const bgNodes = bgSoundNodesRef.current;
          const fadCtx = audioContextRef.current;
          if (bgNodes && fadCtx && fadCtx.state !== 'closed') {
            const now = fadCtx.currentTime;
            bgNodes.gain.gain.setValueAtTime(bgNodes.gain.gain.value, now);
            bgNodes.gain.gain.linearRampToValueAtTime(0, now + 3);
            setTimeout(() => { cleanupBgSound(); setSessionComplete(true); }, 3500);
          } else {
            setSessionComplete(true);
          }
        };
        sourceNodeRef.current = source;
        source.start();
      } else {
        // No audio returned — retry once, then fall back to Web Speech
        if (attempt < 1) {
          console.warn('[Meditation] No audio from Gemini TTS, retrying in 2s...');
          setTimeout(() => playMeditationAudio(text, attempt + 1), 2000);
          return;
        }
        console.warn('[Meditation] Gemini TTS returned no audio — falling back to Web Speech API');
        playWithWebSpeech(text);
      }
    } catch (e) {
      console.error('[Meditation] TTS failed:', e);
      if (attempt < 1) {
        console.warn('[Meditation] TTS error, retrying in 2s...');
        setTimeout(() => playMeditationAudio(text, attempt + 1), 2000);
        return;
      }
      console.warn('[Meditation] Falling back to Web Speech API');
      playWithWebSpeech(text);
    }
  };

  const loadScript = async () => {
    setIsLoading(true);
    setError(false);
    setTtsUnavailable(false);
    setSessionComplete(false);
    // Fire GA when meditation session starts
    const _gStart = (window as any).gtag;
    if (_gStart) _gStart('event', 'calmkit_meditation_start', { background_sound: bgSound, lang });
    await initAudio();
    try {
      const s = await withTimeout(generateMeditationScript(lang), 10000, 'Script generation');
      setScript(s);
      setIsLoading(false);
      // Prepend greeting to TTS audio only — displayed script stays clean
      const greeting = GREETING[lang] ?? GREETING.en;
      await playMeditationAudio(`${greeting} ${s}`);
    } catch (e) {
      console.error("Script generation failed", e);
      const fallback = lang === 'en'
        ? "Breathe in slowly... hold gently... breathe out completely. Feel your body relax with each breath. Let go of tension in your shoulders, your jaw, your hands. You are safe here. You are present. Continue breathing slowly, in and out, finding your natural rhythm of peace."
        : "Inhala lentamente... sostén suavemente... exhala completamente. Siente cómo tu cuerpo se relaja con cada respiración. Deja ir la tensión en tus hombros, tu mandíbula, tus manos. Estás a salvo aquí. Estás presente. Continúa respirando lentamente, encontrando tu ritmo natural de paz.";
      setScript(fallback);
      setIsLoading(false);
      const greeting = GREETING[lang] ?? GREETING.en;
      await playMeditationAudio(`${greeting} ${fallback}`);
    }
  };

  useEffect(() => {
    return () => {
      // Cancel Web Speech if active
      if (usingWebSpeechRef.current) {
        window.speechSynthesis?.cancel();
        usingWebSpeechRef.current = false;
      }
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

  // ── PRE-SESSION: no script yet ──
  if (!script && !isLoading) {
    return (
      <div className="flex-1 min-h-0 flex flex-col px-5 py-4 bg-white dark:bg-[#121212] animate-in fade-in">
        <span className="font-medium uppercase tracking-wide text-xs text-[#233DFF] flex-shrink-0">
          {t.nav.meditate}
        </span>

        {/* Centered icon + label — tappable */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4" onClick={loadScript} style={{ cursor: 'pointer' }}>
          <div className="w-28 h-28 bg-[#233DFF]/8 dark:bg-[#233DFF]/10 rounded-[32px] flex items-center justify-center active:scale-95 transition-all">
            <Sparkles size={52} className="text-[#233DFF]" />
          </div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-gray-300 dark:text-gray-600">
            {t.labels.tapToStart}
          </p>
        </div>

        {/* Background atmosphere */}
        <div className="flex-shrink-0 mb-5">
          <p className="text-[9px] font-medium uppercase tracking-widest text-gray-300 dark:text-gray-600 text-center mb-3">
            {t.bgSound}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {(['NONE', 'RAIN', 'OCEAN', 'FOREST', 'ZEN'] as const).map(s => (
              <button
                key={s}
                onClick={() => setBgSound(s)}
                className={`px-4 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide transition-all active:scale-95 ${bgSound === s ? 'bg-[#233DFF] text-white shadow-lg shadow-blue-500/20' : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500'}`}
              >
                {t.sounds[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Begin button */}
        <button
          onClick={loadScript}
          className="flex-shrink-0 w-full h-16 bg-[#233DFF] text-white rounded-full font-normal text-base shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-3"
        >
          <Play size={20} fill="currentColor" />
          {t.labels.beginSession}
        </button>
      </div>
    );
  }

  // ── LOADING ──
  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 bg-white dark:bg-[#121212] animate-in fade-in">
        <div className="w-24 h-24 bg-[#233DFF]/8 rounded-[28px] flex items-center justify-center">
          <Loader2 size={40} className="text-[#233DFF] animate-spin" />
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-[#233DFF] animate-pulse">{t.loadingMeditation}</p>
      </div>
    );
  }

  // ── ACTIVE / COMPLETE SESSION: script loaded ──
  return (
    <div className="flex-1 min-h-0 flex flex-col px-5 py-4 bg-white dark:bg-[#121212] animate-in fade-in overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0 mb-4">
        <div>
          <span className="font-medium uppercase tracking-wide text-xs text-[#233DFF]">{t.nav.meditate}</span>
          <p className="text-[9px] font-medium uppercase tracking-widest text-gray-400 dark:text-gray-600 mt-0.5">
            {lang === 'es' ? 'PRESENCIA GUIADA' : 'STILLNESS'}
          </p>
        </div>
        <button
          onClick={() => { stopAll(); setScript(''); }}
          className="w-10 h-10 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center active:scale-95 transition-all"
        >
          <RefreshCcw size={16} className="text-gray-400" />
        </button>
      </div>

      {/* Icon + volume badge + progress */}
      <div className="flex flex-col items-center gap-4 flex-shrink-0 mb-5">
        <div className="relative">
          <div className="w-24 h-24 bg-[#233DFF]/8 dark:bg-[#233DFF]/10 rounded-[24px] flex items-center justify-center">
            <div className={`absolute inset-0 bg-[#233DFF]/8 rounded-[24px] transition-all duration-[2500ms] ${isAudioPlaying && !isPaused ? 'animate-ping' : ''}`} />
            <Sparkles size={40} className={`text-[#233DFF] relative z-10 transition-all duration-700 ${isAudioPlaying && !isPaused ? 'scale-110' : ''}`} />
          </div>
          {/* Volume badge */}
          <div className="absolute -bottom-2 -right-2 w-9 h-9 bg-[#233DFF] rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Volume2 size={15} className="text-white" />
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-[260px] h-[3px] bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#233DFF] transition-all duration-100 ease-linear rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Script — scrollable, full text, no clamp */}
      <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0 mb-5 px-1">
        {ttsUnavailable ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-base font-medium italic text-gray-500 dark:text-gray-400 leading-relaxed text-center animate-in fade-in">
              {script}
            </p>
            <button
              onClick={() => playMeditationAudio(script)}
              className="px-5 py-2.5 bg-amber-50 dark:bg-amber-500/10 rounded-full text-xs font-medium text-amber-700 dark:text-amber-400 active:scale-95 transition-all"
            >
              {lang === 'es' ? 'Audio no disponible — reintentar' : 'Audio unavailable — tap to retry'}
            </button>
          </div>
        ) : (
          <p className="text-base font-medium italic text-gray-500 dark:text-gray-400 leading-relaxed text-center animate-in fade-in">
            {script}
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 pb-1">
        {isAudioPlaying ? (
          <button
            onClick={togglePause}
            className="w-full h-16 bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/10 rounded-full font-semibold text-sm uppercase tracking-widest text-[#1a1a1a] dark:text-white transition-all active:scale-[0.98] flex items-center justify-center gap-3"
          >
            {isPaused ? <Play size={18} /> : <Pause size={18} />}
            {isPaused
              ? (lang === 'es' ? 'CONTINUAR SESIÓN' : 'RESUME SESSION')
              : (lang === 'es' ? 'PAUSAR SESIÓN' : 'PAUSE SESSION')}
          </button>
        ) : sessionComplete ? (
          <div className="flex flex-col gap-3">
            {/* Closing message */}
            <p className="text-center text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest">
              {CLOSING[lang] ?? CLOSING.en}
            </p>
            {/* Sponsor line */}
            <p className="text-center text-[10px] text-gray-300 dark:text-gray-600">
              {SPONSOR[lang] ?? SPONSOR.en}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setSessionComplete(false); const g = GREETING[lang] ?? GREETING.en; playMeditationAudio(`${g} ${script}`); }}
                className="flex-1 h-16 bg-[#233DFF] text-white rounded-full font-semibold text-sm uppercase tracking-widest shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
              >
                <Play size={18} fill="currentColor" />
                {lang === 'es' ? 'REPRODUCIR' : 'PLAY AGAIN'}
              </button>
              {bgSoundActive && (
                <button
                  onClick={stopAll}
                  className="h-16 px-5 bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 rounded-full active:scale-[0.98] transition-all flex items-center justify-center"
                >
                  <Square size={16} />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => { const g = GREETING[lang] ?? GREETING.en; playMeditationAudio(`${g} ${script}`); }}
              className="flex-1 h-16 bg-[#233DFF] text-white rounded-full font-semibold text-sm uppercase tracking-widest shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
            >
              <Play size={18} fill="currentColor" />
              {lang === 'es' ? 'REPRODUCIR' : 'PLAY AGAIN'}
            </button>
            {bgSoundActive && (
              <button
                onClick={stopAll}
                className="h-16 px-5 bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 rounded-full active:scale-[0.98] transition-all flex items-center justify-center"
              >
                <Square size={16} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Meditation;
