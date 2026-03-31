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
import { Home as HomeIcon, Wind, BookOpen, Move, Moon, Sun, Zap, Sparkles, Info, Download } from 'lucide-react';
import { fullCleanup } from './audioManager';
import NoSleep from "nosleep.js";

const noSleep = new NoSleep();

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('HOME');
  const [immersive, setImmersive] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstall, setShowInstall] = useState(false);

  const [prefs, setPrefs] = useState<UserPreferences>(() => {
    const saved = localStorage.getItem('hmc_calmkit_prefs');
    return saved ? JSON.parse(saved) : {
      lang: 'en',
      darkMode: false,
      hasSeenOnboarding: false
    };
  });

  /* ------------------------------
     ENABLE KEEP AWAKE (WEB ONLY)
  --------------------------------*/
  useEffect(() => {
    const enable = () => {
      try { noSleep.enable(); } catch {}
      document.removeEventListener("click", enable);
    };
    document.addEventListener("click", enable);
  }, []);

  /* ------------------------------
     URL PARAM HANDLING
  --------------------------------*/
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

  /* ------------------------------
     SAVE PREFS + DARK MODE
  --------------------------------*/
  useEffect(() => {
    localStorage.setItem('hmc_calmkit_prefs', JSON.stringify(prefs));
    if (prefs.darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [prefs]);

  /* ------------------------------
     PWA INSTALL
  --------------------------------*/
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone;

    if (!isStandalone) setShowInstall(true);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setInstallPrompt(null);
        setShowInstall(false);
      }
    } else {
      alert(
        prefs.lang === 'es'
          ? 'Toca Compartir (□↑) y luego "Agregar a pantalla de inicio"'
          : 'Tap Share (□↑) then "Add to Home Screen"'
      );
    }
  };

  const t = translations[prefs.lang];

  /* ------------------------------
     SAFE VIEW SWITCH
  --------------------------------*/
  const safeSetView = useCallback((newView: AppView) => {
    fullCleanup();
    setImmersive(false);
    setView(newView);
  }, []);

  /* ------------------------------
     RENDER VIEW
  --------------------------------*/
  const renderView = () => {
    switch (view) {
      case 'HOME': return <Home onSelectView={safeSetView} lang={prefs.lang} />;
      case 'WALK': return <GuidedWalk onBack={() => safeSetView('HOME')} lang={prefs.lang} onImmersiveChange={setImmersive} />;
      case 'BREATHE': return <BreathingExercise onBack={() => safeSetView('HOME')} lang={prefs.lang} />;
      case 'MEDITATE': return <Meditation onBack={() => safeSetView('HOME')} lang={prefs.lang} />;
      case 'REFLECT': return <Journal onBack={() => safeSetView('HOME')} lang={prefs.lang} />;
      case 'CENTER': return <Grounding onBack={() => safeSetView('HOME')} lang={prefs.lang} />;
      case 'ABOUT':
        return (
          <div className="flex-1 px-5 py-6 flex flex-col gap-5 overflow-hidden">
            <h2 className="text-3xl font-normal dark:text-white">{t.aboutTitle}</h2>
            <div className="flex-1 overflow-auto">
              <p className="text-base leading-relaxed text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                {t.aboutCopy}
              </p>
            </div>
            <button
              onClick={() => safeSetView('HOME')}
              className="h-14 bg-black dark:bg-white text-white dark:text-black rounded-full">
              Back
            </button>
          </div>
        );
      default:
        return <Home onSelectView={safeSetView} lang={prefs.lang} />;
    }
  };

  /* ------------------------------
     APP SHELL
  --------------------------------*/
  return (
    <>
      {!prefs.hasSeenOnboarding && (
        <Onboarding
          onComplete={() => setPrefs(p => ({ ...p, hasSeenOnboarding: true }))}
          lang={prefs.lang}
          onLangChange={(l) => setPrefs(p => ({ ...p, lang: l }))}
        />
      )}

      {/* PHONE-SIZED VIEWPORT LOCK */}
      <div className="fixed inset-0 flex justify-center bg-white dark:bg-[#121212]">
        <div className="w-full max-w-[430px] flex flex-col overflow-hidden">

          {/* HEADER */}
          {!immersive && (
            <header
              className="flex-shrink-0 px-5 flex justify-between items-center bg-white dark:bg-[#121212]"
              style={{ height: 56, paddingTop: 'env(safe-area-inset-top)' }}
            >
              <div onClick={() => safeSetView('HOME')} className="flex items-center gap-3">
                <img src="https://cdn.prod.website-files.com/67359e6040140078962e8a54/690707bad1dd547278086592_Untitled%20(256%20x%20256%20px)-2.png"
                  className="w-8 h-8" />
                <div>
                  <h2 className="text-xs uppercase dark:text-white">CALMKIT</h2>
                  <span className="text-[10px] text-[#233DFF]">UNSTOPPABLE</span>
                </div>
              </div>

              <div className="flex gap-2">
                {showInstall &&
                  <button onClick={handleInstall}><Download size={14} /></button>}
                <button onClick={() => safeSetView('ABOUT')}><Info size={14} /></button>
                <button onClick={() => setPrefs(p => ({ ...p, lang: p.lang === 'en' ? 'es' : 'en' }))}>
                  {prefs.lang.toUpperCase()}
                </button>
                <button onClick={() => setPrefs(p => ({ ...p, darkMode: !p.darkMode }))}>
                  {prefs.darkMode ? <Sun size={14} /> : <Moon size={14} />}
                </button>
              </div>
            </header>
          )}

          {/* MAIN */}
          <main className="flex-1 min-h-0 overflow-hidden">
            {renderView()}
          </main>

          {/* BOTTOM NAV */}
          {!immersive && (
            <nav
              className="flex-shrink-0 flex justify-around border-t"
              style={{ height: 56, paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              {[
                { id: 'HOME', icon: <HomeIcon size={18} />, label: t.nav.home },
                { id: 'BREATHE', icon: <Wind size={18} />, label: t.nav.breathe },
                { id: 'WALK', icon: <Move size={18} />, label: t.nav.move },
                { id: 'MEDITATE', icon: <Sparkles size={18} />, label: t.nav.meditate },
                { id: 'REFLECT', icon: <BookOpen size={18} />, label: t.nav.reflect },
                { id: 'CENTER', icon: <Zap size={18} />, label: t.nav.center },
              ].map(n => (
                <button
                  key={n.id}
                  onClick={() => safeSetView(n.id as AppView)}
                  className={`flex flex-col items-center flex-1 ${view === n.id ? 'text-[#233DFF]' : 'text-gray-400'}`}
                >
                  {n.icon}
                  <span className="text-[9px]">{n.label}</span>
                </button>
              ))}
            </nav>
          )}

        </div>
      </div>
    </>
  );
};

export default App;
