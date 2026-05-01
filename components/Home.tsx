import React, { useState, useEffect } from 'react';
import { AppView, Language } from '../types';
import { translations } from '../translations';
import { generateAffirmation } from '../geminiService';
import { RefreshCcw, Move, BookOpen, Zap, Wind, Sparkles } from 'lucide-react';

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
      // Widely accepted quotes & proverbs
      '"She is clothed with strength and dignity." — Proverbs 31:25',
      '"I can do all things through Christ who strengthens me." — Philippians 4:13',
      '"You have been assigned this mountain to show others it can be moved." — Unknown',
      '"The comeback is always stronger than the setback." — Unknown',
      '"It always seems impossible until it\'s done." — Nelson Mandela',
      '"You were born to stand out." — Dr. Seuss',
      '"She believed she could, so she did." — R.S. Grey',
      '"Our greatest glory is not in never falling, but in rising every time we fall." — Confucius',
      '"Be still, and know that I am God." — Psalm 46:10',
      '"I am not what happened to me. I am what I choose to become." — Carl Jung',
      '"The struggle you\'re in today is developing the strength you need tomorrow." — Unknown',
      '"You have within you right now, everything you need to deal with whatever the world can throw at you." — Brian Tracy',
    ],
    es: [
      "Eres imparable.",
      "Te presentaste hoy — eso requiere valentía.",
      "Tu presencia es tu poder.",
      "Fuiste hecho para esta temporada.",
      "Cada paso adelante es prueba de tu fortaleza.",
      '"Está vestida de fuerza y dignidad." — Proverbios 31:25',
      '"Todo lo puedo en Cristo que me fortalece." — Filipenses 4:13',
      '"La recuperación siempre es más fuerte que la caída." — Desconocido',
      '"Siempre parece imposible hasta que se hace." — Nelson Mandela',
      '"No soy lo que me pasó. Soy lo que elijo ser." — Carl Jung',
      '"La lucha en la que estás hoy está desarrollando la fortaleza que necesitas mañana." — Desconocido',
    ],
  };

  const getRandomDefault = (l: Language) => {
    const arr = DEFAULT_AFFIRMATIONS[l];
    return arr[Math.floor(Math.random() * arr.length)];
  };

  const [affirmation, setAffirmation] = useState(() => getRandomDefault(lang));
  const [loadingAff, setLoadingAff] = useState(false);
  const t = translations[lang];

  const fetchAffirmation = async () => {
    // Show a random default immediately so user is never waiting
    setAffirmation(getRandomDefault(lang));
    setLoadingAff(true);
    try {
      const a = await generateAffirmation(lang);
      if (a && a.trim()) setAffirmation(a);
    } catch {
      // Already showing a default — no action needed
    } finally {
      setLoadingAff(false);
    }
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

      {/* AFFIRMATION */}
      <button
        onClick={fetchAffirmation}
        className="flex-shrink-0 bg-[#FFDE59] rounded-xl px-4 py-3 flex flex-col justify-center relative overflow-hidden active:scale-[0.98] transition-all shadow-md text-left"
      >
        <div className="flex justify-between items-center mb-1">
          <span className="text-[9px] font-medium uppercase tracking-wide text-black/40">
            {t.dailyStrengthLabel}
          </span>
          <RefreshCcw
            size={11}
            className={`text-black/20 ${loadingAff ? 'animate-spin text-black/60' : ''}`}
          />
        </div>

        <p className="text-base font-bold italic text-black leading-snug font-display">
          {`"${affirmation}"`}
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
