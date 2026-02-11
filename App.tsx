
import React, { useState, useEffect } from 'react';
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

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('HOME');
  const [immersive, setImmersive] = useState(false);
  const [prefs, setPrefs] = useState<UserPreferences>(() => {
    const saved = localStorage.getItem('hmc_calmkit_prefs');
    return saved
      ? JSON.parse(saved)
      : { lang: 'en', darkMode: false, hasSeenOnboarding: false };
  });

  // ✅ Critical: lock the app height to the *real* viewport height (fixes iOS + iframes)
  useEffect(() => {
    const setAppHeight = () => {
      // window.innerHeight is the most reliable for iOS address bar + iframe
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
    };

    setAppHeight();
    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', setAppHeight);

    return () => {
      window.removeEventListener('resize', setAppHeight);
      window.removeEventListener('orientationchange', setAppHeight);
    };
  }, []);

  // Read URL parameters from Check-Yourself integration
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const persona = params.get('persona');
    const lang = params.get('lang');
    const phq = params.get('phq');
    const gad = params.get('gad');

    if (lang === 'en' || lang === 'es') setPrefs(p => ({ ...p, lang }));

    if (persona) {
      const personaUpper = persona.toUpperCase();
      const validPersonas = ['HOPE', 'HYPE', 'BREAKTHROUGH', 'STRATEGY'];
      if (validPersonas.includes(personaUpper)) setView('WALK');
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

  const handleOnboardingComplete = () => {
    setPrefs(p => ({ ...p, hasSeenOnboarding: true }));
  };

  const renderView = () => {
    switch (view) {
      case 'HOME':
        return <Home onSelectView={setView} lang={prefs.lang} />;
      case 'WALK':
        return <GuidedWalk onBack={() => setView('HOME')} lang={prefs.lang} onImmersiveChange={setImmersive} />;
      case 'BREATHE':
        return <BreathingExercise onBack={() => setView('HOME')} lang={prefs.lang} />;
      case 'MEDITATE':
        return <Meditation onBack={() => setView('HOME')} lang={prefs.lang} />;
      case 'REFLECT':
        return <Journal onBack={() => setView('HOME')} lang={prefs.lang} />;
      case 'CENTER':
        return <Grounding onBack={() => setView('HOME')} lang={prefs.lang} />;
      case 'ABOUT':
        return (
          <div className="flex-1 px-6 py-6 flex flex-col gap-5 animate-in fade-in overflow-hidden">
            <h2 className="text-3xl font-normal tracking-normal dark:text-white font-display">
              {t.aboutTitle}
            </h2>

            {/* Keep About readable without forcing page scroll */}
            <div className="flex-1 overflow-auto scrollbar-hide">
              <p className="text-base font-medium leading-relaxed text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                {t.aboutCopy}
              </p>
            </div>

            <button
              onClick={() => setView('HOME')}
              className="h-14 bg-black dark:bg-white text-white dark:text-black rounded-full border border-[#0f0f0f] dark:border-white font-normal text-base shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              Back
            </button>
          </div>
        );
      default:
        return <Home onSelectView={setView} lang={prefs.lang} />;
    }
  };

  // Safe area values used in shell sizing
  const headerHeight = immersive ? 0 : 64;
  const navHeight = immersive ? 0 : 80;

  return (
    <div
      className="w-full overflow-hidden bg-slate-50 dark:bg-black"
      style={{ height: 'var(--app-height)' }}
    >
      {!prefs.hasSeenOnboarding && (
        <Onboarding
          onComplete={handleOnboardingComplete}
          lang={prefs.lang}
          onLangChange={(l) => setPrefs(p => ({ ...p, lang: l }))}
        />
      )}

      {/* Shell */}
      <div
        className="w-full h-full mx-auto bg-white dark:bg-[#121212] flex flex-col relative overflow-hidden border-x border-gray-100 dark:border-white/5"
        style={{
          maxWidth: 520, // keep your "phone" feel on desktop but full width on mobile
        }}
      >
        {/* Header */}
        <header
          className={`flex-shrink-0 px-5 flex justify-between items-center z-[110] bg-white dark:bg-[#121212] ${immersive ? 'hidden' : ''}`}
          style={{
            // include safe-area in the header box instead of adding extra height
            height: `calc(${headerHeight}px + env(safe-area-inset-top, 0px))`,
            paddingTop: `env(safe-area-inset-top, 0px)`,
          }}
        >
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('HOME')}>
            <img
              src="https://cdn.prod.website-files.com/67359e6040140078962e8a54/690707bad1dd547278086592_Untitled%20(256%20x%20256%20px)-2.png"
              alt="HMC"
              className="w-9 h-9 object-contain"
            />
            <div className="flex flex-col">
              <h2 className="font-medium text-[13px] uppercase tracking-normal dark:text-white leading-none">
                CALMKIT
              </h2>
              <span className="text-[10px] font-medium uppercase tracking-wide text-[#233DFF]">
                UNSTOPPABLE
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setView('ABOUT')}
              className="w-10 h-10 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center text-gray-400 shadow-sm active:scale-95 transition-transform"
            >
              <Info size={18} />
            </button>

            <button
              onClick={() => setPrefs(p => ({ ...p, lang: p.lang === 'en' ? 'es' : 'en' }))}
              className="w-10 h-10 bg-gray-50 dark:bg-white/5 rounded-full text-[11px] font-semibold dark:text-white shadow-sm flex items-center justify-center active:scale-95 transition-transform"
            >
              {prefs.lang.toUpperCase()}
            </button>

            <button
              onClick={() => setPrefs(p => ({ ...p, darkMode: !p.darkMode }))}
              className="w-10 h-10 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center text-gray-400 shadow-sm active:scale-95 transition-transform"
            >
              {prefs.darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
          {renderView()}
        </main>

        {/* Bottom Nav */}
        <nav
          className={`flex-shrink-0 border-t border-gray-100 dark:border-white/5 bg-white dark:bg-[#121212] flex justify-around items-center ${immersive ? 'hidden' : ''}`}
          style={{
            height: `calc(${navHeight}px + env(safe-area-inset-bottom, 0px))`,
            paddingBottom: `env(safe-area-inset-bottom, 0px)`,
          }}
        >
          {[
            { id: 'HOME', icon: <HomeIcon size={22} />, label: t.nav.home },
            { id: 'BREATHE', icon: <Wind size={22} />, label: t.nav.breathe },
            { id: 'WALK', icon: <Move size={22} />, label: t.nav.move },
            { id: 'MEDITATE', icon: <Sparkles size={22} />, label: t.nav.meditate },
            { id: 'REFLECT', icon: <BookOpen size={22} />, label: t.nav.reflect },
            { id: 'CENTER', icon: <Zap size={22} />, label: t.nav.center },
          ].map((navItem) => (
            <button
              key={navItem.id}
              onClick={() => setView(navItem.id as AppView)}
              aria-current={view === navItem.id ? 'page' : undefined}
              aria-label={navItem.label}
              className={`flex flex-col items-center gap-1 flex-1 py-1 relative active:scale-95 transition-transform ${
                view === navItem.id ? 'text-[#233DFF]' : 'text-gray-300'
              }`}
            >
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 ${
                  view === navItem.id ? 'bg-[#233DFF]/10 scale-110 shadow-sm' : ''
                }`}
              >
                {navItem.icon}
              </div>
              <span
                className={`text-[10px] font-medium uppercase tracking-wide ${
                  view === navItem.id ? 'opacity-100' : 'opacity-40'
                }`}
              >
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
