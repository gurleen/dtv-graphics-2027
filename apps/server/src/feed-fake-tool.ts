/**
 * Stands in for a feed tool in tests: `bun feed-fake-tool.ts <mode> <argument>...`.
 * `run` prints a line, waits, and answers a `stop` line on stdin by printing a line and exiting 0. `crash` prints to
 * stderr and exits 3. `stubborn` ignores the stop.
 */

const [mode, ...args] = process.argv.slice(2);
console.log(`started ${args.join(' ')}`);
if (mode === 'crash') {
  console.error('bad arguments');
  process.exit(3);
}
process.stdin.on('data', (chunk) => {
  if (mode === 'stubborn' || !/^stop\r?$/m.test(String(chunk))) return;
  console.log('handed back');
  process.exit(0);
});
setInterval(() => {}, 1_000);
