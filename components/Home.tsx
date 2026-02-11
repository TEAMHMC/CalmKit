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
    <div style={{ width: '100%', height: '100%', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>

      {/* Header Section */}
      <div style={{ flexShrink: 0 }}>
        <h1 className="text-xl font-normal leading-none dark:text-white font-display">
          Your <span className="text-[#233DFF]">CalmKit</span>
        </h1>
        <p className="text-gray-400 font-medium text-[9px] uppercase tracking-wide mt-0.5">{t.homeSubtitle}</p>
      </div>

      {/* Affirmation Card */}
      <div
        onClick={fetchAffirmation}
        style={{ flexShrink: 0 }}
        className="bg-[#FFDE59] rounded-xl px-4 py-2.5 flex flex-col justify-center relative overflow-hidden active:scale-[0.98] transition-all cursor-pointer shadow-md"
      >
        <div className="flex justify-between items-center mb-0.5">
          <span className="text-[9px] font-medium uppercase tracking-wide text-black/40">{t.dailyStrengthLabel}</span>
          <RefreshCcw size={11} className={`text-black/20 ${loadingAff ? 'animate-spin text-black/60' : ''}`} />
        </div>
        <p className="text-base font-bold italic text-black leading-snug font-display">
          {loadingAff ? <span className="text-black/40">...</span> : `"${affirmation}"`}
        </p>
      </div>

      {/* Spacer — absorbs extra space so cards don't stretch */}
      <div style={{ flex: '1 1 0%', minHeight: 4 }} />

      {/* Core Actions — 2×2 grid + center bar, natural height */}
      <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button
          onClick={() => onSelectView('WALK')}
          style={{ padding: '20px 0' }}
          className="rounded-xl bg-[#233DFF] flex flex-col items-center justify-center text-center gap-1 active:scale-95 shadow-md"
        >
          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-white"><Move size={18} /></div>
          <span className="font-medium uppercase text-[10px] text-white">{t.nav.move}</span>
          <span className="text-[8px] font-medium uppercase text-white/50">{t.tools.walk.subtitle}</span>
        </button>

        <button
          onClick={() => onSelectView('BREATHE')}
          style={{ padding: '20px 0' }}
          className="rounded-xl bg-white dark:bg-white/5 border border-black/10 dark:border-white/20 flex flex-col items-center justify-center text-center gap-1 active:scale-95 shadow-sm"
        >
          <div className="w-9 h-9 rounded-lg bg-gray-50 dark:bg-black/20 flex items-center justify-center text-[#233DFF]"><Wind size={18} /></div>
          <span className="font-medium uppercase text-[10px] dark:text-white">{t.nav.breathe}</span>
          <span className="text-[8px] font-medium uppercase text-gray-400">{t.tools.breathe.subtitle}</span>
        </button>

        <button
          onClick={() => onSelectView('MEDITATE')}
          style={{ padding: '20px 0' }}
          className="rounded-xl bg-white dark:bg-white/5 border border-black/10 dark:border-white/20 flex flex-col items-center justify-center text-center gap-1 active:scale-95 shadow-sm"
        >
          <div className="w-9 h-9 rounded-lg bg-gray-50 dark:bg-black/20 flex items-center justify-center text-[#233DFF]"><Sparkles size={18} /></div>
          <span className="font-medium uppercase text-[10px] dark:text-white">{t.nav.meditate}</span>
          <span className="text-[8px] font-medium uppercase text-gray-400">{t.tools.meditate.subtitle}</span>
        </button>

        <button
          onClick={() => onSelectView('REFLECT')}
          style={{ padding: '20px 0' }}
          className="rounded-xl bg-white dark:bg-white/5 border border-black/10 dark:border-white/20 flex flex-col items-center justify-center text-center gap-1 active:scale-95 shadow-sm"
        >
          <div className="w-9 h-9 rounded-lg bg-gray-50 dark:bg-black/20 flex items-center justify-center text-[#233DFF]"><BookOpen size={18} /></div>
          <span className="font-medium uppercase text-[10px] dark:text-white">{t.nav.reflect}</span>
          <span className="text-[8px] font-medium uppercase text-gray-400">{t.tools.journal.subtitle}</span>
        </button>

        {/* Quick Center — full width bottom row */}
        <button
          onClick={() => onSelectView('CENTER')}
          style={{ gridColumn: 'span 2' }}
          className="w-full bg-black dark:bg-white text-white dark:text-black rounded-xl py-2.5 px-3 flex items-center justify-between active:scale-[0.98] transition-all shadow-md"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-white/10 dark:bg-black/10 rounded-lg flex items-center justify-center"><Zap size={16} fill="currentColor" /></div>
            <div className="flex flex-col items-start">
              <span className="font-medium uppercase text-[11px] tracking-wide leading-none">{t.tools.grounding.title}</span>
              <span className="text-[8px] font-medium uppercase opacity-40 mt-0.5">{t.tools.grounding.subtitle}</span>
            </div>
          </div>
          <RefreshCcw size={11} className="opacity-40" />
        </button>
      </div>
    </div>
  );
};

export default Home;
