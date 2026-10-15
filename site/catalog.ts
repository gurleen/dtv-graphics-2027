/**
 * Which graphic sits where on the stakeholder preview site.
 *
 * The site lists every package the OGraf build produced, so a new graphic appears
 * without an edit here. It is shown on its own, full frame, unless it is named below.
 * Only placement is declared here: names, descriptions and fields come from each
 * package's manifest.
 */

/** The scorebug package id. Graphics in COMPANION_IDS are previewed beside it. */
export const SCOREBUG_ID = 'dtv-basketball-v2-scorebug';

/**
 * Graphics designed to be on air together with the scorebug (they stand on its baseline
 * and clear it horizontally; all but the Burning Question, in the opposite corner, share
 * its height too). The site puts the scorebug on air behind each of these. The double
 * and triple talent lower thirds overlap the scorebug and the matchup locator is a
 * mid-screen card, so none of those belong here.
 */
export const COMPANION_IDS: readonly string[] = [
  'dtv-basketball-v2-player-lower-third',
  'dtv-basketball-v2-staff-lower-third',
  'dtv-basketball-v2-starting-five-lower-third',
  'dtv-basketball-v2-talent-lower-third-single',
  'dtv-basketball-v2-burning-question',
];

export type Placement = 'scorebug' | 'with-scorebug' | 'full-frame';

/** Sidebar order: the scorebug first, its companions, then everything else. */
export const PLACEMENT_ORDER: readonly Placement[] = ['scorebug', 'with-scorebug', 'full-frame'];

export const placementOf = (id: string): Placement =>
  id === SCOREBUG_ID ? 'scorebug' : COMPANION_IDS.includes(id) ? 'with-scorebug' : 'full-frame';

/**
 * The sponsors filter at the top of the sidebar. A graphic belongs to a sponsor when its
 * scene embeds an image from assets/images/sponsors/ whose file name starts with `key`
 * (so `belfor` covers belfor_trimmed.png). `logo` is the file the sidebar shows, and
 * `chip` the background it reads on: Independence Blue Cross is a white wordmark, the
 * rest are full colour for a white chip.
 */
export interface Sponsor {
  key: string;
  name: string;
  logo: string;
  chip: 'light' | 'dark';
}

export const SPONSORS: readonly Sponsor[] = [
  { key: 'independence_blue_cross', name: 'Independence Blue Cross', logo: 'independence_blue_cross.png', chip: 'dark' },
  { key: 'belfor', name: 'Belfor', logo: 'belfor_trimmed.png', chip: 'light' },
  { key: 'drexel_physical_therapy', name: 'Drexel Physical Therapy', logo: 'drexel_physical_therapy_trimmed.png', chip: 'light' },
  { key: 'rothman_orthopaedics', name: 'Rothman Orthopaedics', logo: 'rothman_orthopaedics.png', chip: 'light' },
  { key: 'steamfitters_local_420', name: 'Steamfitters Local 420', logo: 'steamfitters_local_420_logo.png', chip: 'light' },
];
