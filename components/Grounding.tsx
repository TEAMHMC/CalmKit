
import React, { useState } from 'react';
import { Language } from '../types';
import { translations } from '../translations';
import { ArrowRight, RotateCcw } from 'lucide-react';

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
    <div className="flex flex-col h-full bg-white dark:bg-[#121212] px-4 pb-4 animate-in fade-in overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center text-center min-h-0">
        {!done ? (
          <div className="w-full space-y-6 animate-in slide-in-from-right-4">
             <div className="space-y-2">
                <span className="text-[72px] sm:text-[96px] font-bold leading-none text-[#233DFF] opacity-10 tabular-nums">{steps[step].count}</span>
                <div className="relative -mt-12 sm:-mt-14">
                   <h3 className="text-3xl sm:text-4xl font-normal tracking-normal dark:text-white font-display">{steps[step].action}</h3>
                   <p className="text-gray-400 font-medium max-w-[200px] mx-auto mt-2 leading-tight uppercase text-xs tracking-wide">{steps[step].text}</p>
                </div>
             </div>

             <div className="flex justify-center gap-3">
                {steps.map((_, i) => (
                  <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-12 bg-black dark:bg-white' : 'w-4 bg-gray-100 dark:bg-white/10'}`}></div>
                ))}
             </div>

             <button
              onClick={() => step < 4 ? setStep(step + 1) : setDone(true)}
              className="w-full bg-black dark:bg-white text-white dark:text-black py-4 rounded-full border border-[#0f0f0f] dark:border-white font-normal text-base flex items-center justify-center gap-2 shadow-lg active:scale-95"
             >
                <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-black" />
                {step < 4 ? t.onboarding.next : t.labels.done} <ArrowRight size={18} />
             </button>
          </div>
        ) : (
          <div className="space-y-6 animate-in zoom-in duration-500">
             <div className="w-20 h-20 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-full flex items-center justify-center mx-auto shadow-xl">
                <img
                  src="https://cdn.prod.website-files.com/67359e6040140078962e8a54/690707bad1dd547278086592_Untitled%20(256%20x%20256%20px)-2.png"
                  className="w-10 h-10 object-contain"
                  alt="HMC Logo"
                />
             </div>
             <div className="space-y-2">
               <h3 className="text-2xl sm:text-3xl font-normal italic dark:text-white font-display">{t.labels.youArePresent}</h3>
               <p className="text-gray-400 font-medium uppercase text-[10px] tracking-wide">{t.labels.safetyFound}</p>
             </div>
             <button onClick={() => { setStep(0); setDone(false); }} className="w-full bg-white dark:bg-transparent border border-[#0f0f0f] dark:border-white py-4 rounded-full font-normal text-base shadow-sm active:scale-95 text-[#1a1a1a] dark:text-white flex items-center justify-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-black dark:bg-white" />
                {t.labels.repeat}
             </button>
          </div>
        )}
      </div>

      <div className="text-center pt-4 opacity-20 flex-shrink-0">
        <span className="text-[10px] font-medium uppercase text-gray-300 tracking-wide">{t.labels.unstoppableGuide}</span>
      </div>
    </div>
  );
};

export default Grounding;
