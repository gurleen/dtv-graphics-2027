import { expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(import.meta.dir, '../scripts/db.ts');

test('the db script opens the file DTV_DB names, with its backups beside it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dtv-script-'));
  try {
    const file = join(dir, 'show.sqlite');
    const run = Bun.spawnSync(['bun', SCRIPT, 'backup'], { env: { ...process.env, DTV_DB: file } });
    expect(run.exitCode).toBe(0);
    expect(run.stdout.toString()).toContain(join(dir, 'backups'));
    expect(existsSync(file)).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
