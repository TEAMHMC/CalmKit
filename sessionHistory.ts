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

/**
 * Anonymous, per-install identifier. Generated locally, never sent anywhere in
 * raw form: the outcome endpoint HMACs it server-side so distinct devices can be
 * counted once without anything being traceable back to a person. Nothing about
 * this value is derived from the device or the user.
 */
const ANON_KEY = 'calmkit_anon_id';

export const getAnonId = (): string => {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '');
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    // Private mode: still send something valid so the session is counted, it
    // just will not dedupe across reloads.
    return `eph${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  }
};

/**
 * Reports one completed session to HMC so effectiveness can be measured beyond
 * GA4. De-identified and best effort: a failure here never surfaces to the user
 * and never blocks the summary screen.
 */
export const reportOutcome = async (record: SessionRecord, lang: string): Promise<void> => {
  if (record.moodAfter === undefined) return;
  try {
    const { calmKitHeaders } = await import('./services/session');
    await fetch('https://volunteer.healthmatters.clinic/api/calmkit/outcome', {
      method: 'POST',
      headers: await calmKitHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        anonId: getAnonId(),
        moodAfter: record.moodAfter,
        mode: record.mode,
        sessionType: record.sessionType,
        durationSeconds: Math.round(record.durationSeconds),
        distanceMiles: record.distanceMiles,
        lang,
      }),
      keepalive: true,
    });
  } catch {
    /* best effort */
  }
};
