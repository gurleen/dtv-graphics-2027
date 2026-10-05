import React, { useEffect, useRef, useState } from 'react';
import { Rive } from '@rive-app/canvas';
import { fieldClass, hexToRgb, loadLogo, releaseLogos } from './common';
import { Stage, type PreviewGraphic } from './stage';
import { DREXEL_ID, SAINT_JOSEPHS_ID, TEAMS, TEAMS_BY_ID, TEAMS_WITH_LOGOS, groupByConference } from './teams';

const graphic: PreviewGraphic = {
  label: 'Basketball Halftime Adjustments',
  source: 'graphics/basketball-v2/halftime_adjustments.rml',
  width: 1920,
  height: 1080,
};

// The scene's step property: 0 shows the away team, 1 the home team.
const STEPS = [['away', 'Away'], ['home', 'Home']] as const;
const SUGGESTED_LINE_LENGTH = 30;

type TeamText = {
  teamId: number;
  school: string;
  mascot: string;
  lines: [string, string];
  logoTeamId: number;
  primary: string;
  secondary: string;
};

const teamDefaults = (teamId: number, lines: [string, string]): TeamText => {
  const team = TEAMS_BY_ID.get(teamId)!;
  return {
    teamId, school: team.school.toUpperCase(), mascot: team.mascot.toUpperCase(), lines,
    logoTeamId: teamId, primary: team.primary, secondary: team.secondary,
  };
};

function TeamCard({ side, team, setTeam }: {
  side: 'away' | 'home';
  team: TeamText;
  setTeam: React.Dispatch<React.SetStateAction<TeamText>>;
}) {
  const update = (patch: Partial<TeamText>) => setTeam((current) => ({ ...current, ...patch }));
  const selected = TEAMS_BY_ID.get(team.teamId);
  // A preset sets the names, logo and colours; the adjustments are the operator's.
  const selectPreset = (id: number) => {
    const preset = TEAMS_BY_ID.get(id);
    if (!preset) return;
    update({
      teamId: id, school: preset.school.toUpperCase(), mascot: preset.mascot.toUpperCase(),
      logoTeamId: preset.logoUrl ? id : team.logoTeamId,
      primary: preset.primary, secondary: preset.secondary,
    });
  };
  const setLine = (index: 0 | 1, value: string) =>
    setTeam((current) => {
      const lines: [string, string] = [...current.lines];
      lines[index] = value.toUpperCase();
      return { ...current, lines };
    });

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-[#111821] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{team.school || '—'}</h3>
        <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{side}</span>
      </div>

      <div>
        <label htmlFor={`halftime-${side}-preset`} className="mb-1 block text-xs text-slate-400">Team</label>
        <select id={`halftime-${side}-preset`} value={team.teamId} onChange={(event) => selectPreset(Number(event.target.value))} className={fieldClass}>
          {groupByConference(TEAMS).map(([conference, teams]) => (
            <optgroup key={conference} label={conference}>
              {teams.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </optgroup>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-slate-500">{selected ? `${selected.conference} · ${selected.abbreviation}` : '—'}{selected && !selected.logoUrl ? ' · no logo in data' : ''}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`halftime-${side}-school`} className="mb-1 block text-xs text-slate-400">School</label>
          <input id={`halftime-${side}-school`} value={team.school} onChange={(event) => update({ school: event.target.value.toUpperCase() })} className={`${fieldClass} uppercase`} />
        </div>
        <div>
          <label htmlFor={`halftime-${side}-mascot`} className="mb-1 block text-xs text-slate-400">Mascot</label>
          <input id={`halftime-${side}-mascot`} value={team.mascot} onChange={(event) => update({ mascot: event.target.value.toUpperCase() })} className={`${fieldClass} uppercase`} />
        </div>
      </div>

      {([0, 1] as const).map((index) => (
        <div key={index}>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor={`halftime-${side}-line-${index + 1}`} className="text-xs text-slate-400">Adjustment {index + 1}</label>
            <span className={`font-mono text-[11px] ${team.lines[index].length > SUGGESTED_LINE_LENGTH ? 'text-amber-300' : 'text-slate-500'}`}>{team.lines[index].length}/{SUGGESTED_LINE_LENGTH}</span>
          </div>
          <input id={`halftime-${side}-line-${index + 1}`} value={team.lines[index]} onChange={(event) => setLine(index, event.target.value)} className={`${fieldClass} uppercase`} />
        </div>
      ))}

      <div>
        <label htmlFor={`halftime-${side}-logo`} className="mb-1 block text-xs text-slate-400">Logo</label>
        <select id={`halftime-${side}-logo`} value={team.logoTeamId} onChange={(event) => update({ logoTeamId: Number(event.target.value) })} className={fieldClass}>
          {groupByConference(TEAMS_WITH_LOGOS).map(([conference, teams]) => (
            <optgroup key={conference} label={conference}>
              {teams.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {([['primary', 'Panel'], ['secondary', 'Accent']] as const).map(([field, label]) => (
          <div key={field}>
            <label htmlFor={`halftime-${side}-${field}`} className="mb-1 block text-xs text-slate-400">{label}</label>
            <div className="flex items-center gap-2">
              <input id={`halftime-${side}-${field}`} type="color" value={team[field]} onChange={(event) => update(field === 'primary' ? { primary: event.target.value } : { secondary: event.target.value })} className="h-7 w-9 cursor-pointer rounded border border-white/15 bg-[#0c1118]" />
              <span className="font-mono text-[11px] text-slate-500">{team[field].toUpperCase()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HalftimeAdjustmentsPreview() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [step, setStep] = useState(0);
  const [awayTeam, setAwayTeam] = useState<TeamText>(() => teamDefaults(SAINT_JOSEPHS_ID, ['PUSH THE PACE IN TRANSITION', 'LIMIT SECOND-CHANCE POINTS']));
  const [homeTeam, setHomeTeam] = useState<TeamText>(() => teamDefaults(DREXEL_ID, ['ATTACK THE PAINT EARLY', 'CLOSE OUT ON THREE-POINT SHOOTERS']));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loadedRive, setLoadedRive] = useState<Rive | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const rive = new Rive({
      src: '/graphics/basketball-halftime-adjustments.riv',
      canvas: canvasRef.current,
      artboard: 'Basketball Halftime Adjustments v2',
      stateMachine: 'Halftime Adjustments',
      autoplay: true,
      autoBind: false,
      onLoad: () => {
        rive.resizeDrawingSurfaceToCanvas();
        const viewModel = rive.viewModelByName('BasketballHalftimeAdjustmentsV2')?.defaultInstance();
        if (viewModel) rive.bindViewModelInstance(viewModel);
        setLoadedRive(rive);
      },
    });
    return () => { rive.cleanup(); };
  }, []);

  useEffect(() => {
    const instance = loadedRive?.viewModelInstance;
    const playing = instance?.boolean('isPlaying');
    const stepValue = instance?.number('step');
    if (playing) playing.value = isPlaying;
    if (stepValue) stepValue.value = step;
  }, [loadedRive, isPlaying, step]);

  useEffect(() => {
    const instance = loadedRive?.viewModelInstance;
    if (!instance) return;
    for (const [side, team] of [['away', awayTeam], ['home', homeTeam]] as const) {
      const school = instance.string(`${side}School`);
      const mascot = instance.string(`${side}Mascot`);
      const primary = instance.color(`${side}PrimaryColor`);
      const secondary = instance.color(`${side}SecondaryColor`);
      if (school) school.value = team.school;
      if (mascot) mascot.value = team.mascot;
      team.lines.forEach((line, index) => {
        const target = instance.string(`${side}Line${index + 1}`);
        if (target) target.value = line;
      });
      // rgb() takes channels directly; .value is a signed 32-bit integer.
      if (primary) primary.rgb(...hexToRgb(team.primary));
      if (secondary) secondary.rgb(...hexToRgb(team.secondary));
    }
  }, [loadedRive, awayTeam, homeTeam]);

  useEffect(() => {
    const instance = loadedRive?.viewModelInstance;
    if (!instance) return;
    let cancelled = false;
    for (const [side, id] of [['away', awayTeam.logoTeamId], ['home', homeTeam.logoTeamId]] as const) {
      const url = TEAMS_BY_ID.get(id)?.logoUrl;
      if (!url) continue;
      loadLogo(url).then((image) => {
        const target = instance.image(`${side}Logo`);
        if (!cancelled && target) target.value = image;
      }, (error) => console.error(`Could not load the ${side} logo from ${url}`, error));
    }
    return () => { cancelled = true; };
  }, [loadedRive, awayTeam.logoTeamId, homeTeam.logoTeamId]);

  useEffect(() => releaseLogos, []);

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-6 py-8 md:px-10 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Playout</h2>
        <div className="space-y-5 rounded-xl border border-white/10 bg-[#111821] p-4">
          <label className="flex cursor-pointer items-center justify-between text-sm">
            <span>isPlaying <span className="ml-1 text-xs text-slate-500">on air</span></span>
            <input type="checkbox" checked={isPlaying} onChange={(event) => setIsPlaying(event.target.checked)} className="h-4 w-4 accent-sky-400" />
          </label>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Step</span>
              <span className="font-mono text-[11px] text-slate-500">{step}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {STEPS.map(([side, label], index) => (
                <button key={side} type="button" onClick={() => setStep(index)} aria-pressed={step === index}
                  className={`rounded-md border py-1.5 text-xs transition ${step === index ? 'border-sky-400 bg-sky-400/15 text-sky-200' : 'border-white/15 hover:border-white/40'}`}>
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">On air, a step change plays the team change; off air it is immediate.</p>
          </div>
        </div>

        {([['away', awayTeam, setAwayTeam], ['home', homeTeam, setHomeTeam]] as const).map(([side, team, setTeam]) => (
          <TeamCard key={side} side={side} team={team} setTeam={setTeam} />
        ))}
      </aside>

      <Stage graphic={graphic} canvasRef={canvasRef} ariaLabel="Basketball halftime adjustments" note="presented by Rothman Orthopaedics" />
    </div>
  );
}
