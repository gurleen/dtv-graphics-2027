/**
 * A pretend AllSport 5000 on a pseudo-terminal. As a command it prints the device path, then sends each line of
 * stdin, a JSON object of field values such as `{"clockMain":"10:00","scoreHome":"12"}`, as packets:
 *
 *   bun packages/live-allsport/scripts/console.ts
 *
 * The proof imports `openConsole` instead.
 */

import { join } from 'node:path';
import type { FieldName } from '../src/basketball';
import { packetsFor } from '../src/simulator';

export interface FakeConsole {
  /** The slave device, the path to give `--port`. */
  readonly path: string;
  send(values: Partial<Record<FieldName, string>>): void;
  close(): void;
}

export async function openConsole(): Promise<FakeConsole> {
  const child = Bun.spawn(['python3', '-I', join(import.meta.dir, 'pty.py')], { stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' });
  const lines = child.stdout.pipeThrough(new TextDecoderStream()).getReader();
  const path = ((await lines.read()).value ?? '').trim();
  if (!path.startsWith('/dev/')) throw new Error(`pty.py did not print a device path: ${JSON.stringify(path)}`);
  return {
    path,
    send(values) {
      for (const packet of packetsFor(values)) child.stdin.write(`${Buffer.from(packet).toString('hex')}\n`);
      child.stdin.flush();
    },
    close: () => child.kill(),
  };
}

if (import.meta.main) {
  const fake = await openConsole();
  console.log(fake.path);
  for await (const line of console as unknown as AsyncIterable<string>) fake.send(JSON.parse(line));
  fake.close();
}
