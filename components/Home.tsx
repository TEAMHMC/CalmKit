
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
    <div className="w-full h-full p-3 flex flex-col gap-1.5 overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0">
        <h1 className="text-2xl font-normal tracking-normal leading-none dark:text-white font-display">
          Your <span className="text-[#233DFF]">CalmKit</span>
        </h1>
        <p className="text-gray-400 font-medium text-[10px] uppercase tracking-wide">{t.homeSubtitle}</p>
      </div>

      {/* Affirmation Card */}
      <div
        onClick={fetchAffirmation}
        className="bg-[#FFDE59] border border-black/5 rounded-[20px] p-3 flex flex-col justify-center space-y-1 relative overflow-hidden active:scale-[0.98] transition-all cursor-pointer shadow-lg flex-shrink-0"
      >
        <div className="flex justify-between items-center relative z-10">
          <span className="text-[9px] font-medium uppercase tracking-wide text-black/40">{t.dailyStrengthLabel}</span>
          <RefreshCcw size={12} className={`text-black/20 ${loadingAff ? 'animate-spin text-black/60' : ''}`} />
        </div>
        <p className="text-lg font-bold italic text-black leading-snug relative z-10 tracking-normal font-display">
          {loadingAff ? (
            <span className="text-black/40">...</span>
          ) : (
            `"${affirmation}"`
          )}
        </p>
      </div>

      {/* Core Actions Grid — 2x2, centered in available space */}
      <div className="grid grid-cols-2 gap-1.5 flex-1 min-h-0 content-center">
        <button
          onClick={() => onSelectView('WALK')}
          className="p-2 rounded-[20px] bg-[#233DFF] border border-[#233DFF] flex flex-col items-center justify-center text-center gap-1 active:scale-95 shadow-md"
        >
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white">
            <Move size={18} />
          </div>
          <div className="flex flex-col">
            <span className="font-medium uppercase text-[10px] tracking-normal text-white">{t.nav.move}</span>
            <span className="text-[8px] font-medium uppercase tracking-wide text-white/50">{t.tools.walk.subtitle}</span>
          </div>
        </button>

        <button
          onClick={() => onSelectView('BREATHE')}
          className="p-2 rounded-[20px] bg-white dark:bg-white/5 border border-black/10 dark:border-white/20 flex flex-col items-center justify-center text-center gap-1 active:scale-95 shadow-sm"
        >
          <div className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-black/20 flex items-center justify-center text-[#233DFF]">
            <Wind size={18} />
          </div>
          <div className="flex flex-col">
            <span className="font-medium uppercase text-[10px] tracking-normal dark:text-white">{t.nav.breathe}</span>
            <span className="text-[8px] font-medium uppercase tracking-wide text-gray-400">{t.tools.breathe.subtitle}</span>
          </div>
        </button>

        <button
          onClick={() => onSelectView('MEDITATE')}
          className="p-2 rounded-[20px] bg-white dark:bg-white/5 border border-black/10 dark:border-white/20 flex flex-col items-center justify-center text-center gap-1 active:scale-95 shadow-sm"
        >
          <div className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-black/20 flex items-center justify-center text-[#233DFF]">
            <Sparkles size={18} />
          </div>
          <div className="flex flex-col">
            <span className="font-medium uppercase text-[10px] tracking-normal dark:text-white">{t.nav.meditate}</span>
            <span className="text-[8px] font-medium uppercase tracking-wide text-gray-400">{t.tools.meditate.subtitle}</span>
          </div>
        </button>

        <button
          onClick={() => onSelectView('REFLECT')}
          className="p-2 rounded-[20px] bg-white dark:bg-white/5 border border-black/10 dark:border-white/20 flex flex-col items-center justify-center text-center gap-1 active:scale-95 shadow-sm"
        >
          <div className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-black/20 flex items-center justify-center text-[#233DFF]">
            <BookOpen size={18} />
          </div>
          <div className="flex flex-col">
            <span className="font-medium uppercase text-[10px] tracking-normal dark:text-white">{t.nav.reflect}</span>
            <span className="text-[8px] font-medium uppercase tracking-wide text-gray-400">{t.tools.journal.subtitle}</span>
          </div>
        </button>
      </div>

      {/* Quick Center — always visible at bottom */}
      <button
        onClick={() => onSelectView('CENTER')}
        className="flex-shrink-0 w-full bg-black dark:bg-white text-white dark:text-black rounded-[20px] border border-black dark:border-white p-2.5 flex items-center justify-between active:scale-[0.98] transition-all shadow-md"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/10 dark:bg-black/10 rounded-lg flex items-center justify-center">
            <Zap size={16} fill="currentColor" />
          </div>
          <div className="flex flex-col items-start text-left">
            <span className="font-medium uppercase text-[11px] tracking-wide leading-none">{t.tools.grounding.title}</span>
            <span className="text-[8px] font-medium uppercase tracking-wide opacity-40 mt-0.5">{t.tools.grounding.subtitle}</span>
          </div>
        </div>
        <RefreshCcw size={12} className="opacity-40" />
      </button>
    </div>
  );
};

export default Home;
