
import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, RefreshCcw, Volume2, Loader2, Pause, Play } from 'lucide-react';
import { Language, BackgroundSound } from '../types';
import { translations } from '../translations';
import { generateMeditationScript } from '../geminiService';
import { GoogleGenAI, Modality } from "@google/genai";

interface MeditationProps {
  onBack: () => void;
  lang: Language;
}

const Meditation: React.FC<MeditationProps> = ({ onBack, lang }) => {
  const [script, setScript] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [bgSound, setBgSound] = useState<BackgroundSound>('NONE');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);

  const t = translations[lang];
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const bgGainRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const progressIntervalRef = useRef<any>(null);
  const wakeLockRef = useRef<any>(null);

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch (e) {}
  };

  // Keep screen on and resume audio when app regains focus
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (isAudioPlaying && document.visibilityState === 'visible') {
        try { if ('wakeLock' in navigator) wakeLockRef.current = await (navigator as any).wakeLock.request('screen'); } catch(e) {}
        if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      wakeLockRef.current?.release();
    };
  }, [isAudioPlaying]);

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
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch(e) {}
      sourceNodeRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    wakeLockRef.current?.release();
    wakeLockRef.current = null;
    setIsAudioPlaying(false);
    setProgress(0);
  };

  const playMeditationAudio = async (text: string) => {
    stopAudio();
    try {
      const ctx = await initAudio();
      setIsAudioPlaying(true);
      await requestWakeLock();

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: lang === 'es' ? `Habla muy lento, con calma: ${text}` : `Speak very slowly and calmly: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        
        setDuration(audioBuffer.duration);
        startTimeRef.current = ctx.currentTime;
        
        progressIntervalRef.current = setInterval(() => {
          const current = ctx.currentTime - startTimeRef.current;
          setProgress(Math.min((current / audioBuffer.duration) * 100, 100));
        }, 100);

        source.onended = () => {
          setIsAudioPlaying(false);
          clearInterval(progressIntervalRef.current);
        };
        sourceNodeRef.current = source;
        source.start();
      } else {
        setIsAudioPlaying(false);
      }
    } catch (e) {
      console.error("Meditation failed", e);
      setIsAudioPlaying(false);
      setError(true);
    }
  };

  const loadScript = async () => {
    setIsLoading(true);
    setError(false);
    await initAudio();
    try {
      const s = await generateMeditationScript(lang);
      setScript(s);
      await playMeditationAudio(s);
    } catch (e) {
      const fallback = lang === 'en' ? "Breathe in. Breathe out. Be here." : "Inhala. Exhala. Mantente presente.";
      setScript(fallback);
      await playMeditationAudio(fallback);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      stopAudio();
      // Close AudioContext to prevent audio bleed when switching views
      if (audioContextRef.current) { try { audioContextRef.current.close(); } catch(e) {} audioContextRef.current = null; }
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col p-4 animate-in fade-in overflow-hidden bg-white dark:bg-[#121212]">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex flex-col">
          <span className="font-medium uppercase tracking-wide text-[10px] text-[#233DFF]">{t.nav.meditate}</span>
          <span className="text-[10px] font-medium text-gray-300 uppercase tracking-wide mt-1">{t.labels.phaseStillness}</span>
        </div>
        {script && !isLoading && (
          <button
            onClick={loadScript}
            className="w-10 h-10 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center active:scale-95 transition-all shadow-sm"
          >
            <RefreshCcw size={16} className="text-gray-400" />
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-between text-center py-2 overflow-hidden min-h-0">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 animate-in fade-in zoom-in">
            <div className="w-20 h-20 bg-gray-50 dark:bg-white/5 rounded-[32px] flex items-center justify-center relative shadow-inner">
               <Loader2 size={36} className="text-[#233DFF] animate-spin" />
               <div className="absolute -inset-4 border-2 border-[#233DFF]/10 rounded-full animate-ping"></div>
            </div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-[#233DFF] animate-pulse">{t.loadingMeditation}</p>
          </div>
        ) : (
          <>
            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-[#233DFF]/5 rounded-[32px] flex items-center justify-center relative group flex-shrink-0">
              <div className={`absolute inset-0 bg-[#233DFF]/10 rounded-[32px] transition-all duration-[2500ms] ${isAudioPlaying ? 'animate-ping' : ''}`}></div>
              <Sparkles size={36} className={`text-[#233DFF] transition-all duration-700 ${isAudioPlaying ? 'scale-110 rotate-6' : 'scale-100'}`} />
              {isAudioPlaying && (
                <div className="absolute -bottom-2 -right-2 bg-[#233DFF] text-white p-1.5 rounded-full shadow-2xl animate-in bounce-in">
                  <Volume2 size={14} className="animate-pulse" />
                </div>
              )}
            </div>

            <div className="w-full max-w-[180px] h-1.5 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden my-3">
              <div
                className="h-full bg-[#233DFF] transition-all duration-100 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="space-y-2 px-4 flex-1 flex flex-col justify-center overflow-hidden min-h-0">
              <h2 className="text-xl sm:text-2xl font-normal tracking-normal dark:text-white leading-none font-display flex-shrink-0">{t.meditationHeader}</h2>
              {script ? (
                <p className="text-sm font-medium italic text-gray-500 dark:text-gray-400 leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-700 overflow-hidden">
                  {script}
                </p>
              ) : (
                <p className="text-[10px] font-medium text-gray-300 uppercase tracking-wide leading-loose opacity-60">{t.labels.tapToStart}</p>
              )}
            </div>

            {/* Error state */}
            {error && (
              <div className="px-4 py-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl flex-shrink-0">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  {lang === 'es' ? 'No se pudo reproducir el audio. Puedes leer la meditación arriba.' : 'Audio playback failed. You can read the meditation text above.'}
                </p>
              </div>
            )}

            {/* Background Sound Selector */}
            <div className="flex items-center justify-center gap-2 flex-shrink-0 flex-wrap">
              <span className="text-[9px] font-medium uppercase tracking-wide text-gray-300 dark:text-gray-500 mr-1">{t.bgSound}</span>
              {(['NONE', 'RAIN', 'OCEAN', 'FOREST', 'ZEN'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setBgSound(s)}
                  className={`px-3 py-1.5 rounded-full text-[9px] font-medium uppercase tracking-wide transition-all ${bgSound === s ? 'bg-[#233DFF] text-white' : 'bg-gray-50 dark:bg-white/5 text-gray-400 dark:text-gray-500'}`}
                >
                  {t.sounds[s]}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3 w-full max-w-xs flex-shrink-0 mt-4">
              {!script ? (
                <button
                  onClick={loadScript}
                  className="w-full h-14 bg-[#233dff] text-white rounded-full border border-[#233dff] font-normal text-base shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {t.labels.beginSession}
                </button>
              ) : (
                <button
                  onClick={() => isAudioPlaying ? stopAudio() : playMeditationAudio(script)}
                  className={`w-full h-14 rounded-full font-normal text-base transition-all flex items-center justify-center gap-3 ${isAudioPlaying ? 'bg-white dark:bg-white/10 text-[#1a1a1a] dark:text-white border border-[#0f0f0f] dark:border-white' : 'bg-black dark:bg-white text-white dark:text-black border border-[#0f0f0f] dark:border-white shadow-xl'}`}
                >
                  {isAudioPlaying ? <Pause size={16} /> : <Play size={16} />}
                  {isAudioPlaying ? t.pauseSession : t.labels.start}
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
