
import React, { useState, useEffect } from 'react';
import { Language, JournalEntry } from '../types';
import { translations } from '../translations';
import { RefreshCcw, Save, History, CheckCircle2 } from 'lucide-react';
import { generateJournalPrompt } from '../geminiService';

interface JournalProps {
  onBack: () => void;
  lang: Language;
}

const Journal: React.FC<JournalProps> = ({ onBack, lang }) => {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const t = translations[lang];

  useEffect(() => {
    const saved = localStorage.getItem('hmc_calm_kit_journal');
    if (saved) setEntries(JSON.parse(saved));
  }, []);

  const fetchPrompt = async () => {
    setIsLoading(true);
    try {
      const p = await generateJournalPrompt(lang);
      setPrompt(p);
    } catch (e) {
      setPrompt(lang === 'en' ? "What are you outgrowing today?" : "¿Qué estás superando hoy?");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompt();
  }, [lang]);

  const handleSave = () => {
    const newEntry: JournalEntry = {
      id: Date.now().toString(),
      prompt,
      response,
      date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    };
    const updated = [newEntry, ...entries];
    setEntries(updated);
    localStorage.setItem('hmc_calm_kit_journal', JSON.stringify(updated));
    setResponse("");
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  if (showHistory) {
    return (
      <div className="flex-1 flex flex-col bg-white dark:bg-[#121212] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-50 dark:border-white/5">
          <span className="font-medium text-[10px] tracking-wide text-[#233DFF] uppercase">{t.labels.history}</span>
          <button onClick={() => setShowHistory(false)} className="text-[10px] font-medium uppercase text-gray-400">{t.labels.close}</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
          {entries.length === 0 && <p className="text-center text-gray-300 py-20 text-xs font-medium uppercase tracking-wide">{t.labels.noEntries}</p>}
          {entries.map(e => (
            <div key={e.id} className="p-6 bg-gray-50 dark:bg-white/5 rounded-[24px] space-y-3">
              <span className="text-[10px] font-medium text-gray-300 uppercase">{e.date}</span>
              <p className="text-[10px] font-bold italic text-gray-400">"{e.prompt}"</p>
              <p className="text-xs font-medium dark:text-white">{e.response}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[#121212] overflow-hidden">
      <div className="px-4 py-4 border-b border-gray-50 dark:border-white/5 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium text-[9px] tracking-wide text-[#233DFF] uppercase">{t.nav.reflect}</span>
          <button onClick={() => setShowHistory(true)} className="text-gray-300 hover:text-black dark:hover:text-white transition-colors">
            <History size={16} />
          </button>
        </div>
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-lg font-[900] italic leading-tight text-black dark:text-white tracking-tight flex-1">
              "{prompt || '...'}"
            </h3>
            <button onClick={fetchPrompt} disabled={isLoading} className={`flex-shrink-0 w-8 h-8 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center active:scale-95 transition-all ${isLoading ? 'animate-spin' : ''}`}>
              <RefreshCcw size={14} className="text-gray-400" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#233DFF] animate-pulse"></div>
            <span className="text-[9px] font-medium uppercase tracking-wide text-gray-400">{t.labels.phaseWitnessing}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col bg-gray-50/50 dark:bg-white/5 rounded-[24px] overflow-hidden shadow-inner border border-gray-100 dark:border-white/5 min-h-0">
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder={t.journalDesc}
            className="w-full h-full p-4 bg-transparent focus:outline-none text-sm font-medium leading-relaxed resize-none dark:text-white placeholder:text-gray-300"
          />
        </div>

        <div className="relative flex-shrink-0">
          {showSuccess && (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-full text-[9px] font-medium uppercase tracking-wide shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-2">
              <CheckCircle2 size={12} /> {t.labels.saved}
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={!response.trim()}
            className="w-full h-14 bg-black dark:bg-white text-white dark:text-black rounded-full border border-[#0f0f0f] dark:border-white font-normal text-base flex items-center justify-center gap-3 disabled:opacity-20 transition-all active:scale-95 shadow-xl"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-black" />
            <Save size={18} /> {t.saveReflection}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Journal;
