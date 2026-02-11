
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
      setAffirmation(lang === 'en' ? "I am capable and resilient." : "Soy capaz y resiliente.");
    } finally {
      setLoadingAff(false);
    }
  };

  useEffect(() => { fetchAffirmation(); }, [lang]);

  return (
    <div className="w-full h-full px-5 py-6 flex flex-col gap-5 justify-center overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0">
        <h1 className="text-3xl font-normal tracking-normal leading-none dark:text-white font-display">
          Your <span className="text-[#233DFF]">CalmKit</span>
        </h1>
        <p className="text-gray-400 font-medium text-xs uppercase tracking-wide mt-1">{t.homeSubtitle}</p>
      </div>

      {/* Affirmation Card */}
      <div
        onClick={fetchAffirmation}
        className="bg-[#FFDE59] border border-black/5 rounded-3xl p-5 flex flex-col justify-center space-y-2 relative overflow-hidden active:scale-[0.98] transition-all cursor-pointer shadow-lg flex-shrink-0"
      >
        <div className="flex justify-between items-center relative z-10">
          <span className="text-[11px] font-medium uppercase tracking-wide text-black/40">{t.dailyStrengthLabel}</span>
          <RefreshCcw size={14} className={`text-black/20 ${loadingAff ? 'animate-spin text-black/60' : ''}`} />
        </div>
        <p className="text-xl font-bold italic text-black leading-snug relative z-10 tracking-normal font-display">
          {loadingAff ? (
            <span className="text-black/40">...</span>
          ) : (
            `"${affirmation}"`
          )}
        </p>
      </div>

      {/* Core Actions Grid */}
      <div className="grid grid-cols-2 gap-3 flex-shrink-0">
        <button
          onClick={() => onSelectView('WALK')}
          className="p-4 rounded-3xl bg-[#233DFF] border border-[#233DFF] flex flex-col items-center justify-center text-center gap-2 active:scale-95 shadow-md min-h-[100px]"
        >
          <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center text-white">
            <Move size={22} />
          </div>
          <div className="flex flex-col">
            <span className="font-medium uppercase text-xs tracking-normal text-white">{t.nav.move}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-white/50">{t.tools.walk.subtitle}</span>
          </div>
        </button>

        <button
          onClick={() => onSelectView('BREATHE')}
          className="p-4 rounded-3xl bg-white dark:bg-white/5 border border-black/10 dark:border-white/20 flex flex-col items-center justify-center text-center gap-2 active:scale-95 shadow-sm min-h-[100px]"
        >
          <div className="w-11 h-11 rounded-xl bg-gray-50 dark:bg-black/20 flex items-center justify-center text-[#233DFF]">
            <Wind size={22} />
          </div>
          <div className="flex flex-col">
            <span className="font-medium uppercase text-xs tracking-normal dark:text-white">{t.nav.breathe}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{t.tools.breathe.subtitle}</span>
          </div>
        </button>

        <button
          onClick={() => onSelectView('MEDITATE')}
          className="p-4 rounded-3xl bg-white dark:bg-white/5 border border-black/10 dark:border-white/20 flex flex-col items-center justify-center text-center gap-2 active:scale-95 shadow-sm min-h-[100px]"
        >
          <div className="w-11 h-11 rounded-xl bg-gray-50 dark:bg-black/20 flex items-center justify-center text-[#233DFF]">
            <Sparkles size={22} />
          </div>
          <div className="flex flex-col">
            <span className="font-medium uppercase text-xs tracking-normal dark:text-white">{t.nav.meditate}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{t.tools.meditate.subtitle}</span>
          </div>
        </button>

        <button
          onClick={() => onSelectView('REFLECT')}
          className="p-4 rounded-3xl bg-white dark:bg-white/5 border border-black/10 dark:border-white/20 flex flex-col items-center justify-center text-center gap-2 active:scale-95 shadow-sm min-h-[100px]"
        >
          <div className="w-11 h-11 rounded-xl bg-gray-50 dark:bg-black/20 flex items-center justify-center text-[#233DFF]">
            <BookOpen size={22} />
          </div>
          <div className="flex flex-col">
            <span className="font-medium uppercase text-xs tracking-normal dark:text-white">{t.nav.reflect}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{t.tools.journal.subtitle}</span>
          </div>
        </button>
      </div>

      {/* Quick Center — always visible at bottom */}
      <button
        onClick={() => onSelectView('CENTER')}
        className="flex-shrink-0 w-full bg-black dark:bg-white text-white dark:text-black rounded-3xl border border-black dark:border-white p-4 flex items-center justify-between active:scale-[0.98] transition-all shadow-md"
      >
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 bg-white/10 dark:bg-black/10 rounded-xl flex items-center justify-center">
            <Zap size={20} fill="currentColor" />
          </div>
          <div className="flex flex-col items-start text-left">
            <span className="font-medium uppercase text-[13px] tracking-wide leading-none">{t.tools.grounding.title}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide opacity-40 mt-0.5">{t.tools.grounding.subtitle}</span>
          </div>
        </div>
        <RefreshCcw size={14} className="opacity-40" />
      </button>
    </div>
  );
};

export default Home;
