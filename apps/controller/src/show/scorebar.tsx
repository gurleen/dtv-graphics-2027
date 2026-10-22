/**
 * The game along the bottom, to read: score, clocks, period, phase, possession, timeouts,
 * fouls and bonus. Nothing here changes the game; a live data feed will.
 */

import { basketball, type GameView, type Side } from '@dtv/domain';
import { useEffect, useState } from 'react';

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

export function ScoreBar(props: { readonly game: GameView | undefined; readonly live: basketball.BasketballLive | null }) {
  const { game, live } = props;
  const now = useNow(!!live && (live.clock.running || !!live.shotClock?.running));
  if (!game || !live) {
    return <footer className="scorebar empty">Waiting for the game…</footer>;
  }
  const program = game.program as keyof typeof basketball.BASKETBALL_FORMAT;
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
        <span className="period">{basketball.periodLabel(program, live.period)}</span>
        <span className="phase muted">{phaseLabel(live.phase)}</span>
        <span className="possession" aria-label={live.possession ? `Possession ${game.sides[live.possession].brand.abbreviation}` : 'No possession'}>
          <span data-on={live.possession === 'away' || undefined}>◀</span>
          <span data-on={live.possession === 'home' || undefined}>▶</span>
        </span>
      </div>
      {team('home')}
    </footer>
  );
}
