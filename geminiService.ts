
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
  destinationName?: string;
  userLat?: number;
  userLng?: number;
}) => {
  try {
    const data = await proxyCall('narration', {
      mode: params.mode,
      lang: params.lang,
      stats: params.stats,
      isIntro: params.isIntro,
      isFirstSegment: params.isFirstSegment,
      destinationName: params.destinationName,
    });
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
