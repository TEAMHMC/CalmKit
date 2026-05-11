
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Language, EchoPersona, NarrationFrequency, SessionType, IndoorActivity } from '../types';
import { translations } from '../translations';
import { generateSegmentNarrative } from '../geminiService';
import {
  Pause, X, Play, ChevronLeft, Search, Activity, Navigation, Clock, Send, MapPin, Loader2, Zap
} from 'lucide-react';
import { getAudioContext, destroyAudioContext, startKeepAlive, stopKeepAlive, requestWakeLock as sharedRequestWakeLock, releaseWakeLock as sharedReleaseWakeLock, fullCleanup, setSessionResumeCallback, clearSessionResumeCallback, pauseKeepAliveAudio, resumeKeepAliveAudio } from '../audioManager';

declare const google: any;

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5f6368' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#1c2526' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0a0a0a' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#0f0f0f' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1c1c2e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0a0a0a' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#3d3d3d' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1a1a40' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#0a0a1a' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#0f0f0f' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#050a14' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#1a2a3a' }] },
];

let _mapsApiPromise: Promise<void> | null = null;
const ensureGoogleMaps = (): Promise<void> => {
  if ((window as any).google?.maps?.Map) return Promise.resolve();
  if (_mapsApiPromise) return _mapsApiPromise;
  _mapsApiPromise = new Promise((resolve, reject) => {
    // Prefer runtime key injected by nginx (Cloud Run env var) over build-time bake-in
    const key = (window as any).GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    if (!key) console.warn('[CalmKit] GOOGLE_MAPS_API_KEY is not set — map will show watermark');
    // Reuse existing script tag if already injected (e.g. hot reload)
    const existing = document.getElementById('gm-script');
    if (existing) {
      const poll = setInterval(() => {
        if ((window as any).google?.maps?.Map) { clearInterval(poll); resolve(); }
      }, 100);
      setTimeout(() => { clearInterval(poll); resolve(); }, 15000);
      return;
    }
    const s = document.createElement('script');
    s.id = 'gm-script';
    // v=weekly — latest stable; loading=async — non-blocking; libraries needed for Places + polylines
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&v=weekly&libraries=places,geometry&loading=async`;
    s.async = true;
    s.defer = true;
    s.referrerPolicy = 'strict-origin-when-cross-origin';
    s.onload = () => {
      // With loading=async, google.maps namespace exists but Map class may not yet be ready — poll for it
      const poll = setInterval(() => {
        if ((window as any).google?.maps?.Map) { clearInterval(poll); resolve(); }
      }, 100);
      setTimeout(() => { clearInterval(poll); resolve(); }, 15000);
    };
    s.onerror = () => reject(new Error('Google Maps failed to load'));
    document.head.appendChild(s);
  });
  return _mapsApiPromise;
};

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
  const [sessionGpsAcquired, setSessionGpsAcquired] = useState(false);
  const sessionGpsAcquiredRef = useRef(false);
  const [finalStats, setFinalStats] = useState({ distance: 0, time: 0, pace: '0:00' });
  const [finalPath, setFinalPath] = useState<[number, number][]>([]);
  const [envData, setEnvData] = useState<{
    weatherCondition?: string;
    temperature?: number;
    windSpeed?: number;
    airQualityIndex?: number;
    airQualityCategory?: string;
  }>({});

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
  const gpsTimeoutRef = useRef<any>(null);
  const pausedDurationRef = useRef(0);       // ms of total paused time this session
  const pauseStartRef = useRef<number | null>(null); // wall-clock when last pause began
  const destinationMarkerRef = useRef<any>(null);
  const segmentCounterRef = useRef(0);
  const sessionStatsRef = useRef(sessionStats);
  const destinationNameRef = useRef(destinationName);
  const targetThoughtRef = useRef(targetThought);
  const envDataRef = useRef(envData);
  const lastElevationRef = useRef<number | null>(null);
  const elevationGainRef = useRef(0);
  const elevationDeltaRef = useRef<number | null>(null);
  const currentSpeedRef = useRef<number | null>(null);
  // Pre-warm: text + raw TTS audio bytes fetched on step 1 so GO plays instantly
  const preloadedIntroTextRef = useRef<string | null>(null);
  const preloadedIntroBase64Ref = useRef<string | null>(null);
  const preloadKeyRef = useRef<string>('');
  // Inactivity auto-stop: timestamp of last recorded GPS movement
  const lastGPSMovementRef = useRef<number>(Date.now());

  const t = translations[lang];

  // userLocationRef keeps the latest GPS fix readable inside async closures (map init, etc.)
  const userLocationRef = useRef<[number, number] | null>(null);

  // Keep refs in sync
  useEffect(() => { sessionStatsRef.current = sessionStats; }, [sessionStats]);
  useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);
  useEffect(() => { destinationNameRef.current = destinationName; }, [destinationName]);
  useEffect(() => { targetThoughtRef.current = targetThought; }, [targetThought]);
  useEffect(() => { envDataRef.current = envData; }, [envData]);
  useEffect(() => { narrationFreqRef.current = narrationFreq; }, [narrationFreq]);

  // Pre-warm: generate intro text AND pre-fetch TTS audio bytes on step 1.
  // By GO time the audio is already decoded — coach plays in < 200ms.
  useEffect(() => {
    if (step !== 1) return;
    const key = `${mode}-${lang}-${sessionType}-${indoorActivity}`;
    if (preloadKeyRef.current === key && preloadedIntroBase64Ref.current) return;
    preloadedIntroTextRef.current = null;
    preloadedIntroBase64Ref.current = null;
    preloadKeyRef.current = key;
    let cancelled = false;
    generateSegmentNarrative({
      mode,
      activity: sessionType === 'INDOOR' ? (indoorActivity || 'STRETCH') : 'WALK',
      lang,
      stats: { distance: 0, time: 0, pace: '0:00' },
      isIntro: true, isFirstSegment: true, segmentNumber: 1,
      destinationName: destinationName || undefined,
      targetThought: targetThought || undefined,
      indoorActivity: sessionType === 'INDOOR' ? (indoorActivity || undefined) : undefined,
      userLat: userLocation?.[0], userLng: userLocation?.[1],
    }).then(async text => {
      if (cancelled || preloadKeyRef.current !== key) return;
      preloadedIntroTextRef.current = text;
      // Fire TTS fetch immediately — store raw base64 so AudioContext isn't needed yet
      const voice = MODES.find(m => m.id === mode)?.voice || 'Kore';
      try {
        const res = await fetch('https://volunteer.healthmatters.clinic/api/calmkit/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, lang, voice }),
        });
        if (cancelled || preloadKeyRef.current !== key) return;
        if (res.ok) {
          const data = await res.json();
          if (data?.audio && !cancelled && preloadKeyRef.current === key) {
            preloadedIntroBase64Ref.current = data.audio;
          }
        }
      } catch (_) { /* fall through — handleStart will fetch normally */ }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [step, mode, lang, sessionType, indoorActivity]);

  // GPS watch callback — shared by mount watch and requestGpsPermission
  const startGpsWatch = () => {
    if (watchIdRef.current !== null) return; // already watching
    setGpsLoading(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
          // Reject only truly stale cached positions (hours old, e.g. from a different city).
          // 5-min threshold allows normal GPS cold-start (30-60s) without blocking tracking.
          const ageMs = Date.now() - pos.timestamp;
          if (ageMs > 300000) {
            console.log(`[GPS] Skipping very stale position (${Math.round(ageMs / 1000)}s old)`);
            return;
          }

          const newLoc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          const accuracy = pos.coords.accuracy;

          // Always update location — map shows where you are immediately.
          // Cell-tower accuracy is filtered below in path tracking, not here.
          setUserLocation(newLoc);
          setGpsAccuracy(accuracy);
          setGpsLoading(false);
          if (gpsTimeoutRef.current) { clearTimeout(gpsTimeoutRef.current); gpsTimeoutRef.current = null; }

          // Capture altitude for uphill/downhill detection
          if (pos.coords.altitude !== null) {
            const alt = pos.coords.altitude;
            if (lastElevationRef.current !== null) {
              const delta = alt - lastElevationRef.current;
              elevationDeltaRef.current = delta;
              if (delta > 0.5) elevationGainRef.current += delta; // only count meaningful climbs
            }
            lastElevationRef.current = alt;
          }
          // Capture speed (m/s → mph)
          if (pos.coords.speed !== null && pos.coords.speed >= 0) {
            currentSpeedRef.current = pos.coords.speed * 2.237;
          }

          // Clear the "Finding your location" overlay as soon as ANY position arrives —
          // independent of whether Google Maps has finished loading yet.
          if (!sessionGpsAcquiredRef.current) {
            sessionGpsAcquiredRef.current = true;
            setSessionGpsAcquired(true);
          }

          // Update map marker if the Google Maps instance is ready
          if (mapRef.current && markerRef.current) {
            const gmPos = { lat: newLoc[0], lng: newLoc[1] };
            markerRef.current.setPosition(gmPos);
            markerRef.current.setMap(mapRef.current);
            if (!isPausedRef.current) mapRef.current.panTo(gmPos);
          }
          // Track path only with accurate GPS (≤100m) — cell-tower fixes (500m+) corrupt the
          // route because the spike filter then rejects every real GPS update as too far.
          if (isNarratingRef.current && !isPausedRef.current && accuracy <= 100) {
            const last = pathCoordsRef.current[pathCoordsRef.current.length - 1];
            if (last) {
              const R = 3958.8;
              const dLat = (newLoc[0] - last[0]) * Math.PI / 180;
              const dLon = (newLoc[1] - last[1]) * Math.PI / 180;
              const a = Math.sin(dLat/2)**2 + Math.cos(last[0]*Math.PI/180)*Math.cos(newLoc[0]*Math.PI/180)*Math.sin(dLon/2)**2;
              const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              // 0.0005 mi ≈ 2.6 ft minimum movement; filter spikes > 0.05 mi (264 ft) as GPS noise
              if (dist > 0.0005 && dist < 0.05) {
                pathCoordsRef.current.push(newLoc);
                if (pathRef.current) pathRef.current.setPath(pathCoordsRef.current.map(([lat, lng]: [number, number]) => ({ lat, lng })));
                lastPositionRef.current = newLoc;
                lastGPSMovementRef.current = Date.now();
                setSessionStats(prev => ({ ...prev, distance: prev.distance + dist }));
              }
            } else {
              pathCoordsRef.current.push(newLoc);
              lastPositionRef.current = newLoc;
            }
          }
        },
        (err) => {
          console.warn('GPS error:', err.message);
          setGpsLoading(false);
        },
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
      // Fallback: if GPS hasn't resolved in 25s, unblock GO anyway
      gpsTimeoutRef.current = setTimeout(() => {
        setGpsLoading(false);
        gpsTimeoutRef.current = null;
      }, 25000);
  };

  // Try to get location on mount with high accuracy — silently continue if it fails
  // On iOS Safari PWA, watchPosition on mount fails without a prior user gesture.
  // Check permission state first; only start immediately if already granted.
  useEffect(() => {
    if (!navigator.geolocation) return;

    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then(status => {
        if (status.state === 'granted') startGpsWatch();
        // 'prompt' or 'denied': defer to Next button → requestGpsPermission
      }).catch(() => {
        // permissions API unavailable — start watch immediately (non-Safari fallback)
        startGpsWatch();
      });
    } else {
      startGpsWatch();
    }

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (gpsTimeoutRef.current) { clearTimeout(gpsTimeoutRef.current); gpsTimeoutRef.current = null; }
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
      audioBufferQueue.current = [];
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
      if (currentSourceRef.current) { try { currentSourceRef.current.stop(); } catch(e) {} }
      bgNodesRef.current.forEach(n => { try { n.stop(); } catch(e) {} });
      fullCleanup();
      clearSessionResumeCallback();
      audioCtxRef.current = null;
    };
  }, []);

  // ── Narration Loop — must be declared before the useEffect that lists it as a dependency ──
  const narrativeDataRef = useRef<any>(null);
  const narrativeSegmentIndexRef = useRef(0);
  const isFetchingRef = useRef(false);
  const fallbackIntroPlayedRef = useRef(false);
  const closingPlayedRef = useRef(false);
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

        const idx = narrativeSegmentIndexRef.current;
        if (idx < narrative.segments.length) {
          const seg = narrative.segments[idx];
          // Play segments sequentially — no time-gating so audio stays continuous
          isFetchingRef.current = true;
          setIsBufferingAudio(true);
          const text = Array.isArray(seg.scriptBeats) ? seg.scriptBeats.filter(Boolean).join(' ') : String(seg);
          narrativeSegmentIndexRef.current = idx + 1;
          if (text.trim()) {
            const buffer = await speakText(text);
            if (buffer) audioBufferQueue.current.push(buffer);
          }
          isFetchingRef.current = false;
          setIsBufferingAudio(false);
        } else if (!sponsorPlayedRef.current && narrative.spokenSponsorMoment) {
          isFetchingRef.current = true;
          const buffer = await speakText(narrative.spokenSponsorMoment);
          isFetchingRef.current = false;
          if (buffer) audioBufferQueue.current.push(buffer);
          sponsorPlayedRef.current = true;
        } else if (narrative.closingTemplate && sponsorPlayedRef.current && idx >= narrative.segments.length && !closingPlayedRef.current) {
          isFetchingRef.current = true;
          closingPlayedRef.current = true;
          const buffer = await speakText(narrative.closingTemplate);
          isFetchingRef.current = false;
          if (buffer) audioBufferQueue.current.push(buffer);
          narrativeSegmentIndexRef.current = 9999;
        }
      } else {
        isFetchingRef.current = true;
        setIsBufferingAudio(true);
        segmentCounterRef.current++;
        const isIntro = !fallbackIntroPlayedRef.current;
        fallbackIntroPlayedRef.current = true;
        const segment = await generateSegmentNarrative({
          mode,
          activity: sessionType === 'INDOOR' ? (indoorActivityRef.current || 'STRETCH') : 'WALK',
          lang,
          stats: sessionStatsRef.current,
          isIntro,
          isFirstSegment: !sponsorPlayedRef.current,
          segmentNumber: segmentCounterRef.current,
          destinationName: destinationNameRef.current || undefined,
          targetThought: targetThoughtRef.current || undefined,
          indoorActivity: sessionType === 'INDOOR' ? (indoorActivityRef.current || undefined) : undefined,
          userLat: userLocation?.[0],
          userLng: userLocation?.[1],
          ...envDataRef.current,
          ...(elevationGainRef.current > 0 && { elevationGain: elevationGainRef.current }),
          ...(elevationDeltaRef.current !== null && { elevationDelta: elevationDeltaRef.current }),
          ...(currentSpeedRef.current !== null && { speed: currentSpeedRef.current }),
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
      if (!audioCtxRef.current) return;
      const source = audioCtxRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtxRef.current!.destination);
      currentSourceRef.current = source;

      if (narrationFreqRef.current === 'CONTINUOUS') duckAmbience();

      let sourceEnded = false;
      source.onended = () => {
        if (sourceEnded) return;
        sourceEnded = true;
        currentSourceRef.current = null;

        if (narrationFreqRef.current === 'CONTINUOUS') {
          raiseAmbience();
          narrationLoop();
        } else {
          stopAmbience();
          audioCtxRef.current?.suspend();
          pauseKeepAliveAudio();

          const delayMs = narrationFreqRef.current === 'INTERVAL_2' ? 120000 : 300000;
          const preBufferDelay = Math.max(delayMs - 25000, 5000);

          setTimeout(async () => {
            if (!isNarratingRef.current) return;
            isReturningRef.current = true;
            const stats = sessionStatsRef.current;
            const seg = await generateSegmentNarrative({
              mode, activity: 'WALK', lang, stats,
              isIntro: false, isFirstSegment: false, isReturning: true,
              segmentNumber: segmentCounterRef.current,
              indoorActivity: indoorActivityRef.current || undefined,
              destinationName: destinationNameRef.current || undefined,
              targetThought: targetThoughtRef.current || undefined,
              ...envDataRef.current,
              ...(elevationGainRef.current > 0 && { elevationGain: elevationGainRef.current }),
              ...(elevationDeltaRef.current !== null && { elevationDelta: elevationDeltaRef.current }),
              ...(currentSpeedRef.current !== null && { speed: currentSpeedRef.current }),
            });
            const buf = await speakText(seg);
            if (buf) audioBufferQueue.current.push(buf);
          }, preBufferDelay);

          narrationTimeoutRef.current = setTimeout(async () => {
            if (!isNarratingRef.current || isPausedRef.current) return;
            resumeKeepAliveAudio();
            await audioCtxRef.current?.resume();
            narrationLoop();
          }, delayMs);
        }
      };
      source.start(0);
      if (startTimeRef.current === null) startTimeRef.current = Date.now();

      if (narrationFreqRef.current === 'CONTINUOUS' && audioBufferQueue.current.length < 2 && isNarratingRef.current && !narrativeDataRef.current) {
        (async () => {
          const stats = sessionStatsRef.current;
          const seg = await generateSegmentNarrative({
            mode, activity: sessionType === 'INDOOR' ? (indoorActivityRef.current || 'STRETCH') : 'WALK', lang, stats,
            isIntro: false, isFirstSegment: false,
            segmentNumber: segmentCounterRef.current,
            indoorActivity: indoorActivityRef.current || undefined,
            destinationName: destinationNameRef.current || undefined,
            targetThought: targetThoughtRef.current || undefined,
            ...envDataRef.current,
            ...(elevationGainRef.current > 0 && { elevationGain: elevationGainRef.current }),
            ...(elevationDeltaRef.current !== null && { elevationDelta: elevationDeltaRef.current }),
            ...(currentSpeedRef.current !== null && { speed: currentSpeedRef.current }),
          });
          if (!isNarratingRef.current) return;
          const buf = await speakText(seg);
          if (!isNarratingRef.current) return;
          if (buf) audioBufferQueue.current.push(buf);
        })();
      }
    } else {
      setTimeout(narrationLoop, 1000);
    }
  }, [mode, lang]);

  // Screen-lock recovery: when iOS resumes the AudioContext (via lock-screen play button
  // or visibilitychange), the playing AudioBufferSourceNode has died silently without
  // firing onended. Clear the stale ref and restart the narration loop.
  useEffect(() => {
    if (!isPlaying) {
      clearSessionResumeCallback();
      return;
    }
    setSessionResumeCallback(() => {
      if (!isNarratingRef.current || isPausedRef.current) return;
      // The old source node is dead — clear it so narrationLoop starts fresh
      currentSourceRef.current = null;
      // Cancel any pending interval timer; it may have misfired on the suspended context
      if (narrationTimeoutRef.current) {
        clearTimeout(narrationTimeoutRef.current);
        narrationTimeoutRef.current = null;
      }
      narrationLoop();
    });
    return () => clearSessionResumeCallback();
  }, [isPlaying, narrationLoop]);

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
          // Permission now granted — start continuous watch if not already running
          startGpsWatch();
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

  // ── Web Speech API fallback — used when Gemini TTS is unavailable ──
  // Speaks text natively via the browser's built-in speech engine.
  // Sets currentSourceRef to a sentinel so the narrationLoop guard blocks re-entry,
  // then calls narrationLoop() again on completion — seamless audio continuity.
  // Plain function (not useCallback) — accesses only refs, never stale.
  const speakWithWebSpeech = (text: string) => {
    // Never speak if the session has ended — prevents audio bleed into other views
    if (!isNarratingRef.current) return;
    if (!window.speechSynthesis) {
      setTimeout(narrationLoop, 1500);
      return;
    }
    window.speechSynthesis.cancel(); // clear any leftover utterances

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.lang = lang === 'es' ? 'es-US' : 'en-US';

    // Prefer a calm male voice when available
    // getVoices() is populated asynchronously on some browsers — use what's available
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const langCode = lang === 'es' ? 'es' : 'en';
      // Score voices: prefer matching lang, prefer male-sounding names for calm persona
      const maleKeywords = ['male', 'guy', 'man', 'daniel', 'alex', 'fred', 'jorge', 'diego', 'carlos', 'tom', 'arthur', 'luca', 'reed'];
      const scored = voices
        .filter(v => v.lang.toLowerCase().startsWith(langCode))
        .map(v => ({
          voice: v,
          score: maleKeywords.some(k => v.name.toLowerCase().includes(k)) ? 1 : 0,
        }))
        .sort((a, b) => b.score - a.score);
      if (scored.length > 0) utterance.voice = scored[0].voice;
    }

    // Use a sentinel object so narrationLoop guard (currentSourceRef.current check) blocks re-entry.
    // The sentinel's stop() method cancels web speech on pause/stop — same contract as AudioBufferSourceNode.
    const sentinel = { stop: () => { try { window.speechSynthesis.cancel(); } catch (e) {} } };
    currentSourceRef.current = sentinel as unknown as AudioBufferSourceNode;

    if (narrationFreqRef.current === 'CONTINUOUS') duckAmbience();

    utterance.onend = () => {
      // Only clear the sentinel if it's still our utterance (not a newer one)
      if (currentSourceRef.current === (sentinel as unknown as AudioBufferSourceNode)) {
        currentSourceRef.current = null;
      }
      if (narrationFreqRef.current === 'CONTINUOUS') raiseAmbience();
      if (isNarratingRef.current && !isPausedRef.current) {
        narrationLoop();
      }
    };
    utterance.onerror = (e) => {
      // 'interrupted' fires when cancel() is called (e.g. on pause/stop) — not a real error
      if ((e as SpeechSynthesisErrorEvent).error === 'interrupted') return;
      if (currentSourceRef.current === (sentinel as unknown as AudioBufferSourceNode)) {
        currentSourceRef.current = null;
      }
      // On web speech error, retry narration loop after brief pause
      if (isNarratingRef.current && !isPausedRef.current) {
        setTimeout(narrationLoop, 2000);
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  // ── TTS via server-side proxy — API key never in browser ──
  // Falls back to Web Speech API if Gemini TTS fails or times out (10s).
  // Returns an AudioBuffer for the buffer queue, or null if Web Speech fallback handled playback.
  const speakText = async (text: string): Promise<AudioBuffer | null> => {
    const voice = MODES.find(m => m.id === mode)?.voice || 'Kore';

    try {
      const controller = new AbortController();
      const ttsTimeout = setTimeout(() => controller.abort(), 22000); // 22s — matches server-side 25s window

      let res: Response;
      try {
        res = await fetch('https://volunteer.healthmatters.clinic/api/calmkit/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, lang, voice }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(ttsTimeout);
      }

      if (!res!.ok) throw new Error(`TTS ${res!.status}`);
      const data = await res!.json();
      const base64 = data.audio;
      if (!base64) throw new Error('No audio in response');

      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const int16 = new Int16Array(bytes.buffer);
      if (!audioCtxRef.current) throw new Error('AudioContext gone');
      const buffer = audioCtxRef.current.createBuffer(1, int16.length, 24000);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < int16.length; i++) channelData[i] = int16[i] / 32768.0;
      return buffer;
    } catch (err) {
      console.warn('[CalmKit TTS] Gemini TTS failed, using Web Speech fallback:', (err as Error).message);
      // Guard: session may have ended while the TTS fetch was in-flight
      if (isNarratingRef.current) speakWithWebSpeech(text);
      return null;
    }
  };

  // ── Google Places Destination Search ──
  const fetchSuggestions = (q: string) => {
    if (q.length < 3) { setSuggestions([]); return; }
    ensureGoogleMaps().then(() => {
      const svc = new google.maps.places.AutocompleteService();
      const opts: any = {
        input: q,
        types: ['establishment', 'geocode'],
      };
      if (userLocation) {
        opts.locationBias = new google.maps.Circle({
          center: { lat: userLocation[0], lng: userLocation[1] },
          radius: 16000,
        });
      }
      svc.getPlacePredictions(opts, (predictions: any[], status: string) => {
        if (status === 'OK' && predictions) setSuggestions(predictions);
        else setSuggestions([]);
      });
    }).catch(() => setSuggestions([]));
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 400);
  };

  const selectSuggestion = (s: any) => {
    const name = s.structured_formatting?.main_text || s.description.split(',')[0];
    setSearchQuery(name);
    setSuggestions([]);
    ensureGoogleMaps().then(() => {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ placeId: s.place_id }, (results: any[], status: string) => {
        if (status === 'OK' && results[0]) {
          const loc = results[0].geometry.location;
          setDestinationName(name);
          setDestinationCoords([loc.lat(), loc.lng()]);
        }
      });
    });
  };

  // ── Map (Ghost Mode) ──
  useEffect(() => {
    if (!isPlaying || !mapContainerRef.current || mapRef.current) {
      if (!isPlaying && mapRef.current) {
        // Clean up Google Maps resources
        if (markerRef.current) { markerRef.current.setMap(null); markerRef.current = null; }
        if (destinationMarkerRef.current) { destinationMarkerRef.current.setMap(null); destinationMarkerRef.current = null; }
        if (pathRef.current) { pathRef.current.setMap(null); pathRef.current = null; }
        mapRef.current = null;
      }
      return;
    }

    const container = mapContainerRef.current;
    const hasLocation = !!userLocation;
    const initialCenter = hasLocation
      ? { lat: userLocation![0], lng: userLocation![1] }
      : { lat: 39.5, lng: -98.35 };
    const initialZoom = hasLocation ? 16 : 4;
    const capturedDest = destinationCoords;

    let cancelled = false;

    ensureGoogleMaps().then(() => {
      if (cancelled || !container || mapRef.current) return;
      const gm = (window as any).google.maps;

      mapRef.current = new gm.Map(container, {
        center: initialCenter,
        zoom: initialZoom,
        mapTypeId: 'roadmap',
        disableDefaultUI: true,
        gestureHandling: 'greedy',
        styles: DARK_MAP_STYLE,
      });

      // Neon blue route polyline
      pathRef.current = new gm.Polyline({
        map: mapRef.current,
        path: [],
        strokeColor: '#233DFF',
        strokeWeight: 6,
        strokeOpacity: 0.95,
      });

      // Pulsing user position marker using Maps SymbolPath (no SVG data URI needed)
      const userIcon = {
        path: gm.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#233DFF',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 3,
      };

      // Read from ref — GPS may have already fired while the Maps API was loading
      const currentLoc = userLocationRef.current;
      const markerPos = currentLoc
        ? { lat: currentLoc[0], lng: currentLoc[1] }
        : null;

      markerRef.current = new gm.Marker({
        map: markerPos ? mapRef.current : null, // only add to map if we have real location
        position: markerPos || initialCenter,
        icon: userIcon,
        optimized: false,
        zIndex: 999,
      });

      // If GPS was already acquired, center map on real location
      if (markerPos) {
        mapRef.current.setCenter(markerPos);
        mapRef.current.setZoom(16);
      }

      // Destination pin
      if (capturedDest) {
        destinationMarkerRef.current = new gm.Marker({
          map: mapRef.current,
          position: { lat: capturedDest[0], lng: capturedDest[1] },
          icon: {
            path: gm.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: '#233DFF',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });
      }
    }).catch(e => console.warn('Google Maps init failed:', e));

    return () => {
      cancelled = true;
      if (markerRef.current) { markerRef.current.setMap(null); markerRef.current = null; }
      if (destinationMarkerRef.current) { destinationMarkerRef.current.setMap(null); destinationMarkerRef.current = null; }
      if (pathRef.current) { pathRef.current.setMap(null); pathRef.current = null; }
      mapRef.current = null;
    };
  }, [isPlaying]);

  // ── Handlers ──
  const handleStart = async () => {
    try { await initAudio(); } catch (e) { console.warn('Audio init failed, continuing:', e); }

    // Respect the user's session type choice — OUTDOOR works without GPS
    // (map shows at default LA coordinates, audio coaching still fully functional)
    const effectiveSessionType = sessionType;
    const isIndoor = effectiveSessionType === 'INDOOR';
    indoorActivityRef.current = isIndoor ? indoorActivity : null;

    // Reset all session state so a second session starts clean
    setSessionStats({ distance: 0, time: 0, pace: '0:00' });
    audioBufferQueue.current = [];
    narrativeDataRef.current = null;
    narrativeSegmentIndexRef.current = 0;
    segmentCounterRef.current = 0;
    sponsorPlayedRef.current = false;
    isFetchingRef.current = false;
    fallbackIntroPlayedRef.current = false;
    closingPlayedRef.current = false;

    startKeepAlive();
    await sharedRequestWakeLock();

    // Reset per-session GPS state
    sessionGpsAcquiredRef.current = false;
    setSessionGpsAcquired(false);

    // For outdoor: request location on the GO gesture — this is what triggers the iOS
    // native permission prompt. If already granted, resolves instantly.
    if (!isIndoor && !userLocation && navigator.geolocation) {
      await requestGpsPermission();
    }

    // Restart GPS watch if a previous session cleared it
    startGpsWatch();

    // If we already have a GPS fix (e.g. location was acquired before GO was pressed),
    // immediately mark the overlay as cleared. watchPosition only fires on movement, so
    // a stationary user would see the "Finding location" overlay forever without this.
    if (!isIndoor && userLocationRef.current && !sessionGpsAcquiredRef.current) {
      sessionGpsAcquiredRef.current = true;
      setSessionGpsAcquired(true);
    }

    isNarratingRef.current = true;
    setIsPlaying(true);
    const _g = (window as any).gtag;
    if (_g) _g('event', 'calmkit_walk_start', { mode, session_type: effectiveSessionType, destination: destinationName || 'none', lang });

    // Always start with empty path — let the first accurate GPS update (≤100m) during
    // the session seed it. Seeding from a pre-session fix risks using a cell-tower position
    // that's miles off, which then breaks the spike filter for every real GPS update.
    pathCoordsRef.current = [];
    lastPositionRef.current = null;
    const now = Date.now();
    startTimeRef.current = now;
    pausedDurationRef.current = 0;
    pauseStartRef.current = null;

    timerIntervalRef.current = setInterval(() => {
      if (isPausedRef.current) return;
      setSessionStats(prev => {
        const elapsed = (Date.now() - now - pausedDurationRef.current) / 1000;
        const paceRaw = prev.distance > 0 ? (elapsed / 60) / prev.distance : 0;
        const mins = Math.floor(paceRaw);
        const secs = Math.floor((paceRaw - mins) * 60);
        return {
          ...prev,
          time: elapsed,
          pace: prev.distance > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : '0:00'
        };
      });
      // Auto-stop after 10 min with no GPS movement (OUTDOOR only) — prevents runaway sessions
      if (sessionType !== 'INDOOR' && !isPausedRef.current) {
        const idleSec = (Date.now() - lastGPSMovementRef.current) / 1000;
        if (idleSec > 600) {
          clearInterval(timerIntervalRef.current!);
          timerIntervalRef.current = null;
          isNarratingRef.current = false;
          if (currentSourceRef.current) { try { currentSourceRef.current.stop(); } catch(e) {} }
          setFinalPath([...pathCoordsRef.current]);
          setSessionStats(s => { setFinalStats({ ...s }); return s; });
          setIsPlaying(false);
          setIsPaused(false);
          fullCleanup();
          setShowSummary(true);
        }
      }
    }, 1000);

    // No synthetic ambient noise — let the user's music or silence be the background

    // Fetch weather + air quality non-blocking (best-effort — if they fail, Echo still works)
    if (userLocation) {
      const [lat, lng] = userLocation;
      const base = 'https://volunteer.healthmatters.clinic/api/calmkit';
      Promise.all([
        fetch(`${base}/weather?lat=${lat}&lng=${lng}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${base}/airquality?lat=${lat}&lng=${lng}`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]).then(([weather, air]) => {
        const update: typeof envData = {};
        if (weather?.condition) update.weatherCondition = weather.condition;
        if (weather?.temperature !== null && weather?.temperature !== undefined) update.temperature = weather.temperature;
        if (weather?.windSpeed !== null && weather?.windSpeed !== undefined) update.windSpeed = weather.windSpeed;
        if (air?.aqi !== null && air?.aqi !== undefined) update.airQualityIndex = air.aqi;
        if (air?.category) update.airQualityCategory = air.category;
        setEnvData(update);
        envDataRef.current = update;
      });
    }

    // Show buffering indicator immediately while AI voice is being generated
    setIsBufferingAudio(true);

    // Block narrationLoop re-entry while we fetch the first AI segment.
    // If intro text was pre-warmed on step 1, skip generation and go straight to TTS (~3s).
    isFetchingRef.current = true;
    segmentCounterRef.current = 1;
    fallbackIntroPlayedRef.current = true;
    lastGPSMovementRef.current = Date.now();
    (async () => {
      try {
        const preKey = `${mode}-${lang}-${sessionType}-${indoorActivity}`;
        const hasPreloadedAudio = preloadKeyRef.current === preKey && preloadedIntroBase64Ref.current;

        if (hasPreloadedAudio && audioCtxRef.current) {
          // Fast path: TTS was pre-fetched on step 1 — decode in < 100ms, no network round-trip
          const base64 = preloadedIntroBase64Ref.current!;
          preloadedIntroBase64Ref.current = null;
          preloadedIntroTextRef.current = null;
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const int16 = new Int16Array(bytes.buffer);
          const buf = audioCtxRef.current.createBuffer(1, int16.length, 24000);
          const ch = buf.getChannelData(0);
          for (let i = 0; i < int16.length; i++) ch[i] = int16[i] / 32768.0;
          sponsorPlayedRef.current = true;
          isFetchingRef.current = false;
          if (isNarratingRef.current) audioBufferQueue.current.push(buf);
          setIsBufferingAudio(false);
          narrationLoop();
        } else {
          // Slow path: text may be pre-warmed but audio still needs a TTS fetch
          let seg = (preloadKeyRef.current === preKey && preloadedIntroTextRef.current)
            ? preloadedIntroTextRef.current
            : await generateSegmentNarrative({
                mode,
                activity: sessionType === 'INDOOR' ? (indoorActivityRef.current || 'STRETCH') : 'WALK',
                lang, stats: sessionStatsRef.current,
                isIntro: true, isFirstSegment: true, segmentNumber: 1,
                destinationName: destinationNameRef.current || undefined,
                targetThought: targetThoughtRef.current || undefined,
                indoorActivity: sessionType === 'INDOOR' ? (indoorActivityRef.current || undefined) : undefined,
                userLat: userLocation?.[0], userLng: userLocation?.[1],
              });
          preloadedIntroTextRef.current = null;
          preloadedIntroBase64Ref.current = null;
          if (!isNarratingRef.current) { isFetchingRef.current = false; return; }
          sponsorPlayedRef.current = true;
          const buf = await speakText(seg);
          isFetchingRef.current = false;
          if (buf && isNarratingRef.current) audioBufferQueue.current.push(buf);
          narrationLoop();
        }
      } catch {
        isFetchingRef.current = false;
        narrationLoop();
      }
    })();

    // Fetch full 20-minute structured narrative in background (non-blocking)
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    fetch('https://volunteer.healthmatters.clinic/api/calmkit/movement-narrative', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        activity: sessionType === 'INDOOR' ? (indoorActivityRef.current || 'STRETCH') : 'WALK',
        indoorActivity: sessionType === 'INDOOR' ? (indoorActivityRef.current || undefined) : undefined,
        lang,
        destinationName: sessionType === 'OUTDOOR' ? (destinationNameRef.current || undefined) : undefined,
        targetThought: targetThoughtRef.current || undefined,
        timeOfDay,
        ...envDataRef.current,
        ...(elevationGainRef.current > 0 && { elevationGain: Math.round(elevationGainRef.current) }),
        ...(currentSpeedRef.current !== null && { speed: currentSpeedRef.current }),
      }),
    }).then(async (res) => {
      const data = await res.json();
      if (data.success && data.segments && isNarratingRef.current && !narrativeDataRef.current) {
        narrativeDataRef.current = data;
        narrativeSegmentIndexRef.current = 0;
        // Don't queue preStartIntro — fallback already played a greeting
      }
    }).catch(e => {
      console.warn('Failed to fetch narrative, using fallback loop:', e);
    });
  };

  const handleStop = () => {
    const _g = (window as any).gtag;
    if (_g) _g('event', 'calmkit_walk_complete', { mode, elapsed_seconds: sessionStats.time, distance_miles: parseFloat(sessionStats.distance.toFixed(2)) });
    // Set flags first so any in-flight async callbacks (speakText, speakWithWebSpeech) see the stopped state
    isNarratingRef.current = false;
    isPausedRef.current = false;
    isFetchingRef.current = false;
    audioBufferQueue.current = [];
    // Cancel Web Speech immediately — stops audio that came from the TTS fallback path
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (narrationTimeoutRef.current) { clearTimeout(narrationTimeoutRef.current); narrationTimeoutRef.current = null; }
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch(e) {}
      currentSourceRef.current = null;
    }
    stopAmbience();
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    // Clean up Google Maps before showing summary
    if (markerRef.current) { try { markerRef.current.setMap(null); } catch(e) {} markerRef.current = null; }
    if (destinationMarkerRef.current) { try { destinationMarkerRef.current.setMap(null); } catch(e) {} destinationMarkerRef.current = null; }
    if (pathRef.current) { try { pathRef.current.setMap(null); } catch(e) {} pathRef.current = null; }
    mapRef.current = null;
    startMarkerRef.current = null;
    // Close shared AudioContext to prevent audio bleed into other views
    fullCleanup();
    audioCtxRef.current = null;
    setIsPlaying(false);
    setIsPaused(false);
    // Snapshot the walked path and stats before showing summary
    setFinalPath([...pathCoordsRef.current]);
    setFinalStats({ ...sessionStats });
    setShowSummary(true);
  };

  const togglePause = () => {
    const newPaused = !isPaused;
    setIsPaused(newPaused);
    isPausedRef.current = newPaused;
    if (newPaused) {
      pauseStartRef.current = Date.now();
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
      if (pauseStartRef.current !== null) {
        pausedDurationRef.current += Date.now() - pauseStartRef.current;
        pauseStartRef.current = null;
      }
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

    // Build SVG route from captured path coordinates
    const routeSVG = (() => {
      if (sessionType !== 'OUTDOOR' || finalPath.length < 2) return null;
      const lats = finalPath.map(c => c[0]);
      const lngs = finalPath.map(c => c[1]);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
      const latRange = maxLat - minLat || 0.001;
      const lngRange = maxLng - minLng || 0.001;
      const W = 320, H = 180, pad = 24;
      const pts = finalPath.map(([lat, lng]) => {
        const x = pad + ((lng - minLng) / lngRange) * (W - 2 * pad);
        const y = pad + ((maxLat - lat) / latRange) * (H - 2 * pad);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      const [sx, sy] = pts[0].split(',');
      const [ex, ey] = pts[pts.length - 1].split(',');
      return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-2xl" style={{ background: '#0A0A0A', display: 'block' }}>
          <polyline points={pts.join(' ')} fill="none" stroke="#233DFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 0 6px #233DFF)' }} />
          <circle cx={sx} cy={sy} r="6" fill="#233DFF" stroke="white" strokeWidth="2" />
          <circle cx={ex} cy={ey} r="6" fill="white" stroke="#233DFF" strokeWidth="2" />
        </svg>
      );
    })();

    return (
      <div className="flex-1 flex flex-col items-center px-6 py-8 bg-white dark:bg-[#121212] animate-in fade-in text-center gap-6 overflow-y-auto">
        <div className="space-y-1 pt-2">
          <h2 className="text-3xl font-normal tracking-normal dark:text-white font-display">{t.labels.sessionSummary}</h2>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{routeSVG ? t.labels.sessionSummaryDesc : (lang === 'es' ? 'SESIÓN COMPLETADA' : 'SESSION COMPLETE')}</p>
        </div>

        {routeSVG ? (
          <div className="w-full">{routeSVG}</div>
        ) : (
          <div className="w-24 h-24 bg-[#233DFF]/10 rounded-full flex items-center justify-center">
            <Activity size={40} className="text-[#233DFF]" />
          </div>
        )}

        <div className="flex gap-8 justify-center">
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
  // RENDER: Active Walk — New Card Layout
  // ══════════════════════════════════════════════
  if (isPlaying) {
    const elapsed = sessionStats.time;
    const timeStr = `${Math.floor(elapsed / 60)}:${(Math.floor(elapsed) % 60).toString().padStart(2, '0')}`;
    const paceStr = sessionStats.pace === '0:00' ? `--'--"` : sessionStats.pace;

    return (
      <div className="flex-1 relative overflow-hidden bg-[#0A0A0A] dark-map">
        {/* Map */}
        {sessionType === 'OUTDOOR' && <div ref={mapContainerRef} className="absolute inset-0 z-0" />}
        {sessionType === 'INDOOR' && (() => {
          const elapsed = sessionStats.time;
          const auraColor = mode === 'HYPE' ? '#233DFF' : mode === 'BREAKTHROUGH' ? '#f97316' : mode === 'STRATEGY' ? '#eab308' : '#4B70FF';
          const auraSpeed = indoorActivity === 'SWEAT' ? '0.85s' : indoorActivity === 'FLOW' ? '2.2s' : '3.8s';
          const auraScale = indoorActivity === 'SWEAT' ? 1.45 : indoorActivity === 'FLOW' ? 1.2 : 1.1;
          const phase = elapsed < 180 ? 'WARMUP' : elapsed < 600 ? 'ACTIVE' : 'PEAK';
          const ringCount = phase === 'PEAK' ? 4 : phase === 'ACTIVE' ? 3 : 2;
          const ringSizes = [300, 230, 165, 110];
          const activityLabel = indoorActivity === 'SWEAT' ? 'STRENGTH' : indoorActivity === 'FLOW' ? 'FLOW' : 'STRETCH';
          return (
            <div className="absolute inset-0 z-0 flex items-center justify-center bg-[#0A0A0A]">
              <style>{`
                @keyframes aura-ring {
                  0% { transform: scale(1); opacity: 0.55; }
                  60% { transform: scale(${auraScale}); opacity: 0; }
                  100% { transform: scale(${auraScale}); opacity: 0; }
                }
                @keyframes aura-core {
                  0%, 100% { transform: scale(1); opacity: 0.7; }
                  50% { transform: scale(${1 + (auraScale - 1) * 0.5}); opacity: 1; }
                }
              `}</style>
              {ringSizes.slice(0, ringCount).map((size, i) => (
                <div key={size} style={{
                  position: 'absolute', width: size, height: size, borderRadius: '50%',
                  border: `1px solid ${auraColor}`,
                  opacity: [0.08, 0.15, 0.25, 0.4][i],
                  animation: isPaused ? 'none' : `aura-ring ${auraSpeed} ease-out infinite`,
                  animationDelay: `${i * 0.28}s`,
                }} />
              ))}
              {/* Core */}
              <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: `radial-gradient(circle, ${auraColor}50 0%, ${auraColor}15 65%, transparent 100%)`,
                animation: isPaused ? 'none' : `aura-core ${auraSpeed} ease-in-out infinite`,
                boxShadow: `0 0 40px ${auraColor}30`,
              }} />
              {/* Activity label */}
              <span style={{
                position: 'absolute', bottom: 120, fontSize: 10, letterSpacing: 6,
                color: `${auraColor}60`, textTransform: 'uppercase', fontWeight: 600,
              }}>{activityLabel}</span>
            </div>
          );
        })()}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/65 pointer-events-none z-[1]" />

        {/* Finding location overlay — shown until first real GPS fix */}
        {sessionType === 'OUTDOOR' && !sessionGpsAcquired && (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            <div className="bg-black/75 backdrop-blur-xl rounded-3xl px-8 py-6 flex flex-col items-center gap-3 border border-white/10 mx-8">
              <Loader2 size={28} className="text-[#233DFF] animate-spin" />
              <p className="text-white font-medium text-sm text-center">
                {lang === 'es' ? 'Encontrando tu ubicación...' : 'Finding your location...'}
              </p>
              <p className="text-white/40 text-xs text-center">
                {lang === 'es' ? 'Tu sesión ya comenzó' : 'Your session has started'}
              </p>
            </div>
          </div>
        )}

        {/* MILES — large card, upper center */}
        {sessionType === 'OUTDOOR' && (
          <div className="absolute top-5 left-5 right-5 z-20 pointer-events-none">
            <div className="bg-black/55 backdrop-blur-xl rounded-[28px] px-8 py-7 flex flex-col items-center border border-white/5 shadow-2xl">
              <span className="text-[80px] font-black text-white tabular-nums leading-none tracking-tighter">
                {sessionStats.distance.toFixed(2)}
              </span>
              <span className="text-sm font-bold text-[#233DFF] uppercase tracking-[0.35em] mt-2">
                {t.labels.miles}
              </span>
            </div>
          </div>
        )}

        {/* TIME + PACE — combined pill */}
        <div className={`absolute ${sessionType === 'OUTDOOR' ? 'top-[222px]' : 'top-5'} left-5 right-5 z-20 pointer-events-none`}>
          <div className="bg-black/55 backdrop-blur-xl rounded-full px-8 py-4 flex items-center justify-center gap-4 border border-white/5">
            <Clock size={17} className="text-[#233DFF] flex-shrink-0" />
            <span className="text-xl font-bold text-white tabular-nums">{timeStr}</span>
            {sessionType === 'OUTDOOR' && (
              <>
                <div className="w-px h-5 bg-white/25 flex-shrink-0" />
                <Zap size={17} className="text-[#233DFF] flex-shrink-0" fill="currentColor" />
                <span className="text-xl font-bold text-white tabular-nums">{paceStr}</span>
              </>
            )}
            {isBufferingAudio && (
              <>
                <div className="w-px h-5 bg-white/25 flex-shrink-0" />
                <Loader2 size={15} className="text-[#233DFF] animate-spin flex-shrink-0" />
              </>
            )}
          </div>
        </div>

        {/* Bottom Controls */}
        <div
          className="absolute bottom-0 left-0 right-0 px-3 z-20 pointer-events-auto"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', paddingTop: 16 }}
        >
          <div className="bg-black/60 backdrop-blur-xl rounded-[28px] py-4 px-5 flex items-center justify-between gap-4 border border-white/10">
            <button
              onClick={handleStop}
              className="w-14 h-14 flex-shrink-0 bg-white/5 rounded-full border border-white/10 flex items-center justify-center active:scale-95 transition-all"
            >
              <X size={20} className="text-white/60" />
            </button>
            <button
              onClick={togglePause}
              className="w-20 h-20 flex-shrink-0 bg-[#233DFF] rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(35,61,255,0.6)] border border-[#233DFF]/30 active:scale-95 transition-all"
            >
              {isPaused ? <Play size={28} fill="currentColor" className="text-white ml-1" /> : <Pause size={28} fill="currentColor" className="text-white" />}
            </button>
            <div className="flex-shrink-0 flex items-center justify-center" style={{ minWidth: 56 }}>
              {(() => {
                const color = mode === 'HYPE' ? '#ec4899' : mode === 'BREAKTHROUGH' ? '#f97316' : mode === 'STRATEGY' ? '#eab308' : '#233DFF';
                return (
                  <span style={{ color }}
                    className="text-[8px] font-semibold tracking-normal uppercase whitespace-nowrap">
                    {MODES.find(m => m.id === mode)?.label}
                  </span>
                );
              })()}
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
    <div className="flex-1 flex flex-col px-5 py-4 animate-in fade-in bg-white dark:bg-[#121212] min-h-0">
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
              onClick={() => {
                if (!userLocation && !gpsLoading) requestGpsPermission();
                setStep(1);
              }}
              disabled={!targetThought.trim()}
              className="w-full h-14 bg-black dark:bg-white text-white dark:text-black rounded-full font-normal text-base shadow-xl active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-20"
            >
              <Send size={18} />
              {t.onboarding.next}
            </button>
            <button
              onClick={() => {
                setTargetThought('');
                if (!userLocation && !gpsLoading) requestGpsPermission();
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
        <>
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
                    className={`p-3 rounded-2xl text-center transition-all border active:scale-[0.97] ${
                      indoorActivity === act.id
                        ? 'border-[#233DFF] bg-[#233DFF]/5 ring-2 ring-[#233DFF]/10'
                        : 'border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/5'
                    }`}
                  >
                    <span className={`font-medium text-sm block ${indoorActivity === act.id ? 'text-[#233DFF]' : 'dark:text-white'}`}>{act.label}</span>
                    <span className="text-[10px] text-gray-400 block mt-0.5">{act.desc}</span>
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
        </div>

        {/* Go Button — outside scroll container, always visible above tab bar */}
        <button
          onClick={handleStart}
          className="w-full rounded-full bg-[#233DFF] text-white border border-[#233DFF] font-normal h-16 text-base shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 flex-shrink-0 mt-3"
        >
          <Play size={20} fill="currentColor" />
          <span>{lang === 'es' ? 'IR' : 'GO'}</span>
        </button>
        </>
      )}
    </div>
  );
};

export default GuidedWalk;
