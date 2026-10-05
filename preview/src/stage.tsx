import React, { useState } from 'react';

export type PreviewGraphic = {
  label: string;
  source: string;
  width: number;
  height: number;
};

/** The canvas, its background choices and the artboard bounds toggle. */
export function Stage({ graphic, canvasRef, ariaLabel, note }: {
  graphic: PreviewGraphic;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  ariaLabel: string;
  note: string;
}) {
  const [background, setBackground] = useState<'dark' | 'light' | 'checker'>('dark');
  const [showGuides, setShowGuides] = useState(false);

  const backgroundClass = {
    dark: 'bg-[#171d26]',
    light: 'bg-[#e5e9ee]',
    checker: 'checkerboard',
  }[background];

  return (
    <section className="min-w-0">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{graphic.label}</h2>
          <p className="mt-1 text-sm text-slate-400">Settled on-air frame · {graphic.width} × {graphic.height} artboard</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="mr-1">Canvas</span>
          {(['dark', 'light', 'checker'] as const).map((option) => (
            <button key={option} type="button" onClick={() => setBackground(option)}
              aria-pressed={background === option}
              className={`rounded-md border px-3 py-1.5 capitalize transition ${background === option ? 'border-sky-400 bg-sky-400/15 text-sky-200' : 'border-white/15 hover:border-white/40'}`}>
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className={`relative flex min-h-[360px] items-center justify-center overflow-hidden rounded-xl border border-white/10 p-6 md:min-h-[480px] ${backgroundClass}`}>
        <div className={`relative w-full max-w-[1920px] ${showGuides ? 'outline outline-1 outline-dashed outline-sky-400/70' : ''}`}>
          <canvas ref={canvasRef} aria-label={ariaLabel} className="block h-auto w-full" width={graphic.width} height={graphic.height} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={showGuides} onChange={(event) => setShowGuides(event.target.checked)} className="accent-sky-400" />
          Show artboard bounds
        </label>
        <span>Rendered from {graphic.source} with the Rive CLI · {note}</span>
      </div>
    </section>
  );
}
