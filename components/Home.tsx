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
  const DEFAULT_AFFIRMATIONS = {
    en: [
      // Unstoppable Season originals
      "You are unstoppable.",
      "You showed up today — that takes courage.",
      "Your presence is your power.",
      "You were built for this season.",
      "Every step forward is proof of your strength.",
      // Universal quotes — secular, non-gendered, broadly inspiring
      '"You have been assigned this mountain to show others it can be moved." — Unknown',
      '"The comeback is always stronger than the setback." — Unknown',
      '"It always seems impossible until it\'s done." — Nelson Mandela',
      '"Our greatest glory is not in never falling, but in rising every time we fall." — Confucius',
      '"I am not what happened to me. I am what I choose to become." — Carl Jung',
      '"The struggle you\'re in today is developing the strength you need tomorrow." — Unknown',
      '"You can\'t go back and change the beginning, but you can start where you are and change the ending." — C.S. Lewis',
      '"In the middle of difficulty lies opportunity." — Albert Einstein',
      '"You have power over your mind, not outside events. Realize this, and you will find strength." — Marcus Aurelius',
      '"Do not judge me by my successes, judge me by how many times I fell down and got back up again." — Nelson Mandela',
      '"The most courageous act is still to think for yourself. Aloud." — Coco Chanel',
      '"If you don\'t like the road you\'re walking, start paving another one." — Dolly Parton',
      '"The only way out is through." — Robert Frost',
      '"You deserve to be here. You deserve to take up space." — Unknown',
    ],
    es: [
      "Eres imparable.",
      "Te presentaste hoy — eso requiere valentía.",
      "Tu presencia es tu poder.",
      "Fuiste hecho para esta temporada.",
      "Cada paso adelante es prueba de tu fortaleza.",
      '"Te han asignado esta montaña para mostrarle a otros que se puede mover." — Desconocido',
      '"La recuperación siempre es más fuerte que la caída." — Desconocido',
      '"Siempre parece imposible hasta que se hace." — Nelson Mandela',
      '"Nuestra mayor gloria no está en nunca caer, sino en levantarnos cada vez que caemos." — Confucio',
      '"No soy lo que me pasó. Soy lo que elijo ser." — Carl Jung',
      '"La lucha en la que estás hoy está desarrollando la fortaleza que necesitas mañana." — Desconocido',
      '"No puedes volver y cambiar el principio, pero puedes empezar donde estás y cambiar el final." — C.S. Lewis',
      '"En medio de la dificultad se encuentra la oportunidad." — Albert Einstein',
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
    while (next === lastAffirmationRef.current && attempts < 10) {
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
          {affirmation.startsWith('"') ? affirmation : `"${affirmation}"`}
        </p>
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
