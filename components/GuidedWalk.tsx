
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Language, EchoPersona, NarrationFrequency, SessionType, IndoorActivity } from '../types';
import { translations } from '../translations';
import { generateSegmentNarrative, getLocalIntro } from '../geminiService';
import {
  Pause, X, Play, ChevronLeft, Search, Activity, Navigation, Clock, Send, MapPin, Loader2, Zap, Volume2, Gauge
} from 'lucide-react';
import { getAudioContext, destroyAudioContext, startKeepAlive, stopKeepAlive, requestWakeLock as sharedRequestWakeLock, releaseWakeLock as sharedReleaseWakeLock, fullCleanup, setSessionResumeCallback, clearSessionResumeCallback, pauseKeepAliveAudio, resumeKeepAliveAudio, updateMediaSessionMetadata } from '../audioManager';
import { saveSession, getStreak, getWeekStats } from '../sessionHistory';
import type { SessionRecord } from '../types';

declare const google: any;

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1a1f2e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1f2e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8fa8' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#2c3347' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#1a1f2e' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1f2535' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2e3450' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a1f2e' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a4568' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#252e4a' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1f2535' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1520' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#1a2a3a' }] },
];

let _mapsApiPromise: Promise<void> | null = null;
const ensureGoogleMaps = (): Promise<void> => {
  if ((window as any).google?.maps?.Map) return Promise.resolve();
  if (_mapsApiPromise) return _mapsApiPromise;
  _mapsApiPromise = new Promise((resolve, reject) => {
    // Key is injected at runtime by nginx via public/config.js (Cloud Run env var).
    // On GitHub Pages, config.js is empty — map shows watermark; coaching audio still works.
    const key = (window as any).GOOGLE_MAPS_API_KEY || '';
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
  const [lastSpokenText, setLastSpokenText] = useState('');
  const [isCheckInLoading, setIsCheckInLoading] = useState(false);
  const [displaySpeedMph, setDisplaySpeedMph] = useState<number | null>(null);
  const [sessionGpsAcquired, setSessionGpsAcquired] = useState(false);
  const [showMoodCheck, setShowMoodCheck] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const pendingSessionRef = useRef<{ path: [number, number][]; stats: { distance: number; time: number; pace: string } } | null>(null);
  // True while the background movement-narrative fetch is in-flight — narrationLoop
  // retries every 2s instead of making duplicate per-segment API calls during that window.
  const narrativePendingRef = useRef(false);
  const preBufferTimeoutRef = useRef<any>(null);
  const summaryMapContainerRef = useRef<HTMLDivElement>(null);
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
  // Mirrors isPlaying synchronously (set at every setIsPlaying call site) so the map
  // effect cleanup can tell a real session-end teardown apart from a benign re-run.
  const isPlayingRef = useRef(false);
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
  const coachingHistoryRef = useRef<string[]>([]);
  const isCheckInLoadingRef = useRef(false);
  // Track all in-flight TTS AbortControllers so we can cancel them on unmount,
  // preventing audio from playing after the component is gone.
  const activeTtsControllersRef = useRef<Set<AbortController>>(new Set());
  // Rolling window of recent GPS samples: [{distMi, timestampMs}] for pace calculation.
  // Using a 60-second window gives a smooth, responsive pace that reflects current speed
  // rather than the whole-session average (which reads wrong at the start and end).
  const recentGpsSamplesRef = useRef<{ distMi: number; ts: number }[]>([]);

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

  // Notify App.tsx when immersive mode (active walk, no summary) starts or ends
  useEffect(() => {
    onImmersiveChange?.(isPlaying && !showSummary);
    return () => onImmersiveChange?.(false);
  }, [isPlaying, showSummary, onImmersiveChange]);

  // Pre-warm: generate intro text AND pre-fetch TTS audio bytes on step 0 and 1.
  // Narrative API takes ~15s; starting on step 0 gives 15+ extra seconds so
  // GO almost always hits the fast path (decoded audio, <200ms playback).
  useEffect(() => {
    if (step > 1) return; // fire on both step 0 and step 1
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
      userLat: userLocation?.[0] != null ? Math.round(userLocation[0] * 100) / 100 : undefined,
      userLng: userLocation?.[1] != null ? Math.round(userLocation[1] * 100) / 100 : undefined,
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

  // Wrapper that calls generateSegmentNarrative, injects coaching history to prevent
  // repetition, then tracks the returned text so future segments stay fresh.
  const genAndTrack = useCallback(async (params: Parameters<typeof generateSegmentNarrative>[0]) => {
    const text = await generateSegmentNarrative({
      ...params,
      coachingHistory: coachingHistoryRef.current.slice(-8),
    });
    if (text) {
      coachingHistoryRef.current = [...coachingHistoryRef.current, text].slice(-10);
      setLastSpokenText(text);
    }
    return text;
  }, []);

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

          // Capture altitude for uphill/downhill detection.
          // GPS altitude on mobile is noisy (3-10 m per reading). Only track meaningful
          // changes: require a 3 m delta before updating elevationDelta, and only send
          // incline cues to the coach when the cumulative change exceeds 10 m (prevents
          // flat-walk false positives from noisy barometric/GPS altitude data).
          if (pos.coords.altitude !== null) {
            const alt = pos.coords.altitude;
            if (lastElevationRef.current !== null) {
              const delta = alt - lastElevationRef.current;
              // Only record a delta when the change is large enough to be real movement,
              // not GPS noise. 3 m is the practical floor for consumer GPS altitude accuracy.
              if (Math.abs(delta) >= 3) {
                elevationDeltaRef.current = delta;
                if (delta > 3) elevationGainRef.current += delta; // only count meaningful climbs
                lastElevationRef.current = alt;
              }
              // If the change is below threshold, do not update lastElevationRef so that
              // small drifts don't accumulate and trigger false incline readings.
            } else {
              lastElevationRef.current = alt;
            }
          }
          // Capture speed (m/s → mph)
          if (pos.coords.speed !== null && pos.coords.speed >= 0) {
            currentSpeedRef.current = pos.coords.speed * 2.237;
            setDisplaySpeedMph(pos.coords.speed * 2.237);
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
          // Track path only with accurate GPS (<=30m) — cell-tower fixes (500m+) corrupt the
          // route and produce wildly wrong pace readings. 30m is the practical ceiling for a
          // reliable outdoor GPS fix; fixes in the 30-50m range are marginal (urban canyon,
          // dense tree cover) and add noise to both route polyline and pace calculations.
          if (isNarratingRef.current && !isPausedRef.current && accuracy <= 30) {
            const last = pathCoordsRef.current[pathCoordsRef.current.length - 1];
            if (last) {
              const R = 3958.8;
              const dLat = (newLoc[0] - last[0]) * Math.PI / 180;
              const dLon = (newLoc[1] - last[1]) * Math.PI / 180;
              const a = Math.sin(dLat/2)**2 + Math.cos(last[0]*Math.PI/180)*Math.cos(newLoc[0]*Math.PI/180)*Math.sin(dLon/2)**2;
              const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              // Also require GPS receiver's own velocity > 0.2 mph when available,
              // since the receiver's Doppler-based speed is more accurate than position deltas.
              const gpsSpeedMph = pos.coords.speed !== null && pos.coords.speed >= 0
                ? pos.coords.speed * 2.237 : null;
              const isActuallyMoving = gpsSpeedMph === null || gpsSpeedMph > 0.2;
              // Min 0.003mi (~5m) filters stationary drift. Max 0.15mi (~240m) tolerates
              // slow GPS poll intervals without rejecting real movement between fixes.
              if (dist > 0.003 && dist < 0.15 && isActuallyMoving) {
                // Cap path at 10,000 points (~30 hours continuous walking) to prevent
                // memory pressure and slow polyline redraws on very long sessions.
                if (pathCoordsRef.current.length < 10000) {
                  pathCoordsRef.current.push(newLoc);
                }
                if (pathRef.current) pathRef.current.setPath(pathCoordsRef.current.map(([lat, lng]: [number, number]) => ({ lat, lng })));
                lastPositionRef.current = newLoc;
                lastGPSMovementRef.current = Date.now();
                // Record this sample for rolling pace window
                recentGpsSamplesRef.current.push({ distMi: dist, ts: Date.now() });
                setSessionStats(prev => ({ ...prev, distance: prev.distance + dist }));
              }
            } else {
              // Only seed the path with the first GPS fix if it's reasonably accurate (<=30m).
              // This matches the ongoing tracking threshold so the seed fix is always of the
              // same quality as subsequent fixes — prevents phantom lines caused by a coarse
              // first fix followed by a large jump when the real GPS signal arrives.
              if (accuracy <= 30) {
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
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
      // Fallback: if GPS hasn't resolved in 25s, unblock GO anyway
      gpsTimeoutRef.current = setTimeout(() => {
        setGpsLoading(false);
        gpsTimeoutRef.current = null;
      }, 25000);
  };

  // Warm up Cloud Run TTS and narrative endpoints on mount so first GO is fast.
  useEffect(() => {
    const base = 'https://volunteer.healthmatters.clinic/api/calmkit';
    fetch(`${base}/tts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'ready', lang, voice: 'Orus' }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => {});
    fetch(`${base}/movement-narrative`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'HOPE', activity: 'WALK', lang, isIntro: true, isFirstSegment: true }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => {});
  }, []);

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
      if (preBufferTimeoutRef.current) clearTimeout(preBufferTimeoutRef.current);
      isNarratingRef.current = false;
      audioBufferQueue.current = [];
      nextCueRef.current = null;
      nextCueFetchingRef.current = false;
      // Cancel all in-flight TTS fetches so audio does not play after unmount
      activeTtsControllersRef.current.forEach(c => { try { c.abort(); } catch (_) {} });
      activeTtsControllersRef.current.clear();
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
  // Synchronous re-entrancy lock for narrationLoop. narrationLoop is async and has multiple
  // await points before it sets currentSourceRef; without this lock two concurrent callers
  // (check-in, look-ahead wake-up, onended, resume callback, togglePause) can both clear the
  // entry guard and start two AudioBufferSourceNodes at once — the cause of overlapping voice
  // cues. Claimed atomically at the top of narrationLoop before any await; released on every
  // exit path and once playback ownership transfers to currentSourceRef.
  const narrationLoopActiveRef = useRef(false);
  const fallbackIntroPlayedRef = useRef(false);
  const closingPlayedRef = useRef(false);

  // ── Look-ahead buffer: pre-fetch the NEXT cue while the CURRENT one plays ──
  // Stores { text, buffer } for the next cue so it's ready the instant the
  // current audio ends, eliminating the 10-25s silence in CONTINUOUS mode.
  const nextCueRef = useRef<{ text: string; buffer: AudioBuffer | null } | null>(null);
  // True while a background look-ahead fetch is in progress — prevents duplicate fetches.
  const nextCueFetchingRef = useRef(false);
  // Stable ref to narrationLoop — allows startLookAhead to call narrationLoop without
  // a circular useCallback dependency (narrationLoop is assigned below).
  const narrationLoopRef = useRef<() => Promise<void>>(async () => {});

  // Helper: determine what the NEXT narrative cue text will be without advancing
  // the segment index. Used to pre-fetch TTS while the current segment plays.
  // Returns null if look-ahead isn't applicable (e.g. closing, exhausted, etc.).
  const peekNextNarrativeCue = (): string | null => {
    const narrative = narrativeDataRef.current;
    if (!narrative?.segments) return null;
    const nextIdx = narrativeSegmentIndexRef.current; // index is already advanced when current plays
    if (nextIdx < narrative.segments.length) {
      const seg = narrative.segments[nextIdx];
      return Array.isArray(seg.scriptBeats) ? seg.scriptBeats.filter(Boolean).join(' ') : String(seg);
    }
    // Next up would be sponsor or closing — return their text for pre-fetch
    if (!sponsorPlayedRef.current && narrative.spokenSponsorMoment) {
      return narrative.spokenSponsorMoment;
    }
    if (narrative.closingTemplate && sponsorPlayedRef.current && !closingPlayedRef.current) {
      return narrative.closingTemplate;
    }
    return null;
  };

  // Kick off a background look-ahead fetch for the next cue.
  // Only runs in CONTINUOUS mode. No-ops if already fetching or already have a buffered cue.
  // Uses narrationLoopRef to avoid a circular useCallback dependency.
  const startLookAhead = useCallback(() => {
    if (narrationFreqRef.current !== 'CONTINUOUS') return;
    if (nextCueFetchingRef.current || nextCueRef.current) return;
    if (!isNarratingRef.current) return;

    nextCueFetchingRef.current = true;
    (async () => {
      try {
        let text: string | null = null;

        // Only pre-fetch dynamic cues — never peek at the structured narrative.
        // The structured narrative plays itself in sequence; peeking double-plays segments.
        // Look-ahead only activates once the narrative is fully exhausted and cleared.
        if (!narrativePendingRef.current && !narrativeDataRef.current) {
          text = await genAndTrack({
            mode,
            activity: (sessionType === 'INDOOR' ? (indoorActivityRef.current || 'STRETCH') : 'WALK') as any,
            lang,
            stats: sessionStatsRef.current,
            isIntro: false,
            isFirstSegment: false,
            segmentNumber: segmentCounterRef.current + 1,
            destinationName: destinationNameRef.current || undefined,
            targetThought: targetThoughtRef.current || undefined,
            indoorActivity: sessionType === 'INDOOR' ? (indoorActivityRef.current || undefined) : undefined,
            userLat: userLocationRef.current?.[0] != null ? Math.round(userLocationRef.current[0] * 100) / 100 : undefined,
            userLng: userLocationRef.current?.[1] != null ? Math.round(userLocationRef.current[1] * 100) / 100 : undefined,
            ...envDataRef.current,
            ...(elevationGainRef.current > 0 && { elevationGain: elevationGainRef.current }),
            ...(elevationDeltaRef.current !== null && Math.abs(elevationDeltaRef.current) >= 10 && { elevationDelta: elevationDeltaRef.current }),
            ...(currentSpeedRef.current !== null && { speed: currentSpeedRef.current }),
          });
        } else {
          // Narrative still active — nothing to pre-fetch
          nextCueFetchingRef.current = false;
          return;
        }

        if (!text || !isNarratingRef.current) { nextCueFetchingRef.current = false; return; }

        // Pre-synthesize TTS so audio is ready to play immediately.
        // prefetch=true: if TTS fails, do NOT start Web Speech now (would overlap the
        // currently playing cue) — return null and let narrationLoop handle the gap.
        const buf = await speakText(text, 22000, true);
        if (!isNarratingRef.current) { nextCueFetchingRef.current = false; return; }

        nextCueRef.current = { text, buffer: buf };
        nextCueFetchingRef.current = false;

        // If narrationLoop is idle waiting for us, wake it up via the stable ref
        if (!currentSourceRef.current && !isFetchingRef.current && isNarratingRef.current && !isPausedRef.current) {
          narrationLoopRef.current();
        }
      } catch {
        nextCueFetchingRef.current = false;
      }
    })();
  }, [mode, lang, sessionType, genAndTrack]);

  const narrationLoop = useCallback(async () => {
    if (!isNarratingRef.current || isPausedRef.current) return;
    if (isFetchingRef.current || currentSourceRef.current) return;
    // Claim the synchronous lock BEFORE the first await so no second invocation can slip
    // past the guards above while this one is mid-await (prevents two cues playing at once).
    if (narrationLoopActiveRef.current) return;
    narrationLoopActiveRef.current = true;

    try {

    if (audioCtxRef.current?.state === 'suspended') {
      await audioCtxRef.current.resume();
    }

    if (audioBufferQueue.current.length === 0) {
      // ── Fast path: consume the pre-fetched look-ahead cue ──────────────────
      if (nextCueRef.current) {
        const { text, buffer } = nextCueRef.current;
        nextCueRef.current = null;
        if (text) {
          setLastSpokenText(text);
          // Note: text was already added to coachingHistoryRef during look-ahead fetch
        }
        if (buffer) {
          audioBufferQueue.current.push(buffer);
        } else {
          // Pre-fetch TTS failed (prefetch mode suppresses Web Speech to avoid overlap), so
          // there is no audio to play and nothing is currently speaking. Retry shortly — the
          // cold-start path below will generate a fresh dynamic cue. Release the lock first.
          narrationLoopActiveRef.current = false;
          setTimeout(() => narrationLoopRef.current(), 800);
          return;
        }
      } else if (nextCueFetchingRef.current && !narrativeDataRef.current && !narrativePendingRef.current) {
        // Look-ahead is in progress and there is nothing else to play right now —
        // wait for it rather than starting a duplicate fetch. The look-ahead will also
        // call narrationLoop when it completes, so no cue will be lost.
        // If the narrative has already arrived (narrativeDataRef) or a bridge is
        // available (narrativePendingRef), fall through to cold start immediately.
        setTimeout(narrationLoop, 500);
        return;
      } else {
        // ── No look-ahead available (or narrative/bridge already ready) — cold start ──
        const narrative = narrativeDataRef.current;
        if (narrative && narrative.segments) {
          const idx = narrativeSegmentIndexRef.current;
          if (idx < narrative.segments.length) {
            const seg = narrative.segments[idx];
            isFetchingRef.current = true;
            setIsBufferingAudio(true);
            const text = Array.isArray(seg.scriptBeats) ? seg.scriptBeats.filter(Boolean).join(' ') : String(seg);
            narrativeSegmentIndexRef.current = idx + 1;
            if (text.trim()) {
              setLastSpokenText(text);
              coachingHistoryRef.current = [...coachingHistoryRef.current, text].slice(-10);
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
          } else if (closingPlayedRef.current && idx >= narrative.segments.length) {
            // Structured narrative fully exhausted — clear so dynamic cues take over.
            narrativeDataRef.current = null;
          }
        } else {
          // If the background full-narrative fetch is still in-flight, play a bridge cue
          // from the local instant library rather than waiting silently for up to 15s.
          if (narrativePendingRef.current) {
            const hour = new Date().getHours();
            const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
            const bridgeText = getLocalIntro({ mode, lang, timeOfDay: tod, targetThought: targetThoughtRef.current || undefined });
            if (bridgeText && isNarratingRef.current) {
              isFetchingRef.current = true;
              setIsBufferingAudio(true);
              coachingHistoryRef.current = [...coachingHistoryRef.current, bridgeText].slice(-10);
              setLastSpokenText(bridgeText);
              const buf = await speakText(bridgeText);
              isFetchingRef.current = false;
              setIsBufferingAudio(false);
              if (buf && isNarratingRef.current) audioBufferQueue.current.push(buf);
              // After playing bridge, retry narrationLoop — narrative may be ready by then
            } else {
              setTimeout(narrationLoop, 2000);
              return;
            }
          } else {
            isFetchingRef.current = true;
            setIsBufferingAudio(true);
            segmentCounterRef.current++;
            const isIntro = !fallbackIntroPlayedRef.current;
            fallbackIntroPlayedRef.current = true;
            const segment = await genAndTrack({
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
              userLat: userLocationRef.current?.[0] != null ? Math.round(userLocationRef.current[0] * 100) / 100 : undefined,
              userLng: userLocationRef.current?.[1] != null ? Math.round(userLocationRef.current[1] * 100) / 100 : undefined,
              ...envDataRef.current,
              ...(elevationGainRef.current > 0 && { elevationGain: elevationGainRef.current }),
              ...(elevationDeltaRef.current !== null && Math.abs(elevationDeltaRef.current) >= 10 && { elevationDelta: elevationDeltaRef.current }),
              ...(currentSpeedRef.current !== null && { speed: currentSpeedRef.current }),
            });
            if (!sponsorPlayedRef.current) sponsorPlayedRef.current = true;
            const buffer = await speakText(segment);
            isFetchingRef.current = false;
            if (buffer) audioBufferQueue.current.push(buffer);
            setIsBufferingAudio(false);
          }
        }
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

      // As soon as this cue STARTS playing, kick off look-ahead for the next one.
      // This gives the full duration of the current cue for pre-fetch + TTS synthesis,
      // so the next cue is ready to play the instant this one ends (zero gap).
      if (narrationFreqRef.current === 'CONTINUOUS') {
        startLookAhead();
      }

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

          if (preBufferTimeoutRef.current) clearTimeout(preBufferTimeoutRef.current);
          preBufferTimeoutRef.current = setTimeout(async () => {
            preBufferTimeoutRef.current = null;
            if (!isNarratingRef.current) return;
            isReturningRef.current = true;
            const stats = sessionStatsRef.current;
            const seg = await genAndTrack({
              mode, activity: sessionType === 'INDOOR' ? (indoorActivityRef.current || 'STRETCH') : 'WALK', lang, stats,
              isIntro: false, isFirstSegment: false, isReturning: true,
              segmentNumber: segmentCounterRef.current,
              indoorActivity: indoorActivityRef.current || undefined,
              destinationName: destinationNameRef.current || undefined,
              targetThought: targetThoughtRef.current || undefined,
              ...envDataRef.current,
              ...(elevationGainRef.current > 0 && { elevationGain: elevationGainRef.current }),
              ...(elevationDeltaRef.current !== null && Math.abs(elevationDeltaRef.current) >= 10 && { elevationDelta: elevationDeltaRef.current }),
              ...(currentSpeedRef.current !== null && { speed: currentSpeedRef.current }),
            });
            const buf = await speakText(seg);
            if (buf && isNarratingRef.current) audioBufferQueue.current.push(buf);
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
    } else {
      setTimeout(narrationLoop, 1000);
    }

    } finally {
      // Release the lock. Once playback has started, currentSourceRef.current is the guard
      // that blocks re-entry until onended fires; on every early/return path the lock is
      // freed here so the next legitimate narrationLoop call can proceed.
      narrationLoopActiveRef.current = false;
    }
  }, [mode, lang, sessionType, startLookAhead]);

  // Keep narrationLoopRef in sync so startLookAhead can call the latest version
  // without creating a circular useCallback dependency.
  narrationLoopRef.current = narrationLoop;

  // Screen-lock recovery: when iOS resumes the AudioContext (via lock-screen play button
  // or visibilitychange), the playing AudioBufferSourceNode has died silently without
  // firing onended. Clear the stale ref and restart the narration loop.
  useEffect(() => {
    if (!isPlaying) {
      clearSessionResumeCallback();
      return;
    }
    clearSessionResumeCallback(); // always clear stale callback before registering new one
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

  // GPS screen-sleep recovery: on iOS/Android PWA, watchPosition stops delivering
  // updates when the screen sleeps. When the user returns (visibilitychange → visible),
  // clear the dead watch and start a fresh one so tracking resumes immediately.
  // This effect is only active during an outdoor walk (isPlaying + OUTDOOR).
  useEffect(() => {
    if (!isPlaying || sessionType !== 'OUTDOOR') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.geolocation) {
        // Clear the old watch — it may have silently stopped delivering updates.
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        // Restart the watch so we get fresh GPS fixes immediately.
        startGpsWatch();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, sessionType]);

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
          const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          userLocationRef.current = loc;  // update ref immediately so handleStart can read it synchronously
          setUserLocation(loc);
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
  // prefetch=true is used by look-ahead / narrative pre-warm: on TTS failure it must NOT
  // start Web Speech immediately (that would speak over the currently playing cue). It
  // returns null instead, leaving playback to the narrationLoop when the cue's turn comes.
  const speakText = async (text: string, timeoutMs = 22000, prefetch = false): Promise<AudioBuffer | null> => {
    const voice = MODES.find(m => m.id === mode)?.voice || 'Kore';

    try {
      const controller = new AbortController();
      // Register controller so unmount cleanup can abort this fetch if component is destroyed
      activeTtsControllersRef.current.add(controller);
      const ttsTimeout = setTimeout(() => controller.abort(), timeoutMs);

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
        activeTtsControllersRef.current.delete(controller);
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
      // Guard: session may have ended while the TTS fetch was in-flight.
      // In prefetch mode, never start Web Speech here — it would talk over the cue that is
      // currently playing. Return null so the caller skips this cue rather than overlapping.
      if (!prefetch && isNarratingRef.current) speakWithWebSpeech(text);
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
        // Clean up Google Maps resources and remove DOM node to prevent map leaking into summary
        // Wrap all .setMap(null) calls in try/catch — if the map was already partially
        // destroyed (e.g. by handleStop), these will throw and must not propagate.
        if (markerRef.current) { try { markerRef.current.setMap(null); } catch(_){} markerRef.current = null; }
        if (destinationMarkerRef.current) { try { destinationMarkerRef.current.setMap(null); } catch(_){} destinationMarkerRef.current = null; }
        if (pathRef.current) { try { pathRef.current.setMap(null); } catch(_){} pathRef.current = null; }
        try {
          const mapDiv = (mapRef.current as any).getDiv?.();
          if (mapDiv?.parentNode) mapDiv.parentNode.removeChild(mapDiv);
        } catch (_) {}
        mapRef.current = null;
      }
      return;
    }

    const hasLocation = !!userLocation;
    const initialCenter = hasLocation
      ? { lat: userLocation![0], lng: userLocation![1] }
      : { lat: 33.9617, lng: -118.3531 };
    const initialZoom = hasLocation ? 16 : 13;
    const capturedDest = destinationCoords;

    let cancelled = false;

    ensureGoogleMaps().then(() => {
      // Re-read the live container ref rather than a value captured at effect-setup time.
      // On a session restart the container div is a fresh DOM node; using the captured
      // reference could render the map into a detached/stale node (blank dark container).
      const container = mapContainerRef.current;
      if (cancelled || !container || mapRef.current) return;
      const gm = (window as any).google.maps;

      // Defensive: clear any leftover child nodes from a prior session's map so the new
      // gm.Map instance initializes into a clean container and is guaranteed to render.
      try { while (container.firstChild) container.removeChild(container.firstChild); } catch (_) {}

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
      // Only tear down the live map when the session is actually ending (unmount or
      // isPlaying → false). On a benign userLocation re-run while still playing, leave the
      // existing map and markers intact — destroying them here would blank the live map on
      // every GPS fix. The next effect run's top guard no-ops because mapRef.current is set.
      if (isPlayingRef.current && mapRef.current) return;
      if (markerRef.current) { try { markerRef.current.setMap(null); } catch(_){} markerRef.current = null; }
      if (destinationMarkerRef.current) { try { destinationMarkerRef.current.setMap(null); } catch(_){} destinationMarkerRef.current = null; }
      if (pathRef.current) { try { pathRef.current.setMap(null); } catch(_){} pathRef.current = null; }
      mapRef.current = null;
    };
  // userLocation is included so that if the map failed to instantiate on the isPlaying
  // transition (e.g. the Maps API was still loading, or the container was momentarily
  // unavailable), the next GPS fix re-runs this effect and recovers — the top guard
  // early-returns once mapRef.current is set, so this is a clean no-op once the map is up.
  }, [isPlaying, userLocation]);

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
    coachingHistoryRef.current = [];
    recentGpsSamplesRef.current = [];
    setLastSpokenText('');
    setDisplaySpeedMph(null);
    audioBufferQueue.current = [];
    narrativeDataRef.current = null;
    narrativeSegmentIndexRef.current = 0;
    narrativePendingRef.current = false;
    segmentCounterRef.current = 0;
    sponsorPlayedRef.current = false;
    isFetchingRef.current = false;
    fallbackIntroPlayedRef.current = false;
    closingPlayedRef.current = false;
    nextCueRef.current = null;
    nextCueFetchingRef.current = false;

    startKeepAlive();
    updateMediaSessionMetadata(
      `CalmKit — ${MODES.find(m => m.id === mode)?.label || 'Guided Session'}`,
      sessionType === 'INDOOR'
        ? (indoorActivity === 'SWEAT' ? 'Strength Session' : indoorActivity === 'FLOW' ? 'Flow Session' : 'Stretch Session')
        : 'Guided Walk'
    );
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

    // Safety net: if GPS hasn't resolved within 30s, clear the overlay anyway so the
    // user isn't permanently blocked by a slow or unavailable signal.
    if (!isIndoor) {
      setTimeout(() => {
        if (!sessionGpsAcquiredRef.current) {
          sessionGpsAcquiredRef.current = true;
          setSessionGpsAcquired(true);
        }
      }, 30000);
    }

    isNarratingRef.current = true;
    isPlayingRef.current = true;
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

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      if (isPausedRef.current) return;
      setSessionStats(prev => {
        const elapsed = (Date.now() - now - pausedDurationRef.current) / 1000;

        // Rolling pace: use the last 60 seconds of GPS samples for a responsive reading.
        // Falls back to whole-session average when insufficient recent data.
        let paceRaw = 0;
        const windowMs = 60000;
        const cutoff = Date.now() - windowMs;
        // Purge samples older than the window
        recentGpsSamplesRef.current = recentGpsSamplesRef.current.filter(s => s.ts >= cutoff);
        const recentSamples = recentGpsSamplesRef.current;
        // Require at least 3 samples so a single noisy fix cannot skew the reading.
        // 2-sample pace is volatile because one bad fix can double or halve the result.
        if (recentSamples.length >= 3) {
          const windowDistMi = recentSamples.reduce((sum, s) => sum + s.distMi, 0);
          const windowSec = (recentSamples[recentSamples.length - 1].ts - recentSamples[0].ts) / 1000;
          if (windowDistMi > 0.01 && windowSec > 10) {
            paceRaw = (windowSec / 60) / windowDistMi;
          }
        } else if (prev.distance > 0.02) {
          // Not enough rolling data yet — use whole-session average (only above 0.02 mi
          // so the very first few seconds of movement don't produce a wild pace reading).
          paceRaw = (elapsed / 60) / prev.distance;
        }

        const mins = Math.floor(paceRaw);
        const secs = Math.floor((paceRaw - mins) * 60);
        const paceStr = paceRaw > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : '0:00';
        return {
          ...prev,
          time: elapsed,
          pace: paceStr,
        };
      });
      // Auto-stop after 10 min with no GPS movement (OUTDOOR + GPS acquired only)
      if (sessionType !== 'INDOOR' && !isPausedRef.current && sessionGpsAcquiredRef.current) {
        const idleSec = (Date.now() - lastGPSMovementRef.current) / 1000;
        if (idleSec > 600) {
          clearInterval(timerIntervalRef.current!);
          timerIntervalRef.current = null;
          isNarratingRef.current = false;
          if (currentSourceRef.current) { try { currentSourceRef.current.stop(); } catch(e) {} }
          // Null map refs BEFORE setIsPlaying(false) so the useEffect([isPlaying]) cleanup
          // branch sees mapRef.current === null and skips, avoiding a redundant (and potentially
          // unsafe) second pass over already-detached map objects.
          if (markerRef.current) { try { markerRef.current.setMap(null); } catch(_){} markerRef.current = null; }
          if (destinationMarkerRef.current) { try { destinationMarkerRef.current.setMap(null); } catch(_){} destinationMarkerRef.current = null; }
          if (pathRef.current) { try { pathRef.current.setMap(null); } catch(_){} pathRef.current = null; }
          if (mapRef.current) {
            try {
              const gm = (window as any).google?.maps;
              if (gm?.event) gm.event.clearInstanceListeners(mapRef.current);
              const mapDiv = (mapRef.current as any).getDiv?.();
              if (mapDiv) {
                mapDiv.style.cssText = 'display:none;position:static;width:0;height:0;overflow:hidden;';
                if (mapDiv.parentNode) mapDiv.parentNode.removeChild(mapDiv);
              }
            } catch (_) {}
            mapRef.current = null;
          }
          setFinalPath([...pathCoordsRef.current]);
          setSessionStats(s => { setFinalStats({ ...s }); return s; });
          isPlayingRef.current = false;
          setIsPlaying(false);
          setIsPaused(false);
          fullCleanup();
          setShowSummary(true);
        }
      }
    }, 1000);

    // Ambient sound disabled — brown noise sounds like static on mobile speakers

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

    // Mark narrative as pending BEFORE starting the intro IIFE so that startLookAhead
    // (triggered by narrationLoop when the intro starts playing) correctly sees the
    // narrative is in-flight and does not fire a redundant genAndTrack call.
    // Must be set here rather than after the IIFE because the fast path (preloaded audio)
    // runs synchronously — narrationLoop is called BEFORE execution returns to the lines
    // after the IIFE, meaning the check fires with narrativePendingRef = false otherwise.
    narrativePendingRef.current = true;

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
          const preloadedText = preloadedIntroTextRef.current;
          preloadedIntroBase64Ref.current = null;
          preloadedIntroTextRef.current = null;
          if (preloadedText) {
            coachingHistoryRef.current = [preloadedText];
            setLastSpokenText(preloadedText);
          }
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
          // Slow path: pre-warmed text if available (movement-narrative took ~15s to
          // generate the full arc, text may be ready even if TTS audio isn't).
          // If nothing is pre-warmed, use local intro (instant) so Gemini TTS voice
          // starts within 3s while the full AI narrative loads in background.
          // The local intro is a varied persona greeting (10+ options per persona),
          // not the repetitive coaching body. Subsequent segments use the full narrative.
          const preloadedText = (preloadKeyRef.current === preKey && preloadedIntroTextRef.current) ? preloadedIntroTextRef.current : null;
          preloadedIntroTextRef.current = null;
          preloadedIntroBase64Ref.current = null;

          const hour2 = new Date().getHours();
          const tod2 = hour2 < 12 ? 'morning' : hour2 < 17 ? 'afternoon' : 'evening';
          const introText = preloadedText ?? getLocalIntro({
            mode, lang, timeOfDay: tod2,
            targetThought: targetThoughtRef.current || undefined,
          });
          if (introText) {
            coachingHistoryRef.current = [introText];
            setLastSpokenText(introText);
          }
          if (!isNarratingRef.current) { isFetchingRef.current = false; return; }
          sponsorPlayedRef.current = true;
          // 20s TTS timeout — gives Cloud Run time to respond even if slightly cold.
          // Web Speech only fires if Gemini TTS genuinely fails after 20s.
          const buf = await speakText(introText, 20000);
          isFetchingRef.current = false;
          if (buf && isNarratingRef.current) audioBufferQueue.current.push(buf);
          setIsBufferingAudio(false);
          narrationLoop();
        }
      } catch {
        isFetchingRef.current = false;
        narrationLoop();
      }
    })();

    // Fetch full 20-minute structured narrative in background (non-blocking)
    // (narrativePendingRef.current = true was already set above, before the intro IIFE)
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
      narrativePendingRef.current = false;
      if (data.success && data.segments && isNarratingRef.current && !narrativeDataRef.current) {
        narrativeDataRef.current = data;
        // Pre-warm TTS for the first narrative segment immediately so narrationLoop
        // can play it ~3s later (no 15s duplicate API call in the gap).
        if (data.segments[0] && isNarratingRef.current) {
          const seg0 = data.segments[0];
          const text = Array.isArray(seg0.scriptBeats) ? seg0.scriptBeats.filter(Boolean).join(' ') : String(seg0);
          narrativeSegmentIndexRef.current = 1; // segment 0 is being fetched
          // prefetch=true: this pre-warm runs while the intro cue may still be playing, so a
          // TTS failure must not start Web Speech here (would overlap). On null, reset the
          // index so narrationLoop re-reads segment 0 and plays it in proper sequence.
          speakText(text, 22000, true).then(buf => {
            if (buf && isNarratingRef.current && audioBufferQueue.current.length < 3) {
              audioBufferQueue.current.push(buf);
              // Wake narrationLoop if nothing is currently playing or fetching
              if (!isFetchingRef.current && !currentSourceRef.current) narrationLoop();
            } else if (!buf) {
              // TTS returned null — reset index so loop reads segment 0 and plays in order
              narrativeSegmentIndexRef.current = 0;
            }
          }).catch(() => { narrativeSegmentIndexRef.current = 0; });
        } else {
          narrativeSegmentIndexRef.current = 0;
        }
      }
    }).catch(e => {
      narrativePendingRef.current = false;
      console.warn('Failed to fetch narrative, using fallback loop:', e);
    });
  };

  const handleStop = () => {
    const _g = (window as any).gtag;
    if (_g) _g('event', 'calmkit_walk_complete', { mode, elapsed_seconds: sessionStats.time, distance_miles: parseFloat(sessionStats.distance.toFixed(2)) });
    // Destroy Google Maps instance immediately — prevents DOM leak where the map
    // stays visible full-screen after the session ends.
    // IMPORTANT: markers/path must be detached BEFORE the map div is removed, and
    // the DOM removal must happen HERE — mapRef.current will already be null by the
    // time the useEffect([isPlaying]) cleanup branch re-runs after setIsPlaying(false).
    if (markerRef.current) { try { markerRef.current.setMap(null); } catch(e) {} markerRef.current = null; }
    if (destinationMarkerRef.current) { try { destinationMarkerRef.current.setMap(null); } catch(e) {} destinationMarkerRef.current = null; }
    if (pathRef.current) { try { pathRef.current.setMap(null); } catch(e) {} pathRef.current = null; }
    if (mapRef.current) {
      try {
        const gm = (window as any).google?.maps;
        if (gm?.event) gm.event.clearInstanceListeners(mapRef.current);
        const mapDiv = (mapRef.current as any).getDiv?.();
        if (mapDiv) {
          // Collapse immediately to prevent any flash of the full-screen map
          mapDiv.style.cssText = 'display:none;position:static;width:0;height:0;overflow:hidden;';
          if (mapDiv.parentNode) mapDiv.parentNode.removeChild(mapDiv);
        }
      } catch (_) {}
      mapRef.current = null;
    }
    // Set flags first so any in-flight async callbacks see the stopped state
    isNarratingRef.current = false;
    narrativePendingRef.current = false;
    isPausedRef.current = false;
    isFetchingRef.current = false;
    audioBufferQueue.current = [];
    nextCueRef.current = null;
    nextCueFetchingRef.current = false;
    // Cancel Web Speech immediately — stops audio that came from the TTS fallback path
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (narrationTimeoutRef.current) { clearTimeout(narrationTimeoutRef.current); narrationTimeoutRef.current = null; }
    if (preBufferTimeoutRef.current) { clearTimeout(preBufferTimeoutRef.current); preBufferTimeoutRef.current = null; }
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch(e) {}
      currentSourceRef.current = null;
    }
    stopAmbience();
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    startMarkerRef.current = null;
    // Close shared AudioContext to prevent audio bleed into other views
    fullCleanup();
    audioCtxRef.current = null;
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsPaused(false);
    pendingSessionRef.current = { path: [...pathCoordsRef.current], stats: { ...sessionStatsRef.current } };
    setShowMoodCheck(true);
  };

  const requestCheckIn = useCallback(async () => {
    if (!isNarratingRef.current || isPausedRef.current || isCheckInLoadingRef.current) return;
    isCheckInLoadingRef.current = true;
    setIsCheckInLoading(true);
    try {
      if (narrationTimeoutRef.current) { clearTimeout(narrationTimeoutRef.current); narrationTimeoutRef.current = null; }
      segmentCounterRef.current++;
      const text = await genAndTrack({
        mode,
        activity: sessionType === 'INDOOR' ? (indoorActivityRef.current || 'STRETCH') : 'WALK',
        lang,
        stats: sessionStatsRef.current,
        isIntro: false, isFirstSegment: false,
        segmentNumber: segmentCounterRef.current,
        indoorActivity: indoorActivityRef.current || undefined,
        destinationName: destinationNameRef.current || undefined,
        targetThought: targetThoughtRef.current || undefined,
        ...envDataRef.current,
        ...(elevationGainRef.current > 0 && { elevationGain: elevationGainRef.current }),
        ...(elevationDeltaRef.current !== null && Math.abs(elevationDeltaRef.current) >= 10 && { elevationDelta: elevationDeltaRef.current }),
        ...(currentSpeedRef.current !== null && { speed: currentSpeedRef.current }),
      });
      // prefetch=true: synthesize the check-in cue WITHOUT starting Web Speech mid-fetch.
      // We then interrupt the current cue and play the check-in buffer ourselves, so the
      // interrupt is atomic and cannot overlap whatever started during the await above.
      const buf = await speakText(text, 22000, true);
      if (buf && isNarratingRef.current && !isPausedRef.current) {
        // Atomically interrupt anything that may have started playing during the awaits.
        if (currentSourceRef.current) { try { currentSourceRef.current.stop(); } catch (_) {} currentSourceRef.current = null; }
        if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
        // Drop any buffered/look-ahead cues so the check-in plays next with nothing queued behind it.
        nextCueRef.current = null;
        nextCueFetchingRef.current = false;
        audioBufferQueue.current = [buf];
        narrationLoop();
      }
    } catch (_) {} finally {
      isCheckInLoadingRef.current = false;
      setIsCheckInLoading(false);
    }
  }, [mode, lang, sessionType]);

  const togglePause = () => {
    const newPaused = !isPaused;
    setIsPaused(newPaused);
    isPausedRef.current = newPaused;
    if (newPaused) {
      pauseStartRef.current = Date.now();
      // Stop the active audio source immediately
      if (currentSourceRef.current) {
        try { currentSourceRef.current.stop(); } catch(e) {}
        currentSourceRef.current = null;
      }
      if (narrationTimeoutRef.current) { clearTimeout(narrationTimeoutRef.current); narrationTimeoutRef.current = null; }
      // Clear the narration loop lock so it is not stuck after the source was force-stopped.
      // Any in-flight TTS fetch will find isPausedRef.current === true and bail before playing.
      narrationLoopActiveRef.current = false;
      // Discard any pre-fetched look-ahead and the audio buffer queue so that data from a
      // fetch that completes while paused does not trigger an extra playback on resume.
      nextCueRef.current = null;
      nextCueFetchingRef.current = false;
      audioBufferQueue.current = [];
      // Mark fetching as done — any in-flight fetch will see isPausedRef and not enqueue
      isFetchingRef.current = false;
      if (bgGainRef.current && audioCtxRef.current) {
        bgGainRef.current.gain.linearRampToValueAtTime(0.02, audioCtxRef.current.currentTime + 0.3);
      }
      audioCtxRef.current?.suspend();
    } else {
      if (pauseStartRef.current !== null) {
        pausedDurationRef.current += Date.now() - pauseStartRef.current;
        pauseStartRef.current = null;
      }
      // Wait for the AudioContext to fully resume before starting narration, to avoid
      // the narrationLoop seeing a suspended context and bailing immediately.
      const ctx = audioCtxRef.current;
      if (ctx) {
        ctx.resume().then(() => {
          if (!isPausedRef.current && isNarratingRef.current) {
            if (narrationFreqRef.current === 'CONTINUOUS') raiseAmbience();
            narrationLoop();
          }
        }).catch(() => {
          if (!isPausedRef.current && isNarratingRef.current) narrationLoop();
        });
      } else {
        if (narrationFreqRef.current === 'CONTINUOUS') raiseAmbience();
        narrationLoop();
      }
    }
  };

  // Initialize Google Map in session summary so users see real streets + their route
  useEffect(() => {
    if (!showSummary || sessionType !== 'OUTDOOR' || finalPath.length < 2) return;
    let cancelled = false;
    ensureGoogleMaps().then(() => {
      if (cancelled || !summaryMapContainerRef.current) return;
      const gm = (window as any).google.maps;
      const map = new gm.Map(summaryMapContainerRef.current, {
        zoom: 15,
        mapTypeId: 'roadmap',
        disableDefaultUI: true,
        gestureHandling: 'greedy',
        styles: DARK_MAP_STYLE,
      });
      const bounds = new gm.LatLngBounds();
      const path = finalPath.map(([lat, lng]: [number, number]) => {
        bounds.extend({ lat, lng });
        return { lat, lng };
      });
      new gm.Polyline({ map, path, strokeColor: '#233DFF', strokeWeight: 5, strokeOpacity: 1,
        icons: [{ icon: { path: gm.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, fillColor: '#233DFF', fillOpacity: 0.7, strokeColor: '#fff', strokeWeight: 1 }, offset: '100%' }],
      });
      new gm.Marker({ map, position: path[0], icon: { path: gm.SymbolPath.CIRCLE, scale: 8, fillColor: '#233DFF', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 } });
      new gm.Marker({ map, position: path[path.length - 1], icon: { path: gm.SymbolPath.CIRCLE, scale: 8, fillColor: '#ffffff', fillOpacity: 1, strokeColor: '#233DFF', strokeWeight: 2 } });
      map.fitBounds(bounds, { top: 32, right: 32, bottom: 32, left: 32 });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [showSummary, finalPath, sessionType]);

  // ══════════════════════════════════════════════
  // RENDER: Post-session Mood Check
  // ══════════════════════════════════════════════
  if (showMoodCheck) {
    const MOOD_OPTIONS = [
      { value: 1, label: lang === 'es' ? 'Mucho peor' : 'Much worse', color: '#ef4444' },
      { value: 2, label: lang === 'es' ? 'Algo peor' : 'Slightly worse', color: '#f97316' },
      { value: 3, label: lang === 'es' ? 'Igual' : 'About the same', color: '#6b7280' },
      { value: 4, label: lang === 'es' ? 'Mejor' : 'Better', color: '#22c55e' },
      { value: 5, label: lang === 'es' ? 'Mucho mejor' : 'Much better', color: '#3b82f6' },
    ];
    const completeMoodCheck = (moodValue: number) => {
      const durationSec = Math.round(pendingSessionRef.current?.stats.time ?? 0);
      const distanceMi = pendingSessionRef.current?.stats.distance ?? 0;
      const record: SessionRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date: new Date().toISOString(),
        mode,
        sessionType,
        durationSeconds: durationSec,
        distanceMiles: distanceMi,
        moodAfter: moodValue,
      };
      saveSession(record);
      // Fire GA event so improvement is trackable in analytics
      const _g = (window as any).gtag;
      if (_g) {
        const streak = getStreak();
        const week = getWeekStats();
        _g('event', 'calmkit_mood_checkin', {
          mood_rating: moodValue,
          mode,
          session_type: sessionType,
          duration_seconds: durationSec,
          distance_miles: parseFloat(distanceMi.toFixed(2)),
          streak_days: streak,
          sessions_this_week: week.count,
          lang,
        });
      }
      if (pendingSessionRef.current) {
        setFinalPath(pendingSessionRef.current.path);
        setFinalStats(pendingSessionRef.current.stats);
      }
      setShowMoodCheck(false);
      setShowSummary(true);
    };
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 bg-[#0A0A0A]">
        <div className="space-y-2 text-center mb-10">
          <h2 className="text-3xl font-normal text-white font-display">
            {lang === 'es' ? 'Revisa contigo' : 'Check in with yourself'}
          </h2>
          <p className="text-sm text-white/40 leading-snug">
            {lang === 'es' ? 'Comparado con cuando empezaste, ¿cómo te sientes?' : 'Compared to when you started, how do you feel?'}
          </p>
        </div>
        <div className="w-full grid grid-cols-5 gap-3 mb-10">
          {MOOD_OPTIONS.map(m => (
            <button
              key={m.value}
              onClick={() => completeMoodCheck(m.value)}
              className="flex flex-col items-center gap-2 active:scale-95 transition-all"
            >
              <div
                className="w-12 h-12 rounded-full border-2 flex items-center justify-center"
                style={{ borderColor: m.color, background: m.color + '22' }}
              >
                <span className="text-base font-bold" style={{ color: m.color }}>{m.value}</span>
              </div>
              <span className="text-[9px] font-medium text-white/35 text-center leading-tight uppercase tracking-wide">{m.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => completeMoodCheck(3)}
          className="text-sm text-white/20 font-medium tracking-wide"
        >
          {lang === 'es' ? 'Saltar' : 'Skip'}
        </button>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // RENDER: Session Summary
  // ══════════════════════════════════════════════
  if (showSummary) {
    const mins = Math.floor(finalStats.time / 60);
    const secs = Math.floor(finalStats.time % 60);

    const hasRoute = sessionType === 'OUTDOOR' && finalPath.length >= 2;

    return (
      <div className="flex-1 flex flex-col items-center px-6 py-8 bg-white dark:bg-[#121212] animate-in fade-in text-center gap-6 overflow-y-auto">
        <div className="space-y-1 pt-2">
          <h2 className="text-3xl font-normal tracking-normal dark:text-white font-display">{t.labels.sessionSummary}</h2>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{hasRoute ? t.labels.sessionSummaryDesc : (lang === 'es' ? 'SESIÓN COMPLETADA' : 'SESSION COMPLETE')}</p>
        </div>

        {hasRoute ? (
          <div ref={summaryMapContainerRef} className="w-full rounded-2xl overflow-hidden border border-white/5" style={{ height: 220 }} />
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
    const modeColor = mode === 'HYPE' ? '#ec4899' : mode === 'BREAKTHROUGH' ? '#f97316' : mode === 'STRATEGY' ? '#eab308' : '#233DFF';
    const modeName = MODES.find(m => m.id === mode)?.label ?? mode;
    const phase = elapsed < 180 ? 'WARMUP' : elapsed < 600 ? 'ACTIVE' : 'PEAK';
    const speedStr = displaySpeedMph !== null && displaySpeedMph > 0.1 ? displaySpeedMph.toFixed(1) : '--';

    return (
      <div className="flex-1 relative overflow-hidden bg-[#0A0A0A] dark-map">
        {/* Map — full screen background */}
        {sessionType === 'OUTDOOR' && <div ref={mapContainerRef} className="absolute inset-0 z-0" />}

        {/* Indoor aura visualization */}
        {sessionType === 'INDOOR' && (() => {
          const auraColor = modeColor;
          const auraSpeed = indoorActivity === 'SWEAT' ? '0.85s' : indoorActivity === 'FLOW' ? '2.2s' : '3.8s';
          const auraScale = indoorActivity === 'SWEAT' ? 1.45 : indoorActivity === 'FLOW' ? 1.2 : 1.1;
          const ringCount = phase === 'PEAK' ? 4 : phase === 'ACTIVE' ? 3 : 2;
          const ringSizes = [300, 230, 165, 110];
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
              <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: `radial-gradient(circle, ${auraColor}50 0%, ${auraColor}15 65%, transparent 100%)`,
                animation: isPaused ? 'none' : `aura-core ${auraSpeed} ease-in-out infinite`,
                boxShadow: `0 0 40px ${auraColor}30`,
              }} />
            </div>
          );
        })()}

        {/* Heavy gradient at bottom so stat cards are always readable over map */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/95 pointer-events-none z-[1]" />

        {/* LIVE badge — top left, outdoor only */}
        {sessionType === 'OUTDOOR' && (
          <div className="absolute top-5 left-5 z-20 flex items-center gap-1.5 bg-black/55 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/10 pointer-events-none">
            <div className="w-2 h-2 rounded-full bg-[#233DFF] animate-pulse" />
            <span className="text-[10px] font-semibold tracking-[0.2em] text-white/70 uppercase">Live</span>
          </div>
        )}

        {/* Phase badge — indoor only, top center */}
        {sessionType === 'INDOOR' && (
          <div className="absolute top-5 left-0 right-0 z-20 flex justify-center pointer-events-none">
            <span className="text-[10px] font-bold tracking-[0.35em] uppercase" style={{ color: modeColor + 'aa' }}>{phase}</span>
          </div>
        )}

        {/* Finding location overlay */}
        {sessionType === 'OUTDOOR' && !sessionGpsAcquired && (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            <div className="bg-black/75 backdrop-blur-xl rounded-3xl px-8 py-6 flex flex-col items-center gap-3 border border-white/10 mx-8">
              <Loader2 size={28} className="text-[#233DFF] animate-spin" />
              <p className="text-white font-medium text-sm text-center">
                {lang === 'es' ? 'Encontrando tu ubicación...' : 'Finding your location...'}
              </p>
              <p className="text-white/40 text-xs text-center">
                {gpsAccuracy !== null && gpsAccuracy > 100
                  ? (lang === 'es' ? 'Poca precisión. Sal al exterior para mejor seguimiento.' : 'Low accuracy. Move outdoors for better tracking.')
                  : (lang === 'es' ? 'Tu sesión ya comenzó' : 'Your session has started')}
              </p>
            </div>
          </div>
        )}

        {/* End-session confirmation overlay — prevents accidental tap on X */}
        {showEndConfirm && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-[#161616] border border-white/10 rounded-3xl px-7 py-7 mx-6 flex flex-col items-center gap-5">
              <p className="text-white text-base font-medium text-center leading-snug">
                {lang === 'es' ? 'Terminar esta sesión?' : 'End this session?'}
              </p>
              <p className="text-white/40 text-xs text-center leading-relaxed">
                {lang === 'es' ? 'Tu progreso se guardará.' : 'Your progress will be saved.'}
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowEndConfirm(false)}
                  className="flex-1 h-12 rounded-full bg-white/10 border border-white/15 text-white/70 text-sm font-medium active:scale-95 transition-all"
                >
                  {lang === 'es' ? 'Seguir' : 'Keep going'}
                </button>
                <button
                  onClick={() => { setShowEndConfirm(false); handleStop(); }}
                  className="flex-1 h-12 rounded-full bg-white text-black text-sm font-medium active:scale-95 transition-all"
                >
                  {lang === 'es' ? 'Terminar' : 'End walk'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BOTTOM PANEL — stat grid + coaching card + controls */}
        <div
          className="absolute bottom-0 left-0 right-0 z-20 pointer-events-auto"
          style={{ paddingBottom: 'calc(max(env(safe-area-inset-bottom), 16px) + 8px)' }}
        >
          <div className="mx-3 flex flex-col gap-2">

            {/* STAT CARDS — 4-col grid for outdoor, 2-col for indoor */}
            {sessionType === 'OUTDOOR' ? (
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-black/55 backdrop-blur-xl rounded-[16px] p-2.5 flex flex-col gap-1 border border-white/5">
                  <div className="flex items-center gap-1">
                    <Clock size={12} className="text-[#3b82f6]" />
                    <span className="text-[8px] font-semibold tracking-[0.15em] text-white/35 uppercase">Time</span>
                  </div>
                  <span className="text-[17px] font-black text-white tabular-nums leading-none">{timeStr}</span>
                </div>
                <div className="bg-black/55 backdrop-blur-xl rounded-[16px] p-2.5 flex flex-col gap-1 border border-white/5">
                  <div className="flex items-center gap-1">
                    <Navigation size={12} className="text-[#22c55e]" />
                    <span className="text-[8px] font-semibold tracking-[0.15em] text-white/35 uppercase">Miles</span>
                  </div>
                  <span className="text-[17px] font-black text-white tabular-nums leading-none">{sessionStats.distance.toFixed(2)}</span>
                </div>
                <div className="bg-black/55 backdrop-blur-xl rounded-[16px] p-2.5 flex flex-col gap-1 border border-white/5">
                  <div className="flex items-center gap-1">
                    <Gauge size={12} className="text-[#f97316]" />
                    <span className="text-[8px] font-semibold tracking-[0.15em] text-white/35 uppercase">Pace</span>
                  </div>
                  <span className="text-[17px] font-black text-white tabular-nums leading-none">{paceStr}</span>
                </div>
                <div className="bg-black/55 backdrop-blur-xl rounded-[16px] p-2.5 flex flex-col gap-1 border border-white/5">
                  <div className="flex items-center gap-1">
                    <Activity size={12} className="text-[#ef4444]" />
                    <span className="text-[8px] font-semibold tracking-[0.15em] text-white/35 uppercase">MPH</span>
                  </div>
                  <span className="text-[17px] font-black text-white tabular-nums leading-none">{speedStr}</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-black/55 backdrop-blur-xl rounded-[16px] p-2.5 flex flex-col gap-1 border border-white/5">
                  <div className="flex items-center gap-1">
                    <Clock size={12} className="text-[#3b82f6]" />
                    <span className="text-[8px] font-semibold tracking-[0.15em] text-white/35 uppercase">Time</span>
                  </div>
                  <span className="text-[17px] font-black text-white tabular-nums leading-none">{timeStr}</span>
                </div>
                <div className="bg-black/55 backdrop-blur-xl rounded-[16px] p-2.5 flex flex-col gap-1 border border-white/5">
                  <div className="flex items-center gap-1">
                    <Activity size={12} style={{ color: modeColor }} />
                    <span className="text-[8px] font-semibold tracking-[0.15em] text-white/35 uppercase">Phase</span>
                  </div>
                  <span className="text-[17px] font-black text-white tabular-nums leading-none">{phase}</span>
                </div>
              </div>
            )}

            {/* COACHING CARD — prominent, large italic text with persona watermark */}
            <div className="bg-black/70 backdrop-blur-2xl rounded-[20px] px-4 pt-3 pb-3 border border-white/10 relative overflow-hidden">
              <Volume2 size={96} className="absolute -right-3 -bottom-5 pointer-events-none select-none" style={{ color: modeColor, opacity: 0.07 }} />
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse bg-green-400" />
                  <span className="text-[9px] font-bold tracking-[0.25em] text-white/35 uppercase">{modeName}</span>
                </div>
                {isBufferingAudio && <Loader2 size={11} className="text-white/30 animate-spin flex-shrink-0" />}
              </div>
              <p className="text-white/90 text-[15px] font-normal italic leading-snug line-clamp-3 pr-2">
                {lastSpokenText ? `"${lastSpokenText}"` : (lang === 'es' ? 'Preparando tu sesión...' : 'Preparing your session...')}
              </p>
            </div>

            {/* CONTROLS — X / play-pause (persona-colored) / check-in */}
            <div className="bg-black/60 backdrop-blur-xl rounded-[24px] py-3 px-5 flex items-center justify-between gap-4 border border-white/10">
              <button
                onClick={() => setShowEndConfirm(true)}
                className="w-12 h-12 flex-shrink-0 bg-white/5 rounded-full border border-white/10 flex items-center justify-center active:scale-95 transition-all"
                aria-label={lang === 'es' ? 'Terminar sesión' : 'End session'}
              >
                <X size={18} className="text-white/60" />
              </button>
              <button
                onClick={togglePause}
                aria-label={isPaused
                  ? (lang === 'es' ? 'Reanudar sesión' : 'Resume session')
                  : (lang === 'es' ? 'Pausar sesión' : 'Pause session')}
                className="flex-shrink-0 rounded-full flex items-center justify-center active:scale-95 transition-all"
                style={{ width: 72, height: 72, background: modeColor, boxShadow: `0 0 40px ${modeColor}50`, border: `1px solid ${modeColor}55` }}
              >
                {isPaused
                  ? <Play size={26} fill="currentColor" className="text-white ml-1" />
                  : <Pause size={26} fill="currentColor" className="text-white" />}
              </button>
              <button
                onClick={requestCheckIn}
                disabled={isCheckInLoading || isPaused}
                aria-label={lang === 'es' ? 'Pedir coaching ahora' : 'Request coaching check-in'}
                className="w-12 h-12 flex-shrink-0 bg-white/5 rounded-full border border-white/10 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all disabled:opacity-40"
              >
                {isCheckInLoading
                  ? <Loader2 size={14} className="animate-spin" style={{ color: modeColor }} />
                  : <Zap size={14} style={{ color: modeColor }} fill="currentColor" />}
              </button>
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
              {lang === 'es' ? 'Saltar. Solo quiero moverme.' : 'Skip. Just let me move.'}
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
