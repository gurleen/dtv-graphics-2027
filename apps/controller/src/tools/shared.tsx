/** The pieces every feed tab shares: the basketball game choice, the state line, the log, and a guarded call. */

import type { FeedStatus } from '@dtv/api';
import { PROGRAMS } from '@dtv/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Label, ListBox, ListBoxItem, Popover, Select, SelectValue } from 'react-aria-components';
import { useController } from '../app/context';
import { gameLabel } from '../data/rows';

const stateText = (feed: FeedStatus): string => {
  if (feed.state === 'running') return `Running since ${new Date(feed.startedAt ?? 0).toLocaleTimeString('en-GB')}`;
  if (feed.state === 'exited') return `Exited (code ${feed.exitCode})`;
  return 'Stopped';
};

export function FeedState({ feed }: { readonly feed: FeedStatus }) {
  return (
    <p className="tool-state" data-state={feed.state} role="status">
      <span className="dot" aria-hidden="true" />
      {stateText(feed)}
    </p>
  );
}

export function FeedLog({ feed, label }: { readonly feed: FeedStatus; readonly label: string }) {
  const log = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [feed.log]);
  return (
    <pre className="tool-log" ref={log} role="log" aria-label={label} tabIndex={0}>
      {feed.log.length ? feed.log.join('\n') : 'No output yet.'}
    </pre>
  );
}

/** `call` runs a request with `busy` set around it and a failure kept in `error`; `setError(null)` clears it. */
export function useCall() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  return { call, busy, error, setError };
}

/** The game a feed form shows: a running feed's own first, so a reload shows what is running; then the active game, then the last one used. */
export function useGameChoice(feed: (FeedStatus & { readonly game: string | null }) | null | undefined) {
  const { world, show } = useController();
  const [chosen, setChosen] = useState<string | null>(null);
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
  const game = chosen ?? (feed?.state === 'running' ? feed.game : (show?.game?.id ?? feed?.game)) ?? null;
  return { games, game, choose: setChosen };
}

/**
 * A text field of a feed form, kept in this browser's localStorage under `key` as it changes: a running feed's own value
 * first, so a reload shows what is running; then the value last entered here; then the feed's last start.
 */
export function useCachedInput(key: string, feed: (FeedStatus & { readonly value: string | null }) | null | undefined) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [cached] = useState(() => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  });
  const value = chosen ?? (feed?.state === 'running' ? feed.value : (cached ?? feed?.value)) ?? '';
  const choose = (next: string) => {
    setChosen(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      // Private mode or a full store: the field still works, it just is not remembered.
    }
  };
  return { value, choose };
}

export function GameSelect({ games, game, onChange }: { readonly games: readonly { id: string; label: string }[]; readonly game: string | null; readonly onChange: (id: string | null) => void }) {
  return (
    <Select className="field tool-game" placeholder="Choose a game" selectedKey={game} onSelectionChange={(key) => onChange(key === null ? null : String(key))}>
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
  );
}
