/** The AllSport tab: starts and stops the feed that reads a Daktronics AllSport 5000 console into a game, and shows its log. */

import { useCallback, useEffect, useState } from 'react';
import { Button, Checkbox, ComboBox, Input, Label, ListBox, ListBoxItem, Popover } from 'react-aria-components';
import { useController } from '../app/context';
import { useStream } from '../app/streams';
import { FeedLog, FeedState, GameSelect, useCall, useGameChoice } from './shared';

export function AllsportTool() {
  const { api } = useController();
  const feed = useStream((signal) => api.tools.allsport.watch(undefined, { signal }), [api]);
  const [chosenPort, setChosenPort] = useState<string | null>(null);
  const [chosenScore, setChosenScore] = useState<boolean | null>(null);
  const [ports, setPorts] = useState<readonly string[]>([]);
  const { games, game, choose } = useGameChoice(feed);
  const { call, busy, error, setError } = useCall();

  const refresh = useCallback(() => api.tools.allsport.ports().then(setPorts, () => setPorts([])), [api]);
  useEffect(() => void refresh(), [refresh]);

  const port = chosenPort ?? feed?.port ?? '';
  const score = chosenScore ?? feed?.score ?? true;
  const running = feed?.state === 'running';
  const sameAsRunning = running && port === feed.port && game === feed.game && score === feed.score;

  if (!feed) return <p className="loading">Loading…</p>;

  const choosePort = (value: string) => {
    setChosenPort(value);
    setError(null);
  };

  return (
    <section className="tool" aria-label="AllSport">
      <h2>AllSport</h2>
      <p className="hint">
        While it runs, the AllSport console supplies the clock, shot clock and period, and the operator cannot edit them. With Score on, it also supplies score, timeouts, bonus and possession. StatCrew also writes the score, so turn
        Score off if StatCrew owns it. Stop gives everything back, and is the way to set halftime or final.
      </p>
      <FeedState feed={feed} />
      <div className="tool-form">
        <ComboBox
          className="field tool-file"
          items={ports.map((path) => ({ id: path }))}
          allowsCustomValue
          inputValue={port}
          onInputChange={choosePort}
          onSelectionChange={(key) => key !== null && choosePort(String(key))}
          menuTrigger="focus"
        >
          <Label>Port</Label>
          <div className="combo">
            <Input className="mono" placeholder="/dev/cu.usbserial-1410" spellCheck={false} />
            <Button className="combo-button" aria-label="Show ports">▾</Button>
          </div>
          <Popover className="popover tools-portal">
            <ListBox className="listbox">
              {(option: { id: string }) => <ListBoxItem className="option" id={option.id} textValue={option.id}>{option.id}</ListBoxItem>}
            </ListBox>
          </Popover>
        </ComboBox>
        <Button className="button" onPress={() => void refresh()}>
          Refresh
        </Button>
        <GameSelect
          games={games}
          game={game}
          onChange={(id) => {
            choose(id);
            setError(null);
          }}
        />
      </div>
      <div className="tool-form">
        <Checkbox className="tool-check" isSelected={score} onChange={setChosenScore}>
          <span className="check-box" aria-hidden="true">{score ? '✓' : ''}</span>
          Score, timeouts, bonus, possession
        </Checkbox>
        <Button className="button primary" isDisabled={busy || !port || !game || sameAsRunning} onPress={() => call(() => api.tools.allsport.start({ port, game: game as never, score }))}>
          {running && !sameAsRunning ? 'Restart' : 'Start'}
        </Button>
        <Button className="button" isDisabled={busy || !running} onPress={() => call(() => api.tools.allsport.stop())}>
          Stop
        </Button>
      </div>
      {error && (
        <p className="problem" role="alert">
          {error}
        </p>
      )}
      <FeedLog feed={feed} label="AllSport log" />
    </section>
  );
}
