/**
 * The game along the bottom: score, clocks, period, phase, possession, timeouts, fouls and
 * bonus. Score, clocks and possession have keys, shown on their buttons; timeouts, fouls,
 * period and phase are by mouse. A value still on its way to the server is marked pending.
 */

import { basketball, type GameView, type Side, SIDES } from '@dtv/domain';
import { type ReactNode, useEffect, useState } from 'react';
import { Button, Input, Label, ListBox, ListBoxItem, Popover, Select, SelectValue, TextField } from 'react-aria-components';
import type { Game, GameCommand } from './game';
import { type KeyAction, keyLabel } from './keys';

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

/** `13:59` or `0:42.5` to milliseconds; null for anything else. */
const parseClock = (text: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})(?:\.(\d))?$/.exec(text.trim());
  if (!match) return null;
  return (Number(match[1]) * 60 + Number(match[2])) * 1000 + Number(match[3] ?? 0) * 100;
};

const Key = (props: { readonly action: KeyAction }) => <kbd>{keyLabel(props.action)}</kbd>;

const PHASES = basketball.Phase.options.map((phase) => ({ id: phase, label: phase === 'pregame' ? 'Pregame' : phase[0]!.toUpperCase() + phase.slice(1) }));

function Choose(props: { readonly label: string; readonly className: string; readonly selected: string; readonly options: readonly { id: string; label: string }[]; readonly onChange: (id: string) => void; readonly pending?: boolean }) {
  return (
    <Select className={props.className} aria-label={props.label} selectedKey={props.selected} onSelectionChange={(key) => key !== null && props.onChange(String(key))} data-pending={props.pending || undefined}>
      <Label className="sr-only">{props.label}</Label>
      <Button className="select-button">
        <SelectValue />
        <span aria-hidden>▾</span>
      </Button>
      <Popover className="popover">
        <ListBox className="listbox" items={props.options}>
          {(option) => <ListBoxItem className="option">{option.label}</ListBoxItem>}
        </ListBox>
      </Popover>
    </Select>
  );
}

export function ScoreBar(props: { readonly game: GameView | undefined; readonly board: Game }) {
  const { game } = props;
  const { live, actions, pending } = props.board;
  const now = useNow(!!live && (live.clock.running || !!live.shotClock?.running));
  const [clockText, setClockText] = useState<string | null>(null);
  if (!game || !live || !actions) {
    return <footer className="scorebar empty">{game ? 'Waiting for the game…' : 'This show has no game.'}</footer>;
  }
  const { apply } = actions;
  const waiting = (match: (command: GameCommand) => boolean) => pending.some(match) || undefined;
  const program = game.program as keyof typeof basketball.BASKETBALL_FORMAT;
  const format = basketball.BASKETBALL_FORMAT[program];
  const remaining = basketball.remainingAt(live.clock, now);
  const shot = live.shotClock && basketball.remainingAt(live.shotClock, now);
  const periods = Array.from({ length: format.periods + 2 }, (_, index) => ({ id: String(index + 1), label: basketball.periodLabel(program, index + 1) }));

  const team = (side: Side): ReactNode => {
    const score = live.score[side];
    const fouls = live.team[side].pf;
    const abbreviation = game.sides[side].brand.abbreviation;
    return (
      <div className={`team ${side}`} data-side={side}>
        <span className="abbr">{abbreviation}</span>
        <span className="score" data-testid={`score-${side}`} data-pending={waiting((command) => command.type === 'score' && command.side === side)}>
          {score}
        </span>
        {([1, 2, 3] as const).map((points) => (
          <Button key={points} className="button small keyed" onPress={() => actions.score(side, points)}>
            +{points}
            <Key action={{ type: 'score', side, by: points }} />
          </Button>
        ))}
        <Button className="button small keyed" aria-label={`${abbreviation} minus one`} isDisabled={score === 0} onPress={() => actions.score(side, -1)}>
          −<Key action={{ type: 'score', side, by: -1 }} />
        </Button>
        <span className="timeouts" aria-label={`${live.timeouts[side]} timeouts left`} data-pending={waiting((command) => command.type === 'timeouts' && command.side === side)}>
          TO
          {[0, 1, 2, 3].map((index) => (
            <Button
              key={index}
              className="timeout"
              data-on={index < live.timeouts[side] || undefined}
              aria-label={`${index + 1} timeouts`}
              onPress={() => apply({ type: 'timeouts', side, remaining: index + 1 === live.timeouts[side] ? index : index + 1 })}
            />
          ))}
        </span>
        <span className="fouls" data-pending={waiting((command) => command.type === 'teamLine' && command.side === side)}>
          PF <span className="mono">{fouls}</span>
          <Button className="button small" aria-label={`Foul on ${side}`} onPress={() => apply({ type: 'teamLine', side, line: { pf: fouls + 1 } })}>
            +
          </Button>
          <Button className="button small" aria-label={`Foul off ${side}`} isDisabled={fouls === 0} onPress={() => apply({ type: 'teamLine', side, line: { pf: fouls - 1 } })}>
            −
          </Button>
        </span>
        <Button
          className="button small toggle"
          data-on={live.bonus[side] || undefined}
          data-pending={waiting((command) => command.type === 'bonus' && command.side === side)}
          onPress={() => apply({ type: 'bonus', side, value: !live.bonus[side] })}
        >
          Bonus
        </Button>
      </div>
    );
  };

  return (
    <footer className="scorebar" aria-label="Game">
      {team('away')}
      <div className="clocks">
        {clockText === null ? (
          <Button
            className="clock mono"
            aria-label="Set the game clock"
            data-testid="game-clock"
            data-pending={waiting((command) => command.type === 'clock' || command.type === 'clockSet')}
            onPress={() => setClockText(basketball.formatGameClock(remaining))}
          >
            {basketball.formatGameClock(remaining)}
          </Button>
        ) : (
          <TextField
            className="clock-edit"
            aria-label="Game clock"
            value={clockText}
            onChange={setClockText}
            autoFocus
            onBlur={() => setClockText(null)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setClockText(null);
              if (event.key !== 'Enter') return;
              const ms = parseClock(clockText);
              if (ms !== null) apply({ type: 'clockSet', remainingMs: ms, running: live.clock.running });
              setClockText(null);
            }}
          >
            <Input className="mono" />
          </TextField>
        )}
        <Button className="button small toggle keyed" data-on={live.clock.running || undefined} onPress={actions.clock}>
          {live.clock.running ? 'Stop' : 'Start'}
          <Key action={{ type: 'clock' }} />
        </Button>
        <span className="shot" data-pending={waiting((command) => command.type === 'shotClock')}>
          SC <span className="mono" data-testid="shot-clock">{shot === null || shot === undefined ? '–' : basketball.formatShotClock(shot)}</span>
        </span>
        {([30, 20] as const).map((seconds) => (
          <Button key={seconds} className="button small keyed" onPress={() => actions.shotClock(seconds)}>
            {seconds}
            <Key action={{ type: 'shotClock', seconds }} />
          </Button>
        ))}
        <Choose
          label="Period"
          className="period"
          selected={String(live.period)}
          options={periods}
          onChange={(key) => apply({ type: 'period', period: Number(key) })}
          pending={waiting((command) => command.type === 'period')}
        />
        <Choose
          label="Phase"
          className="phase"
          selected={live.phase}
          options={PHASES}
          onChange={(key) => apply({ type: 'phase', phase: basketball.Phase.parse(key) })}
          pending={waiting((command) => command.type === 'phase')}
        />
        <span className="possession" aria-label="Possession" data-pending={waiting((command) => command.type === 'possession')}>
          {SIDES.map((side) => (
            <Button
              key={side}
              className="button small toggle keyed"
              data-on={live.possession === side || undefined}
              aria-label={`Possession ${game.sides[side].brand.abbreviation}`}
              onPress={() => actions.possession(live.possession === side ? null : side)}
            >
              {side === 'away' ? '◀' : '▶'}
              <Key action={{ type: 'possession', side }} />
            </Button>
          ))}
        </span>
      </div>
      {team('home')}
    </footer>
  );
}
