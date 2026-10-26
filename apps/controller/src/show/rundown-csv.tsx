/**
 * The rundown as a CSV file, in and out. The file carries no ids and no game, so a rundown
 * exported from one game imports into another. An import is all or nothing: every row is
 * read and checked against the registry first, and one bad row writes nothing. Registry failures are named by cue number, since the parse keeps no line per cue.
 */

import { type Cue, type CsvError, parseRundownCsv, rundownCsv, showOf } from '@dtv/domain';
import { checkCue } from '@dtv/playout';
import { Button, FileTrigger } from 'react-aria-components';
import { useCommands } from '../app/commands';
import { useController } from '../app/context';
import { newCueId, type RundownEdits } from './rundown-edits';

/** How many bad rows a failure names before it counts the rest. */
const SHOWN = 3;

const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
};

export function RundownCsv({ edits }: { readonly edits: RundownEdits | null }) {
  const { registry, world, show: view } = useController();
  const { fail } = useCommands();
  const stored = view?.game && world ? showOf(world, view.game.id).rundown : [];

  const read = async (file: File) => {
    const parsed = parseRundownCsv(await file.text());
    const errors: readonly CsvError[] = parsed.ok ? [] : parsed.errors;
    const cues: Cue[] = [];
    const checkErrors: string[] = [];
    if (parsed.ok) {
      parsed.cues.forEach((fields, index) => {
        const cue = { ...fields, id: newCueId(fields.graphic) };
        const check = checkCue(registry, cue);
        if (check.ok) cues.push(cue);
        else checkErrors.push(`Cue ${index + 1}: ${check.error}`);
      });
    }
    const problems = [...errors.map((error) => `Line ${error.line}: ${error.message}`), ...checkErrors];
    if (problems.length) {
      const shown = problems.slice(0, SHOWN);
      const more = problems.length > SHOWN ? ` (and ${problems.length - SHOWN} more)` : '';
      fail(`${file.name} was not imported; nothing was saved. ${shown.join(' ')}${more}`);
    } else if (cues.length) void edits?.append(cues);
  };

  return (
    <>
      <Button className="button small" onPress={() => download('rundown.csv', rundownCsv(stored))} isDisabled={stored.length === 0}>
        Export CSV
      </Button>
      <FileTrigger acceptedFileTypes={['.csv', 'text/csv']} onSelect={(files) => files?.[0] && void read(files[0])}>
        <Button className="button small" isDisabled={!edits}>
          Import CSV
        </Button>
      </FileTrigger>
    </>
  );
}
