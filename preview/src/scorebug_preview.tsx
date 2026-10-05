import React, { useEffect, useRef, useState } from 'react';
import { Rive } from '@rive-app/canvas';
import { fieldClass, hexToRgb, loadLogo, releaseLogos } from './common';
import { Stage, type PreviewGraphic } from './stage';
import { DREXEL_ID, SAINT_JOSEPHS_ID, TEAMS, TEAMS_BY_ID, TEAMS_WITH_LOGOS, groupByConference } from './teams';

const graphic: PreviewGraphic = {
  label: 'NCAA Basketball Scorebug',
  source: 'graphics/10_ncaa_basketball_scorebug/10_ncaa_basketball_scorebug.rml',
  width: 1920,
  height: 1080,
};

const GAME_CLOCK_START = (13 * 60) + 59;
const SHOT_CLOCK_START = 24;
const TIMEOUT_MAXIMUM = 4;

type TeamControls = {
  teamId: number;
  acronym: string;
  logoTeamId: number;
  primary: string;
  secondary: string;
  timeouts: number;
  bonus: boolean;
};

const teamDefaults = (teamId: number, timeouts: number, bonus: boolean): TeamControls => {
  const team = TEAMS_BY_ID.get(teamId)!;
  return {
    teamId, acronym: team.abbreviation, logoTeamId: teamId,
    primary: team.primary, secondary: team.secondary,
    timeouts, bonus,
  };
};

const formatClock = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
};

function TeamCard({ side, team, setTeam, draft, setDraft, changeScore }: {
  side: 'away' | 'home';
  team: TeamControls;
  setTeam: React.Dispatch<React.SetStateAction<TeamControls>>;
  draft: string;
  setDraft: (value: string) => void;
  changeScore: (side: 'away' | 'home', amount: number) => void;
}) {
  const update = (patch: Partial<TeamControls>) => setTeam((current) => ({ ...current, ...patch }));
  const selected = TEAMS_BY_ID.get(team.teamId);
  const logoTeam = TEAMS_BY_ID.get(team.logoTeamId);
  // A team with no logo_name in the source data keeps whatever logo is up.
  const selectPreset = (id: number) => {
    const preset = TEAMS_BY_ID.get(id);
    if (!preset) return;
    update({
      teamId: id, acronym: preset.abbreviation,
      logoTeamId: preset.logoUrl ? id : team.logoTeamId,
      primary: preset.primary, secondary: preset.secondary,
    });
  };

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-[#111821] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{team.acronym || '—'}</h3>
        <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{side}</span>
      </div>

      <div>
        <label htmlFor={`${side}-preset`} className="mb-1 block text-xs text-slate-400">Team</label>
        <select id={`${side}-preset`} value={team.teamId} onChange={(event) => selectPreset(Number(event.target.value))} className={fieldClass}>
          {groupByConference(TEAMS).map(([conference, teams]) => (
            <optgroup key={conference} label={conference}>
              {teams.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </optgroup>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-slate-500">{selected ? `${selected.conference} · ${selected.abbreviation}` : '—'}{selected && !selected.logoUrl ? ' · no logo in data' : ''}</p>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between"><label htmlFor={`${side}-score`} className="text-xs text-slate-400">Score</label></div>
        <input id={`${side}-score`} inputMode="numeric" value={draft} onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ''))} className="mb-2 w-full rounded-md border border-white/15 bg-[#0c1118] px-3 py-2 font-mono text-sm outline-none focus:border-sky-400" />
        <div className="grid grid-cols-3 gap-1.5">{[1, 2, 3].map((amount) => <button key={amount} type="button" onClick={() => changeScore(side, amount)} className="rounded-md border border-white/15 py-1 text-xs transition hover:border-sky-400 hover:bg-sky-400/10">+{amount}</button>)}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${side}-acronym`} className="mb-1 block text-xs text-slate-400">Acronym</label>
          <input id={`${side}-acronym`} maxLength={4} value={team.acronym} onChange={(event) => update({ acronym: event.target.value.toUpperCase() })} className={`${fieldClass} font-mono uppercase`} />
        </div>
        <div>
          <label htmlFor={`${side}-logo`} className="mb-1 block text-xs text-slate-400">Logo</label>
          <select id={`${side}-logo`} value={team.logoTeamId} onChange={(event) => update({ logoTeamId: Number(event.target.value) })} className={fieldClass}>
            {groupByConference(TEAMS_WITH_LOGOS).map(([conference, teams]) => (
              <optgroup key={conference} label={conference}>
                {teams.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {logoTeam?.logoUrl ? (
        <div className="flex items-center gap-2 rounded-md border border-white/10 bg-[#0c1118] p-2">
          <img src={logoTeam.logoUrl} alt="" className="h-8 w-8 object-contain" />
          <span className="truncate font-mono text-[11px] text-slate-500">{logoTeam.logoUrl.split('/').pop()}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {([['primary', 'Panel'], ['secondary', 'Accent']] as const).map(([field, label]) => (
          <div key={field}>
            <label htmlFor={`${side}-${field}`} className="mb-1 block text-xs text-slate-400">{label}</label>
            <div className="flex items-center gap-2">
              <input id={`${side}-${field}`} type="color" value={team[field]} onChange={(event) => update(field === 'primary' ? { primary: event.target.value } : { secondary: event.target.value })} className="h-7 w-9 cursor-pointer rounded border border-white/15 bg-[#0c1118]" />
              <span className="font-mono text-[11px] text-slate-500">{team[field].toUpperCase()}</span>
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-slate-400">Timeouts</span>
          <span className="font-mono text-[11px] text-slate-500">{team.timeouts}</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: TIMEOUT_MAXIMUM + 1 }, (_, count) => (
            <button key={count} type="button" onClick={() => update({ timeouts: count })} aria-pressed={team.timeouts === count}
              className={`rounded-md border py-1 text-xs transition ${team.timeouts === count ? 'border-sky-400 bg-sky-400/15 text-sky-200' : 'border-white/15 hover:border-white/40'}`}>
              {count}
            </button>
          ))}
        </div>
      </div>

      <label className="flex cursor-pointer items-center justify-between text-sm">
        <span>Bonus</span>
        <input type="checkbox" checked={team.bonus} onChange={(event) => update({ bonus: event.target.checked })} className="h-4 w-4 accent-sky-400" />
      </label>
    </div>
  );
}

export function ScorebugPreview() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isClockRunning, setIsClockRunning] = useState(true);
  const [period, setPeriod] = useState('2ND');
  const [clockSeconds, setClockSeconds] = useState(GAME_CLOCK_START);
  const [shotClock, setShotClock] = useState(SHOT_CLOCK_START);
  const [awayScore, setAwayScore] = useState(68);
  const [homeScore, setHomeScore] = useState(72);
  const [draftAway, setDraftAway] = useState('68');
  const [draftHome, setDraftHome] = useState('72');
  const [awayTeam, setAwayTeam] = useState<TeamControls>(() => teamDefaults(SAINT_JOSEPHS_ID, 4, true));
  const [homeTeam, setHomeTeam] = useState<TeamControls>(() => teamDefaults(DREXEL_ID, 4, true));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loadedRive, setLoadedRive] = useState<Rive | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const value = Number.parseInt(draftAway, 10);
      if (Number.isFinite(value) && value >= 0) setAwayScore(value);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draftAway]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const value = Number.parseInt(draftHome, 10);
      if (Number.isFinite(value) && value >= 0) setHomeScore(value);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draftHome]);

  useEffect(() => {
    if (!isClockRunning) return;

    const timer = window.setInterval(() => {
      setClockSeconds((current) => {
        if (current <= 1) {
          setIsClockRunning(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isClockRunning]);

  useEffect(() => {
    if (!isClockRunning) return;

    const timer = window.setInterval(() => {
      setShotClock((current) => current <= 0 ? SHOT_CLOCK_START : current - 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isClockRunning]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const rive = new Rive({
      src: '/graphics/ncaa-basketball-scorebug.riv',
      canvas: canvasRef.current,
      artboard: 'NCAA Basketball Scorebug',
      stateMachine: 'Scorebug',
      autoplay: true,
      autoBind: false,
      onLoad: () => {
        rive.resizeDrawingSurfaceToCanvas();
        const viewModel = rive.viewModelByName('BasketballScorebug')?.defaultInstance();
        if (viewModel) rive.bindViewModelInstance(viewModel);
        setLoadedRive(rive);
      },
    });
    return () => { rive.cleanup(); };
  }, []);

  useEffect(() => {
    const instance = loadedRive?.viewModelInstance;
    const away = instance?.number('awayScore');
    const home = instance?.number('homeScore');
    const playing = instance?.boolean('isPlaying');
    const periodValue = instance?.string('period');
    const clock = instance?.string('clock');
    const shotClockValue = instance?.string('shotClock');
    if (away) away.value = awayScore;
    if (home) home.value = homeScore;
    if (playing) playing.value = isPlaying;
    if (periodValue) periodValue.value = period;
    if (clock) clock.value = formatClock(clockSeconds);
    if (shotClockValue) shotClockValue.value = String(shotClock);
  }, [loadedRive, awayScore, homeScore, isPlaying, period, clockSeconds, shotClock]);

  useEffect(() => {
    const instance = loadedRive?.viewModelInstance;
    if (!instance) return;
    for (const [side, team] of [['away', awayTeam], ['home', homeTeam]] as const) {
      const acronym = instance.string(`${side}Acronym`);
      const timeouts = instance.number(`${side}Timeouts`);
      const bonus = instance.boolean(`${side}Bonus`);
      const primary = instance.color(`${side}PrimaryColor`);
      const secondary = instance.color(`${side}SecondaryColor`);
      if (acronym) acronym.value = team.acronym;
      if (timeouts) timeouts.value = team.timeouts;
      if (bonus) bonus.value = team.bonus;
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

  const changeScore = (side: 'away' | 'home', amount: number) => {
    if (side === 'away') {
      const next = Math.max(0, awayScore + amount);
      setAwayScore(next); setDraftAway(String(next));
    } else {
      const next = Math.max(0, homeScore + amount);
      setHomeScore(next); setDraftHome(String(next));
    }
  };

  const resetClocks = () => {
    setClockSeconds(GAME_CLOCK_START);
    setShotClock(SHOT_CLOCK_START);
    setIsClockRunning(false);
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-6 py-8 md:px-10 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Game state</h2>
        <div className="space-y-5 rounded-xl border border-white/10 bg-[#111821] p-4">
          <label className="flex cursor-pointer items-center justify-between text-sm">
            <span>isPlaying <span className="ml-1 text-xs text-slate-500">on air</span></span>
            <input type="checkbox" checked={isPlaying} onChange={(event) => setIsPlaying(event.target.checked)} className="h-4 w-4 accent-sky-400" />
          </label>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="period" className="text-sm font-medium">Period</label>
              <select id="period" value={period} onChange={(event) => setPeriod(event.target.value)} className="rounded-md border border-white/15 bg-[#0c1118] px-2 py-1 font-mono text-xs outline-none focus:border-sky-400">
                <option>1ST</option>
                <option>2ND</option>
                <option>OT</option>
                <option>2OT</option>
              </select>
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium">Game clock</span><span className="font-mono text-lg tabular-nums text-sky-200">{formatClock(clockSeconds)}</span></div>
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500"><span>Shot clock</span><span className="font-mono tabular-nums">{shotClock}</span></div>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => setIsClockRunning((running) => !running)} disabled={clockSeconds === 0} className="rounded-md border border-white/15 py-1.5 text-xs transition hover:border-sky-400 hover:bg-sky-400/10 disabled:cursor-not-allowed disabled:opacity-40">{isClockRunning ? 'Pause' : 'Start'}</button>
              <button type="button" onClick={resetClocks} className="rounded-md border border-white/15 py-1.5 text-xs transition hover:border-sky-400 hover:bg-sky-400/10">Reset</button>
            </div>
          </div>
        </div>

        {([['away', awayTeam, setAwayTeam, draftAway, setDraftAway], ['home', homeTeam, setHomeTeam, draftHome, setDraftHome]] as const).map(([side, team, setTeam, draft, setDraft]) => (
          <TeamCard key={side} side={side} team={team} setTeam={setTeam} draft={draft} setDraft={setDraft} changeScore={changeScore} />
        ))}
      </aside>

      <Stage graphic={graphic} canvasRef={canvasRef} ariaLabel="NCAA basketball scorebug" note="score edits debounce 300ms" />
    </div>
  );
}
