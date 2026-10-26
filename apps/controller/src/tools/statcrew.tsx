/** The StatCrew tab: starts and stops the feed that writes a StatCrew box score into a game, and shows its log. */

import { useState } from 'react';
import { Button, Input, Label, TextField } from 'react-aria-components';
import { useController } from '../app/context';
import { useStream } from '../app/streams';
import { FeedLog, FeedState, GameSelect, useCall, useGameChoice } from './shared';

export function StatcrewTool() {
  const { api } = useController();
  const feed = useStream((signal) => api.tools.statcrew.watch(undefined, { signal }), [api]);
  const [chosenFile, setChosenFile] = useState<string | null>(null);
  const { games, game, choose } = useGameChoice(feed);
  const { call, busy, error, setError } = useCall();

  const file = chosenFile ?? feed?.file ?? '';
  const running = feed?.state === 'running';
  const sameAsRunning = running && file === feed.file && game === feed.game;

  if (!feed) return <p className="loading">Loading…</p>;

  return (
    <section className="tool" aria-label="StatCrew">
      <h2>StatCrew</h2>
      <p className="hint">
        While it runs, StatCrew supplies the score and stats and the operator cannot edit them. Stop gives them back. The clock stays with the operator.
      </p>
      <FeedState feed={feed} />
      <div className="tool-form">
        <TextField
          className="field tool-file"
          value={file}
          onChange={(value) => {
            setChosenFile(value);
            setError(null);
          }}
        >
          <Label>File</Label>
          <Input className="mono" placeholder="/path/to/statcrew/game.xml" spellCheck={false} />
        </TextField>
        <GameSelect
          games={games}
          game={game}
          onChange={(id) => {
            choose(id);
            setError(null);
          }}
        />
        <Button className="button primary" isDisabled={busy || !file || !game || sameAsRunning} onPress={() => call(() => api.tools.statcrew.start({ file, game: game as never }))}>
          {running && !sameAsRunning ? 'Restart' : 'Start'}
        </Button>
        <Button className="button" isDisabled={busy || !running} onPress={() => call(() => api.tools.statcrew.stop())}>
          Stop
        </Button>
      </div>
      {error && (
        <p className="problem" role="alert">
          {error}
        </p>
      )}
      <FeedLog feed={feed} label="StatCrew log" />
    </section>
  );
}
