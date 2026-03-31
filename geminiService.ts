
import { GoogleGenAI, Type } from "@google/genai";
import { Language, EchoPersona, ActivityType } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const PERSONA_PROMPTS = {
  HYPE: `HIGH-ENERGY CBT COACH. You use behavioral activation — getting people moving IS the therapy.
    Techniques: Action precedes motivation. Movement breaks rumination. Energy creates clarity.
    Tone: Punchy, rhythmic, like a trainer who GETS IT. "Your legs are moving. That means your brain is resetting. That's not just a walk — that's therapy."`,
  BREAKTHROUGH: `DIRECT CBT THERAPIST. You use cognitive restructuring — challenging distorted thoughts in real-time.
    Techniques: Identify the thought. Challenge the evidence. Reframe it. "What's the thought? Is it a fact or a feeling? Let's look at the evidence."
    Tone: Honest, investigative, pattern-interrupting. No fluff.`,
  HOPE: `WARM GROUNDING GUIDE. You use mindfulness-based CBT — present-moment awareness through senses.
    Techniques: 5-4-3-2-1 grounding while walking. Body scan in motion. "Feel your feet on the ground. What do you hear right now? Stay here with me."
    Tone: Gentle, safe, like a trusted friend walking beside you.`,
  STRATEGY: `PRACTICAL CBT PLANNER. You use problem-solving therapy — breaking overwhelm into next steps.
    Techniques: Define the problem. List options. Pick ONE next step. "You don't need to solve everything. What's the smallest thing you can do today?"
    Tone: Calm, logical, structured. Like a wise mentor.`
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
  const langText = params.lang === 'es' ? 'Spanish' : 'English';
  const sponsorLine = params.isFirstSegment ? "Include this EXACT line naturally: 'This guided walk is supported by L.A. Care Health Plan.'" : "";
  const mins = Math.floor(params.stats.time / 60);
  const dist = params.stats.distance.toFixed(2);

  // Pace-aware context
  let paceContext = '';
  const paceNum = parseFloat(params.stats.pace?.split(':')[0] || '0');
  if (params.stats.distance > 0.1) {
    if (paceNum < 12) paceContext = 'They are moving fast — channel that energy, acknowledge the intensity.';
    else if (paceNum < 16) paceContext = 'Steady pace — affirm the consistency.';
    else if (paceNum < 25) paceContext = 'Slow pace — this is fine, emphasize that any movement counts.';
    else paceContext = 'They may have paused or are walking very slowly — be gentle, check in.';
  }

  const prompt = `You are a CBT-trained wellness coach on a guided walk. Generate a spoken segment.
    Language: ${langText}
    Persona: ${PERSONA_PROMPTS[params.mode]}

    CURRENT STATE:
    - Distance: ${dist} miles
    - Time: ${mins} minutes elapsed
    - Pace: ${params.stats.pace} per mile
    ${paceContext}
    ${params.destinationName ? `Walking toward: ${params.destinationName}` : "Free walk — no destination"}

    TYPE: ${params.isIntro ? "INTRO (8-12 seconds). Welcome them. Set the tone. Name the persona." : "CONTINUOUS GUIDANCE (45-60 seconds). Apply a specific CBT technique based on your persona."}
    ${sponsorLine}

    CBT REQUIREMENTS:
    1. Every segment MUST include at least ONE specific CBT technique (not just motivation)
    2. Reference their physical state (pace, distance, time)
    3. Never repeat yourself — each segment should feel fresh
    4. 6th-grade reading level. No jargon. Real talk.
    5. Format as raw spoken text. No markdown. No stage directions.
    6. End with something that keeps them moving or thinking
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0.85 }
    });
    return response.text || "";
  } catch (e) {
    return params.lang === 'es' ? "Sigue moviéndote, lo estás haciendo bien." : "Keep moving, you are doing great.";
  }
};

export const generateEndingMessage = async (params: {
  mode: EchoPersona;
  lang: Language;
  stats: { distance: number; time: number; pace: string };
}) => {
  const langText = params.lang === 'es' ? 'Spanish' : 'English';
  const mins = Math.floor(params.stats.time / 60);
  const dist = params.stats.distance.toFixed(2);

  const prompt = `You are a CBT-trained wellness coach. The walk just ended. Generate a closing message.
    Language: ${langText}
    Persona: ${PERSONA_PROMPTS[params.mode]}
    Stats: ${dist} miles in ${mins} minutes, pace ${params.stats.pace}/mile.

    REQUIREMENTS:
    1. Celebrate what they just did (be specific with their stats)
    2. Name ONE insight or CBT takeaway from the walk
    3. Give them something to carry into the rest of their day
    4. Keep it 15-20 seconds spoken
    5. End with warmth — they just showed up for themselves
    6. Raw text only. No markdown.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0.8 }
    });
    return response.text || "";
  } catch (e) {
    return params.lang === 'es'
      ? `${dist} millas en ${mins} minutos. Eso es fuerza. Lleva esta energía contigo.`
      : `${dist} miles in ${mins} minutes. That's strength. Carry this energy with you.`;
  }
};

export const generateAffirmation = async (lang: Language) => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
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
      model: 'gemini-2.5-flash',
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
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0.7 }
    });
    return response.text || (lang === 'es' ? "Inhala. Exhala. Mantente presente." : "Breathe in. Breathe out. Be here.");
  } catch (e) {
    return lang === 'es' ? "Inhala. Exhala. Mantente presente." : "Breathe in. Breathe out. Be here.";
  }
};
