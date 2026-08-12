import React, { useState, useEffect } from 'react';
import { AppView, Language } from '../types';
import { translations } from '../translations';
import { RefreshCcw, Move, BookOpen, Zap, Wind, Sparkles, Activity } from 'lucide-react';
import { getStreak, getWeekStats, getSessions } from '../sessionHistory';

interface HomeProps {
  onSelectView: (view: AppView) => void;
  lang: Language;
}

const Home: React.FC<HomeProps> = ({ onSelectView, lang }) => {
  // Instant defaults — never show a blank or loading state
  /**
   * Each entry is the affirmation text plus an optional attribution.
   *
   * The attribution used to be glued onto the text with an em dash, which HMC copy
   * standards do not allow anywhere user-facing. Keeping it as its own field lets
   * the card render it on a separate line, and lets the unattributed lines carry
   * no dangling "Unknown" credit at all.
   */
  const DEFAULT_AFFIRMATIONS: Record<Language, { text: string; author?: string }[]> = {
    en: [
      // Unstoppable Season originals
      { text: 'You are unstoppable.' },
      { text: 'You showed up today. That takes courage.' },
      { text: 'Your presence is your power.' },
      { text: 'You were built for this season.' },
      { text: 'Every step forward is proof of your strength.' },
      // Universal quotes, secular, non-gendered, broadly inspiring
      { text: 'You have been assigned this mountain to show others it can be moved.' },
      { text: 'The comeback is always stronger than the setback.' },
      { text: 'It always seems impossible until it\'s done.', author: 'Nelson Mandela' },
      { text: 'Our greatest glory is not in never falling, but in rising every time we fall.', author: 'Confucius' },
      { text: 'I am not what happened to me. I am what I choose to become.', author: 'Carl Jung' },
      { text: 'The struggle you\'re in today is developing the strength you need tomorrow.' },
      { text: 'You can\'t go back and change the beginning, but you can start where you are and change the ending.', author: 'C.S. Lewis' },
      { text: 'In the middle of difficulty lies opportunity.', author: 'Albert Einstein' },
      { text: 'You have power over your mind, not outside events. Realize this, and you will find strength.', author: 'Marcus Aurelius' },
      { text: 'Do not judge me by my successes, judge me by how many times I fell down and got back up again.', author: 'Nelson Mandela' },
      { text: 'The most courageous act is still to think for yourself. Aloud.', author: 'Coco Chanel' },
      { text: 'If you don\'t like the road you\'re walking, start paving another one.', author: 'Dolly Parton' },
      { text: 'The only way out is through.', author: 'Robert Frost' },
      { text: 'You deserve to be here. You deserve to take up space.' },
    ],
    es: [
      { text: 'Eres imparable.' },
      { text: 'Te presentaste hoy. Eso requiere valentía.' },
      { text: 'Tu presencia es tu poder.' },
      { text: 'Fuiste hecho para esta temporada.' },
      { text: 'Cada paso adelante es prueba de tu fortaleza.' },
      { text: 'Te han asignado esta montaña para mostrarle a otros que se puede mover.' },
      { text: 'La recuperación siempre es más fuerte que la caída.' },
      { text: 'Siempre parece imposible hasta que se hace.', author: 'Nelson Mandela' },
      { text: 'Nuestra mayor gloria no está en nunca caer, sino en levantarnos cada vez que caemos.', author: 'Confucio' },
      { text: 'No soy lo que me pasó. Soy lo que elijo ser.', author: 'Carl Jung' },
      { text: 'La lucha en la que estás hoy está desarrollando la fortaleza que necesitas mañana.' },
      { text: 'No puedes volver y cambiar el principio, pero puedes empezar donde estás y cambiar el final.', author: 'C.S. Lewis' },
      { text: 'En medio de la dificultad se encuentra la oportunidad.', author: 'Albert Einstein' },
    ],
  };

  const getRandomDefault = (l: Language) => {
    const arr = DEFAULT_AFFIRMATIONS[l];
    return arr[Math.floor(Math.random() * arr.length)];
  };

  const [affirmation, setAffirmation] = useState(() => getRandomDefault(lang));
  const lastAffirmationRef = React.useRef(affirmation);
  const t = translations[lang];

  const [streak, setStreak] = useState(0);
  const [weekStats, setWeekStats] = useState({ count: 0, totalMinutes: 0, totalMiles: 0 });
  const [hasSessions, setHasSessions] = useState(false);

  useEffect(() => {
    const sessions = getSessions();
    setHasSessions(sessions.length > 0);
    setStreak(getStreak());
    setWeekStats(getWeekStats());
  }, []);

  const fetchAffirmation = () => {
    // Pick from the local pool instantly — guaranteed unique from the last one shown
    let next = getRandomDefault(lang);
    let attempts = 0;
    while (next.text === lastAffirmationRef.current.text && attempts < 10) {
      next = getRandomDefault(lang);
      attempts++;
    }
    lastAffirmationRef.current = next;
    setAffirmation(next);
  };

  useEffect(() => { fetchAffirmation(); }, [lang]);

  return (
    /* FIT TO VIEWPORT — no scroll */
    <div className="w-full h-full flex flex-col p-4 gap-3 overflow-hidden">

      {/* HEADER */}
      <div className="flex-shrink-0">
        <h1 className="text-xl font-normal leading-none dark:text-white font-display">
          Your <span className="text-[#233DFF]">CalmKit</span>
        </h1>
        <p className="text-gray-400 font-medium text-[9px] uppercase tracking-wide mt-0.5">
          {t.homeSubtitle}
        </p>
      </div>

      {/* PROGRESS — only shown after first session */}
      {hasSessions && (
        <div className="flex-shrink-0 bg-white dark:bg-white/5 rounded-xl px-4 py-3 border border-black/5 dark:border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#233DFF]/10 flex items-center justify-center flex-shrink-0">
              <Activity size={15} className="text-[#233DFF]" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold dark:text-white leading-none">
                {streak > 0 ? `${streak}-day streak` : `${weekStats.count} session${weekStats.count !== 1 ? 's' : ''} this week`}
              </span>
              <span className="text-[9px] font-medium text-gray-400 mt-0.5">
                {weekStats.totalMinutes}m · {weekStats.totalMiles}mi
              </span>
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            {[1, 2, 3, 4, 5, 6, 7].map(d => (
              <div
                key={d}
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: d <= streak ? '#233DFF' : 'rgba(35,61,255,0.12)' }}
              />
            ))}
          </div>
        </div>
      )}

      {/* AFFIRMATION */}
      <button
        onClick={fetchAffirmation}
        className="flex-shrink-0 bg-[#FFDE59] rounded-xl px-4 py-3 flex flex-col justify-center relative overflow-hidden active:scale-[0.98] transition-all shadow-md text-left"
      >
        <div className="flex justify-between items-center mb-1">
          <span className="text-[9px] font-medium uppercase tracking-wide text-black/40">
            {t.dailyStrengthLabel}
          </span>
          <RefreshCcw size={11} className="text-black/20" />
        </div>

        <p className="text-base font-bold italic text-black leading-snug font-display">
          {`"${affirmation.text}"`}
        </p>
        {affirmation.author && (
          <p className="text-[10px] font-semibold uppercase tracking-wide text-black/40 mt-1">
            {affirmation.author}
          </p>
        )}
      </button>

      {/* ACTION GRID — fills remaining space on mobile; capped on tablet/desktop so cards don't become tall rectangles */}
      <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-3">

        {/* WALK */}
        <button
          onClick={() => onSelectView('WALK')}
          className="rounded-xl bg-[#233DFF] flex flex-col items-center justify-center gap-1 active:scale-95 shadow-md"
        >
          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-white">
            <Move size={18} />
          </div>
          <span className="font-medium uppercase text-[10px] text-white">
            {t.nav.move}
          </span>
          <span className="text-[8px] font-medium uppercase text-white/60">
            {t.tools.walk.subtitle}
          </span>
        </button>

        {/* BREATHE */}
        <button
          onClick={() => onSelectView('BREATHE')}
          className="rounded-xl bg-white dark:bg-white/5 border border-black/10 dark:border-white/20 flex flex-col items-center justify-center gap-1 active:scale-95 shadow-sm"
        >
          <div className="w-9 h-9 rounded-lg bg-gray-50 dark:bg-black/20 flex items-center justify-center text-[#233DFF]">
            <Wind size={18} />
          </div>
          <span className="font-medium uppercase text-[10px] dark:text-white">
            {t.nav.breathe}
          </span>
          <span className="text-[8px] font-medium uppercase text-gray-400">
            {t.tools.breathe.subtitle}
          </span>
        </button>

        {/* MEDITATE */}
        <button
          onClick={() => onSelectView('MEDITATE')}
          className="rounded-xl bg-white dark:bg-white/5 border border-black/10 dark:border-white/20 flex flex-col items-center justify-center gap-1 active:scale-95 shadow-sm"
        >
          <div className="w-9 h-9 rounded-lg bg-gray-50 dark:bg-black/20 flex items-center justify-center text-[#233DFF]">
            <Sparkles size={18} />
          </div>
          <span className="font-medium uppercase text-[10px] dark:text-white">
            {t.nav.meditate}
          </span>
          <span className="text-[8px] font-medium uppercase text-gray-400">
            {t.tools.meditate.subtitle}
          </span>
        </button>

        {/* REFLECT */}
        <button
          onClick={() => onSelectView('REFLECT')}
          className="rounded-xl bg-white dark:bg-white/5 border border-black/10 dark:border-white/20 flex flex-col items-center justify-center gap-1 active:scale-95 shadow-sm"
        >
          <div className="w-9 h-9 rounded-lg bg-gray-50 dark:bg-black/20 flex items-center justify-center text-[#233DFF]">
            <BookOpen size={18} />
          </div>
          <span className="font-medium uppercase text-[10px] dark:text-white">
            {t.nav.reflect}
          </span>
          <span className="text-[8px] font-medium uppercase text-gray-400">
            {t.tools.journal.subtitle}
          </span>
        </button>

      </div>

      {/* QUICK CENTER */}
      <button
        onClick={() => onSelectView('CENTER')}
        className="flex-shrink-0 w-full bg-black dark:bg-white text-white dark:text-black rounded-xl py-3 px-3 flex items-center justify-between active:scale-[0.98] transition-all shadow-md"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-white/10 dark:bg-black/10 rounded-lg flex items-center justify-center">
            <Zap size={16} fill="currentColor" />
          </div>

          <div className="flex flex-col items-start">
            <span className="font-medium uppercase text-[11px] tracking-wide leading-none">
              {t.tools.grounding.title}
            </span>
            <span className="text-[8px] font-medium uppercase opacity-40 mt-0.5">
              {t.tools.grounding.subtitle}
            </span>
          </div>
        </div>

        <RefreshCcw size={11} className="opacity-40" />
      </button>

    </div>
  );
};

export default Home;
