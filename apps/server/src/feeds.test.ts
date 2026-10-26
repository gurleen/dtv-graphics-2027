import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serialPorts } from './feeds';

let dev: string;
const touch = (...names: string[]) => names.forEach((name) => writeFileSync(join(dev, name), ''));

beforeEach(() => {
  dev = mkdtempSync(join(tmpdir(), 'dev-'));
  touch('cu.usbserial-1410', 'cu.Bluetooth-Incoming-Port', 'cu.debug-console', 'cu.usbmodem1', 'tty.usbserial-1410', 'ttyUSB0', 'ttyACM1', 'ttyS0', 'null');
});
afterEach(() => rmSync(dev, { recursive: true, force: true }));

test('macOS offers the call-out devices except Bluetooth and the debug console', () => {
  expect(serialPorts('darwin', dev)).toEqual([join(dev, 'cu.usbmodem1'), join(dev, 'cu.usbserial-1410')]);
});

test('Linux offers USB and ACM serial devices, and other systems none', () => {
  expect(serialPorts('linux', dev)).toEqual([join(dev, 'ttyACM1'), join(dev, 'ttyUSB0')]);
  expect(serialPorts('win32', dev)).toEqual([]);
});
