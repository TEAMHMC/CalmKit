
export type AppView = 'HOME' | 'WALK' | 'BREATHE' | 'MEDITATE' | 'REFLECT' | 'CENTER' | 'ABOUT';
export type Language = 'en' | 'es';
export type EchoPersona = 'HYPE' | 'BREAKTHROUGH' | 'HOPE' | 'STRATEGY';
export type ActivityType = 'WALK' | 'RUN';
export type NarrationFrequency = 'CONTINUOUS' | 'INTERVAL_2' | 'INTERVAL_5';
export type SessionType = 'OUTDOOR' | 'INDOOR';
export type IndoorActivity = 'STRETCH' | 'FLOW' | 'SWEAT';
/* Type for background ambience in meditation sessions */
export type BackgroundSound = 'NONE' | 'RAIN' | 'OCEAN' | 'FOREST' | 'ZEN';

export interface UserPreferences {
  lang: Language;
  darkMode: boolean;
  hasSeenOnboarding: boolean;
}

export interface JournalEntry {
  id: string;
  prompt: string;
  response: string;
  date: string;
}

export interface SessionRecord {
  id: string;
  date: string;
  mode: EchoPersona;
  sessionType: SessionType;
  durationSeconds: number;
  distanceMiles: number;
  moodAfter?: number; // 1–5: 1=much worse, 3=same, 5=much better
}
