
import { GoogleGenAI, Type } from "@google/genai";
import { Language, EchoPersona, ActivityType, IndoorActivity } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

/**
 * Behavioral UX Architecture — Persona Specifications
 * Each mode maps to a distinct voice, cadence, emotional posture, and rule set.
 */
const modeSpecifications = {
  HYPE: {
    voice: "Masculine (Zephyr)",
    cadence: "Staccato, punchy verbs, high rhythmic pressure.",
    posture: "Rhythmic, commanding, and energizing activation.",
    rules: "Use short motivational bursts. DO NOT use mode name 'Hype'. Focus on momentum. Pace: Medium to Fast."
  },
  BREAKTHROUGH: {
    voice: "Feminine (Puck)",
    cadence: "Resonant, medium pace, emotionally intelligent emphasis.",
    posture: "Direct, firm, and investigative clarity.",
    rules: "Use clarifying questions and truth statements. DO NOT use mode name 'Breakthrough'. Focus on reframing patterns. Pace: Medium."
  },
  HOPE: {
    voice: "Feminine (Kore)",
    cadence: "Legato, flowing sentences, slow-to-medium pace.",
    posture: "Warm, steady, and emotionally holding reassurance.",
    rules: "Use soft affirmations and grounding statements. DO NOT use mode name 'Hope'. Focus on safety and presence. Pace: Slow."
  },
  STRATEGY: {
    voice: "Masculine (Charon)",
    cadence: "Measured, composed, steady pacing.",
    posture: "Calm, confident, and grounded practical guidance.",
    rules: "Use structured guidance and practical framing. DO NOT use mode name 'Strategy'. Focus on organization and perspective. Pace: Medium."
  }
};

export const generateSegmentNarrative = async (params: {
  mode: EchoPersona;
  activity: ActivityType;
  lang: Language;
  stats: { distance: number; time: number; pace: string };
  isIntro: boolean;
  isFirstSegment: boolean;
  isReturning?: boolean;
  indoorActivity?: IndoorActivity;
  destinationName?: string;
  targetThought?: string;
}) => {
  const spec = modeSpecifications[params.mode];
  const langText = params.lang === 'es' ? 'Spanish' : 'English';
  const sponsorLine = params.isFirstSegment
    ? "Integrate NATURALLY: 'This space is supported by partners who believe in access to care for everyone.'"
    : "";

  const cbtContext = params.targetThought
    ? `The user's check-in thought: "${params.targetThought}". Gently weave awareness of this into guidance — acknowledge what they're carrying without being clinical.`
    : "";

  const indoorContext = params.indoorActivity
    ? `INDOOR SESSION — The user is doing a ${params.indoorActivity === 'STRETCH' ? 'gentle stretching' : params.indoorActivity === 'FLOW' ? 'mindful yoga-style movement flow' : 'bodyweight sweat workout'} session indoors. Guide their BODY through specific movements: "Roll your shoulders back... Now reach your arms overhead..." Give actual movement cues, not just walking direction. Keep it accessible and safe.`
    : "";

  const returningContext = params.isReturning
    ? `IMPORTANT: The user has been walking/running with their own music. You are checking back in after a few minutes of silence. Open with a brief, natural re-entry like "Still here with you..." or "Checking in..." or "Hey, you're still going..." — NOT "Welcome back" or "I'm back". Keep it fresh and human. Then offer a short insight or encouragement.`
    : "";

  const prompt = `Generate a unique, generative movement guidance segment for a CalmKit wellness session.
    Language: ${langText}
    Voice Persona: ${spec.voice}
    Cadence: ${spec.cadence}
    Emotional Posture: ${spec.posture}
    Rules: ${spec.rules}
    Current Stats: ${params.stats.distance.toFixed(2)} miles, ${Math.floor(params.stats.time/60)} mins elapsed, Pace: ${params.stats.pace}.
    Context: ${params.isIntro ? "Pre-Start Intro (15-20s)" : "Continuous guidance segment (60s)"}.
    ${params.destinationName ? `Target: ${params.destinationName}` : "Just Go mode — no specific destination."}.
    ${cbtContext}
    ${indoorContext}
    ${returningContext}
    ${sponsorLine}

    CRITICAL INSTRUCTIONS:
    1. 6th-grade level. No jargon.
    2. NEVER identify yourself by name. Do not say "I am Hope" or "Let's start the Hype."
    3. NO FIXED PHRASES. Every segment must feel unique. Avoid clichés like "Welcome back" or "Let's get started."
    4. NO CLINICAL LANGUAGE. No therapy, no diagnosis, no medical advice.
    5. NO PERFORMANCE METRICS. Focus on cognitive and emotional presence, not speed or calories.
    6. CADENCE ADHERENCE: Write to match the specified cadence (Staccato for Hype, Legato for Hope, etc.).
    7. Speak to their CURRENT physical state based on stats.
    8. If distance is low, encourage the beginning. If high, acknowledge what they've built.
    9. Format as raw spoken text only. No Markdown.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { temperature: 1.0 }
    });
    return response.text || "";
  } catch (e) {
    return params.lang === 'es' ? "Sigue moviéndote, lo estás haciendo bien." : "Keep moving, you are doing great.";
  }
};

export const findNearbyWalkableDestination = async (lat: number, lng: number, category: string, lang: Language) => {
  return null;
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
