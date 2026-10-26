/**
 * Stands in for a feed tool in tests: `bun feed-fake-tool.ts <mode> <argument>...`.
 * `run` prints a line, waits, and answers SIGINT by printing a line and exiting 0. `crash` prints to stderr and
 * exits 3. `stubborn` ignores SIGINT.
 */

const [mode, ...args] = process.argv.slice(2);
console.log(`started ${args.join(' ')}`);
if (mode === 'crash') {
  console.error('bad arguments');
  process.exit(3);
}
process.on('SIGINT', () => {
  if (mode === 'stubborn') return;
  console.log('handed back');
  process.exit(0);
});
setInterval(() => {}, 1_000);
