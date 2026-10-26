/** The feed tools the server supervises, as the router sees them, and the serial devices an AllSport feed can read. */

import type { GameId } from '@dtv/domain';
import { readdirSync } from 'node:fs';
import type { FeedSupervisor } from './feed-supervisor';

export type StatcrewSupervisor = FeedSupervisor<{ file: string; game: GameId }, 'no-game' | 'no-file'>;
export type AllsportSupervisor = FeedSupervisor<{ port: string; game: GameId; score: boolean }, 'no-game' | 'no-port'>;

export interface Feeds {
  readonly statcrew: StatcrewSupervisor;
  readonly allsport: AllsportSupervisor;
  /** The serial devices that could be a console. */
  readonly ports: () => readonly string[];
}

/** `/dev/cu.*` on macOS, except the two that are not serial ports; `/dev/ttyUSB*` and `/dev/ttyACM*` on Linux. */
const CANDIDATE = { darwin: /^cu\.(?!Bluetooth-Incoming-Port$|debug-console$)/, linux: /^tty(USB|ACM)/ } as const;

export function serialPorts(platform: string = process.platform, dev = '/dev'): string[] {
  const pattern = CANDIDATE[platform as keyof typeof CANDIDATE];
  if (!pattern) return [];
  return readdirSync(dev)
    .filter((name) => pattern.test(name))
    .sort()
    .map((name) => `${dev}/${name}`);
}
