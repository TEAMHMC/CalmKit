
import React, { useState, useEffect, useCallback } from 'react';
import { AppView, UserPreferences } from './types';
import { translations } from './translations';
import Home from './components/Home';
import GuidedWalk from './components/GuidedWalk';
import BreathingExercise from './components/BreathingExercise';
import Journal from './components/Journal';
import Grounding from './components/Grounding';
import Meditation from './components/Meditation';
import Onboarding from './components/Onboarding';
import { Home as HomeIcon, Wind, BookOpen, Move, Moon, Sun, Zap, Sparkles, Info } from 'lucide-react';
import { fullCleanup } from './audioManager';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('HOME');
  const [immersive, setImmersive] = useState(false);
  const [prefs, setPrefs] = useState<UserPreferences>(() => {
    const saved = localStorage.getItem('hmc_calmkit_prefs');
    return saved ? JSON.parse(saved) : {
      lang: 'en',
      darkMode: false,
      hasSeenOnboarding: false
    };
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const persona = params.get('persona');
    const lang = params.get('lang');
    const phq = params.get('phq');
    const gad = params.get('gad');
    if (lang === 'en' || lang === 'es') setPrefs(p => ({ ...p, lang }));
    if (persona) {
      const valid = ['HOPE', 'HYPE', 'BREAKTHROUGH', 'STRATEGY'];
      if (valid.includes(persona.toUpperCase())) setView('WALK');
    }
    if (phq) sessionStorage.setItem('calmkit_phq', phq);
    if (gad) sessionStorage.setItem('calmkit_gad', gad);
  }, []);

  useEffect(() => {
    localStorage.setItem('hmc_calmkit_prefs', JSON.stringify(prefs));
    if (prefs.darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [prefs]);

  const t = translations[prefs.lang];

  // Safe view switch: kill all audio before mounting a new view
  const safeSetView = useCallback((newView: AppView) => {
    fullCleanup();
    setImmersive(false);
    setView(newView);
  }, []);

  const renderView = () => {
    switch (view) {
      case 'HOME': return <Home onSelectView={safeSetView} lang={prefs.lang} />;
      case 'WALK': return <GuidedWalk onBack={() => safeSetView('HOME')} lang={prefs.lang} onImmersiveChange={setImmersive} />;
      case 'BREATHE': return <BreathingExercise onBack={() => safeSetView('HOME')} lang={prefs.lang} />;
      case 'MEDITATE': return <Meditation onBack={() => safeSetView('HOME')} lang={prefs.lang} />;
      case 'REFLECT': return <Journal onBack={() => safeSetView('HOME')} lang={prefs.lang} />;
      case 'CENTER': return <Grounding onBack={() => safeSetView('HOME')} lang={prefs.lang} />;
      case 'ABOUT': return (
        <div className="flex-1 px-5 py-6 flex flex-col gap-5 animate-in fade-in overflow-hidden">
          <h2 className="text-3xl font-normal dark:text-white font-display">{t.aboutTitle}</h2>
          <div className="flex-1 overflow-auto scrollbar-hide">
            <p className="text-base leading-relaxed text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{t.aboutCopy}</p>
          </div>
          <button onClick={() => safeSetView('HOME')} className="h-14 bg-black dark:bg-white text-white dark:text-black rounded-full font-normal text-base shadow-lg flex items-center justify-center active:scale-95">Back</button>
        </div>
      );
      default: return <Home onSelectView={safeSetView} lang={prefs.lang} />;
    }
  };

  return (
    <div className="flex items-center justify-center w-full bg-slate-50 dark:bg-black overflow-hidden" style={{ height: 'var(--app-height, 100vh)' }}>
      {!prefs.hasSeenOnboarding && (
        <Onboarding
          onComplete={() => setPrefs(p => ({ ...p, hasSeenOnboarding: true }))}
          lang={prefs.lang}
          onLangChange={(l) => setPrefs(p => ({ ...p, lang: l }))}
        />
      )}

      <div className="w-full h-full max-w-lg bg-white dark:bg-[#121212] flex flex-col relative overflow-hidden border-x border-gray-100 dark:border-white/5">

        {/* Header */}
        {!immersive && (
          <header className="flex-shrink-0 px-5 h-14 flex justify-between items-center z-[110] bg-white dark:bg-[#121212] pt-[env(safe-area-inset-top,0px)]">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => safeSetView('HOME')}>
              <img src="https://cdn.prod.website-files.com/67359e6040140078962e8a54/690707bad1dd547278086592_Untitled%20(256%20x%20256%20px)-2.png" alt="HMC" className="w-8 h-8 object-contain" />
              <div className="flex flex-col">
                <h2 className="font-medium text-[13px] uppercase dark:text-white leading-none">CALMKIT</h2>
                <span className="text-[10px] font-medium uppercase tracking-wide text-[#233DFF]">UNSTOPPABLE</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => safeSetView('ABOUT')} className="w-8 h-8 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center text-gray-400 active:scale-95"><Info size={14} /></button>
              <button onClick={() => setPrefs(p => ({ ...p, lang: p.lang === 'en' ? 'es' : 'en' }))} className="w-8 h-8 bg-gray-50 dark:bg-white/5 rounded-full text-[11px] font-semibold dark:text-white flex items-center justify-center active:scale-95">{prefs.lang.toUpperCase()}</button>
              <button onClick={() => setPrefs(p => ({ ...p, darkMode: !p.darkMode }))} className="w-8 h-8 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center text-gray-400 active:scale-95">{prefs.darkMode ? <Sun size={14} /> : <Moon size={14} />}</button>
            </div>
          </header>
        )}

        <main className="flex-1 overflow-hidden relative flex flex-col min-h-0">
          {renderView()}
        </main>

        {/* Bottom Nav */}
        {!immersive && (
          <nav className="flex-shrink-0 border-t border-gray-50 dark:border-white/5 bg-white dark:bg-[#121212] flex justify-around items-center h-14 pb-[env(safe-area-inset-bottom,0px)]">
            {[
              { id: 'HOME', icon: <HomeIcon size={18} />, label: t.nav.home },
              { id: 'BREATHE', icon: <Wind size={18} />, label: t.nav.breathe },
              { id: 'WALK', icon: <Move size={18} />, label: t.nav.move },
              { id: 'MEDITATE', icon: <Sparkles size={18} />, label: t.nav.meditate },
              { id: 'REFLECT', icon: <BookOpen size={18} />, label: t.nav.reflect },
              { id: 'CENTER', icon: <Zap size={18} />, label: t.nav.center },
            ].map((n) => (
              <button key={n.id} onClick={() => safeSetView(n.id as AppView)} aria-current={view === n.id ? 'page' : undefined} aria-label={n.label}
                className={`flex flex-col items-center gap-0.5 flex-1 ${view === n.id ? 'text-[#233DFF]' : 'text-gray-300'}`}>
                <div className={`p-1.5 rounded-lg transition-all ${view === n.id ? 'bg-[#233DFF]/5' : ''}`}>{n.icon}</div>
                <span className={`text-[8px] font-medium uppercase ${view === n.id ? 'opacity-100' : 'opacity-40'}`}>{n.label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
};

export default App;
