/**
 * The scorebug page: the Scorebug Slider's lines and a Player Lower Third, each built on
 * the spot and sent as a direct cue, beside my preview, Take and program. Every button
 * shows the text it would put on air, so the operator never airs a line unread.
 */

import { basketball, type GameId, type GameView, type Player, type PlayerId, resolveGame, sameJson, SIDES, type Side, type World } from '@dtv/domain';
import { bindValues, type CueRef, resolveCue, type ShowView, showContext } from '@dtv/playout';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Label, TextField, ToggleButton, ToggleButtonGroup } from 'react-aria-components';
import { useCommands } from '../app/commands';
import { useController } from '../app/context';
import { useStream } from '../app/streams';
import { useShowActions } from '../show/actions';
import { useGame } from '../show/game';
import { Monitor } from '../show/monitor';
import '../show/show.css';
import { scorerFromLines, scorerFromPlays } from './scorer';
import './scorebug.css';

const { PLAYER_GAME_STATS, PLAYER_SEASON_STATS, relevantStats } = basketball;

const SLIDER = 'basketball-v2/scorebug-slider';
const LOWER_THIRD = 'basketball-v2/player-lower-third';

const direct = (graphic: string, params: Record<string, unknown>) => ({ kind: 'direct', graphic, params }) as CueRef;

type Bound = { readonly ok: true; readonly values: Readonly<Record<string, unknown>> } | { readonly ok: false; readonly error: string };

/** What a cue would put on air right now, or why it cannot air. */
function useBound(ref: CueRef, live: basketball.BasketballLive | null): Bound {
  const { world, registry, show: view } = useController();
  if (!world || !view?.game) return { ok: false, error: 'No active game' };
  const context = showContext({ world, gameId: view.game.id, live: (game) => (live?.gameId === game ? live : undefined), now: Date.now() });
  const cue = resolveCue(registry, ref, context);
  if (!cue.ok) return cue;
  try {
    return { ok: true, values: bindValues(cue.entry, { graphic: cue.graphic, params: cue.params, step: 0, overrides: {} }, context) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function ScorebugPage() {
  const { show: view } = useController();
  if (!view) return <p className="loading">Connecting…</p>;
  if (!view.game) return <p className="loading">No game is active. Activate one on the Show page.</p>;
  return <Console view={view} game={view.game.id} />;
}

function Console(props: { readonly view: ShowView; readonly game: GameId }) {
  const { world } = useController();
  const live = useGame(props.game);
  const game = world ? resolveGame(world, props.game) : undefined;
  return (
    <div className="scorebug-page show-portal">
      <Sliders view={props.view} live={live} game={game} />
      {world && game ? <LowerThird view={props.view} live={live} game={game} world={world} /> : <section className="panel" />}
      <Rail view={props.view} />
    </div>
  );
}

/** Air or preview one direct cue, with what it would show and whether it is on program. */
function CueRow(props: { readonly view: ShowView; readonly name: string; readonly cueRef: CueRef; readonly bound: Bound; readonly text: (values: Readonly<Record<string, unknown>>) => string }) {
  const { operator } = useController();
  const { send, pending } = useCommands();
  const { view, cueRef, bound } = props;
  const onAir = sameJson(view.program.lower?.origin, cueRef);
  const inPreview = sameJson(view.preview.lower?.origin, cueRef);
  const airing = pending.some((command) => command.type === 'air' && sameJson(command.ref, cueRef));
  return (
    <div className="quick-row" data-pgm={onAir || undefined} data-pvw={inPreview || undefined}>
      <div className="quick-text">
        <span className="quick-name">
          {props.name}
          {onAir && <span className="tag pgm">PGM</span>}
          {inPreview && <span className="tag pvw">PVW</span>}
        </span>
        {bound.ok ? <span className="quick-value">{props.text(bound.values)}</span> : <span className="cue-error">{bound.error}</span>}
      </div>
      <Button className="button small" isDisabled={!bound.ok} onPress={() => void send({ type: 'cue', operator, ref: cueRef })}>
        Preview
      </Button>
      {onAir ? (
        <Button className="button small danger" onPress={() => void send({ type: 'clear', layer: 'lower', slot: view.program.lower!.id })}>
          Off air
        </Button>
      ) : (
        <Button className="button small primary" isDisabled={!bound.ok} isPending={airing} onPress={() => void send({ type: 'air', operator, ref: cueRef })}>
          Air
        </Button>
      )}
    </div>
  );
}

const sliderText = (values: Readonly<Record<string, unknown>>) => `${String(values.title)} · ${String(values.subtitle)}`;

function SliderRow(props: { readonly view: ShowView; readonly live: basketball.BasketballLive | null; readonly name: string; readonly params: Record<string, unknown> }) {
  const cueRef = direct(SLIDER, props.params);
  const bound = useBound(cueRef, props.live);
  return <CueRow view={props.view} name={props.name} cueRef={cueRef} bound={bound} text={sliderText} />;
}

function Sliders(props: { readonly view: ShowView; readonly live: basketball.BasketballLive | null; readonly game: GameView | undefined }) {
  const { world } = useController();
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const show = world && props.game ? world.get('show', props.game.game.id) : undefined;
  const talents = (show?.crew ?? []).slice(0, 3).map((member) => member.talentId);
  return (
    <section className="panel sliders" aria-label="Scorebug sliders">
      <header className="panel-header">
        <h2>Scorebug slider</h2>
      </header>
      <SliderRow view={props.view} live={props.live} name="Venue" params={{ kind: 'venue' }} />
      <SliderRow view={props.view} live={props.live} name="Commentators" params={{ kind: 'commentators', talents }} />
      {SIDES.map((side) => (
        <SliderRow key={side} view={props.view} live={props.live} name={`${props.game?.sides[side].school.shortName ?? side} insights`} params={{ kind: 'insights', side }} />
      ))}
      <div className="custom-slider">
        <TextField className="field" value={title} onChange={setTitle}>
          <Label>Custom title</Label>
          <Input />
        </TextField>
        <TextField className="field" value={subtitle} onChange={setSubtitle}>
          <Label>Custom subtitle</Label>
          <Input />
        </TextField>
      </div>
      {title.trim() && subtitle.trim() ? (
        <SliderRow view={props.view} live={props.live} name="Custom" params={{ kind: 'custom', title, subtitle }} />
      ) : (
        <p className="empty">Type a title and a subtitle to air a custom line.</p>
      )}
    </section>
  );
}

type LineKind = 'game' | 'season' | 'none';

interface Pick {
  readonly player: PlayerId;
  readonly kind: LineKind;
  readonly stats: readonly string[];
}

const seasonOf = (world: World, player: PlayerId) => {
  const stats = world.get('playerStats', player)?.stats;
  return stats?.sport === 'basketball' ? stats : undefined;
};

/** Tonight's line when it has a stat worth showing, else the season's, with the stats that hold. */
function autoPick(world: World, live: basketball.BasketballLive | null, player: PlayerId, kind?: LineKind): Pick {
  const tonight = live?.players[player];
  const season = seasonOf(world, player);
  const gameStats = tonight ? relevantStats(PLAYER_GAME_STATS, tonight) : [];
  const seasonStats = season ? relevantStats(PLAYER_SEASON_STATS, season) : [];
  const chosen = kind ?? (gameStats.length ? 'game' : seasonStats.length ? 'season' : 'none');
  return { player, kind: chosen, stats: chosen === 'game' ? gameStats : chosen === 'season' ? seasonStats : [] };
}

/** Every stat of the line's catalogue with its value for the player, so a chip always shows its number. */
function statChoices(world: World, live: basketball.BasketballLive | null, pick: Pick): readonly { id: string; label: string; value: string; holds: boolean }[] {
  if (pick.kind === 'game') {
    const line = live?.players[pick.player] ?? basketball.StatLine.parse({});
    return Object.entries(PLAYER_GAME_STATS).map(([id, stat]) => ({ id, label: stat.label, value: stat.value(line), holds: stat.holds(line) }));
  }
  if (pick.kind === 'season') {
    const season = seasonOf(world, pick.player);
    return Object.entries(PLAYER_SEASON_STATS).map(([id, stat]) => ({ id, label: stat.label, value: season ? stat.value(season) : '-', holds: !!season && stat.holds(season) }));
  }
  return [];
}

const paramsOf = (pick: Pick) => ({ player: pick.player, line: pick.kind === 'none' ? { kind: 'none' } : { kind: pick.kind, stats: pick.stats } });

/** The newest scorer: StatCrew's plays when its feed reads this game, else whoever's points last went up while the page was open. */
function useLatestScorer(game: GameView, live: basketball.BasketballLive | null, world: World): Player | null {
  const { api } = useController();
  const feed = useStream((signal) => api.tools.statcrew.watch(undefined, { signal }), [api]);
  const fromPlays = feed?.game === game.game.id ? scorerFromPlays(feed.events, game, world) : null;
  const previous = useRef<basketball.BasketballLive['players'] | null>(null);
  const [fromLines, setFromLines] = useState<PlayerId | null>(null);
  useEffect(() => {
    if (!live) return;
    const scorer = previous.current && scorerFromLines(previous.current, live.players);
    if (scorer) setFromLines(scorer);
    previous.current = live.players;
  }, [live?.players]);
  return fromPlays ?? (fromLines ? (world.get('player', fromLines) ?? null) : null);
}

function LowerThird(props: { readonly view: ShowView; readonly live: basketball.BasketballLive | null; readonly game: GameView; readonly world: World }) {
  const { view, live, game, world } = props;
  const [pick, setPick] = useState<Pick | null>(null);
  const scorer = useLatestScorer(game, live, world);
  const choose = (player: PlayerId, kind?: LineKind) => setPick(autoPick(world, live, player, kind));
  const choices = pick ? statChoices(world, live, pick) : [];
  const full = !!pick && pick.stats.length >= 4;
  const scorerPoints = scorer ? (live?.players[scorer.id]?.pts ?? 0) : 0;
  return (
    <section className="panel lower-third" aria-label="Player lower third">
      <header className="panel-header">
        <h2>Player lower third</h2>
        <Button className="button small primary latest-scorer" isDisabled={!scorer} onPress={() => scorer && choose(scorer.id)}>
          {scorer ? `Latest scorer · #${scorer.jersey} ${`${scorer.firstName} ${scorer.lastName}`.trim()} · ${scorerPoints} PTS` : 'Latest scorer · no basket yet'}
        </Button>
      </header>
      <div className="rosters">
        {SIDES.map((side) => (
          <Roster key={side} side={side} game={game} world={world} live={live} selected={pick?.player ?? null} onPick={choose} />
        ))}
      </div>
      {pick && (
        <div className="line-editor">
          <ToggleButtonGroup
            className="chips"
            aria-label="Stat line"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[pick.kind]}
            onSelectionChange={(keys) => {
              const kind = [...keys][0] as LineKind | undefined;
              if (kind) choose(pick.player, kind);
            }}
          >
            <ToggleButton id="game" className="chip-toggle">Tonight</ToggleButton>
            <ToggleButton id="season" className="chip-toggle">Season</ToggleButton>
            <ToggleButton id="none" className="chip-toggle">Name only</ToggleButton>
          </ToggleButtonGroup>
          {choices.length > 0 && (
            <ToggleButtonGroup
              className="chips stat-chips"
              aria-label="Stats, up to 4, in order"
              selectionMode="multiple"
              selectedKeys={pick.stats}
              onSelectionChange={(keys) => {
                const picked = [...keys].map(String);
                setPick({ ...pick, stats: [...pick.stats.filter((key) => picked.includes(key)), ...picked.filter((key) => !pick.stats.includes(key))] });
              }}
            >
              {choices.map((choice) => (
                <ToggleButton key={choice.id} id={choice.id} className="chip-toggle stat-chip" data-zero={!choice.holds || undefined} isDisabled={full && !pick.stats.includes(choice.id)}>
                  <span className="stat-value">{choice.value}</span> {choice.label}
                  {pick.stats.includes(choice.id) && <span className="order">{pick.stats.indexOf(choice.id) + 1}</span>}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}
          <LowerThirdRow view={view} live={live} pick={pick} />
        </div>
      )}
    </section>
  );
}

function LowerThirdRow(props: { readonly view: ShowView; readonly live: basketball.BasketballLive | null; readonly pick: Pick }) {
  const cueRef = direct(LOWER_THIRD, paramsOf(props.pick));
  const bound = useBound(cueRef, props.live);
  const text = (values: Readonly<Record<string, unknown>>) =>
    [`#${String(values.jerseyNumber)} ${`${String(values.firstName)} ${String(values.lastName)}`.trim()}`, [values.statLabel, values.statLine].filter(Boolean).join(' · ')].filter(Boolean).join(' · ');
  return <CueRow view={props.view} name="Lower third" cueRef={cueRef} bound={bound} text={text} />;
}

function Roster(props: {
  readonly side: Side;
  readonly game: GameView;
  readonly world: World;
  readonly live: basketball.BasketballLive | null;
  readonly selected: PlayerId | null;
  readonly onPick: (player: PlayerId) => void;
}) {
  const { team, brand, school } = props.game.sides[props.side];
  const players = useMemo(
    () => [...props.world.roster(team.id, props.game.season.id)].sort((a, b) => Number(a.jersey) - Number(b.jersey) || a.jersey.localeCompare(b.jersey)),
    [props.world, team.id, props.game.season.id],
  );
  return (
    <div className="roster" aria-label={`${school.name} players`}>
      <h3>{brand.abbreviation}</h3>
      {players.map((player) => {
        const line = props.live?.players[player.id];
        return (
          <Button key={player.id} className="roster-player" data-selected={props.selected === player.id || undefined} onPress={() => props.onPick(player.id)}>
            <span className="jersey">#{player.jersey}</span>
            <span className="player-name">{player.firstName ? `${player.firstName.slice(0, 1)}. ${player.lastName}` : player.lastName}</span>
            <span className="player-stats">
              {line ? `${line.pts} PTS · ${line.reb} REB · ${line.ast} AST` : 'no line'}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

function Rail(props: { readonly view: ShowView }) {
  const { operator } = useController();
  const { problem, dismiss, pending } = useCommands();
  const actions = useShowActions(undefined)!;
  const { view } = props;
  const previewEmpty = Object.keys(view.preview).length === 0;
  return (
    <aside className="rail" aria-label="Monitors">
      <div className="rail-head">
        My preview <span className="tag pvw">PVW</span>
      </div>
      <Monitor name="preview" bus={{ kind: 'preview', operator }} className="pvw" />
      <div className="take-row">
        <Button className="button take" isDisabled={previewEmpty} isPending={pending.some((command) => command.type === 'take')} onPress={actions.take}>
          Take
        </Button>
        <Button className="button" isDisabled={previewEmpty} onPress={actions.clearPreview}>
          Clear PVW
        </Button>
        <Button className="button danger" isDisabled={!view.program.lower} onPress={() => actions.clearLayer('lower')}>
          Clear lower
        </Button>
      </div>
      <div className="problem-slot">
        {problem && (
          <div className="problem-strip" role="alert" key={problem.at}>
            <span>{problem.message}</span>
            <Button className="button small" aria-label="Dismiss" onPress={dismiss}>
              ✕
            </Button>
          </div>
        )}
      </div>
      <div className="rail-head">
        Program <span className="tag pgm">PGM</span>
      </div>
      <Monitor name="program" bus={{ kind: 'program' }} className="pgm" />
    </aside>
  );
}
