import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HalftimeAdjustmentsPreview } from './halftime_adjustments_preview';
import { ScorebugPreview } from './scorebug_preview';
import './style.css';

// Each graphic owns its controls and Rive instance; only the selected one is mounted.
// The URL hash names the selection, so a link opens the same graphic.
const GRAPHICS = [
  { slug: 'ncaa-basketball-scorebug', label: 'NCAA Basketball Scorebug', Preview: ScorebugPreview },
  { slug: 'basketball-halftime-adjustments', label: 'Basketball Halftime Adjustments', Preview: HalftimeAdjustmentsPreview },
] as const;

const graphicFromHash = () => GRAPHICS.find((entry) => `#${entry.slug}` === window.location.hash) ?? GRAPHICS[0];

function App() {
  const [selected, setSelected] = useState(graphicFromHash);

  useEffect(() => {
    const follow = () => setSelected(graphicFromHash());
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  const { Preview } = selected;

  return (
    <main className="min-h-screen bg-[#0c1118] text-slate-100">
      <header className="border-b border-white/10 px-6 py-5 md:px-10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-sky-400">DTV / Rive</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{selected.label}</h1>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-xs" aria-label="Graphics">
            {GRAPHICS.map((entry) => (
              <a key={entry.slug} href={`#${entry.slug}`} aria-current={entry === selected ? 'page' : undefined}
                className={`rounded-full border px-3 py-1 transition ${entry === selected ? 'border-sky-400 bg-sky-400/15 text-sky-200' : 'border-white/15 text-slate-400 hover:border-white/40'}`}>
                {entry.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <Preview key={selected.slug} />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
