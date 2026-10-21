/**
 * The game, by mouse: score, clocks, period, possession, timeouts, fouls and bonus. Every
 * button sends an absolute value computed from what it shows, so two operators pressing +2
 * for one basket agree. Keys for these come in phase 5.
 */

import { basketball, type GameView, type Side, SIDES, SourceId } from '@dtv/domain';
import { useEffect, useState } from 'react';
import { Button, Input, Label, ListBox, ListBoxItem, Popover, Select, SelectValue, TextField } from 'react-aria-components';
import { reasonOf, useCommands } from '../app/commands';
import { useController } from '../app/context';

type Live = basketball.BasketballLive;
type Command = basketball.BasketballCommand;

const OPERATOR = SourceId.parse('operator');

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

export function ScoreBar(props: { readonly game: GameView | undefined; readonly live: Live | null }) {
  const { api } = useController();
  const { fail } = useCommands();
  const { game, live } = props;
  const now = useNow(!!live && (live.clock.running || !!live.shotClock?.running));
  const [clockText, setClockText] = useState<string | null>(null);
  if (!game || !live) {
    return <footer className="scorebar empty">{game ? 'Waiting for the game…' : 'This show has no game.'}</footer>;
  }
  const apply = (...commands: Command[]) =>
    void api.game
      .apply({ sport: 'basketball', gameId: live.gameId, source: OPERATOR, commands: [commands[0]!, ...commands.slice(1)] })
      .catch((error) => fail(`Game not updated: ${reasonOf(error)}`));
  const program = game.program as keyof typeof basketball.BASKETBALL_FORMAT;
  const format = basketball.BASKETBALL_FORMAT[program];
  const remaining = basketball.remainingAt(live.clock, now);
  const shot = live.shotClock && basketball.remainingAt(live.shotClock, now);
  const periods = Array.from({ length: format.periods + 2 }, (_, index) => ({ id: String(index + 1), label: basketball.periodLabel(program, index + 1) }));

  const team = (side: Side) => {
    const score = live.score[side];
    const fouls = live.team[side].pf;
    return (
      <div className={`team ${side}`} data-side={side}>
        <span className="abbr">{game.sides[side].brand.abbreviation}</span>
        <span className="score" data-testid={`score-${side}`}>
          {score}
        </span>
        {[1, 2, 3].map((points) => (
          <Button key={points} className="button small" onPress={() => apply({ type: 'score', side, value: score + points })}>
            +{points}
          </Button>
        ))}
        <Button className="button small" aria-label={`Take a point off ${side}`} isDisabled={score === 0} onPress={() => apply({ type: 'score', side, value: score - 1 })}>
          −
        </Button>
        <span className="timeouts" aria-label={`${live.timeouts[side]} timeouts left`}>
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
        <span className="fouls">
          fouls <span className="mono">{fouls}</span>
          <Button className="button small" aria-label={`Foul on ${side}`} onPress={() => apply({ type: 'teamLine', side, line: { pf: fouls + 1 } })}>
            +
          </Button>
          <Button className="button small" aria-label={`Foul off ${side}`} isDisabled={fouls === 0} onPress={() => apply({ type: 'teamLine', side, line: { pf: fouls - 1 } })}>
            −
          </Button>
        </span>
        <Button className="button small toggle" data-on={live.bonus[side] || undefined} onPress={() => apply({ type: 'bonus', side, value: !live.bonus[side] })}>
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
          <Button className="clock mono" aria-label="Set the game clock" onPress={() => setClockText(basketball.formatGameClock(remaining))}>
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
        <Button className="button small toggle" data-on={live.clock.running || undefined} onPress={() => apply({ type: 'clock', action: live.clock.running ? 'stop' : 'start' })}>
          {live.clock.running ? 'Stop' : 'Start'}
        </Button>
        <span className="shot">
          SC <span className="mono">{shot === null || shot === undefined ? '–' : basketball.formatShotClock(shot)}</span>
        </span>
        {[30, 20].map((seconds) => (
          <Button key={seconds} className="button small" onPress={() => apply({ type: 'shotClock', remainingMs: seconds * 1000, running: live.clock.running })}>
            {seconds}
          </Button>
        ))}
        <Select className="period" aria-label="Period" selectedKey={String(live.period)} onSelectionChange={(key) => key !== null && apply({ type: 'period', period: Number(key) })}>
          <Label className="sr-only">Period</Label>
          <Button className="select-button">
            <SelectValue />
            <span aria-hidden>▾</span>
          </Button>
          <Popover className="popover">
            <ListBox className="listbox" items={periods}>
              {(option) => <ListBoxItem className="option">{option.label}</ListBoxItem>}
            </ListBox>
          </Popover>
        </Select>
        <span className="possession" aria-label="Possession">
          Poss
          {SIDES.map((side) => (
            <Button
              key={side}
              className="button small toggle"
              data-on={live.possession === side || undefined}
              aria-label={`Possession ${game.sides[side].brand.abbreviation}`}
              onPress={() => apply({ type: 'possession', side: live.possession === side ? null : side })}
            >
              {side === 'away' ? '◀' : '▶'}
            </Button>
          ))}
        </span>
      </div>
      {team('home')}
    </footer>
  );
}
