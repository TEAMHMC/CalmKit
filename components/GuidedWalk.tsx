
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Language, EchoPersona, NarrationFrequency, SessionType, IndoorActivity } from '../types';
import { translations } from '../translations';
import { generateSegmentNarrative } from '../geminiService';
import {
  Pause, X, Play, ChevronLeft, Search, Activity, Navigation, Clock, Send, MapPin, Loader2
} from 'lucide-react';
import { getAudioContext, destroyAudioContext, startKeepAlive, stopKeepAlive, requestWakeLock as sharedRequestWakeLock, releaseWakeLock as sharedReleaseWakeLock, fullCleanup } from '../audioManager';

declare const L: any;

const MODES: { id: EchoPersona; label: string; desc: string; voice: string; tone: string }[] = [
  { id: 'HOPE', label: 'Hope', desc: 'Safety & Self-Compassion', voice: 'Orus', tone: 'blue' },
  { id: 'HYPE', label: 'Hype', desc: 'Momentum & Action', voice: 'Charon', tone: 'pink' },
  { id: 'BREAKTHROUGH', label: 'Breakthrough', desc: 'Clarity & Perspective', voice: 'Kore', tone: 'orange' },
  { id: 'STRATEGY', label: 'Strategy', desc: 'Problem-Solving & Control', voice: 'Aoede', tone: 'yellow' },
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
  const [gpsLoading, setGpsLoading] = useState(false);
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

  // Try to get location on mount with high accuracy — silently continue if it fails
  // Instant lock on mount — watchPosition for continuous high-accuracy GPS from the moment MOVE tab opens
  useEffect(() => {
    if (navigator.geolocation) {
      setGpsLoading(true);
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const newLoc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setUserLocation(newLoc);
          setGpsAccuracy(pos.coords.accuracy);
          setGpsLoading(false);

          // If map is active, update marker and track path
          if (mapRef.current && markerRef.current) {
            markerRef.current.setLatLng(newLoc);
            if (!isPausedRef.current) {
              mapRef.current.panTo(newLoc, { animate: true });
            }
            // 2-meter tracking sensitivity (0.0012 miles)
            if (isNarratingRef.current) {
              const last = pathCoordsRef.current[pathCoordsRef.current.length - 1];
              if (last) {
                const R = 3958.8;
                const dLat = (newLoc[0] - last[0]) * Math.PI / 180;
                const dLon = (newLoc[1] - last[1]) * Math.PI / 180;
                const a = Math.sin(dLat/2)**2 + Math.cos(last[0]*Math.PI/180)*Math.cos(newLoc[0]*Math.PI/180)*Math.sin(dLon/2)**2;
                const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                if (dist > 0.0012) {
                  pathCoordsRef.current.push(newLoc);
                  if (pathRef.current) pathRef.current.setLatLngs(pathCoordsRef.current);
                  lastPositionRef.current = newLoc;
                  setSessionStats(prev => ({ ...prev, distance: prev.distance + dist }));
                }
              } else {
                pathCoordsRef.current.push(newLoc);
                lastPositionRef.current = newLoc;
              }
            }
          }
        },
        (err) => {
          console.warn('GPS error:', err.message);
          setGpsLoading(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
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
      fullCleanup();
      audioCtxRef.current = null;
    };
  }, []);

  // Request GPS on user gesture (mobile Safari requires this)
  // If permission was already denied, skip re-requesting and return false immediately.
  const requestGpsPermission = (): Promise<boolean> => {
    return new Promise(async (resolve) => {
      if (!navigator.geolocation) {
        setGpsLoading(false);
        resolve(false);
        return;
      }
      // Check if permission was already denied — don't re-prompt
      try {
        if (navigator.permissions) {
          const status = await navigator.permissions.query({ name: 'geolocation' });
          if (status.state === 'denied') {
            console.warn('GPS permission previously denied, skipping re-request');
            setGpsLoading(false);
            resolve(false);
            return;
          }
        }
      } catch (e) {
        // permissions API not supported, continue with request
      }
      setGpsLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation([pos.coords.latitude, pos.coords.longitude]);
          setGpsAccuracy(pos.coords.accuracy);
          setGpsLoading(false);
          resolve(true);
        },
        (err) => {
          console.warn('GPS permission request failed:', err.code, err.message);
          setGpsLoading(false);
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  };

  // ── Audio (shared manager) ──
  const initAudio = async () => {
    const ctx = await getAudioContext(24000);
    audioCtxRef.current = ctx;
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

  // ── TTS via server-side proxy — API key never in browser ──
  const speakText = async (text: string) => {
    const voice = MODES.find(m => m.id === mode)?.voice || 'Kore';
    const res = await fetch('https://volunteer.healthmatters.clinic/api/calmkit/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang, voice }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const base64 = data.audio;
    if (!base64) return null;

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const int16 = new Int16Array(bytes.buffer);
    const buffer = audioCtxRef.current!.createBuffer(1, int16.length, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < int16.length; i++) channelData[i] = int16[i] / 32768.0;
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
  const narrativeDataRef = useRef<any>(null);
  const narrativeSegmentIndexRef = useRef(0);
  const isFetchingRef = useRef(false);
  const narrationLoop = useCallback(async () => {
    if (!isNarratingRef.current || isPausedRef.current) return;
    if (isFetchingRef.current || currentSourceRef.current) return;

    if (audioCtxRef.current?.state === 'suspended') {
      await audioCtxRef.current.resume();
    }

    if (audioBufferQueue.current.length === 0) {
      const narrative = narrativeDataRef.current;
      if (narrative && narrative.segments) {
        const elapsed = sessionStatsRef.current.time || 0;
        const currentMin = Math.floor(elapsed / 60);

        // Find the next segment to play based on elapsed time
        const idx = narrativeSegmentIndexRef.current;
        if (idx < narrative.segments.length) {
          const seg = narrative.segments[idx];
          // Play when we've reached this segment's minute mark (or immediately if we're past it)
          if (currentMin >= (seg.minuteIndex || 0)) {
            isFetchingRef.current = true;
            setIsBufferingAudio(true);
            const text = Array.isArray(seg.scriptBeats) ? seg.scriptBeats.join(' ') : String(seg);
            const buffer = await speakText(text);
            isFetchingRef.current = false;
            if (buffer) audioBufferQueue.current.push(buffer);
            narrativeSegmentIndexRef.current = idx + 1;
            setIsBufferingAudio(false);
          }
        } else if (!sponsorPlayedRef.current && narrative.spokenSponsorMoment) {
          // Play sponsor line after all segments
          isFetchingRef.current = true;
          const buffer = await speakText(narrative.spokenSponsorMoment);
          isFetchingRef.current = false;
          if (buffer) audioBufferQueue.current.push(buffer);
          sponsorPlayedRef.current = true;
        } else if (narrative.closingTemplate && sponsorPlayedRef.current && idx >= narrative.segments.length) {
          // Play closing after sponsor
          isFetchingRef.current = true;
          const buffer = await speakText(narrative.closingTemplate);
          isFetchingRef.current = false;
          if (buffer) audioBufferQueue.current.push(buffer);
          narrativeSegmentIndexRef.current = 9999; // Done
        }
      } else {
        // Fallback: no structured narrative, use single segment generation
        isFetchingRef.current = true;
        setIsBufferingAudio(true);
        const segment = await generateSegmentNarrative({
          mode, activity: 'WALK', lang,
          stats: sessionStatsRef.current,
          isIntro: startTimeRef.current === null,
          isFirstSegment: !sponsorPlayedRef.current,
        });
        if (!sponsorPlayedRef.current) sponsorPlayedRef.current = true;
        const buffer = await speakText(segment);
        isFetchingRef.current = false;
        if (buffer) audioBufferQueue.current.push(buffer);
        setIsBufferingAudio(false);
      }
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
      const initialLoc = userLocation || [34.05, -118.24];
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        touchZoom: true,
        scrollWheelZoom: false,
        doubleClickZoom: false
      }).setView(initialLoc, 19);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);

      // Neon polyline for walked path
      pathRef.current = L.polyline([], {
        color: '#233DFF',
        weight: 8,
        opacity: 0.95,
        lineJoin: 'round',
        className: 'glowing-path'
      }).addTo(mapRef.current);

      // Create neon marker immediately at current location
      const icon = L.divIcon({
        className: 'user-marker',
        html: `<div class="relative w-12 h-12 flex items-center justify-center"><div class="absolute inset-0 bg-[#233DFF]/25 rounded-full animate-ping"></div><div class="w-6 h-6 bg-[#233DFF] rounded-full border-[3px] border-white shadow-[0_0_20px_#233DFF]"></div></div>`,
        iconSize: [48, 48],
        iconAnchor: [24, 24]
      });
      markerRef.current = L.marker(initialLoc, { icon }).addTo(mapRef.current);
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
  }, [isPlaying]);

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
    try { await initAudio(); } catch (e) { console.warn('Audio init failed, continuing:', e); }

    // If user chose outdoor but GPS was never granted, silently switch to indoor
    const effectiveSessionType = (sessionType === 'OUTDOOR' && !userLocation) ? 'INDOOR' : sessionType;
    if (effectiveSessionType !== sessionType) setSessionType(effectiveSessionType);
    const isIndoor = effectiveSessionType === 'INDOOR';
    indoorActivityRef.current = isIndoor ? indoorActivity : null;

    // Use existing GPS if available, don't re-request (avoids 10s hang)
    if (!isIndoor && userLocation) {
      pathCoordsRef.current = [userLocation];
      lastPositionRef.current = userLocation;
    }

    startKeepAlive();
    await sharedRequestWakeLock();
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
    // No synthetic ambient noise — let the user's music or silence be the background

    // Fetch full 20-minute structured narrative before starting narration
    try {
      setIsBufferingAudio(true);
      const res = await fetch('https://volunteer.healthmatters.clinic/api/calmkit/movement-narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, activity: 'WALK', lang, destinationName: destinationNameRef.current || undefined }),
      });
      const data = await res.json();
      if (data.success && data.preStartIntro) {
        narrativeDataRef.current = data;
        narrativeSegmentIndexRef.current = 0;
        // Play the intro immediately
        const buf = await speakText(data.preStartIntro);
        if (buf) audioBufferQueue.current.push(buf);
      }
      setIsBufferingAudio(false);
    } catch (e) {
      console.warn('Failed to fetch narrative, falling back to loop:', e);
      setIsBufferingAudio(false);
    }
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
    // Close shared AudioContext to prevent audio bleed into other views
    fullCleanup();
    audioCtxRef.current = null;
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
      <div className="flex-1 flex flex-col h-full bg-[#0A0A0A] overflow-hidden relative">
        {/* Ghost Mode Map or Indoor Background */}
        <div className="flex-1 relative overflow-hidden dark-map h-full">
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
              {isBufferingAudio && (
                <div className="px-4 py-1.5 rounded-full bg-[#233DFF]/30 backdrop-blur-md border border-[#233DFF]/40 animate-pulse">
                  <span className="text-[11px] font-medium text-white/70 uppercase">loading</span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Controls — pointer-events-auto so buttons work over the map */}
          <div className="absolute bottom-0 left-0 right-0 px-6 z-20 pb-[calc(env(safe-area-inset-bottom,24px)+20px)] flex flex-col items-center gap-5 pointer-events-auto">
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
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1 leading-snug">
              {lang === 'es'
                ? 'Cuéntanos cómo te sientes — tu guía adaptará la sesión a lo que necesitas ahora mismo.'
                : 'Tell us what\'s on your mind — your guide will tailor the session to what you need right now.'}
            </p>
          </div>
          <div className="flex-1 min-h-0 my-3">
            <textarea
              value={targetThought}
              onChange={(e) => setTargetThought(e.target.value)}
              placeholder={t.labels.thoughtPlaceholder}
              className="w-full h-full p-5 bg-gray-50 dark:bg-white/5 rounded-3xl border border-gray-100 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-[#233DFF] text-base resize-none dark:text-white placeholder:text-gray-400"
            />
          </div>

          <div className="flex flex-col gap-2 flex-shrink-0">
            <button
              onClick={async () => {
                if (!userLocation && !gpsLoading) await requestGpsPermission();
                setStep(1);
              }}
              disabled={!targetThought.trim()}
              className="w-full h-14 bg-black dark:bg-white text-white dark:text-black rounded-full border border-[#0f0f0f] dark:border-white font-normal text-base shadow-xl active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-20"
            >
              <Send size={18} />
              {t.onboarding.next}
            </button>
            <button
              onClick={async () => {
                setTargetThought('');
                if (!userLocation && !gpsLoading) await requestGpsPermission();
                setStep(1);
              }}
              className="w-full py-3 text-sm font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              {lang === 'es' ? 'Saltar — solo quiero moverme' : 'Skip — just let me move'}
            </button>
          </div>
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

            {/* GPS Status — only show if not available */}
            {sessionType === 'OUTDOOR' && !gpsLoading && !userLocation && (
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl">
                <MapPin size={16} className="text-gray-400 flex-shrink-0" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{lang === 'es' ? 'Ubicación no disponible — la guía de audio funciona sin ella' : 'Location not available — audio guidance works without it'}</p>
              </div>
            )}

            {/* Outdoor: Destination Search — only show if GPS is available */}
            {sessionType === 'OUTDOOR' && userLocation && (
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
