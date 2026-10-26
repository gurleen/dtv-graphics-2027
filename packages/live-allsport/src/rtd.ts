/**
 * The Daktronics RTD serial stream: framing, checksums and the console's screen buffer. Pure; no IO.
 *
 * A packet is `SYN ... SOH <header> STX <text> EOT <2 hex checksum> ETB`. The bytes between SYN and SOH are
 * ignored. The header is `004210` and a 4-digit zero-based index: where `<text>` lands in a buffer of about
 * 1024 characters. The console sends only what changed.
 */

const SYN = 0x16;
const SOH = 0x01;
const STX = 0x02;
const EOT = 0x04;
const ETB = 0x17;

const HEADER_PREFIX = '004210';
const HEADER_LENGTH = HEADER_PREFIX.length + 4;
export const BUFFER_SIZE = 1024;
/** A frame longer than this is garbage: the largest real packet is the whole buffer. */
const MAX_FRAME = BUFFER_SIZE + 64;

export interface Packet {
  readonly kind: 'packet';
  /** Zero-based index into the buffer. */
  readonly start: number;
  /** Empty for a packet without STX and text. */
  readonly text: string;
}

/** `unsupported` is a header that is not `004210` plus an index, or a frame without the expected markers. */
export interface Rejected {
  readonly kind: 'rejected';
  readonly reason: 'checksum' | 'unsupported';
}

export type Frame = Packet | Rejected;

/** The checksum byte: 0x04 plus every byte after SYN up to but excluding EOT, modulo 256. */
export const checksum = (bytes: Uint8Array): number => bytes.reduce((sum, byte) => (sum + byte) & 0xff, EOT);

const hex = (value: number) => value.toString(16).toUpperCase().padStart(2, '0');

/** Parses the bytes between SYN and ETB. */
export function parsePacket(frame: Uint8Array): Frame {
  const unsupported: Rejected = { kind: 'rejected', reason: 'unsupported' };
  const eot = frame.length - 3;
  const soh = frame.indexOf(SOH);
  if (eot < 0 || frame[eot] !== EOT || soh < 0 || soh > eot) return unsupported;
  const given = String.fromCharCode(frame[eot + 1]!, frame[eot + 2]!);
  if (given !== hex(checksum(frame.subarray(0, eot)))) return { kind: 'rejected', reason: 'checksum' };

  const stx = frame.indexOf(STX, soh);
  const headerEnd = stx >= 0 && stx < eot ? stx : eot;
  const header = String.fromCharCode(...frame.subarray(soh + 1, headerEnd));
  const index = header.slice(HEADER_PREFIX.length);
  if (header.length !== HEADER_LENGTH || !header.startsWith(HEADER_PREFIX) || !/^\d{4}$/.test(index)) return unsupported;
  return { kind: 'packet', start: Number(index), text: headerEnd === eot ? '' : String.fromCharCode(...frame.subarray(headerEnd + 1, eot)) };
}

/**
 * Cuts a byte stream into frames. Bytes after SYN are held until ETB, across chunks; a SYN inside a frame
 * starts it over, so a frame cut short by a dropped byte costs only itself.
 */
export function createFramer(): { push(chunk: Uint8Array): Frame[] } {
  let held: number[] | null = null;
  return {
    push(chunk) {
      const frames: Frame[] = [];
      for (const byte of chunk) {
        if (byte === SYN) held = [];
        else if (held === null) continue;
        else if (byte === ETB) {
          frames.push(parsePacket(Uint8Array.from(held)));
          held = null;
        } else if (held.push(byte) > MAX_FRAME) held = null;
      }
      return frames;
    },
  };
}

/**
 * The console's screen: every packet's text written at its index. A cell nothing has written is unknown, which
 * is not the same as a space the console wrote to blank it.
 */
export function createRtdBuffer() {
  const cells: (string | undefined)[] = new Array(BUFFER_SIZE);
  return {
    apply(packet: Packet) {
      for (let offset = 0; offset < packet.text.length && packet.start + offset < BUFFER_SIZE; offset++) cells[packet.start + offset] = packet.text[offset];
    },
    /** `length` characters from the 1-based `position`, or null when the console has never written any of them. */
    field(position: number, length: number): string | null {
      const text = Array.from({ length }, (_, offset) => cells[position - 1 + offset]);
      return text.every((cell) => cell === undefined) ? null : text.map((cell) => cell ?? ' ').join('');
    },
  };
}

export type RtdBuffer = ReturnType<typeof createRtdBuffer>;
