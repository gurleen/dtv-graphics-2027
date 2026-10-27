/**
 * The game along the bottom, to read: score, clocks, period, phase, possession, timeouts,
 * fouls and bonus. The period is the one thing an operator sets here, for a game no feed
 * writes the clock of; everything else a live data feed changes.
 */

import { basketball, type GameView, type Side } from '@dtv/domain';
import { useEffect, useState } from 'react';
import { Button, ListBox, ListBoxItem, Popover, Select, SelectValue } from 'react-aria-components';
import { reasonOf, useCommands } from '../app/commands';
import { useController } from '../app/context';

/** The time now, every tenth of a second while `ticking`. */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [ticking]);
  return ticking ? now : Date.now();
}

const phaseLabel = (phase: basketball.Phase) => (phase === 'pregame' ? 'Pregame' : phase[0]!.toUpperCase() + phase.slice(1));

type Program = keyof typeof basketball.BASKETBALL_FORMAT;

/** Overtimes the menu always offers; a game already past them offers its own too. */
const OVERTIMES = 4;

/** Where the game stands, as one menu choice: a phase, or a period of live play. */
const stageOf = (live: basketball.BasketballLive): string => (live.phase === 'live' ? `period-${live.period}` : live.phase);

/** Regulation periods, halftime at the midpoint, overtimes, then pregame and final. */
function stages(program: Program, live: basketball.BasketballLive) {
  const { periods } = basketball.BASKETBALL_FORMAT[program];
  const last = Math.max(periods + OVERTIMES, live.period);
  const options: { id: string; label: string }[] = [{ id: 'pregame', label: 'Pregame' }];
  for (let period = 1; period <= last; period++) {
    options.push({ id: `period-${period}`, label: basketball.periodLabel(program, period) });
    if (period === periods / 2) options.push({ id: 'halftime', label: 'Halftime' });
  }
  options.push({ id: 'final', label: 'Final' });
  return options;
}

/** The commands that move the game to a stage. Halftime leaves the first half's last period current. */
function commandsTo(program: Program, live: basketball.BasketballLive, stage: string): basketball.BasketballCommand[] {
  const { periods } = basketball.BASKETBALL_FORMAT[program];
  const phase: basketball.Phase = stage.startsWith('period-') ? 'live' : (stage as basketball.Phase);
  const period = stage.startsWith('period-') ? Number(stage.slice('period-'.length)) : stage === 'halftime' ? periods / 2 : stage === 'pregame' ? 1 : live.period;
  return [
    ...(period !== live.period ? [{ type: 'period', period } as const] : []),
    ...(phase !== live.phase ? [{ type: 'phase', phase } as const] : []),
  ];
}

function PeriodSelect(props: { readonly game: GameView; readonly live: basketball.BasketballLive }) {
  const { api } = useController();
  const { fail } = useCommands();
  const { game, live } = props;
  const program = game.program as Program;
  const writer = live.authority.clock;
  const fed = writer !== basketball.OPERATOR;
  const [sending, setSending] = useState(false);
  const choose = async (stage: string) => {
    const commands = commandsTo(program, live, stage);
    if (commands.length === 0) return;
    setSending(true);
    try {
      await api.game.apply({ sport: 'basketball', gameId: live.gameId, source: basketball.OPERATOR, commands });
    } catch (error) {
      fail(`Period not set: ${reasonOf(error)}`);
    } finally {
      setSending(false);
    }
  };
  return (
    <Select
      className="period-select"
      aria-label={fed ? `Period, written by ${writer}` : 'Period'}
      selectedKey={stageOf(live)}
      isDisabled={fed || sending}
      onSelectionChange={(key) => key !== null && void choose(String(key))}
    >
      <Button className="select-button" data-testid="period">
        <SelectValue />
        <span aria-hidden>▾</span>
      </Button>
      <Popover className="popover show-portal">
        <ListBox className="listbox" items={stages(program, live)}>
          {(option) => <ListBoxItem className="option">{option.label}</ListBoxItem>}
        </ListBox>
      </Popover>
    </Select>
  );
}

export function ScoreBar(props: { readonly game: GameView | undefined; readonly live: basketball.BasketballLive | null }) {
  const { game, live } = props;
  const now = useNow(!!live && (live.clock.running || !!live.shotClock?.running));
  if (!game || !live) {
    return <footer className="scorebar empty">Waiting for the game…</footer>;
  }
  const shot = live.shotClock && basketball.remainingAt(live.shotClock, now);

  const team = (side: Side) => {
    const abbreviation = game.sides[side].brand.abbreviation;
    return (
      <div className={`team ${side}`} data-side={side}>
        <span className="abbr">{abbreviation}</span>
        <span className="score" data-testid={`score-${side}`}>
          {live.score[side]}
        </span>
        <span className="timeouts" aria-label={`${live.timeouts[side]} timeouts left`}>
          TO
          {[0, 1, 2, 3].map((index) => (
            <span key={index} className="timeout" data-on={index < live.timeouts[side] || undefined} />
          ))}
        </span>
        <span className="fouls">
          PF <span className="mono">{live.team[side].pf}</span>
        </span>
        {live.bonus[side] && <span className="tag bonus">Bonus</span>}
      </div>
    );
  };

  return (
    <footer className="scorebar" aria-label="Game">
      {team('away')}
      <div className="clocks">
        <span className="clock mono" data-testid="game-clock">
          {basketball.formatGameClock(basketball.remainingAt(live.clock, now))}
        </span>
        <span className="shot">
          SC <span className="mono" data-testid="shot-clock">{shot === null || shot === undefined ? '–' : basketball.formatShotClock(shot)}</span>
        </span>
        <PeriodSelect game={game} live={live} />
        {live.phase === 'live' && <span className="phase muted">{phaseLabel(live.phase)}</span>}
        <span className="possession" aria-label={live.possession ? `Possession ${game.sides[live.possession].brand.abbreviation}` : 'No possession'}>
          <span data-on={live.possession === 'away' || undefined}>◀</span>
          <span data-on={live.possession === 'home' || undefined}>▶</span>
        </span>
      </div>
      {team('home')}
    </footer>
  );
}
