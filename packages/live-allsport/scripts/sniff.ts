/**
 * Prints each distinct message a Windows COM port sends in the scoreboard format (`SOH <text> <2 hex> EOT`), with the
 * time and a caret under every column that changed, to map a layout by pressing keys on the console.
 *
 *   bun packages/live-allsport/scripts/sniff.ts [--port=COM1] [--baud=9600]
 */

import { parseArgs } from 'node:util';
import { openComPort } from '../src/windows';

const { values } = parseArgs({ options: { port: { type: 'string', default: 'COM1' }, baud: { type: 'string', default: '9600' } } });
const port = openComPort(values.port!, Number(values.baud));
const stamp = () => new Date().toLocaleTimeString('en-US', { hour12: false });
const ruler = '0123456789'.repeat(4);
console.log(`${stamp()} ${values.port} at ${values.baud} baud\n         ${ruler}`);

let pending = '';
let last = '';
setInterval(() => {
  pending += port.read().toString('latin1');
  let end: number;
  while ((end = pending.indexOf('\u0004')) >= 0) {
    const message = pending.slice(pending.lastIndexOf('\u0001', end) + 1, end);
    pending = pending.slice(end + 1);
    if (message === last) continue;
    const marks = [...message].map((character, index) => (character !== last[index] ? '^' : ' ')).join('');
    console.log(`${stamp()} ${message.replaceAll(' ', '·')}\n         ${marks}`);
    last = message;
  }
}, 20);
