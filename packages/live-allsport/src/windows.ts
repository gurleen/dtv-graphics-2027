/**
 * A Windows COM port, opened and set up through kernel32 so the tool still needs no native serial module. Reads never
 * block: each returns what the driver holds, so the caller polls and the event loop stays free for the server.
 */

import { dlopen, FFIType, ptr } from 'bun:ffi';

const GENERIC_READ = 0x80000000;
const OPEN_EXISTING = 3;
const INVALID_HANDLE = -1n;
const MAXDWORD = 0xffffffff;
const READ_SIZE = 4096;

/** The DCB's flags: binary mode, DTR and RTS held on, no flow control, and no abort on a line error. */
const DCB_FLAGS = 0x1 | (0x1 << 4) | (0x1 << 12);
const DCB_SIZE = 28;

/** Windows error codes worth naming for an operator. */
const REASONS: Readonly<Record<number, string>> = {
  2: 'no such port',
  5: 'the port is in use by another program',
  31: 'the device stopped responding (unplugged?)',
  433: 'the device is not connected',
  1167: 'the device is not connected',
};

let kernel32: ReturnType<typeof load> | undefined;
function load() {
  return dlopen('kernel32.dll', {
    CreateFileW: { args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.i64 },
    GetCommState: { args: [FFIType.i64, FFIType.ptr], returns: FFIType.i32 },
    SetCommState: { args: [FFIType.i64, FFIType.ptr], returns: FFIType.i32 },
    SetCommTimeouts: { args: [FFIType.i64, FFIType.ptr], returns: FFIType.i32 },
    ReadFile: { args: [FFIType.i64, FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
    CloseHandle: { args: [FFIType.i64], returns: FFIType.i32 },
    GetLastError: { args: [], returns: FFIType.u32 },
  }).symbols;
}

export interface ComPort {
  /** The bytes the port has received since the last read; empty when there are none. Throws when the port fails. */
  read(): Buffer;
  close(): void;
}

/** `COM3` or `com3` as the device path Windows opens, `\\.\COM3`, which also reaches COM10 and above. */
export function devicePath(port: string): string {
  return port.startsWith('\\\\.\\') ? port : `\\\\.\\${port.toUpperCase()}`;
}

/** Writes 8N1 at `baud` over a DCB that GetCommState filled, keeping its XON and XOFF characters, which must differ. */
export function configureDcb(dcb: Buffer, baud: number): void {
  dcb.writeUInt32LE(DCB_SIZE, 0);
  dcb.writeUInt32LE(baud, 4);
  dcb.writeUInt32LE(DCB_FLAGS, 8);
  dcb.writeUInt8(8, 18); // ByteSize
  dcb.writeUInt8(0, 19); // Parity: none
  dcb.writeUInt8(0, 20); // StopBits: one
}

/** Opens `port` (`COM3`) at `baud`, 8N1, raw. Throws with the reason an operator can act on. */
export function openComPort(port: string, baud: number): ComPort {
  const k = (kernel32 ??= load());
  const fail = (step: string): never => {
    const code = k.GetLastError();
    throw new Error(`${step}: ${REASONS[code] ?? `Windows error ${code}`}`);
  };

  const name = Buffer.from(`${devicePath(port)}\0`, 'utf16le');
  const handle = k.CreateFileW(ptr(name), GENERIC_READ, 0, null, OPEN_EXISTING, 0, null) as bigint;
  if (handle === INVALID_HANDLE) fail('open failed');

  const dcb = Buffer.alloc(DCB_SIZE);
  dcb.writeUInt32LE(DCB_SIZE, 0);
  // Interval MAXDWORD with no total timeouts makes ReadFile return at once with whatever has arrived.
  const timeouts = Buffer.alloc(20);
  timeouts.writeUInt32LE(MAXDWORD, 0);
  const setUp = () => {
    if (!k.GetCommState(handle, ptr(dcb))) fail('reading the port settings failed');
    configureDcb(dcb, baud);
    if (!k.SetCommState(handle, ptr(dcb))) fail(`setting ${baud} baud 8N1 failed`);
    if (!k.SetCommTimeouts(handle, ptr(timeouts))) fail('setting the read timeouts failed');
  };
  try {
    setUp();
  } catch (error) {
    k.CloseHandle(handle);
    throw error;
  }

  const buffer = Buffer.alloc(READ_SIZE);
  const count = new Uint32Array(1);
  let open = true;
  return {
    read() {
      if (!open) return Buffer.alloc(0);
      if (!k.ReadFile(handle, ptr(buffer), READ_SIZE, ptr(count), null)) fail('read failed');
      return Buffer.from(buffer.subarray(0, count[0]));
    },
    close() {
      if (!open) return;
      open = false;
      k.CloseHandle(handle);
    },
  };
}
