import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameId } from '@dtv/domain';
import { parseSerialComm, serialPorts, writesScore } from './feeds';

let dev: string;
const touch = (...names: string[]) => names.forEach((name) => writeFileSync(join(dev, name), ''));

beforeEach(() => {
  dev = mkdtempSync(join(tmpdir(), 'dev-'));
  touch('cu.usbserial-1410', 'cu.Bluetooth-Incoming-Port', 'cu.debug-console', 'cu.usbmodem1', 'tty.usbserial-1410', 'ttyUSB0', 'ttyACM1', 'ttyS0', 'null');
});
afterEach(() => rmSync(dev, { recursive: true, force: true }));

test('macOS offers the call-out devices except Bluetooth and the debug console', () => {
  expect(serialPorts('darwin', dev)).toEqual([`${dev}/cu.usbmodem1`, `${dev}/cu.usbserial-1410`]);
});

test('Linux offers USB and ACM serial devices, and other systems none', () => {
  expect(serialPorts('linux', dev)).toEqual([`${dev}/ttyACM1`, `${dev}/ttyUSB0`]);
  expect(serialPorts('freebsd', dev)).toEqual([]);
});

test('Windows offers the registry COM ports in number order, except Bluetooth links', () => {
  const output = [
    '',
    'HKEY_LOCAL_MACHINE\\HARDWARE\\DEVICEMAP\\SERIALCOMM',
    '    \\Device\\Serial0    REG_SZ    COM3',
    '    \\Device\\BthModem1    REG_SZ    COM4',
    '    \\Device\\mxuport0    REG_SZ    COM10',
    '    \\Device\\VCP0    REG_SZ    COM1',
    '',
  ].join('\r\n');
  expect(parseSerialComm(output)).toEqual(['COM1', 'COM3', 'COM10']);
  expect(parseSerialComm('')).toEqual([]);
});

test('a feed writes the score only while it runs on that game, and AllSport not with Score off', () => {
  const game = GameId.parse('2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb');
  const other = GameId.parse('2026-27/2026-11-12/drexel-mbb.at.hofstra-mbb');
  expect(writesScore({ state: 'running', game }, game)).toBe(true);
  expect(writesScore({ state: 'running', game, score: true }, game)).toBe(true);
  expect(writesScore({ state: 'running', game, score: false }, game)).toBe(false);
  expect(writesScore({ state: 'running', game }, other)).toBe(false);
  expect(writesScore({ state: 'exited', game }, game)).toBe(false);
  expect(writesScore({ state: 'stopped', game: null, score: null }, game)).toBe(false);
});
