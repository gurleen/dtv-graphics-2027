/** The StatCrew file's play by play, newest first: in full on the StatCrew tab, compact on the Show rail. */

import type { StatcrewPlay } from '@dtv/api';
import './plays.css';

export function PlayList({ plays, compact = false, empty = 'No plays yet.' }: { readonly plays: readonly StatcrewPlay[]; readonly compact?: boolean; readonly empty?: string }) {
  return (
    <section className="tool-plays" aria-label="StatCrew plays" data-compact={compact || undefined}>
      <h3>
        Plays <span className="count">{plays.length}</span>
      </h3>
      <div className="tool-plays-scroll" tabIndex={0}>
        {plays.length ? (
          <table>
            <thead>
              <tr>
                <th>Per</th>
                <th>Clock</th>
                <th>Team</th>
                {!compact && <th className="end">#</th>}
                <th>Player</th>
                <th>Play</th>
                <th className="end">Score</th>
              </tr>
            </thead>
            <tbody>
              {plays
                .map((play, index) => (
                  <tr key={index} data-scoring={play.score ? true : undefined}>
                    <td className="mono">{play.period}</td>
                    <td className="mono">{play.time}</td>
                    <td>{play.team}</td>
                    {!compact && <td className="mono end">{play.uni}</td>}
                    <td className="player" title={compact ? play.name : undefined}>
                      {compact && play.uni !== 'TM' ? `#${play.uni} ${play.name}` : play.name}
                    </td>
                    <td>{[play.action, play.type].filter(Boolean).join(' ')}</td>
                    <td className="mono end">{play.score && `${play.score.away}-${play.score.home}`}</td>
                  </tr>
                ))
                .reverse()}
            </tbody>
          </table>
        ) : (
          <p className="empty">{empty}</p>
        )}
      </div>
    </section>
  );
}
