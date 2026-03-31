
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
