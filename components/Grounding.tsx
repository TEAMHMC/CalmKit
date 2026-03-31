
import React, { useState } from 'react';
import { Language } from '../types';
import { translations } from '../translations';
import { ArrowRight, Home } from 'lucide-react';

interface GroundingProps {
  onBack: () => void;
  lang: Language;
}

const Grounding: React.FC<GroundingProps> = ({ onBack, lang }) => {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const t = translations[lang];
  const steps = t.groundingSteps;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#121212] px-6 pb-6 animate-in fade-in overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center text-center min-h-0">
        {!done ? (
          <div key={step} className="w-full space-y-8 animate-in slide-in-from-right-4">
             <div className="space-y-2">
                <span className="text-[80px] sm:text-[96px] font-bold leading-none text-[#233DFF] opacity-10 tabular-nums">{steps[step].count}</span>
                <div className="relative -mt-14 sm:-mt-16">
                   <h3 className="text-4xl font-normal tracking-normal dark:text-white font-display">{steps[step].action}</h3>
                   <p className="text-gray-400 font-medium max-w-[240px] mx-auto mt-3 leading-snug uppercase text-sm tracking-wide">{steps[step].text}</p>
                </div>
             </div>

             <div className="flex justify-center gap-3" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={5} aria-label={`Step ${step + 1} of 5`}>
                {steps.map((_, i) => (
                  <div key={i} className={`h-2 rounded-full transition-all ${i === step ? 'w-14 bg-black dark:bg-white' : 'w-4 bg-gray-100 dark:bg-white/10'}`}></div>
                ))}
             </div>

             <button
              onClick={() => step < 4 ? setStep(step + 1) : setDone(true)}
              className="w-full bg-black dark:bg-white text-white dark:text-black h-16 rounded-full border border-[#0f0f0f] dark:border-white font-normal text-base flex items-center justify-center gap-2 shadow-lg active:scale-95"
             >
                {step < 4 ? t.onboarding.next : t.labels.done} <ArrowRight size={20} />
             </button>
          </div>
        ) : (
          <div className="space-y-8 animate-in zoom-in duration-500">
             <div className="w-24 h-24 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-full flex items-center justify-center mx-auto shadow-xl">
                <img
                  src="https://cdn.prod.website-files.com/67359e6040140078962e8a54/690707bad1dd547278086592_Untitled%20(256%20x%20256%20px)-2.png"
                  className="w-12 h-12 object-contain"
                  alt="HMC Logo"
                />
             </div>
             <div className="space-y-2">
               <h3 className="text-3xl font-normal italic dark:text-white font-display">{t.labels.youArePresent}</h3>
               <p className="text-gray-400 font-medium uppercase text-xs tracking-wide">{t.labels.safetyFound}</p>
             </div>
             <button onClick={() => { setStep(0); setDone(false); }} className="w-full bg-white dark:bg-transparent border border-[#0f0f0f] dark:border-white h-16 rounded-full font-normal text-base shadow-sm active:scale-95 text-[#1a1a1a] dark:text-white flex items-center justify-center gap-2">
                {t.labels.repeat}
             </button>
             <button onClick={onBack} className="w-full h-12 rounded-full font-normal text-base text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex items-center justify-center gap-2">
                <Home size={16} /> {t.nav.home}
             </button>
          </div>
        )}
      </div>

      <div className="text-center pt-4 opacity-20 flex-shrink-0">
        <span className="text-[11px] font-medium uppercase text-gray-300 tracking-wide">{t.labels.unstoppableGuide}</span>
      </div>
    </div>
  );
};

export default Grounding;
