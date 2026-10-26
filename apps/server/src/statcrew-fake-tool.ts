/**
 * Stands in for the StatCrew feed in tests: `bun statcrew-fake-tool.ts <mode> <file> <game>`.
 * `run` prints a line, waits, and answers SIGINT by printing a line and exiting 0. `crash` prints to stderr and
 * exits 3. `stubborn` ignores SIGINT.
 */

const [mode, file, game] = process.argv.slice(2);
console.log(`started ${file} ${game}`);
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
