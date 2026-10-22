/**
 * Downloads a program-season's sportsdataverse files and reads the columns the importer
 * uses. The release assets are parquet; hyparquet reads them in memory.
 */

import { type ProgramCode, SDV_DATASET_NAMES, SDV_DATASETS, type SdvDataset, type SdvSources, sdvYear, type SeasonId } from '@dtv/domain';
import { parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const RELEASES = 'https://github.com/sportsdataverse/sportsdataverse-data/releases/download';

export type SdvFetcher = (program: ProgramCode, season: SeasonId) => Promise<SdvSources>;

/** Integers arrive as bigint; the domain's schemas take numbers. */
const plain = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' ? Number(value) : value]));

async function readDataset<D extends SdvDataset>(dataset: D, program: ProgramCode, season: SeasonId, fetcher: typeof fetch) {
  const url = `${RELEASES}/${SDV_DATASETS[dataset].path(program, sdvYear(season))}.parquet`;
  const response = await fetcher(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const schema = SDV_DATASETS[dataset].row;
  const rows = await parquetReadObjects({ file: await response.arrayBuffer(), columns: Object.keys(schema.shape), compressors });
  return rows.map((row, index) => {
    const parsed = schema.safeParse(plain(row));
    if (!parsed.success) throw new Error(`${url}, row ${index}: ${parsed.error.message}`);
    return parsed.data;
  });
}

/** Every dataset at once; one not published for the season (HTTP 404) is null. */
export const fetchSportsdataverse = (fetcher: typeof fetch = fetch): SdvFetcher => async (program, season) => {
  const entries = await Promise.all(SDV_DATASET_NAMES.map(async (dataset) => [dataset, await readDataset(dataset, program, season, fetcher)] as const));
  return Object.fromEntries(entries) as unknown as SdvSources;
};
