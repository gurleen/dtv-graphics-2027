import { expect, test } from 'bun:test';
import { configureDcb, devicePath } from './windows';

test('a COM name opens through the device namespace, which also reaches COM10 and above', () => {
  expect(devicePath('COM1')).toBe('\\\\.\\COM1');
  expect(devicePath('com12')).toBe('\\\\.\\COM12');
  expect(devicePath('\\\\.\\COM3')).toBe('\\\\.\\COM3');
});

test('the DCB is 8N1 at the baud, binary, DTR and RTS on, no flow control, and keeps XON and XOFF', () => {
  const dcb = Buffer.alloc(28);
  dcb.writeUInt8(0x11, 21);
  dcb.writeUInt8(0x13, 22);
  configureDcb(dcb, 19200);
  expect(dcb.readUInt32LE(0)).toBe(28);
  expect(dcb.readUInt32LE(4)).toBe(19200);
  expect(dcb.readUInt32LE(8)).toBe(0b0001_0000_0001_0001);
  expect([dcb[18], dcb[19], dcb[20]]).toEqual([8, 0, 0]);
  expect([dcb[21], dcb[22]]).toEqual([0x11, 0x13]);
});
