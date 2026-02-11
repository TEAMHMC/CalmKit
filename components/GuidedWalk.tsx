
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Language, EchoPersona, NarrationFrequency, SessionType, IndoorActivity } from '../types';
import { translations } from '../translations';
import { generateSegmentNarrative } from '../geminiService';
import { GoogleGenAI, Modality } from "@google/genai";
import {
  Pause, X, Play, ChevronLeft, Search, Activity, Navigation, Clock, Send
} from 'lucide-react';

declare const L: any;

const MODES: { id: EchoPersona; label: string; desc: string; voice: string; tone: string }[] = [
  { id: 'HOPE', label: 'Hope', desc: 'Safety & Self-Compassion', voice: 'Kore', tone: 'blue' },
  { id: 'HYPE', label: 'Hype', desc: 'Momentum & Action', voice: 'Zephyr', tone: 'pink' },
  { id: 'BREAKTHROUGH', label: 'Breakthrough', desc: 'Clarity & Perspective', voice: 'Puck', tone: 'orange' },
  { id: 'STRATEGY', label: 'Strategy', desc: 'Problem-Solving & Control', voice: 'Charon', tone: 'yellow' },
];

interface MovementProps {
  onBack: () => void;
  lang: Language;
  onImmersiveChange?: (immersive: boolean) => void;
}

const GuidedWalk: React.FC<MovementProps> = ({ onBack, lang, onImmersiveChange }) => {
  // ── State ──
  const [step, setStep] = useState(0); // 0: CBT Check-in, 1: Mode + Destination
  const [targetThought, setTargetThought] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [mode, setMode] = useState<EchoPersona>('HOPE');
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [sessionStats, setSessionStats] = useState({ distance: 0, time: 0, pace: "0:00" });
  const [isBufferingAudio, setIsBufferingAudio] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [destinationName, setDestinationName] = useState("");
  const [destinationCoords, setDestinationCoords] = useState<[number, number] | null>(null);
  const [gpsError, setGpsError] = useState(false);
  const [narrationFreq, setNarrationFreq] = useState<NarrationFrequency>('CONTINUOUS');
  const [sessionType, setSessionType] = useState<SessionType>('OUTDOOR');
  const [indoorActivity, setIndoorActivity] = useState<IndoorActivity>('STRETCH');
  const [showSummary, setShowSummary] = useState(false);
  const [finalStats, setFinalStats] = useState({ distance: 0, time: 0, pace: '0:00' });

  // ── Refs ──
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
  const wakeLockRef = useRef<any>(null);
  const bgNodesRef = useRef<any[]>([]);
  const bgGainRef = useRef<GainNode | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isPausedRef = useRef(false);
  const debounceRef = useRef<any>(null);
  const narrationTimeoutRef = useRef<any>(null);
  const narrationFreqRef = useRef<NarrationFrequency>('CONTINUOUS');
  const startMarkerRef = useRef<any>(null);
  const isReturningRef = useRef(false);
  const indoorActivityRef = useRef<IndoorActivity | null>(null);
  const sessionStatsRef = useRef(sessionStats);
  const destinationNameRef = useRef(destinationName);
  const targetThoughtRef = useRef(targetThought);

  const t = translations[lang];

  // Keep refs in sync
  useEffect(() => { sessionStatsRef.current = sessionStats; }, [sessionStats]);
  useEffect(() => { destinationNameRef.current = destinationName; }, [destinationName]);
  useEffect(() => { targetThoughtRef.current = targetThought; }, [targetThought]);
  useEffect(() => { narrationFreqRef.current = narrationFreq; }, [narrationFreq]);

  // Try to get location silently on mount (works if permission already granted)
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
        () => {},
        { enableHighAccuracy: false, timeout: 5000 }
      );
    }
  }, []);

  // Cleanup on unmount — close AudioContext to prevent audio bleed between views
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (narrationTimeoutRef.current) clearTimeout(narrationTimeoutRef.current);
      isNarratingRef.current = false;
      if (currentSourceRef.current) { try { currentSourceRef.current.stop(); } catch(e) {} }
      bgNodesRef.current.forEach(n => { try { n.stop(); } catch(e) {} });
      if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch(e) {} audioCtxRef.current = null; }
      if (wakeLockRef.current) { wakeLockRef.current.release(); }
    };
  }, []);

  // Request GPS on user gesture (mobile Safari requires this)
  const requestGpsPermission = () => {
    if (navigator.geolocation) {
      setGpsError(false);
      navigator.geolocation.getCurrentPosition(
        (pos) => { setUserLocation([pos.coords.latitude, pos.coords.longitude]); setGpsError(false); },
        () => { setGpsError(true); },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    } else {
      setGpsError(true);
    }
  };

  // ── Wake Lock ──
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch (e) {}
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (isPlaying && document.visibilityState === 'visible') {
        await requestWakeLock();
        if (audioCtxRef.current?.state === 'suspended') {
          await audioCtxRef.current.resume();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPlaying]);

  // ── Audio ──
  const initAudio = async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
  };

  // ── Ambient Interlude System ──
  const createAmbience = () => {
    const ctx = audioCtxRef.current!;
    const nodes: any[] = [];
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.12;
    masterGain.connect(ctx.destination);
    bgGainRef.current = masterGain;

    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      noiseData[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = noiseData[i];
      noiseData[i] *= 3.5;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.7;

    switch (mode) {
      case 'HOPE':
        filter.frequency.value = 800;
        (() => {
          const pad = ctx.createOscillator();
          pad.type = 'sine';
          pad.frequency.value = 220;
          const padGain = ctx.createGain();
          padGain.gain.value = 0.025;
          pad.connect(padGain);
          padGain.connect(masterGain);
          pad.start();
          nodes.push(pad);
        })();
        break;
      case 'HYPE':
        filter.frequency.value = 1500;
        filter.Q.value = 0.5;
        (() => {
          const bass = ctx.createOscillator();
          bass.type = 'sine';
          bass.frequency.value = 55;
          const bassGain = ctx.createGain();
          bassGain.gain.value = 0.03;
          const pulseLfo = ctx.createOscillator();
          pulseLfo.frequency.value = 1.2;
          const pulseDepth = ctx.createGain();
          pulseDepth.gain.value = 0.03;
          pulseLfo.connect(pulseDepth);
          pulseDepth.connect(bassGain.gain);
          pulseLfo.start();
          bass.connect(bassGain);
          bassGain.connect(masterGain);
          bass.start();
          nodes.push(bass, pulseLfo);
        })();
        break;
      case 'BREAKTHROUGH':
        filter.frequency.value = 400;
        filter.Q.value = 1.2;
        [174, 261, 396].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = freq;
          const g = ctx.createGain();
          g.gain.value = 0.04 - i * 0.01;
          osc.connect(g);
          g.connect(masterGain);
          osc.start();
          nodes.push(osc);
        });
        break;
      case 'STRATEGY':
        filter.frequency.value = 600;
        (() => {
          const lfo = ctx.createOscillator();
          const lfoGain = ctx.createGain();
          lfo.frequency.value = 0.12;
          lfoGain.gain.value = 300;
          lfo.connect(lfoGain);
          lfoGain.connect(filter.frequency);
          lfo.start();
          nodes.push(lfo);
        })();
        break;
    }

    noiseSource.connect(filter);
    filter.connect(masterGain);
    noiseSource.start();
    nodes.push(noiseSource);
    bgNodesRef.current = nodes;
  };

  const duckAmbience = () => {
    if (bgGainRef.current && audioCtxRef.current) {
      bgGainRef.current.gain.linearRampToValueAtTime(0.03, audioCtxRef.current.currentTime + 0.8);
    }
  };

  const raiseAmbience = () => {
    if (bgGainRef.current && audioCtxRef.current) {
      bgGainRef.current.gain.linearRampToValueAtTime(0.12, audioCtxRef.current.currentTime + 1.5);
    }
  };

  const stopAmbience = () => {
    bgNodesRef.current.forEach(n => { try { n.stop(); } catch(e) {} });
    bgNodesRef.current = [];
    bgGainRef.current = null;
  };

  // ── TTS via Gemini ──
  const speakText = async (text: string) => {
    const genai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const voice = MODES.find(m => m.id === mode)?.voice || 'Kore';
    const response = await genai.models.generateContent({
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
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const int16 = new Int16Array(bytes.buffer);
    const buffer = audioCtxRef.current!.createBuffer(1, int16.length, 24000);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < int16.length; i++) data[i] = int16[i] / 32768.0;
    return buffer;
  };

  // ── Nominatim Destination Search ──
  const fetchSuggestions = async (q: string) => {
    if (q.length < 3) { setSuggestions([]); return; }
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`;
    if (userLocation) {
      const [lat, lon] = userLocation;
      url += `&lat=${lat}&lon=${lon}&viewbox=${lon - 0.1},${lat + 0.1},${lon + 0.1},${lat - 0.1}&bounded=0`;
    }
    try {
      const res = await fetch(url);
      const data = await res.json();
      setSuggestions(data);
    } catch (e) {
      setSuggestions([]);
    }
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 600);
  };

  const selectSuggestion = (s: any) => {
    const name = s.display_name.split(',')[0];
    setDestinationName(name);
    setDestinationCoords([parseFloat(s.lat), parseFloat(s.lon)]);
    setSearchQuery(name);
    setSuggestions([]);
  };

  // ── Narration Loop ──
  const narrationLoop = useCallback(async () => {
    if (!isNarratingRef.current || isPausedRef.current) return;

    // Ensure AudioContext is active before playing
    if (audioCtxRef.current?.state === 'suspended') {
      await audioCtxRef.current.resume();
    }

    if (audioBufferQueue.current.length === 0) {
      setIsBufferingAudio(true);
      const stats = sessionStatsRef.current;
      const returning = isReturningRef.current;
      isReturningRef.current = false;
      const segment = await generateSegmentNarrative({
        mode,
        activity: 'WALK',
        lang,
        stats,
        isIntro: startTimeRef.current === null,
        isFirstSegment: !sponsorPlayedRef.current,
        isReturning: returning,
        indoorActivity: indoorActivityRef.current || undefined,
        destinationName: destinationNameRef.current || undefined,
        targetThought: targetThoughtRef.current || undefined
      });
      if (!sponsorPlayedRef.current) sponsorPlayedRef.current = true;
      const buffer = await speakText(segment);
      if (buffer) audioBufferQueue.current.push(buffer);
      setIsBufferingAudio(false);
    }

    if (isPausedRef.current || !isNarratingRef.current) return;

    if (audioBufferQueue.current.length > 0) {
      const buffer = audioBufferQueue.current.shift()!;
      const source = audioCtxRef.current!.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtxRef.current!.destination);
      currentSourceRef.current = source;

      // In interval mode, only duck if ambience is active (continuous mode)
      if (narrationFreqRef.current === 'CONTINUOUS') duckAmbience();

      source.onended = () => {
        currentSourceRef.current = null;

        if (narrationFreqRef.current === 'CONTINUOUS') {
          // Continuous: raise ambience and immediately loop
          raiseAmbience();
          narrationLoop();
        } else {
          // Interval mode: silence everything so user's music plays
          stopAmbience();
          audioCtxRef.current?.suspend();

          const delayMs = narrationFreqRef.current === 'INTERVAL_2' ? 120000 : 300000;

          // Pre-buffer next segment 25s before the gap ends
          const preBufferDelay = Math.max(delayMs - 25000, 5000);
          setTimeout(async () => {
            if (!isNarratingRef.current) return;
            isReturningRef.current = true;
            const stats = sessionStatsRef.current;
            const seg = await generateSegmentNarrative({
              mode, activity: 'WALK', lang, stats,
              isIntro: false, isFirstSegment: false, isReturning: true,
              indoorActivity: indoorActivityRef.current || undefined,
              destinationName: destinationNameRef.current || undefined,
              targetThought: targetThoughtRef.current || undefined
            });
            const buf = await speakText(seg);
            if (buf) audioBufferQueue.current.push(buf);
          }, preBufferDelay);

          // Resume narration after the interval
          narrationTimeoutRef.current = setTimeout(async () => {
            if (!isNarratingRef.current || isPausedRef.current) return;
            await audioCtxRef.current?.resume();
            narrationLoop();
          }, delayMs);
        }
      };
      source.start(0);
      if (startTimeRef.current === null) startTimeRef.current = Date.now();

      // Pre-buffer next segment (continuous mode only — interval pre-buffers in the timeout)
      if (narrationFreqRef.current === 'CONTINUOUS' && audioBufferQueue.current.length < 2 && isNarratingRef.current) {
        (async () => {
          const stats = sessionStatsRef.current;
          const seg = await generateSegmentNarrative({
            mode, activity: 'WALK', lang, stats,
            isIntro: false, isFirstSegment: false,
            indoorActivity: indoorActivityRef.current || undefined,
            destinationName: destinationNameRef.current || undefined,
            targetThought: targetThoughtRef.current || undefined
          });
          const buf = await speakText(seg);
          if (buf) audioBufferQueue.current.push(buf);
        })();
      }
    } else {
      setTimeout(narrationLoop, 1000);
    }
  }, [mode, lang]);

  // ── Map (Ghost Mode) ──
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

      // Standard OSM tiles — CSS .dark-map filter converts to ghost mode
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);

      // Neon polyline for walked path
      pathRef.current = L.polyline([], {
        color: '#233DFF',
        weight: 8,
        opacity: 0.95,
        lineJoin: 'round',
        className: 'glowing-path'
      }).addTo(mapRef.current);
    }

    if (mapRef.current && userLocation) {
      // Start pin: small green marker at the walk origin
      if (!startMarkerRef.current && pathCoordsRef.current.length > 0) {
        const startIcon = L.divIcon({
          className: '',
          html: `<div class="w-4 h-4 bg-green-400 rounded-full border-2 border-white shadow-[0_0_10px_rgba(74,222,128,0.6)]"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });
        startMarkerRef.current = L.marker(pathCoordsRef.current[0], { icon: startIcon }).addTo(mapRef.current);
      }

      if (!markerRef.current) {
        // Pulsing neon marker via divIcon
        const icon = L.divIcon({
          className: '',
          html: `<div class="relative w-12 h-12 flex items-center justify-center"><div class="absolute inset-0 bg-[#233DFF]/25 rounded-full animate-ping"></div><div class="w-6 h-6 bg-[#233DFF] rounded-full border-[3px] border-white shadow-[0_0_20px_#233DFF]"></div></div>`,
          iconSize: [48, 48],
          iconAnchor: [24, 24]
        });
        markerRef.current = L.marker(userLocation, { icon }).addTo(mapRef.current);
      } else {
        markerRef.current.setLatLng(userLocation);
      }

      if (pathCoordsRef.current.length > 1 && pathRef.current) {
        pathRef.current.setLatLngs(pathCoordsRef.current);
      }

      if (!isPaused) {
        mapRef.current.panTo(userLocation, { animate: true });
      }
    }

    return () => {
      if (!isPlaying && mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        startMarkerRef.current = null;
        pathRef.current = null;
      }
    };
  }, [isPlaying, userLocation, isPaused]);

  // ── GPS Tracking ──
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
            setSessionStats(prevStats => ({
              ...prevStats,
              distance: prevStats.distance + (d / 1609.34)
            }));
            pathCoordsRef.current.push(current);
            lastPositionRef.current = current;
          }
        } else {
          lastPositionRef.current = current;
        }
      },
      (err) => { console.warn('GPS tracking error:', err.message); },
      { enableHighAccuracy: true }
    );
  };

  // ── Handlers ──
  const handleStart = async () => {
    await initAudio();
    const isIndoor = sessionType === 'INDOOR';
    indoorActivityRef.current = isIndoor ? indoorActivity : null;

    // GPS only for outdoor sessions
    if (!isIndoor) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true, timeout: 10000
          });
        });
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(coords);
        pathCoordsRef.current = [coords];
        lastPositionRef.current = coords;
      } catch (e) {
        // GPS failed on outdoor — still continue, just no map tracking
      }
    }

    await requestWakeLock();
    onImmersiveChange?.(true);
    setIsPlaying(true);
    isNarratingRef.current = true;
    const now = Date.now();
    startTimeRef.current = now;

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

    if (!isIndoor && pathCoordsRef.current.length > 0) startTracking();
    if (narrationFreq === 'CONTINUOUS') createAmbience();
    narrationLoop();
  };

  const handleStop = () => {
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch(e) {}
      currentSourceRef.current = null;
    }
    isNarratingRef.current = false;
    isPausedRef.current = false;
    if (narrationTimeoutRef.current) { clearTimeout(narrationTimeoutRef.current); narrationTimeoutRef.current = null; }
    stopAmbience();
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    // Close AudioContext to prevent audio bleed into other views
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch(e) {} audioCtxRef.current = null; }
    releaseWakeLock();
    onImmersiveChange?.(false);
    setIsPlaying(false);
    setIsPaused(false);
    // Show session summary instead of immediately going home
    setFinalStats({ ...sessionStats });
    setShowSummary(true);
  };

  const togglePause = () => {
    const newPaused = !isPaused;
    setIsPaused(newPaused);
    isPausedRef.current = newPaused;
    if (newPaused) {
      if (currentSourceRef.current) {
        try { currentSourceRef.current.stop(); } catch(e) {}
        currentSourceRef.current = null;
      }
      if (narrationTimeoutRef.current) { clearTimeout(narrationTimeoutRef.current); narrationTimeoutRef.current = null; }
      if (bgGainRef.current && audioCtxRef.current) {
        bgGainRef.current.gain.linearRampToValueAtTime(0.02, audioCtxRef.current.currentTime + 0.3);
      }
      audioCtxRef.current?.suspend();
    } else {
      audioCtxRef.current?.resume();
      if (narrationFreqRef.current === 'CONTINUOUS') raiseAmbience();
      narrationLoop();
    }
  };

  // ══════════════════════════════════════════════
  // RENDER: Session Summary
  // ══════════════════════════════════════════════
  if (showSummary) {
    const mins = Math.floor(finalStats.time / 60);
    const secs = Math.floor(finalStats.time % 60);
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 bg-white dark:bg-[#121212] animate-in fade-in text-center gap-8">
        <div className="w-24 h-24 bg-[#233DFF]/10 rounded-full flex items-center justify-center">
          <Activity size={40} className="text-[#233DFF]" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-normal tracking-normal dark:text-white font-display">{t.labels.sessionSummary}</h2>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t.labels.sessionSummaryDesc}</p>
        </div>
        <div className="flex gap-8">
          {sessionType === 'OUTDOOR' && (
            <div className="flex flex-col items-center">
              <span className="text-4xl font-semibold tabular-nums text-[#233DFF]">{finalStats.distance.toFixed(2)}</span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{t.labels.miles}</span>
            </div>
          )}
          <div className="flex flex-col items-center">
            <span className="text-4xl font-semibold tabular-nums dark:text-white">{mins}:{secs.toString().padStart(2, '0')}</span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{t.labels.time}</span>
          </div>
          {sessionType === 'OUTDOOR' && finalStats.distance > 0 && (
            <div className="flex flex-col items-center">
              <span className="text-4xl font-semibold tabular-nums dark:text-white">{finalStats.pace}</span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{t.labels.avgPace}</span>
            </div>
          )}
        </div>
        <p className="text-base font-medium italic text-gray-500 dark:text-gray-400 max-w-xs">{t.labels.wellDone}</p>
        <div className="w-full max-w-xs space-y-4">
          <button
            onClick={onBack}
            className="w-full h-16 bg-black dark:bg-white text-white dark:text-black rounded-full border border-[#0f0f0f] dark:border-white font-normal text-base shadow-lg active:scale-95 transition-all"
          >
            {t.labels.returnHome}
          </button>
          <p className="text-xs font-medium text-gray-300 dark:text-gray-600 uppercase tracking-wide">{t.labels.crisisLine}</p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // RENDER: Active Walk — Ghost Mode
  // ══════════════════════════════════════════════
  if (isPlaying) {
    return (
      <div className="flex-1 flex flex-col bg-[#0A0A0A] overflow-hidden relative">
        {/* Ghost Mode Map or Indoor Background */}
        <div className="flex-1 relative overflow-hidden dark-map">
          {sessionType === 'OUTDOOR' && <div ref={mapContainerRef} className="absolute inset-0 z-0" />}
          {sessionType === 'INDOOR' && (
            <div className="absolute inset-0 z-0 flex items-center justify-center bg-[#0A0A0A]">
              <div className="w-40 h-40 bg-[#233DFF]/5 rounded-full flex items-center justify-center animate-pulse">
                <Activity size={48} className="text-[#233DFF]/30" />
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none z-[1]" />

          {/* Floating Pill HUD */}
          <div className="absolute top-0 left-0 right-0 p-4 z-20 pt-[env(safe-area-inset-top,24px)] pointer-events-none flex flex-col gap-3">
            <div className="flex justify-center gap-2.5">
              {sessionType === 'OUTDOOR' && (
                <>
                  <div className="px-5 py-2.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center gap-2.5 shadow-2xl">
                    <Activity size={16} className="text-[#233DFF]" />
                    <span className="text-2xl font-semibold tracking-tight text-white tabular-nums">{sessionStats.distance.toFixed(2)}</span>
                    <span className="text-[11px] font-medium text-white/60 uppercase tracking-widest">{t.labels.miles}</span>
                  </div>
                  <div className="px-5 py-2.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center gap-2.5 shadow-2xl">
                    <Navigation size={16} className="text-[#233DFF]" />
                    <span className="text-2xl font-semibold tracking-tight text-white tabular-nums">{sessionStats.pace}</span>
                    <span className="text-[11px] font-medium text-white/60 uppercase tracking-widest">{t.labels.avgPace}</span>
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-center">
              <div className="px-5 py-2.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center gap-2.5 shadow-2xl">
                <Clock size={16} className="text-[#233DFF]" />
                <span className="text-2xl font-semibold tracking-tight text-white tabular-nums">
                  {Math.floor(sessionStats.time / 60)}:{(Math.floor(sessionStats.time) % 60).toString().padStart(2, '0')}
                </span>
                <span className="text-[11px] font-medium text-white/60 uppercase tracking-widest">{t.labels.time}</span>
              </div>
            </div>

            {/* Status indicators */}
            <div className="flex justify-center gap-2.5">
              {sessionType === 'INDOOR' && (
                <div className="px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10">
                  <span className="text-[11px] font-medium text-white/50 uppercase">{t.labels.indoorSession} — {t.labels[indoorActivity.toLowerCase() as 'stretch' | 'flow' | 'sweat']}</span>
                </div>
              )}
              {sessionType === 'OUTDOOR' && gpsAccuracy != null && gpsAccuracy > 30 && (
                <div className="px-4 py-1.5 rounded-full bg-yellow-500/20 backdrop-blur-md border border-yellow-500/30">
                  <span className="text-[11px] font-medium text-yellow-400 uppercase">GPS: {gpsAccuracy.toFixed(0)}m</span>
                </div>
              )}
              {isBufferingAudio && (
                <div className="px-4 py-1.5 rounded-full bg-[#233DFF]/30 backdrop-blur-md border border-[#233DFF]/40 animate-pulse">
                  <span className="text-[11px] font-medium text-white/70 uppercase">loading</span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Controls */}
          <div className="absolute bottom-0 left-0 right-0 px-6 z-20 pb-[calc(env(safe-area-inset-bottom,24px)+20px)] flex flex-col items-center gap-5">
            <div className="px-5 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10">
              <span className="text-xs font-medium text-white uppercase tracking-wide">
                {MODES.find(m => m.id === mode)?.label}{sessionType === 'INDOOR' ? ` · ${t.labels[indoorActivity.toLowerCase() as 'stretch' | 'flow' | 'sweat']}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-8">
              <button
                onClick={handleStop}
                className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-full border border-white/20 flex items-center justify-center text-white/60 active:scale-95 transition-all"
              >
                <X size={22} />
              </button>
              <button
                onClick={togglePause}
                className="w-24 h-24 bg-[#233DFF] rounded-full flex items-center justify-center text-white shadow-[0_0_30px_rgba(35,61,255,0.4)] border border-white/20 active:scale-95 transition-all"
              >
                {isPaused ? <Play size={32} fill="currentColor" /> : <Pause size={32} fill="currentColor" />}
              </button>
              <div className="w-16 h-16" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // RENDER: Setup — Step 0 (CBT Check-in) & Step 1 (Mode + Destination)
  // ══════════════════════════════════════════════
  return (
    <div className="flex-1 flex flex-col px-5 py-4 animate-in fade-in overflow-hidden bg-white dark:bg-[#121212]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 flex-shrink-0">
        <button onClick={step === 0 ? onBack : () => setStep(0)} className="w-11 h-11 -ml-2 flex items-center justify-center text-gray-400 hover:text-black dark:hover:text-white transition-colors rounded-full active:bg-gray-50 dark:active:bg-white/5">
          <ChevronLeft size={24} />
        </button>
        <span className="font-medium uppercase tracking-wide text-xs text-[#233DFF]">{t.nav.move}</span>
      </div>

      {/* ── Step 0: CBT Check-in ── */}
      {step === 0 && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="space-y-2 flex-shrink-0">
            <h2 className="text-3xl font-normal tracking-normal dark:text-white font-display">{t.labels.checkIn}</h2>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t.labels.checkInSub}</p>
          </div>
          <div className="flex-1 min-h-0 my-4">
            <textarea
              value={targetThought}
              onChange={(e) => setTargetThought(e.target.value)}
              placeholder={t.labels.thoughtPlaceholder}
              className="w-full h-full p-5 bg-gray-50 dark:bg-white/5 rounded-3xl border border-gray-100 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-[#233DFF] text-base resize-none dark:text-white placeholder:text-gray-400"
            />
          </div>
          <button
            onClick={() => { requestGpsPermission(); setStep(1); }}
            disabled={!targetThought.trim()}
            className="w-full h-16 bg-black dark:bg-white text-white dark:text-black rounded-full border border-[#0f0f0f] dark:border-white font-normal text-base shadow-xl active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-20 flex-shrink-0"
          >
            {t.onboarding.next} <Send size={18} />
          </button>
        </div>
      )}

      {/* ── Step 1: Mode + Destination ── */}
      {step === 1 && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Title */}
          <div className="space-y-2 mb-4 flex-shrink-0">
            <h2 className="text-3xl font-normal tracking-normal dark:text-white font-display">{t.labels.readyToBegin}</h2>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t.labels.selectMode}</p>
          </div>

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0 -mx-1 px-1 space-y-4">
            {/* Outdoor / Indoor Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-300 dark:text-gray-500 mr-1">{t.labels.sessionType}</span>
              {(['OUTDOOR', 'INDOOR'] as SessionType[]).map(st => (
                <button
                  key={st}
                  onClick={() => setSessionType(st)}
                  className={`px-4 py-2 rounded-full text-[11px] font-medium uppercase tracking-wide transition-all active:scale-95 ${sessionType === st ? 'bg-[#233DFF] text-white' : 'bg-gray-50 dark:bg-white/5 text-gray-400 dark:text-gray-500'}`}
                >
                  {t.labels[st.toLowerCase() as 'outdoor' | 'indoor']}
                </button>
              ))}
            </div>

            {/* GPS Warning (outdoor only) */}
            {gpsError && sessionType === 'OUTDOOR' && (
              <div className="px-5 py-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{lang === 'es' ? 'No se pudo acceder al GPS. El mapa no rastreará tu camino, pero la guía de audio seguirá funcionando.' : 'Could not access GPS. Map tracking won\'t work, but audio guidance will still play.'}</p>
              </div>
            )}

            {/* Outdoor: Destination Search */}
            {sessionType === 'OUTDOOR' && (
              <div className="relative">
                <div className="flex items-center gap-3 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 px-4 py-4">
                  <Search size={18} className="text-gray-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder={lang === 'es' ? 'Buscar un destino...' : 'Search for a destination...'}
                    className="bg-transparent flex-1 text-base outline-none dark:text-white placeholder:text-gray-400"
                  />
                </div>
                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1a1a1a] rounded-2xl border border-gray-100 dark:border-white/10 shadow-xl z-50 max-h-48 overflow-auto">
                    {suggestions.map((s: any, i: number) => (
                      <button
                        key={i}
                        onClick={() => selectSuggestion(s)}
                        className="w-full text-left px-5 py-4 text-sm hover:bg-gray-50 dark:hover:bg-white/5 border-b border-gray-50 dark:border-white/5 last:border-0 dark:text-white truncate active:bg-gray-100 dark:active:bg-white/10"
                      >
                        {s.display_name}
                      </button>
                    ))}
                  </div>
                )}
                {destinationName && (
                  <div className="mt-3 flex items-center gap-2">
                    <Navigation size={14} className="text-[#233DFF]" />
                    <span className="text-sm text-[#233DFF] font-medium truncate">{destinationName}</span>
                    <button
                      onClick={() => { setDestinationName(''); setDestinationCoords(null); setSearchQuery(''); }}
                      className="text-gray-400 text-base ml-auto flex-shrink-0 w-8 h-8 flex items-center justify-center"
                    >
                      &times;
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Indoor: Activity Picker */}
            {sessionType === 'INDOOR' && (
              <div className="grid grid-cols-3 gap-2.5">
                {([
                  { id: 'STRETCH' as IndoorActivity, label: t.labels.stretch, desc: t.labels.stretchDesc },
                  { id: 'FLOW' as IndoorActivity, label: t.labels.flow, desc: t.labels.flowDesc },
                  { id: 'SWEAT' as IndoorActivity, label: t.labels.sweat, desc: t.labels.sweatDesc },
                ]).map(act => (
                  <button
                    key={act.id}
                    onClick={() => setIndoorActivity(act.id)}
                    className={`p-4 rounded-2xl text-center transition-all border active:scale-[0.97] ${
                      indoorActivity === act.id
                        ? 'border-[#233DFF] bg-[#233DFF]/5 ring-2 ring-[#233DFF]/10'
                        : 'border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/5'
                    }`}
                  >
                    <span className={`font-medium text-base block ${indoorActivity === act.id ? 'text-[#233DFF]' : 'dark:text-white'}`}>{act.label}</span>
                    <span className="text-[11px] text-gray-400 block mt-1">{act.desc}</span>
                  </button>
                ))}
              </div>
            )}

            {/* 2x2 Mode Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`p-4 rounded-2xl text-left transition-all border active:scale-[0.97] ${
                    mode === m.id
                      ? 'border-[#233DFF] bg-[#233DFF]/5 ring-2 ring-[#233DFF]/10'
                      : 'border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/5'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full mb-2 ${
                    m.tone === 'blue' ? 'bg-[#233DFF]' :
                    m.tone === 'pink' ? 'bg-pink-400' :
                    m.tone === 'orange' ? 'bg-orange-400' : 'bg-yellow-400'
                  }`} />
                  <span className={`font-medium text-base block ${mode === m.id ? 'text-[#233DFF]' : 'dark:text-white'}`}>{m.label}</span>
                  <span className="text-xs text-gray-400 block mt-0.5">{m.desc}</span>
                </button>
              ))}
            </div>

            {/* Narration Frequency */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-300 dark:text-gray-500 mr-1">{t.labels.narrationFreq}</span>
              {([
                { id: 'CONTINUOUS' as NarrationFrequency, label: t.labels.continuous },
                { id: 'INTERVAL_2' as NarrationFrequency, label: t.labels.every2Min },
                { id: 'INTERVAL_5' as NarrationFrequency, label: t.labels.every5Min },
              ]).map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setNarrationFreq(opt.id)}
                  className={`px-4 py-2 rounded-full text-[11px] font-medium uppercase tracking-wide transition-all active:scale-95 ${narrationFreq === opt.id ? 'bg-[#233DFF] text-white' : 'bg-gray-50 dark:bg-white/5 text-gray-400 dark:text-gray-500'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Go Button — pinned to bottom */}
          <button
            onClick={handleStart}
            className="w-full rounded-full bg-[#233DFF] text-white border border-[#233DFF] font-normal h-16 text-base shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 flex-shrink-0 mt-4"
          >
            <Play size={20} fill="currentColor" />
            <span>{sessionType === 'INDOOR'
              ? (lang === 'es' ? 'Comenzar' : 'Begin')
              : destinationName ? `${t.labels.justGo} \u2192 ${destinationName}` : lang === 'es' ? 'Solo Moverme' : 'Just Move'
            }</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default GuidedWalk;
