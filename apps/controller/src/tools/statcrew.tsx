/** The StatCrew tab: starts and stops the feed that writes a StatCrew box score into a game, and shows its log. */

import type { StatcrewFeed } from '@dtv/api';
import { PROGRAMS } from '@dtv/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Label, ListBox, ListBoxItem, Popover, Select, SelectValue, TextField } from 'react-aria-components';
import { useController } from '../app/context';
import { useStream } from '../app/streams';
import { gameLabel } from '../data/rows';

const STATE_TEXT = (feed: StatcrewFeed): string => {
  if (feed.state === 'running') return `Running since ${new Date(feed.startedAt ?? 0).toLocaleTimeString('en-GB')}`;
  if (feed.state === 'exited') return `Exited (code ${feed.exitCode})`;
  return 'Stopped';
};

export function StatcrewTool() {
  const { api, world, show } = useController();
  const feed = useStream((signal) => api.tools.statcrew.watch(undefined, { signal }), [api]);
  const [chosenFile, setChosenFile] = useState<string | null>(null);
  const [chosenGame, setChosenGame] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const games = useMemo(
    () =>
      world
        ? [...world.all('game')]
            .filter((game) => PROGRAMS[game.program].sport === 'basketball')
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
            .map((game) => ({ id: game.id as string, label: gameLabel(world, game) }))
        : [],
    [world],
  );

  // A running feed's own values come first, so a reload shows what is running; then the active game, then the last one used.
  const file = chosenFile ?? feed?.file ?? '';
  const game = chosenGame ?? (feed?.state === 'running' ? feed.game : (show?.game?.id ?? feed?.game)) ?? null;
  const running = feed?.state === 'running';
  const sameAsRunning = running && file === feed.file && game === feed.game;

  const call = async (run: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const log = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [feed?.log]);

  if (!feed) return <p className="loading">Loading…</p>;

  return (
    <section className="tool" aria-label="StatCrew">
      <h2>StatCrew</h2>
      <p className="hint">
        While it runs, StatCrew supplies the score and stats and the operator cannot edit them. Stop gives them back. The clock stays with the operator.
      </p>
      <p className="tool-state" data-state={feed.state} role="status">
        <span className="dot" aria-hidden="true" />
        {STATE_TEXT(feed)}
      </p>
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
        <Select
          className="field tool-game"
          placeholder="Choose a game"
          selectedKey={game}
          onSelectionChange={(key) => {
            setChosenGame(key === null ? null : String(key));
            setError(null);
          }}
        >
          <Label>Game</Label>
          <Button className="select-button">
            <SelectValue />
            <span aria-hidden="true">▾</span>
          </Button>
          <Popover className="popover tools-portal">
            <ListBox className="listbox" items={games}>
              {(option) => <ListBoxItem className="option" textValue={option.label}>{option.label}</ListBoxItem>}
            </ListBox>
          </Popover>
        </Select>
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
      <pre className="tool-log" ref={log} role="log" aria-label="StatCrew log" tabIndex={0}>
        {feed.log.length ? feed.log.join('\n') : 'No output yet.'}
      </pre>
    </section>
  );
}
