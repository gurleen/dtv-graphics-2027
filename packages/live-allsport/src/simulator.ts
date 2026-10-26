/** Builds the bytes a console sends, for tests and the proof scripts. Pure. */

import { FIELDS, type FieldName } from './basketball';
import { BUFFER_SIZE, checksum } from './rtd';

const text = (value: string) => Uint8Array.from(value, (character) => character.charCodeAt(0));

/** One framed packet writing `text` at the zero-based `start`. */
export function encodePacket(start: number, characters: string): Uint8Array {
  if (start < 0 || start + characters.length > BUFFER_SIZE) throw new Error(`packet at ${start} overruns the buffer`);
  const body = Uint8Array.from([...text('00000000'), 0x01, ...text(`004210${String(start).padStart(4, '0')}`), 0x02, ...text(characters)]);
  return Uint8Array.from([0x16, ...body, 0x04, ...text(checksum(body).toString(16).toUpperCase().padStart(2, '0')), 0x17]);
}

/** One packet per field, each value padded with spaces to the field's length: `{ scoreHome: '12' }`. A blank value blanks the field. */
export function packetsFor(values: Partial<Record<FieldName, string>>): Uint8Array[] {
  return Object.entries(values).map(([name, value]) => {
    const [position, length] = FIELDS[name as FieldName];
    return encodePacket(position - 1, value.padEnd(length, ' ').slice(0, length));
  });
}
