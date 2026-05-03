import React, { useState, useEffect, useCallback, Component } from 'react';
import { AppView, UserPreferences } from './types';
import { translations } from './translations';

class ErrorBoundary extends Component<
  { children: React.ReactNode; onBack: () => void },
  { error: Error | null }
> {
  constructor(props: any) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 bg-white dark:bg-[#121212] gap-6 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <span className="text-2xl">⚠️</span>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-stone-800 dark:text-white mb-2">Something went wrong</h2>
            <p className="text-xs text-red-500 font-mono bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-left break-all max-h-40 overflow-auto">
              {this.state.error.message}
            </p>
          </div>
          <button
            onClick={() => { this.setState({ error: null }); this.props.onBack(); }}
            className="px-8 py-3 bg-black dark:bg-white text-white dark:text-black rounded-full font-medium text-sm"
          >
            Back to Home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import Home from './components/Home';
import GuidedWalk from './components/GuidedWalk';
import BreathingExercise from './components/BreathingExercise';
import Journal from './components/Journal';
import Grounding from './components/Grounding';
import Meditation from './components/Meditation';
import Onboarding from './components/Onboarding';
import { Home as HomeIcon, Wind, BookOpen, Move, Moon, Sun, Zap, Sparkles, Info, Download } from 'lucide-react';
import { fullCleanup, destroyAudioContext } from './audioManager';
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
    // Destroy AudioContext first so component cleanup effects
    // can't accidentally re-create audio nodes on a stale context
    destroyAudioContext();
    fullCleanup();
    setImmersive(false);
    // Defer view switch to a microtask so the OLD component unmounts
    // and its cleanup useEffect runs before the new view renders
    setTimeout(() => setView(newView), 0);
  }, []);

  /* ------------------------------
     RENDER VIEW
  --------------------------------*/
  const renderView = () => {
    switch (view) {
      case 'HOME': return <Home onSelectView={safeSetView} lang={prefs.lang} />;
      case 'WALK': return <ErrorBoundary onBack={() => safeSetView('HOME')}><GuidedWalk onBack={() => safeSetView('HOME')} lang={prefs.lang} onImmersiveChange={setImmersive} /></ErrorBoundary>;
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
              className="h-14 bg-black dark:bg-white text-white dark:text-black rounded-full font-normal active:scale-95 transition-all">
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
      {!prefs.hasSeenOnboarding && !(window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone) && (
        <Onboarding
          onComplete={() => setPrefs(p => ({ ...p, hasSeenOnboarding: true }))}
          lang={prefs.lang}
          onLangChange={(l) => setPrefs(p => ({ ...p, lang: l }))}
        />
      )}

      {/* PHONE FRAME — full screen on mobile, floating centered phone on desktop */}
      <div className="fixed inset-0 flex justify-center items-start sm:items-center bg-[#e8e8e8] dark:bg-[#0a0a0a]">
        <div
          className="flex flex-col overflow-hidden bg-white dark:bg-[#121212] w-full h-full sm:h-[844px] sm:max-h-[90vh] sm:rounded-[40px] sm:shadow-[0_40px_120px_-20px_rgba(0,0,0,0.35)] dark:sm:shadow-[0_40px_120px_-20px_rgba(0,0,0,0.7)]"
          style={{ maxWidth: 430 }}
        >

          {/* HEADER */}
          {!immersive && (
            <header
              className="flex-shrink-0 px-5 flex justify-between items-center bg-white dark:bg-[#121212] border-b border-gray-100 dark:border-white/10"
              style={{ minHeight: 56, paddingTop: 'calc(env(safe-area-inset-top) + 8px)', paddingBottom: 8 }}
            >
              <div onClick={() => safeSetView('HOME')} className="flex items-center gap-3 cursor-pointer">
                <img src="https://cdn.prod.website-files.com/67359e6040140078962e8a54/690707bad1dd547278086592_Untitled%20(256%20x%20256%20px)-2.png"
                  className="w-10 h-10 rounded-xl shadow-sm" alt="CalmKit by Health Matters Clinic" />
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-sm font-bold tracking-tight dark:text-white leading-none">Your CalmKit</h2>
                  <span className="text-[9px] font-semibold tracking-widest text-[#233DFF] bg-[#233DFF]/10 dark:bg-[#233DFF]/20 px-2 py-0.5 rounded-full w-fit leading-none">UNSTOPPABLE</span>
                </div>
              </div>

              <div className="flex gap-1">
                {showInstall &&
                  <button onClick={handleInstall} aria-label="Install CalmKit app" className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"><Download size={16} /></button>}
                <button onClick={() => safeSetView('ABOUT')} aria-label="About CalmKit" className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"><Info size={16} /></button>
                <button onClick={() => setPrefs(p => ({ ...p, lang: p.lang === 'en' ? 'es' : 'en' }))} aria-label={prefs.lang === 'en' ? 'Switch to Spanish' : 'Cambiar a inglés'} className="w-11 h-11 flex items-center justify-center rounded-full text-xs font-bold hover:bg-gray-100 dark:hover:bg-white/10 dark:text-white transition-colors">
                  {prefs.lang.toUpperCase()}
                </button>
                <button onClick={() => setPrefs(p => ({ ...p, darkMode: !p.darkMode }))} aria-label={prefs.darkMode ? 'Switch to light mode' : 'Switch to dark mode'} className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                  {prefs.darkMode ? <Sun size={16} /> : <Moon size={16} />}
                </button>
              </div>
            </header>
          )}

          {/* MAIN */}
          <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {renderView()}
          </main>

          {/* BOTTOM NAV */}
          {!immersive && (
            <nav
              className="flex-shrink-0 flex justify-around border-t dark:border-white/10"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
              aria-label="Main navigation"
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
                  aria-label={n.label}
                  aria-current={view === n.id ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center flex-1 min-h-[44px] py-2 relative ${view === n.id ? 'text-[#233DFF]' : 'text-gray-400 dark:text-gray-500'}`}
                >
                  {view === n.id && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2px] rounded-full bg-[#233DFF]" />}
                  {n.icon}
                  <span className="text-[9px] mt-0.5">{n.label}</span>
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
