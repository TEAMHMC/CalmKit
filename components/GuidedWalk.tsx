
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Language, EchoPersona } from '../types';
import { translations } from '../translations';
import { generateSegmentNarrative } from '../geminiService';
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  Pause, X, Play, ChevronLeft, Sparkles, Send
} from 'lucide-react';

declare const L: any;

const MODES: { id: EchoPersona; label: string; desc: string; voice: string; tone: 'blue' | 'orange' | 'yellow' | 'pink' }[] = [
  { id: 'HOPE', label: 'Hope', desc: 'Safety & Self-Compassion', voice: 'Kore', tone: 'blue' },
  { id: 'HYPE', label: 'Hype', desc: 'Momentum & Action', voice: 'Zephyr', tone: 'pink' },
  { id: 'BREAKTHROUGH', label: 'Breakthrough', desc: 'Clarity & Perspective', voice: 'Puck', tone: 'orange' },
  { id: 'STRATEGY', label: 'Strategy', desc: 'Problem-Solving & Control', voice: 'Charon', tone: 'yellow' },
];

interface MovementProps {
  onBack: () => void;
  lang: Language;
}

const GuidedWalk: React.FC<MovementProps> = ({ onBack, lang }) => {
  const [step, setStep] = useState(0); // 0: Check-in, 1: Mode Select, 2: Active Walk
  const [targetThought, setTargetThought] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [mode, setMode] = useState<EchoPersona>('HOPE'); 
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [sessionStats, setSessionStats] = useState({ distance: 0, time: 0, pace: "0:00" });
  const [isBufferingAudio, setIsBufferingAudio] = useState(false);

  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const pathRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastPositionRef = useRef<[number, number] | null>(null);
  const pathCoordsRef = useRef<[number, number][]>([]);
  const audioBufferQueue = useRef<AudioBuffer[]>([]);
  const isNarratingRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);
  const sponsorPlayedRef = useRef(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const timerIntervalRef = useRef<any>(null);

  const t = translations[lang];

  const initAudio = async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
  };

  const speakText = async (text: string) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const voice = MODES.find(m => m.id === mode)?.voice || 'Kore';
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    });
    const base64 = response.candidates?.[0]?.content?.parts[0]?.inlineData?.data;
    if (!base64) return null;
    
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    const int16 = new Int16Array(bytes.buffer);
    const frameCount = int16.length;
    const buffer = audioCtxRef.current!.createBuffer(1, frameCount, 24000);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      data[i] = int16[i] / 32768.0;
    }
    return buffer;
  };

  const narrationLoop = useCallback(async () => {
    if (!isNarratingRef.current || isPaused) return;

    if (audioBufferQueue.current.length < 2) {
      setIsBufferingAudio(true);
      const isIntro = startTimeRef.current === null;
      const segment = await generateSegmentNarrative({
        mode,
        activity: 'WALK',
        lang,
        stats: sessionStats,
        isIntro,
        isFirstSegment: !sponsorPlayedRef.current,
        targetThought
      });
      if (!sponsorPlayedRef.current) sponsorPlayedRef.current = true;
      const buffer = await speakText(segment);
      if (buffer) audioBufferQueue.current.push(buffer);
      setIsBufferingAudio(false);
    }

    if (audioBufferQueue.current.length > 0) {
      const buffer = audioBufferQueue.current.shift()!;
      const source = audioCtxRef.current!.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtxRef.current!.destination);
      source.onended = () => narrationLoop();
      source.start(0);
      if (startTimeRef.current === null) startTimeRef.current = Date.now();
    } else {
      setTimeout(narrationLoop, 2000);
    }
  }, [mode, lang, sessionStats, isPaused, targetThought]);

  useEffect(() => {
    if (isPlaying && mapContainerRef.current && !mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: true,
        touchZoom: true,
        doubleClickZoom: true
      }).setView(userLocation || [34.05, -118.24], 17);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(mapRef.current);
    }

    if (mapRef.current && userLocation) {
      if (!markerRef.current) {
        markerRef.current = L.circleMarker(userLocation, {
          radius: 12,
          color: '#fff',
          fillColor: '#233DFF',
          fillOpacity: 1,
          weight: 4,
          className: 'neon-marker'
        }).addTo(mapRef.current);
      } else {
        markerRef.current.setLatLng(userLocation);
      }

      if (pathCoordsRef.current.length > 1) {
        if (!pathRef.current) {
          pathRef.current = L.polyline(pathCoordsRef.current, {
            color: '#233DFF',
            weight: 5,
            opacity: 0.8,
            className: 'neon-line'
          }).addTo(mapRef.current);
        } else {
          pathRef.current.setLatLngs(pathCoordsRef.current);
        }
      }

      if (!isPaused && mapRef.current) {
        mapRef.current.panTo(userLocation, { animate: true });
      }
    }

    return () => {
      if (!isPlaying && mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        pathRef.current = null;
      }
    };
  }, [isPlaying, userLocation, isPaused]);

  const startTracking = () => {
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGpsAccuracy(accuracy);
        const current: [number, number] = [latitude, longitude];
        setUserLocation(current);

        if (accuracy > 40) return;

        if (lastPositionRef.current) {
          const prev = lastPositionRef.current;
          const d = L.latLng(prev[0], prev[1]).distanceTo(L.latLng(current[0], current[1]));

          if (d > 5) {
            setSessionStats(prevStats => {
              const newDist = prevStats.distance + (d / 1609.34);
              return { ...prevStats, distance: newDist };
            });
            pathCoordsRef.current.push(current);
            lastPositionRef.current = current;
          }
        } else {
          lastPositionRef.current = current;
        }
      },
      null,
      { enableHighAccuracy: true }
    );
  };

  const handleStart = async () => {
    await initAudio();

    // Get user's actual location BEFORE showing the map
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
      });
      const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
      setUserLocation(coords);
      pathCoordsRef.current = [coords];
      lastPositionRef.current = coords;
    } catch (e) {
      // Will fall back to watchPosition updates
    }

    setIsPlaying(true);
    setStep(2);
    isNarratingRef.current = true;
    const now = Date.now();
    startTimeRef.current = now;

    // Independent timer that ticks every second for time + pace
    timerIntervalRef.current = setInterval(() => {
      setSessionStats(prev => {
        const elapsed = (Date.now() - now) / 1000;
        const paceRaw = prev.distance > 0 ? (elapsed / 60) / prev.distance : 0;
        const mins = Math.floor(paceRaw);
        const secs = Math.floor((paceRaw - mins) * 60);
        return {
          ...prev,
          time: elapsed,
          pace: prev.distance > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : '0:00'
        };
      });
    }, 1000);

    startTracking();
    narrationLoop();
  };

  const handleStop = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    setIsPlaying(false);
    setIsPaused(false);
    isNarratingRef.current = false;
    onBack();
  };

  if (isPlaying) {
    return (
      <div className="flex-1 flex flex-col bg-black overflow-hidden relative">
        <div ref={mapContainerRef} className="absolute inset-0 z-0 opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90 pointer-events-none z-[1]" />

        <header className="relative z-[10] p-6 flex justify-between items-start">
          <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
            <span className="text-[10px] font-medium text-white uppercase tracking-wide">{MODES.find(m => m.id === mode)?.label || 'GUIDE'}</span>
          </div>
          <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
            <span className="text-[10px] font-medium text-white uppercase tracking-wide">GPS: {gpsAccuracy ? `${gpsAccuracy.toFixed(0)}m` : '---'}</span>
          </div>
        </header>

        <div className="relative z-[10] mt-auto p-6 space-y-6">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: t.labels.miles, value: sessionStats.distance.toFixed(2) },
              { label: t.labels.avgPace, value: sessionStats.pace },
              { label: t.labels.time, value: `${Math.floor(sessionStats.time / 60)}:${(Math.floor(sessionStats.time) % 60).toString().padStart(2, '0')}` }
            ].map((stat, i) => (
              <div key={i} className="bg-black/40 backdrop-blur-lg border border-white/10 rounded-3xl p-4 flex flex-col items-center">
                <span className="text-[9px] font-medium text-gray-400 uppercase tracking-wide mb-1">{stat.label}</span>
                <span className="text-xl font-bold text-white tabular-nums tracking-normal">{stat.value}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            <button 
              onClick={() => setIsPaused(!isPaused)}
              className="w-24 h-20 bg-white/10 backdrop-blur-lg border border-white/10 rounded-[32px] flex items-center justify-center text-white active:scale-95 transition-all"
            >
              {isPaused ? <Play size={24} fill="currentColor" /> : <Pause size={24} fill="currentColor" />}
            </button>
            <button
              onClick={handleStop}
              className="flex-1 h-20 bg-[#233dff] rounded-full border border-[#233dff] flex items-center justify-center text-white font-normal text-base shadow-xl shadow-blue-500/20 active:scale-95 transition-all gap-2"
            >
              {t.labels.done}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 animate-in fade-in overflow-hidden bg-white dark:bg-[#121212]">
      <div className="flex items-center gap-2 mb-4 flex-shrink-0">
        <button onClick={step === 0 ? onBack : () => setStep(step - 1)} className="p-2 -ml-2 text-gray-400 hover:text-black dark:hover:text-white transition-colors">
          <ChevronLeft size={24} />
        </button>
        <span className="font-medium uppercase tracking-wide text-[10px] text-[#233DFF]">{t.nav.move}</span>
      </div>

      {step === 0 && (
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          <div className="space-y-1 flex-shrink-0">
            <h2 className="text-3xl font-normal tracking-normal dark:text-white font-display">{t.labels.checkIn}</h2>
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{t.labels.checkInSub}</p>
          </div>
          <div className="my-4 flex-1 min-h-0">
            <textarea
              value={targetThought}
              onChange={(e) => setTargetThought(e.target.value)}
              placeholder={t.labels.thoughtPlaceholder}
              className="w-full h-full min-h-[80px] max-h-[160px] p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-[#233DFF] text-sm resize-none"
            />
          </div>
          <button
            onClick={() => setStep(1)}
            disabled={!targetThought.trim()}
            className="w-full h-14 bg-black dark:bg-white text-white dark:text-black rounded-full border border-[#0f0f0f] dark:border-white font-normal text-base shadow-xl active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-20 flex-shrink-0"
          >
            {t.onboarding.next} <Send size={16} />
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="space-y-1 mb-4 flex-shrink-0">
            <h2 className="text-3xl font-normal tracking-normal dark:text-white font-display">{t.labels.readyToBegin}</h2>
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{t.labels.selectMode}</p>
          </div>

          <div className="grid grid-cols-1 gap-2 mb-4">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`px-4 py-3 rounded-2xl border-2 transition-all flex items-center justify-between group active:scale-[0.98] ${mode === m.id ? 'border-[#233DFF] bg-[#233DFF]/5' : 'border-gray-50 dark:border-white/5 bg-gray-50 dark:bg-white/5'}`}
              >
                <div className="flex flex-col items-start text-left">
                  <span className={`font-medium uppercase text-sm tracking-wide ${mode === m.id ? 'text-[#233DFF]' : 'dark:text-white'}`}>{m.label}</span>
                  <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{m.desc}</span>
                </div>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${mode === m.id ? 'bg-[#233DFF] text-white scale-110' : 'bg-gray-100 dark:bg-white/10 text-gray-400'}`}>
                  <Sparkles size={16} />
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={handleStart}
            className="w-full h-14 bg-[#233dff] text-white rounded-full border border-[#233dff] font-normal text-base shadow-xl active:scale-95 transition-all flex items-center justify-center gap-4 flex-shrink-0"
          >
            <Play size={20} fill="currentColor" /> {t.labels.start}
          </button>
        </div>
      )}
    </div>
  );
};

export default GuidedWalk;
