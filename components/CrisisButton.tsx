import React, { useState } from 'react';
import { LifeBuoy, Phone, MessageSquare, X } from 'lucide-react';

/**
 * Persistent, always-tappable crisis-support affordance.
 *
 * Rendered globally by App.tsx so it is reachable from Home, every mode, and
 * during immersive sessions — not buried on a single screen. Opens a sheet with
 * real tel:/sms: links to the 988 Suicide & Crisis Lifeline, Crisis Text Line
 * (741741), and 911. This is a safety requirement: a distressed user must be one
 * tap from a trained counselor at any point in the app.
 */

interface CrisisButtonProps {
  lang: 'en' | 'es';
  immersive?: boolean;
}

const COPY = {
  en: {
    trigger: 'Get help',
    title: 'You are not alone',
    subtitle:
      'If you are in crisis or thinking about harming yourself, reach a trained counselor now. Free, confidential, and available 24/7.',
    call988: 'Call 988',
    call988sub: 'Suicide & Crisis Lifeline',
    text988: 'Text 988',
    text988sub: 'Message a crisis counselor',
    text741: 'Text HOME to 741741',
    text741sub: 'Crisis Text Line',
    call911: 'Call 911',
    call911sub: 'If you or someone else is in immediate danger',
    close: 'Close',
  },
  es: {
    trigger: 'Ayuda',
    title: 'No estás solo/a',
    subtitle:
      'Si estás en crisis o piensas en hacerte daño, comunícate ahora con un consejero capacitado. Es gratis, confidencial y está disponible 24/7.',
    call988: 'Llama al 988',
    call988sub: 'Línea de Prevención del Suicidio y Crisis',
    text988: 'Envía un texto al 988',
    text988sub: 'Escríbele a un consejero de crisis',
    text741: 'Envía HOME al 741741',
    text741sub: 'Línea de Texto de Crisis',
    call911: 'Llama al 911',
    call911sub: 'Si tú u otra persona está en peligro inmediato',
    close: 'Cerrar',
  },
};

const CrisisButton: React.FC<CrisisButtonProps> = ({ lang, immersive }) => {
  const [open, setOpen] = useState(false);
  const t = COPY[lang] || COPY.en;

  return (
    <>
      {/* Floating trigger — always present, sits above the bottom nav (or lower
          when the nav is hidden during immersive sessions). */}
      <button
        onClick={() => setOpen(true)}
        aria-label={lang === 'es' ? 'Obtener ayuda en crisis' : 'Get crisis help'}
        className="absolute right-4 z-40 flex items-center gap-1.5 px-3.5 h-10 rounded-full bg-[#233DFF] text-white shadow-lg shadow-[#233DFF]/30 active:scale-95 transition-transform"
        style={{ bottom: immersive ? 'calc(env(safe-area-inset-bottom) + 20px)' : 'calc(env(safe-area-inset-bottom) + 72px)' }}
      >
        <LifeBuoy size={16} />
        <span className="text-xs font-semibold">{t.trigger}</span>
      </button>

      {open && (
        <div
          className="absolute inset-0 z-50 flex items-end justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={t.title}
        >
          {/* Scrim */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />

          {/* Sheet */}
          <div className="relative w-full bg-white dark:bg-[#1a1a1a] rounded-t-[28px] px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-2xl">
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-xl font-semibold dark:text-white">{t.title}</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label={t.close}
                className="w-9 h-9 -mr-1 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400 mb-4">
              {t.subtitle}
            </p>

            <div className="flex flex-col gap-2.5">
              <a
                href="tel:988"
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#233DFF] text-white active:scale-[0.98] transition-transform"
              >
                <Phone size={20} className="flex-shrink-0" />
                <span className="flex flex-col">
                  <span className="font-semibold leading-tight">{t.call988}</span>
                  <span className="text-xs opacity-80 leading-tight">{t.call988sub}</span>
                </span>
              </a>

              <a
                href="sms:988"
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white active:scale-[0.98] transition-transform"
              >
                <MessageSquare size={20} className="flex-shrink-0" />
                <span className="flex flex-col">
                  <span className="font-semibold leading-tight">{t.text988}</span>
                  <span className="text-xs opacity-70 leading-tight">{t.text988sub}</span>
                </span>
              </a>

              <a
                href="sms:741741"
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white active:scale-[0.98] transition-transform"
              >
                <MessageSquare size={20} className="flex-shrink-0" />
                <span className="flex flex-col">
                  <span className="font-semibold leading-tight">{t.text741}</span>
                  <span className="text-xs opacity-70 leading-tight">{t.text741sub}</span>
                </span>
              </a>

              <a
                href="tel:911"
                className="flex items-center gap-3 p-3.5 rounded-2xl border border-gray-200 dark:border-white/15 text-gray-900 dark:text-white active:scale-[0.98] transition-transform"
              >
                <Phone size={20} className="flex-shrink-0 text-red-600" />
                <span className="flex flex-col">
                  <span className="font-semibold leading-tight">{t.call911}</span>
                  <span className="text-xs opacity-70 leading-tight">{t.call911sub}</span>
                </span>
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CrisisButton;
