
import React, { useState } from 'react';
import { Language } from '../types';
import { translations } from '../translations';
import { ArrowRight, Check, Wind, Move, BookOpen, Zap } from 'lucide-react';

interface OnboardingProps {
  onComplete: () => void;
  lang: Language;
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete, lang }) => {
  const [step, setStep] = useState(0);
  const t = translations[lang];

  const steps = [
    {
      title: t.onboarding.title,
      desc: t.onboarding.step1,
      icon: <img src="https://cdn.prod.website-files.com/67359e6040140078962e8a54/690707bad1dd547278086592_Untitled%20(256%20x%20256%20px)-2.png" className="w-24 h-24 object-contain" alt="HMC Logo" />,
      color: "bg-transparent"
    },
    {
      title: t.nav.breathe,
      desc: lang === 'en' ? "Find rhythm in your breath. 4-count box breathing to reset." : "Encuentra el ritmo en tu respiración. Respiración de caja de 4 tiempos.",
      icon: <Wind className="text-[#233DFF]" size={56} />,
      color: "bg-white dark:bg-white/5"
    },
    {
      title: t.nav.move,
      desc: t.onboarding.step2,
      icon: <Move className="text-white" size={56} />,
      color: "bg-[#233DFF]"
    },
    {
      title: t.nav.reflect,
      desc: lang === 'en' ? "A safe place for your thoughts. Capture your growth." : "Un lugar seguro para tus pensamientos. Captura tu crecimiento.",
      icon: <BookOpen className="text-[#233DFF]" size={56} />,
      color: "bg-white dark:bg-white/5"
    },
    {
      title: t.nav.center,
      desc: t.onboarding.step3,
      icon: <Zap className="text-white" size={56} />,
      color: "bg-black dark:bg-white/10"
    }
  ];

  const isLastStep = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[200] bg-white dark:bg-[#0a0a0a] flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
      <div className="max-w-sm w-full space-y-12">
        <div className={`w-36 h-36 ${steps[step].color} rounded-[48px] flex items-center justify-center mx-auto transition-all duration-700`}>
          {steps[step].icon}
        </div>

        <div className="space-y-4">
          <h2 className="text-5xl font-normal tracking-normal leading-none dark:text-white font-display">
            {steps[step].title}
          </h2>
          <p className="text-sm font-medium text-gray-400 leading-relaxed px-6">
            {steps[step].desc}
          </p>
        </div>

        <div className="flex justify-center gap-2.5">
          {steps.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-10 bg-[#233DFF]' : 'w-2 bg-gray-100 dark:bg-white/10'}`} />
          ))}
        </div>

        <div className="flex flex-col gap-5 pt-4">
          <button
            onClick={() => isLastStep ? onComplete() : setStep(step + 1)}
            className={`w-full h-16 rounded-full font-bold uppercase tracking-wide text-xs flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl ${isLastStep ? 'bg-[#233DFF] text-white border border-[#233DFF]' : 'bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isLastStep ? 'bg-white' : 'bg-white dark:bg-black'}`} />
            {isLastStep ? t.onboarding.finish : t.onboarding.next}
            {isLastStep ? <Check size={20} /> : <ArrowRight size={20} />}
          </button>

          {step < steps.length - 1 && (
            <button onClick={onComplete} className="text-[11px] font-medium uppercase tracking-wide text-gray-300 hover:text-gray-500 transition-colors">
              {t.labels.skipTutorial}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
