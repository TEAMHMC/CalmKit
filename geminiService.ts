
import { GoogleGenAI, Type } from "@google/genai";
import { Language, EchoPersona, ActivityType } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const PERSONA_PROMPTS = {
  HYPE: "high-energy coach, punchy, motivating, focus on drive and power.",
  BREAKTHROUGH: "direct, honest, pattern-interrupting, investigative and clear.",
  HOPE: "warm, reassuring, focused on safety and grounding.",
  STRATEGY: "calm, practical, logic-driven, focused on the next immediate step."
};

export const generateSegmentNarrative = async (params: {
  mode: EchoPersona;
  activity: ActivityType;
  lang: Language;
  stats: { distance: number; time: number; pace: string };
  isIntro: boolean;
  isFirstSegment: boolean;
  destinationName?: string;
}) => {
  const langText = params.lang === 'es' ? 'Spanish' : 'English';
  const sponsorLine = params.isFirstSegment ? "Include this EXACT line naturally: 'This guided walk is supported by L.A. Care Health Plan.'" : "";
  
  const prompt = `Act as a wellness guide. Generate a 1-minute spoken movement segment.
    Language: ${langText}
    Style: ${PERSONA_PROMPTS[params.mode]}
    Current Stats: ${params.stats.distance.toFixed(2)} miles, ${Math.floor(params.stats.time/60)} mins elapsed, Pace: ${params.stats.pace}.
    Context: ${params.isIntro ? "Intro (8-12s)" : "Continuous guidance (60s)"}.
    ${params.destinationName ? `Target: ${params.destinationName}` : "Just Go mode"}.
    ${sponsorLine}

    STRICT RULES:
    1. 6th-grade level. No jargon.
    2. Speak to their CURRENT physical state based on stats.
    3. If distance is low, encourage the start. If high, acknowledge the work.
    4. Format as raw text only. No Markdown.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { temperature: 0.8 }
    });
    return response.text || "";
  } catch (e) {
    return params.lang === 'es' ? "Sigue moviéndote, lo estás haciendo bien." : "Keep moving, you are doing great.";
  }
};

export const findNearbyWalkableDestination = async (lat: number, lng: number, category: string, lang: Language) => {
  const prompt = `Find a specific, real-world walkable destination (like a park path, trail entrance, or pedestrian walkway) within 1.5 miles of Lat ${lat}, Lng ${lng}. 
  CRITICAL: Must be pedestrian-only or high-walkability. NO highways, NO restricted driving-only zones.
  Return a JSON object with: { "name": "Location Name", "lat": number, "lng": number, "displayName": "Brief description" }`;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { 
        tools: [{ googleMaps: {} }], 
        toolConfig: { 
          retrievalConfig: { 
            latLng: { latitude: lat, longitude: lng } 
          } 
        } 
      }
    });
    const rawText = response.text || "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (e) { return null; }
};

export const generateAffirmation = async (lang: Language) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `One short affirmation in ${lang === 'es' ? 'Spanish' : 'English'}.`,
    config: { temperature: 1.0 }
  });
  return response.text || "";
};

export const generateJournalPrompt = async (lang: Language) => {
  const langText = lang === 'es' ? 'Spanish' : 'English';
  const prompt = `Generate a single, deep, introspective journal prompt for self-reflection in ${langText}. One sentence only. No Markdown.`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { temperature: 0.9 }
    });
    return response.text || (lang === 'es' ? "¿Qué estás superando hoy?" : "What are you outgrowing today?");
  } catch (e) {
    return lang === 'es' ? "¿Qué estás superando hoy?" : "What are you outgrowing today?";
  }
};

export const generateMeditationScript = async (lang: Language) => {
  const langText = lang === 'es' ? 'Spanish' : 'English';
  const prompt = `Generate a short (2-3 sentences) guided meditation script focused on presence and grounding in ${langText}. No Markdown.`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { temperature: 0.7 }
    });
    return response.text || (lang === 'es' ? "Inhala. Exhala. Mantente presente." : "Breathe in. Breathe out. Be here.");
  } catch (e) {
    return lang === 'es' ? "Inhala. Exhala. Mantente presente." : "Breathe in. Breathe out. Be here.";
  }
};
