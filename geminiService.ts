
import { Language, EchoPersona, ActivityType } from "./types";

// All AI calls go through the HMC backend proxy — API key stays server-side
const PROXY_URL = 'https://volunteer.healthmatters.clinic/api/calmkit';

const proxyCall = async (endpoint: string, body: Record<string, any>): Promise<any> => {
  const res = await fetch(`${PROXY_URL}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Proxy ${endpoint} failed: ${res.status}`);
  return res.json();
};

export const generateSegmentNarrative = async (params: {
  mode: EchoPersona;
  activity: ActivityType;
  lang: Language;
  stats: { distance: number; time: number; pace: string };
  isIntro: boolean;
  isFirstSegment: boolean;
  isReturning?: boolean;
  indoorActivity?: string;
  segmentNumber?: number;
  destinationName?: string;
  targetThought?: string;
  userLat?: number;
  userLng?: number;
  // Environmental context
  weatherCondition?: string;
  temperature?: number;   // Celsius from Google Weather API
  windSpeed?: number;     // m/s from Google Weather API
  airQualityIndex?: number;
  airQualityCategory?: string;
  elevationGain?: number; // cumulative meters climbed
  elevationDelta?: number; // recent change (negative = downhill)
  speed?: number;         // mph from device GPS
}) => {
  try {
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    const sessionMinutes = Math.floor((params.stats?.time || 0) / 60);
    const data = await proxyCall('movement-narrative', {
      mode: params.mode,
      activity: params.activity || 'WALK',
      lang: params.lang,
      destinationName: params.destinationName,
      targetThought: params.targetThought,
      timeOfDay,
      sessionMinutes,
      distanceMiles: params.stats?.distance || 0,
      isIntro: params.isIntro,
      isFirstSegment: params.isFirstSegment,
      isReturning: params.isReturning,
      indoorActivity: params.indoorActivity,
      segmentNumber: params.segmentNumber,
      // Environmental context — only send if available
      ...(params.weatherCondition && { weatherCondition: params.weatherCondition }),
      ...(params.temperature !== undefined && { temperature: params.temperature }),
      ...(params.windSpeed !== undefined && { windSpeed: params.windSpeed }),
      ...(params.airQualityIndex !== undefined && { airQualityIndex: params.airQualityIndex }),
      ...(params.airQualityCategory && { airQualityCategory: params.airQualityCategory }),
      ...(params.elevationGain !== undefined && params.elevationGain > 0 && { elevationGain: Math.round(params.elevationGain) }),
      ...(params.elevationDelta !== undefined && { elevationDelta: Math.round(params.elevationDelta) }),
      ...(params.speed !== undefined && params.speed > 0 && { speed: params.speed }),
    });
    // Return the full narrative data for the narration loop
    if (data.preStartIntro) return data.preStartIntro;
    return data.narration || "";
  } catch (e) {
    return params.lang === 'es' ? "Sigue moviéndote, lo estás haciendo bien." : "Keep moving, you are doing great.";
  }
};

export const generateEndingMessage = async (params: {
  mode: EchoPersona;
  lang: Language;
  stats: { distance: number; time: number; pace: string };
}) => {
  try {
    const data = await proxyCall('ending', {
      mode: params.mode,
      lang: params.lang,
      stats: params.stats,
    });
    return data.message || "";
  } catch (e) {
    const dist = params.stats.distance.toFixed(2);
    const mins = Math.floor(params.stats.time / 60);
    return params.lang === 'es'
      ? `${dist} millas en ${mins} minutos. Eso es fuerza. Lleva esta energía contigo.`
      : `${dist} miles in ${mins} minutes. That's strength. Carry this energy with you.`;
  }
};

export const generateAffirmation = async (lang: Language) => {
  try {
    const data = await proxyCall('affirmation', { lang });
    return data.affirmation || "";
  } catch (e) {
    return lang === 'es' ? "Soy capaz y resiliente." : "I am capable and resilient.";
  }
};

export const generateJournalPrompt = async (lang: Language) => {
  try {
    const data = await proxyCall('journal-prompt', { lang });
    return data.prompt || "";
  } catch (e) {
    return lang === 'es' ? "¿Qué estás superando hoy?" : "What are you outgrowing today?";
  }
};

export const generateMeditationScript = async (lang: Language) => {
  try {
    const data = await proxyCall('meditation', { lang });
    return data.script || "";
  } catch (e) {
    return lang === 'es' ? "Inhala. Exhala. Mantente presente." : "Breathe in. Breathe out. Be here.";
  }
};
