/** The feed tools the server supervises, as the router sees them, and the serial devices an AllSport feed can read. */

import type { GameId } from '@dtv/domain';
import { existsSync, readdirSync } from 'node:fs';
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

/**
 * The COM ports in `reg query HKLM\HARDWARE\DEVICEMAP\SERIALCOMM` output, in number order. Bluetooth serial links
 * (`\Device\BthModem*`) are left out, as on macOS.
 */
export function parseSerialComm(text: string): string[] {
  return [...text.matchAll(/^\s*(\S+)\s+REG_SZ\s+(COM\d+)\s*$/gm)]
    .filter(([, device]) => !/^\\Device\\BthModem/i.test(device!))
    .map(([, , port]) => port!)
    .sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
}

function windowsPorts(): string[] {
  const query = Bun.spawnSync(['reg', 'query', 'HKLM\\HARDWARE\\DEVICEMAP\\SERIALCOMM']);
  // With no serial device at all the key is missing and reg exits 1.
  return query.success ? parseSerialComm(query.stdout.toString()) : [];
}

/** Whether `port` is a device the AllSport feed can open. Every COM name "exists" on Windows, so ask the registry. */
export function portExists(port: string): boolean {
  return process.platform === 'win32' ? windowsPorts().includes(port.toUpperCase()) : existsSync(port);
}

export function serialPorts(platform: string = process.platform, dev = '/dev'): string[] {
  if (platform === 'win32') return windowsPorts();
  const pattern = CANDIDATE[platform as keyof typeof CANDIDATE];
  if (!pattern) return [];
  return readdirSync(dev)
    .filter((name) => pattern.test(name))
    .sort()
    .map((name) => `${dev}/${name}`);
}
