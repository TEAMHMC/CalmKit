
import React, { useState, useEffect } from 'react';
import { AppView, Language, UserPreferences } from './types';
import { translations } from './translations';
import Home from './components/Home';
import GuidedWalk from './components/GuidedWalk';
import BreathingExercise from './components/BreathingExercise';
import Journal from './components/Journal';
import Grounding from './components/Grounding';
import Meditation from './components/Meditation';
import Onboarding from './components/Onboarding';
import { Home as HomeIcon, Wind, BookOpen, Move, Moon, Sun, Zap, Sparkles, Info } from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('HOME');
  const [prefs, setPrefs] = useState<UserPreferences>(() => {
    const saved = localStorage.getItem('hmc_calmkit_prefs');
    return saved ? JSON.parse(saved) : {
      lang: 'en',
      darkMode: false,
      hasSeenOnboarding: false
    };
  });

  // Read URL parameters from Check-Yourself integration
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const persona = params.get('persona');
    const lang = params.get('lang');
    const phq = params.get('phq');
    const gad = params.get('gad');

    if (lang === 'en' || lang === 'es') {
      setPrefs(p => ({ ...p, lang }));
    }

    if (persona) {
      const personaUpper = persona.toUpperCase();
      const validPersonas = ['HOPE', 'HYPE', 'BREAKTHROUGH', 'STRATEGY'];
      if (validPersonas.includes(personaUpper)) {
        // Pre-select the guided walk view so the persona mode is active
        setView('WALK');
      }
    }

    // Store PHQ/GAD scores for potential use in session context
    if (phq) sessionStorage.setItem('calmkit_phq', phq);
    if (gad) sessionStorage.setItem('calmkit_gad', gad);
  }, []);

  useEffect(() => {
    localStorage.setItem('hmc_calmkit_prefs', JSON.stringify(prefs));
    if (prefs.darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [prefs]);

  const t = translations[prefs.lang];

  const handleOnboardingComplete = () => {
    setPrefs(p => ({ ...p, hasSeenOnboarding: true }));
  };

  const renderView = () => {
    switch (view) {
      case 'HOME': return <Home onSelectView={setView} lang={prefs.lang} />;
      case 'WALK': return <GuidedWalk onBack={() => setView('HOME')} lang={prefs.lang} />;
      case 'BREATHE': return <BreathingExercise onBack={() => setView('HOME')} lang={prefs.lang} />;
      case 'MEDITATE': return <Meditation onBack={() => setView('HOME')} lang={prefs.lang} />;
      case 'REFLECT': return <Journal onBack={() => setView('HOME')} lang={prefs.lang} />;
      case 'CENTER': return <Grounding onBack={() => setView('HOME')} lang={prefs.lang} />;
      case 'ABOUT': return (
        <div className="flex-1 p-8 flex flex-col gap-6 animate-in fade-in overflow-y-auto">
          <h2 className="text-3xl font-normal tracking-normal dark:text-white font-display">{t.aboutTitle}</h2>
          <p className="text-sm font-medium leading-relaxed text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{t.aboutCopy}</p>
          <button onClick={() => setView('HOME')} className="mt-4 h-14 bg-black dark:bg-white text-white dark:text-black rounded-2xl font-bold uppercase text-[10px] tracking-wide shadow-lg">BACK</button>
        </div>
      );
      default: return <Home onSelectView={setView} lang={prefs.lang} />;
    }
  };

  return (
    <div className="flex items-center justify-center w-full h-screen bg-slate-50 dark:bg-black overflow-hidden">
      {!prefs.hasSeenOnboarding && <Onboarding onComplete={handleOnboardingComplete} lang={prefs.lang} />}
      
      <div className="w-full h-full max-w-lg bg-white dark:bg-[#121212] flex flex-col relative overflow-hidden border-x border-gray-100 dark:border-white/5">
        
        <header className="flex-shrink-0 px-6 h-20 flex justify-between items-center z-[110] bg-white dark:bg-[#121212] pt-[env(safe-area-inset-top,0px)]">
           <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('HOME')}>
             <img 
               src="https://cdn.prod.website-files.com/67359e6040140078962e8a54/690707bad1dd547278086592_Untitled%20(256%20x%20256%20px)-2.png" 
               alt="HMC" 
               className="w-8 h-8 object-contain" 
             />
             <div className="flex flex-col">
               <h2 className="font-medium text-[12px] uppercase tracking-normal dark:text-white leading-none">CALMKIT</h2>
               <span className="text-[7px] font-medium uppercase tracking-wide text-[#233DFF]">UNSTOPPABLE</span>
             </div>
           </div>
           
           <div className="flex items-center gap-3">
              <button 
                onClick={() => setView('ABOUT')}
                className="w-9 h-9 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center text-gray-400 shadow-sm"
              >
                <Info size={16} />
              </button>
              <button 
                onClick={() => setPrefs(p => ({ ...p, lang: p.lang === 'en' ? 'es' : 'en' }))}
                className="w-9 h-9 bg-gray-50 dark:bg-white/5 rounded-full text-[9px] font-medium dark:text-white shadow-sm"
              >
                {prefs.lang.toUpperCase()}
              </button>
              <button 
                onClick={() => setPrefs(p => ({ ...p, darkMode: !p.darkMode }))}
                className="w-9 h-9 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center text-gray-400 shadow-sm"
              >
                {prefs.darkMode ? <Sun size={16} /> : <Moon size={16} />}
              </button>
           </div>
        </header>

        <main className="flex-1 overflow-hidden relative flex flex-col min-h-0">
          {renderView()}
        </main>

        <nav className="flex-shrink-0 border-t border-gray-50 dark:border-white/5 bg-white dark:bg-[#121212] flex justify-around items-center h-22 pb-[env(safe-area-inset-bottom,0px)]">
          {[
            { id: 'HOME', icon: <HomeIcon size={20} />, label: t.nav.home },
            { id: 'BREATHE', icon: <Wind size={20} />, label: t.nav.breathe },
            { id: 'WALK', icon: <Move size={20} />, label: t.nav.move },
            { id: 'MEDITATE', icon: <Sparkles size={20} />, label: t.nav.meditate },
            { id: 'REFLECT', icon: <BookOpen size={20} />, label: t.nav.reflect },
            { id: 'CENTER', icon: <Zap size={20} />, label: t.nav.center },
          ].map((navItem) => (
            <button 
              key={navItem.id}
              onClick={() => setView(navItem.id as AppView)} 
              className={`flex flex-col items-center gap-1 flex-1 relative ${view === navItem.id ? 'text-[#233DFF]' : 'text-gray-300'}`}
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${view === navItem.id ? 'bg-[#233DFF]/10 scale-110 shadow-sm' : ''}`}>
                {navItem.icon}
              </div>
              <span className={`text-[8px] font-medium uppercase tracking-wide ${view === navItem.id ? 'opacity-100' : 'opacity-40'}`}>
                {navItem.label}
              </span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default App;
