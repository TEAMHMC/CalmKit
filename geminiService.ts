
import { GoogleGenAI, Type } from "@google/genai";
import { Language, EchoPersona, ActivityType } from "./types";

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    const key = process.env.API_KEY;
    if (!key) throw new Error("Gemini API key not configured");
    _ai = new GoogleGenAI({ apiKey: key });
  }
  return _ai;
}

const PERSONA_CBT_PROMPTS = {
  HYPE: "You are a Behavioral Activation coach. Your goal is to build momentum and challenge thoughts of inability. Focus on the physical feeling of moving and celebrate the action itself. Use energetic, encouraging language. Technique: Behavioral Activation.",
  BREAKTHROUGH: "You are a Cognitive Restructuring guide. Your goal is to help the user gently challenge their unhelpful thought. Use Socratic questioning to explore evidence, identify cognitive distortions (like catastrophizing or all-or-nothing thinking), and find alternative perspectives. Be direct but compassionate. Technique: Cognitive Restructuring.",
  HOPE: "You are a Self-Compassion focused guide. Your goal is to validate the user's feelings while gently challenging thoughts of hopelessness. Focus on safety, grounding, and finding exceptions or 'shades of gray'. Remind them of their resilience. Technique: Building Self-Efficacy & Self-Compassion.",
  STRATEGY: "You are a Problem-Solving therapist. Your goal is to help the user move from feeling overwhelmed to taking a small, concrete step. Help them break down the problem and focus only on what is within their immediate control. Be calm, practical, and logical. Technique: Problem-Solving & Goal Setting."
};

export const generateSegmentNarrative = async (params: {
  mode: EchoPersona;
  activity: ActivityType;
  lang: Language;
  stats: { distance: number; time: number; pace: string };
  isIntro: boolean;
  isFirstSegment: boolean;
  targetThought?: string;
}) => {
  const langText = params.lang === 'es' ? 'Spanish' : 'English';
  const sponsorLine = params.isFirstSegment ? "Include this EXACT line naturally: 'This guided walk is supported by L.A. Care Health Plan.'" : "";
  
  const introPrompt = `Generate a short (15-20 second) spoken intro for a guided walk. Your tone is about grounding the user in the present moment. Focus on the feeling of their feet on the ground and the rhythm of their breath. Language: ${langText}. Format as raw text.`;
  
  const mainPrompt = `
    Act as a therapeutic guide using a specific Cognitive Behavioral Therapy (CBT) approach. Your persona is: ${PERSONA_CBT_PROMPTS[params.mode]}
    The user is on a walk. Their stats are: ${params.stats.distance.toFixed(2)} miles, ${Math.floor(params.stats.time/60)} mins elapsed.
    The unhelpful thought they are working on is: "${params.targetThought || 'feeling stuck'}"

    Your task is to generate a 1-minute spoken segment that integrates your CBT technique with the physical act of walking.

    - **Connect to the walk:** Use the rhythm of walking, looking forward, or physical sensations as metaphors.
    - **Apply your technique:** Use your specific persona's CBT method to address their thought. For example:
        - (BREAKTHROUGH): "As you take a step, let's look at that thought. What evidence do you have that it's 100% true?"
        - (HOPE): "It's okay to feel that way. Each step is a reminder that you are moving, even when your thoughts feel stuck. Can you recall a time you felt this way and got through it?"
        - (HYPE): "That thought wants you to stand still, but look at you—you're moving. Your body is already proving it wrong. Let's pick up the pace for just a moment."
        - (STRATEGY): "That thought feels big. Let's shrink the problem. What is one single, tiny action you can take on this after our walk? Just one."
    - **Language:** ${langText}.
    - **Rules:** 6th-grade reading level. No clinical jargon. Be encouraging. Format as raw text only. No Markdown.
    ${sponsorLine}
  `;

  try {
    const response = await getAI().models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: params.isIntro ? introPrompt : mainPrompt,
      config: { temperature: 0.85 }
    });
    return response.text || "";
  } catch (e) {
    return params.lang === 'es' ? "Sigue moviéndote, lo estás haciendo bien." : "Keep moving, you are doing great.";
  }
};


export const findNearbyWalkableDestination = async (lat: number, lng: number, category: string, lang: Language) => {
  // This function is no longer used in the UI but is kept for potential future use.
  return null;
};

export const generateAffirmation = async (lang: Language) => {
  const response = await getAI().models.generateContent({
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
    const response = await getAI().models.generateContent({
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
    const response = await getAI().models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { temperature: 0.7 }
    });
    return response.text || (lang === 'es' ? "Inhala. Exhala. Mantente presente." : "Breathe in. Breathe out. Be here.");
  } catch (e) {
    return lang === 'es' ? "Inhala. Exhala. Mantente presente." : "Breathe in. Breathe out. Be here.";
  }
};
