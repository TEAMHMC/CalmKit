import { SessionRecord } from './types';

const STORAGE_KEY = 'calmkit_sessions';

export const getSessions = (): SessionRecord[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
};

export const saveSession = (record: SessionRecord): void => {
  const all = getSessions();
  localStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...all].slice(0, 200)));
};

export const getStreak = (): number => {
  const sessions = getSessions();
  if (!sessions.length) return 0;
  const days = new Set(sessions.map(s => s.date.split('T')[0]));
  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (days.has(d.toISOString().split('T')[0])) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
};

export const getWeekStats = () => {
  const sessions = getSessions();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  cutoff.setHours(0, 0, 0, 0);
  const recent = sessions.filter(s => new Date(s.date) >= cutoff);
  const totalMinutes = Math.round(recent.reduce((a, s) => a + s.durationSeconds / 60, 0));
  const totalMiles = parseFloat(recent.reduce((a, s) => a + s.distanceMiles, 0).toFixed(1));
  return { count: recent.length, totalMinutes, totalMiles };
};
