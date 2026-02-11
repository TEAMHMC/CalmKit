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
  const [affirmation, setAffirmation] = useState("");
  const [loadingAff, setLoadingAff] = useState(false);
  const t = translations[lang];

  const fetchAffirmation = async () => {
    setLoadingAff(true);
    try {
      const a = await generateAffirmation(lang);
      setAffirmation(a);
    } catch (e) {
      setAffirmation(
        lang === 'en'
          ? "I am capable and resilient."
          : "Soy capaz y resiliente."
      );
    } finally {
      setLoadingAff(false);
    }
  };

  useEffect(() => {
    fetchAffirmation();
  }, [lang]);

  return (
    <div className="flex flex-col h-full min-h-0 px-4 pt-4 pb-3 gap-3 overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0">
        <h1 className="text-2xl font-normal leading-none dark:text-white font-display">
          Your <span className="text-[#233DFF]">CalmKit</span>
        </h1>
        <p className="text-gray-400 font-medium text-[10px] uppercase tracking-wide mt-0.5">
          {t.homeSubtitle}
        </p>
      </div>

      {/* Affirmation Card — compact */}
      <div
        onClick={fetchAffirmation}
        className="flex-shrink-0 bg-[#FFDE59] border border-black/5 rounded-2xl px-4 py-3 flex flex-col justify-center relative overflow-hidden active:scale-[0.98] transition-all cursor-pointer shadow-lg"
      >
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-black/40">
            {t.dailyStrengthLabel}
          </span>
          <RefreshCcw
            size={12}
            className={`text-black/20 ${loadingAff ? 'animate-spin text-black/60' : ''}`}
          />
        </div>
        <p className="text-lg font-bold italic text-black leading-snug tracking-normal font-display">
          {loadingAff ? (
            <span className="text-black/40">...</span>
          ) : (
            `"${affirmation}"`
          )}
        </p>
      </div>

      {/* Core Actions Grid — fills available space */}
      <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-2.5">

        {/* MOVE */}
        <button
          onClick={() => onSelectView('WALK')}
          className="rounded-2xl bg-[#233DFF] border border-[#233DFF] flex flex-col items-center justify-center text-center gap-1.5 active:scale-95 shadow-md overflow-hidden"
        >
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white">
            <Move size={20} />
          </div>
          <div className="flex flex-col">
            <span className="font-medium uppercase text-[11px] text-white">
              {t.nav.move}
            </span>
            <span className="text-[9px] font-medium uppercase text-white/50">
              {t.tools.walk.subtitle}
            </span>
          </div>
        </button>

        {/* BREATHE */}
        <button
          onClick={() => onSelectView('BREATHE')}
          className="rounded-2xl bg-white dark:bg-white/5 border border-black/10 dark:border-white/20 flex flex-col items-center justify-center text-center gap-1.5 active:scale-95 shadow-sm overflow-hidden"
        >
          <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-black/20 flex items-center justify-center text-[#233DFF]">
            <Wind size={20} />
          </div>
          <div className="flex flex-col">
            <span className="font-medium uppercase text-[11px] dark:text-white">
              {t.nav.breathe}
            </span>
            <span className="text-[9px] font-medium uppercase text-gray-400">
              {t.tools.breathe.subtitle}
            </span>
          </div>
        </button>

        {/* CALM */}
        <button
          onClick={() => onSelectView('MEDITATE')}
          className="rounded-2xl bg-white dark:bg-white/5 border border-black/10 dark:border-white/20 flex flex-col items-center justify-center text-center gap-1.5 active:scale-95 shadow-sm overflow-hidden"
        >
          <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-black/20 flex items-center justify-center text-[#233DFF]">
            <Sparkles size={20} />
          </div>
          <div className="flex flex-col">
            <span className="font-medium uppercase text-[11px] dark:text-white">
              {t.nav.meditate}
            </span>
            <span className="text-[9px] font-medium uppercase text-gray-400">
              {t.tools.meditate.subtitle}
            </span>
          </div>
        </button>

        {/* REFLECT */}
        <button
          onClick={() => onSelectView('REFLECT')}
          className="rounded-2xl bg-white dark:bg-white/5 border border-black/10 dark:border-white/20 flex flex-col items-center justify-center text-center gap-1.5 active:scale-95 shadow-sm overflow-hidden"
        >
          <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-black/20 flex items-center justify-center text-[#233DFF]">
            <BookOpen size={20} />
          </div>
          <div className="flex flex-col">
            <span className="font-medium uppercase text-[11px] dark:text-white">
              {t.nav.reflect}
            </span>
            <span className="text-[9px] font-medium uppercase text-gray-400">
              {t.tools.journal.subtitle}
            </span>
          </div>
        </button>
      </div>

      {/* QUICK CENTER — pinned to bottom */}
      <button
        onClick={() => onSelectView('CENTER')}
        className="flex-shrink-0 w-full bg-black dark:bg-white text-white dark:text-black rounded-2xl border border-black dark:border-white p-3 flex items-center justify-between active:scale-[0.98] transition-all shadow-md"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 dark:bg-black/10 rounded-xl flex items-center justify-center">
            <Zap size={18} fill="currentColor" />
          </div>
          <div className="flex flex-col items-start text-left">
            <span className="font-medium uppercase text-[12px] tracking-wide leading-none">
              {t.tools.grounding.title}
            </span>
            <span className="text-[9px] font-medium uppercase opacity-40 mt-0.5">
              {t.tools.grounding.subtitle}
            </span>
          </div>
        </div>
        <RefreshCcw size={12} className="opacity-40" />
      </button>
    </div>
  );
};

export default Home;
