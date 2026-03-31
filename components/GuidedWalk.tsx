
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Language, EchoPersona } from '../types';
import { translations } from '../translations';
import { generateSegmentNarrative } from '../geminiService';
import { GoogleGenAI, Modality } from "@google/genai";
import {
  Pause, X, Play, ChevronLeft, Sparkles, Navigation, MapPin
} from 'lucide-react';
import {
  initGoogleMaps,
  getWalkingDirections,
  findNearbyWalkableDestinations,
  formatStepForVoice,
  WalkingRoute,
  WalkingStep,
  NearbyDestination
} from '../services/mapsService';

declare const L: any;
declare const google: any;

const MODES: { id: EchoPersona; label: string; desc: string; voice: string; tone: 'blue' | 'orange' | 'yellow' | 'pink' }[] = [
  { id: 'HOPE', label: 'Hope', desc: 'Safety & Grounding', voice: 'Kore', tone: 'blue' },
  { id: 'HYPE', label: 'Hype', desc: 'Energy & Momentum', voice: 'Zephyr', tone: 'pink' },
  { id: 'BREAKTHROUGH', label: 'Breakthrough', desc: 'Truth & Clarity', voice: 'Puck', tone: 'orange' },
  { id: 'STRATEGY', label: 'Strategy', desc: 'Practical Direction', voice: 'Charon', tone: 'yellow' },
];

interface MovementProps {
  onBack: () => void;
  lang: Language;
}

const GuidedWalk: React.FC<MovementProps> = ({ onBack, lang }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [mode, setMode] = useState<EchoPersona>('HOPE');
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [sessionStats, setSessionStats] = useState({ distance: 0, time: 0, pace: "0:00" });
  const [isBufferingAudio, setIsBufferingAudio] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

  // Navigation state
  const [walkMode, setWalkMode] = useState<'free' | 'destination'>('free');
  const [nearbyDestinations, setNearbyDestinations] = useState<NearbyDestination[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<NearbyDestination | null>(null);
  const [currentRoute, setCurrentRoute] = useState<WalkingRoute | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isLoadingDestinations, setIsLoadingDestinations] = useState(false);

  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const pathRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const destinationMarkerRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastPositionRef = useRef<[number, number] | null>(null);
  const pathCoordsRef = useRef<[number, number][]>([]);
  const audioBufferQueue = useRef<AudioBuffer[]>([]);
  const isNarratingRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);
  const pausedElapsedRef = useRef<number>(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalDistanceRef = useRef<number>(0);
  const sponsorPlayedRef = useRef(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<any>(null);

  const t = translations[lang];

  // Haversine distance between two GPS coordinates in meters
  const haversineDistance = (
    [lat1, lon1]: [number, number],
    [lat2, lon2]: [number, number]
  ): number => {
    const R = 6371000; // Earth radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Format pace as "min:sec" per mile
  const formatPace = (elapsedSeconds: number, distanceMiles: number): string => {
    if (distanceMiles < 0.001) return "0:00";
    const paceSeconds = elapsedSeconds / distanceMiles;
    const mins = Math.floor(paceSeconds / 60);
    const secs = Math.floor(paceSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get current elapsed time in seconds, accounting for pauses
  const getElapsedSeconds = (): number => {
    if (!startTimeRef.current) return 0;
    if (isPaused) return pausedElapsedRef.current;
    return pausedElapsedRef.current + (Date.now() - startTimeRef.current) / 1000;
  };

  // Start a 1-second interval timer to update time & pace continuously
  const startTimer = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      const elapsed = getElapsedSeconds();
      const dist = totalDistanceRef.current;
      setSessionStats({
        distance: dist,
        time: Math.floor(elapsed),
        pace: formatPace(elapsed, dist),
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const initAudio = async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
  };

  // Load nearby walkable destinations
  const loadNearbyDestinations = async (lat: number, lng: number) => {
    setIsLoadingDestinations(true);
    try {
      const destinations = await findNearbyWalkableDestinations(lat, lng, 2000, 'park');
      setNearbyDestinations(destinations);
    } catch (e) {
      console.error('Failed to load destinations:', e);
    }
    setIsLoadingDestinations(false);
  };

  // Select a destination and get walking directions
  const selectDestination = async (dest: NearbyDestination) => {
    if (!userLocation) return;
    setSelectedDestination(dest);

    const route = await getWalkingDirections(
      { lat: userLocation[0], lng: userLocation[1] },
      { lat: dest.lat, lng: dest.lng }
    );

    if (route) {
      setCurrentRoute(route);
      setCurrentStepIndex(0);
      displayRouteOnMap(route, dest);
    }
  };

  // Display route polyline and destination marker on Leaflet map
  const displayRouteOnMap = (route: WalkingRoute, dest: NearbyDestination) => {
    if (!mapRef.current) return;

    // Remove existing route layer
    if (routeLayerRef.current) {
      mapRef.current.removeLayer(routeLayerRef.current);
    }
    if (destinationMarkerRef.current) {
      mapRef.current.removeLayer(destinationMarkerRef.current);
    }

    // Decode polyline and add to map
    if (route.polyline && google?.maps?.geometry?.encoding) {
      const decodedPath = google.maps.geometry.encoding.decodePath(route.polyline);
      const latLngs = decodedPath.map((p: any) => [p.lat(), p.lng()]);

      routeLayerRef.current = L.polyline(latLngs, {
        color: '#22c55e',
        weight: 6,
        opacity: 0.8,
        dashArray: '10, 10'
      }).addTo(mapRef.current);
    }

    // Add destination marker
    destinationMarkerRef.current = L.marker([dest.lat, dest.lng], {
      icon: L.divIcon({
        className: 'destination-marker',
        html: `<div style="background:#22c55e;width:24px;height:24px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      })
    }).addTo(mapRef.current);

    // Fit bounds to show route
    mapRef.current.fitBounds([
      [route.bounds.south, route.bounds.west],
      [route.bounds.north, route.bounds.east]
    ], { padding: [50, 50] });
  };

  // Check if user is near a waypoint and advance navigation
  const checkNavigationProgress = (currentLat: number, currentLng: number) => {
    if (!currentRoute || walkMode !== 'destination') return;

    const currentStep = currentRoute.steps[currentStepIndex];
    if (!currentStep) return;

    // Calculate distance to current step's end point
    const distToStep = L.latLng(currentLat, currentLng).distanceTo(
      L.latLng(currentStep.endLocation.lat, currentStep.endLocation.lng)
    );

    // If within 20 meters, advance to next step
    if (distToStep < 20 && currentStepIndex < currentRoute.steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
      // Queue voice instruction for next step
      const nextStep = currentRoute.steps[currentStepIndex + 1];
      if (nextStep) {
        const voiceInstruction = formatStepForVoice(nextStep, lang);
        speakText(voiceInstruction).then(buffer => {
          if (buffer) audioBufferQueue.current.unshift(buffer);
        });
      }
    }

    // Check if arrived at destination
    if (selectedDestination) {
      const distToDest = L.latLng(currentLat, currentLng).distanceTo(
        L.latLng(selectedDestination.lat, selectedDestination.lng)
      );
      if (distToDest < 30) {
        // Arrived!
        const arrivalMsg = lang === 'es'
          ? `¡Llegaste a ${selectedDestination.name}! Excelente caminata.`
          : `You've arrived at ${selectedDestination.name}! Great walk.`;
        speakText(arrivalMsg);
      }
    }
  };

  const speakText = async (text: string) => {
    // Initialize GoogleGenAI inside the function as per guidelines
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
    
    // Extract audio data from the response
    const base64 = response.candidates?.[0]?.content?.parts[0]?.inlineData?.data;
    if (!base64) return null;
    
    // Custom decode function to handle base64 to binary
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    // Custom audio buffer decoding for raw PCM data
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
        destinationName: selectedDestination?.name,
        userLat: userLocation?.[0],
        userLng: userLocation?.[1],
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
      // Audio ducking: boost narration volume, creates contrast with background music
      const gainNode = audioCtxRef.current!.createGain();
      gainNode.gain.value = 1.3; // Narration louder than normal
      source.connect(gainNode);
      gainNode.connect(audioCtxRef.current!.destination);
      source.onended = () => narrationLoop();
      source.start(0);
      if (startTimeRef.current === null) startTimeRef.current = Date.now();
    } else {
      setTimeout(narrationLoop, 2000);
    }
  }, [mode, lang, sessionStats, isPaused]);

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
      L.control.zoom({ position: 'topright' }).addTo(mapRef.current);
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

  // Cleanup timer and GPS on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      stopTracking();
    };
  }, []);

  const startTracking = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(coords);
        lastPositionRef.current = coords;
        pathCoordsRef.current = [coords];
      },
      null,
      { enableHighAccuracy: true, timeout: 5000 }
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGpsAccuracy(accuracy);
        const current: [number, number] = [latitude, longitude];
        setUserLocation(current);

        // Ignore low-accuracy readings
        if (accuracy > 40) return;

        if (lastPositionRef.current) {
          const prev = lastPositionRef.current;
          const d = haversineDistance(prev, current);

          // Filter GPS jitter — only count movement > 3 meters
          if (d > 3) {
            totalDistanceRef.current += d / 1609.34; // meters to miles
            pathCoordsRef.current.push(current);
            lastPositionRef.current = current;

            // Immediately update stats so map effect picks up new path
            const elapsed = getElapsedSeconds();
            setSessionStats({
              distance: totalDistanceRef.current,
              time: Math.floor(elapsed),
              pace: formatPace(elapsed, totalDistanceRef.current),
            });

            // Check navigation progress for turn-by-turn
            checkNavigationProgress(latitude, longitude);
          }
        } else {
          lastPositionRef.current = current;
          pathCoordsRef.current = [current];
        }
      },
      (err) => console.warn('GPS watch error:', err),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  const handleStart = async () => {
    await initAudio();
    // Reset session state
    totalDistanceRef.current = 0;
    pausedElapsedRef.current = 0;
    pathCoordsRef.current = [];
    lastPositionRef.current = null;
    setSessionStats({ distance: 0, time: 0, pace: "0:00" });

    setIsPlaying(true);
    isNarratingRef.current = true;
    startTimeRef.current = Date.now();
    startTracking();
    startTimer();
    narrationLoop();
  };

  const handleStop = async () => {
    isNarratingRef.current = false;
    stopTracking();
    stopTimer();

    // Generate and speak ending message
    try {
      const { generateEndingMessage } = await import('../geminiService');
      const endMsg = await generateEndingMessage({ mode, lang, stats: sessionStats });
      const buffer = await speakText(endMsg);
      if (buffer && audioCtxRef.current) {
        const source = audioCtxRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtxRef.current.destination);
        source.onended = () => {
          setIsPlaying(false);
          setIsPaused(false);
          startTimeRef.current = null;
          pausedElapsedRef.current = 0;
          onBack();
        };
        source.start(0);
        return; // Wait for ending message to finish before going back
      }
    } catch (e) {
      console.warn('Ending message failed:', e);
    }

    // Fallback if ending message fails
    setIsPlaying(false);
    setIsPaused(false);
    startTimeRef.current = null;
    pausedElapsedRef.current = 0;
    onBack();
  };

  const handlePause = () => {
    if (isPaused) {
      // RESUME: restart GPS and timer from where we left off
      startTimeRef.current = Date.now();
      startTracking();
      startTimer();
      isNarratingRef.current = true;
      setIsPaused(false);
      narrationLoop();
    } else {
      // PAUSE: freeze elapsed time, stop GPS, stop timer
      pausedElapsedRef.current = getElapsedSeconds();
      startTimeRef.current = null;
      stopTracking();
      stopTimer();
      isNarratingRef.current = false;
      setIsPaused(true);
    }
  };

  if (!isPlaying) {
    return (
      <div className="flex-1 flex flex-col p-6 animate-in fade-in overflow-y-auto bg-white dark:bg-[#121212]">
        <div className="flex items-center gap-2 mb-8">
          <button onClick={onBack} className="p-2 -ml-2 text-gray-400 hover:text-black dark:hover:text-white transition-colors">
            <ChevronLeft size={24} />
          </button>
          <span className="font-black uppercase tracking-[0.3em] text-[10px] text-[#233DFF]">{t.nav.move}</span>
        </div>

        <div className="space-y-1 mb-8">
          <h2 className="text-4xl font-black tracking-tighter uppercase dark:text-white">{t.labels.readyToBegin}</h2>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-400">{t.labels.selectMode}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 mb-6">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`p-6 rounded-[32px] border-2 transition-all flex items-center justify-between group active:scale-[0.98] ${mode === m.id ? 'border-[#233DFF] bg-[#233DFF]/5' : 'border-gray-50 dark:border-white/5 bg-gray-50 dark:bg-white/5'}`}
            >
              <div className="flex flex-col items-start text-left">
                <span className={`font-black uppercase text-sm tracking-widest ${mode === m.id ? 'text-[#233DFF]' : 'dark:text-white'}`}>{m.label}</span>
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">{m.desc}</span>
              </div>
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${mode === m.id ? 'bg-[#233DFF] text-white scale-110' : 'bg-gray-100 dark:bg-white/10 text-gray-400'}`}>
                <Sparkles size={18} />
              </div>
            </button>
          ))}
        </div>

        {/* Walk Mode Selection */}
        <div className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-400 mb-3">
            {lang === 'es' ? 'Tipo de caminata' : 'Walk Type'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setWalkMode('free')}
              className={`p-4 rounded-2xl border-2 transition-all ${walkMode === 'free' ? 'border-[#233DFF] bg-[#233DFF]/5' : 'border-gray-100 dark:border-white/5'}`}
            >
              <Navigation size={24} className={walkMode === 'free' ? 'text-[#233DFF] mx-auto mb-2' : 'text-gray-400 mx-auto mb-2'} />
              <span className={`text-xs font-bold block ${walkMode === 'free' ? 'text-[#233DFF]' : 'text-gray-500'}`}>
                {lang === 'es' ? 'Libre' : 'Free Walk'}
              </span>
            </button>
            <button
              onClick={() => {
                setWalkMode('destination');
                if (userLocation) {
                  loadNearbyDestinations(userLocation[0], userLocation[1]);
                } else {
                  navigator.geolocation.getCurrentPosition((pos) => {
                    setUserLocation([pos.coords.latitude, pos.coords.longitude]);
                    loadNearbyDestinations(pos.coords.latitude, pos.coords.longitude);
                  });
                }
              }}
              className={`p-4 rounded-2xl border-2 transition-all ${walkMode === 'destination' ? 'border-green-500 bg-green-500/5' : 'border-gray-100 dark:border-white/5'}`}
            >
              <MapPin size={24} className={walkMode === 'destination' ? 'text-green-500 mx-auto mb-2' : 'text-gray-400 mx-auto mb-2'} />
              <span className={`text-xs font-bold block ${walkMode === 'destination' ? 'text-green-600' : 'text-gray-500'}`}>
                {lang === 'es' ? 'A un destino' : 'To Destination'}
              </span>
            </button>
          </div>
        </div>

        {/* Destination Selection (if destination mode) */}
        {walkMode === 'destination' && (
          <div className="mb-6">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-400 mb-3">
              {lang === 'es' ? 'Elige un destino' : 'Choose Destination'}
            </p>
            {isLoadingDestinations ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-3 border-green-500/20 border-t-green-500 rounded-full animate-spin" />
              </div>
            ) : nearbyDestinations.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {nearbyDestinations.map((dest, i) => (
                  <button
                    key={i}
                    onClick={() => selectDestination(dest)}
                    className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${selectedDestination?.name === dest.name ? 'border-green-500 bg-green-500/5' : 'border-gray-100 dark:border-white/5'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedDestination?.name === dest.name ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-white/10 text-gray-400'}`}>
                        <MapPin size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate dark:text-white">{dest.name}</p>
                        <p className="text-xs text-gray-400 truncate">{dest.address}</p>
                      </div>
                      {dest.rating && (
                        <span className="text-xs font-bold text-yellow-500">★ {dest.rating}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-gray-400 py-4">
                {lang === 'es' ? 'No se encontraron destinos cercanos' : 'No nearby destinations found'}
              </p>
            )}
          </div>
        )}

        {/* Route Info */}
        {currentRoute && selectedDestination && (
          <div className="mb-6 p-4 bg-green-500/10 rounded-2xl border border-green-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-600 font-bold uppercase tracking-wider">
                  {lang === 'es' ? 'Ruta a' : 'Route to'}
                </p>
                <p className="font-bold text-green-700">{selectedDestination.name}</p>
              </div>
              <div className="text-right">
                <p className="font-black text-green-600">{currentRoute.distance}</p>
                <p className="text-xs text-green-500">{currentRoute.duration}</p>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={walkMode === 'destination' && !selectedDestination}
          className={`w-full h-20 rounded-[32px] font-black uppercase tracking-[0.5em] text-xs shadow-xl active:scale-95 transition-all flex items-center justify-center gap-4 ${walkMode === 'destination' && !selectedDestination ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#233DFF] text-white'}`}
        >
          <Play size={20} fill="currentColor" /> {t.labels.start}
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-black overflow-hidden relative">
      <div ref={mapContainerRef} className="absolute inset-0 z-0 opacity-60" />
      
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90 pointer-events-none z-[1]" />

      <header className="relative z-[10] p-6 flex justify-between items-start">
        <button onClick={handleStop} className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-all">
          <X size={20} />
        </button>
        <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
          <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">GPS: {gpsAccuracy ? `${gpsAccuracy.toFixed(0)}m` : '---'}</span>
        </div>
      </header>

      <div className="relative z-[10] mt-auto p-6 space-y-6">
        {/* Turn-by-turn navigation card */}
        {walkMode === 'destination' && currentRoute && currentRoute.steps[currentStepIndex] && (
          <div className="bg-green-500/90 backdrop-blur-lg rounded-3xl p-4 border border-green-400/30">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                <Navigation size={24} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="text-white font-bold text-sm leading-tight">
                  {currentRoute.steps[currentStepIndex].instruction}
                </p>
                <p className="text-green-100 text-xs mt-1">
                  {currentRoute.steps[currentStepIndex].distance} · {lang === 'es' ? 'Paso' : 'Step'} {currentStepIndex + 1}/{currentRoute.steps.length}
                </p>
              </div>
            </div>
            {selectedDestination && (
              <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between">
                <span className="text-green-100 text-xs">{lang === 'es' ? 'Destino' : 'Destination'}</span>
                <span className="text-white font-bold text-xs">{selectedDestination.name}</span>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t.labels.miles, value: sessionStats.distance.toFixed(2) },
            { label: t.labels.avgPace, value: sessionStats.pace },
            { label: t.labels.time, value: `${Math.floor(sessionStats.time / 60)}:${(sessionStats.time % 60).toString().padStart(2, '0')}` }
          ].map((stat, i) => (
            <div key={i} className="bg-black/40 backdrop-blur-lg border border-white/10 rounded-3xl p-4 flex flex-col items-center">
              <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-1">{stat.label}</span>
              <span className="text-xl font-black text-white tabular-nums tracking-tighter">{stat.value}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-4">
          <button 
            onClick={handlePause}
            className="flex-1 h-20 bg-white/10 backdrop-blur-lg border border-white/10 rounded-[32px] flex items-center justify-center text-white active:scale-95 transition-all"
          >
            {isPaused ? <Play size={24} fill="currentColor" /> : <Pause size={24} fill="currentColor" />}
          </button>
          <button 
            onClick={handleStop}
            className="flex-1 h-20 bg-[#233DFF] rounded-[32px] flex items-center justify-center text-white font-black uppercase tracking-[0.3em] text-[10px] shadow-xl shadow-blue-500/20 active:scale-95 transition-all"
          >
            {t.labels.done}
          </button>
        </div>
      </div>

      {isBufferingAudio && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[20] flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};

// Fix for Error 1: Exporting GuidedWalk as default
export default GuidedWalk;
