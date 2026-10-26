import { describe, expect, test } from 'bun:test';
import { checksum, createFramer, createRtdBuffer, type Frame, parsePacket } from './rtd';
import { encodePacket } from './simulator';

const TEXT = '16:0916:09   16:0916:09    s   ';
const bytes = (value: string) => Uint8Array.from(value, (character) => character.charCodeAt(0));
/** `body` with its EOT and a correct checksum. */
const sealed = (body: string) => Uint8Array.from([...bytes(body), 0x04, ...bytes(checksum(bytes(body)).toString(16).toUpperCase().padStart(2, '0'))]);
/** A frame as the crate's test vectors write it, between SYN and ETB. */
const vector = (header: string, checksum: string) => bytes(`00000000\x01${header}\x02${TEXT}\x04${checksum}`);

describe('parsePacket', () => {
  test('reads the published packets: the text and where it starts', () => {
    expect(parsePacket(vector('0042100000', '49'))).toEqual({ kind: 'packet', start: 0, text: TEXT });
    expect(parsePacket(vector('0042100006', '4F'))).toEqual({ kind: 'packet', start: 6, text: TEXT });
  });

  test('rejects a wrong checksum, and a header it does not support', () => {
    expect(parsePacket(vector('0042100000', '4A'))).toEqual({ kind: 'rejected', reason: 'checksum' });
    const other = encodePacket(0, 'x');
    other[other.indexOf(0x01) + 3] = 0x39;
    expect(parsePacket(other.subarray(1, -1))).toEqual({ kind: 'rejected', reason: 'checksum' });
    expect(parsePacket(sealed('00000000\x010042110000\x02x'))).toEqual({ kind: 'rejected', reason: 'unsupported' });
  });

  test('a packet without text is a packet with none', () => {
    expect(parsePacket(sealed('00000000\x010042100005'))).toEqual({ kind: 'packet', start: 5, text: '' });
  });
});

describe('createFramer', () => {
  const whole = [...encodePacket(0, '12:34'), ...encodePacket(27, 's')];

  test('finds every packet however the stream is split', () => {
    for (let cut = 1; cut < whole.length; cut++) {
      const framer = createFramer();
      const frames = [...framer.push(Uint8Array.from(whole.slice(0, cut))), ...framer.push(Uint8Array.from(whole.slice(cut)))];
      expect(frames).toEqual([
        { kind: 'packet', start: 0, text: '12:34' },
        { kind: 'packet', start: 27, text: 's' },
      ]);
    }
  });

  test('skips garbage between packets and starts over at a SYN that cuts a packet short', () => {
    const cutShort = encodePacket(0, '99:99').slice(0, 20);
    const frames = createFramer().push(Uint8Array.from([0x00, 0xff, ...cutShort, ...encodePacket(6, '1:00'), 0x41]));
    expect(frames).toEqual([{ kind: 'packet', start: 6, text: '1:00' }]);
  });

  test('reports a corrupted packet and carries on with the next', () => {
    const corrupt = encodePacket(0, '12:34');
    corrupt[12] = corrupt[12]! ^ 0x01;
    const frames: Frame[] = createFramer().push(Uint8Array.from([...corrupt, ...encodePacket(0, '12:35')]));
    expect(frames.map((frame) => (frame.kind === 'packet' ? frame.text : frame.reason))).toEqual(['checksum', '12:35']);
  });
});

describe('createRtdBuffer', () => {
  test('a field is unknown until written, and a written blank is a blank', () => {
    const buffer = createRtdBuffer();
    expect(buffer.field(1, 5)).toBeNull();
    buffer.apply({ kind: 'packet', start: 0, text: '  ' });
    expect(buffer.field(1, 5)).toBe('     ');
    buffer.apply({ kind: 'packet', start: 2, text: '1' });
    expect(buffer.field(2, 3)).toBe(' 1 ');
  });
});
