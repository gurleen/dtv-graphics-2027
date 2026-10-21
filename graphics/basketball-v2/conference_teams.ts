/**
 * The members of the Coastal Athletic Association in 2026-27, in alphabetical order: the
 * teams the Conference Standings card can list. generate_conference_standings.ts embeds a
 * logo and a tint for each, and the registry entry names each row by `name`.
 *
 * `name` is the text on the card and the value an operator selects; `color` is the team
 * primary (`AARRGGBB`), drawn as the row tint on game nights; `logo` is the full-colour
 * mark, fitted and centred in a 176 x 120 canvas with a 4 margin (the card draws it at
 * 0.3125, a 55 x 37.5 box). Northeastern's keeps only the husky: its black wordmark
 * vanishes on dark glass.
 *
 * Fairfield joins as the fourteenth member in 2027-28: add it here, with its logo.
 */

export type ConferenceTeam = { name: string; color: string; logo: string };

export const CONFERENCE_TEAMS: readonly ConferenceTeam[] = [
  { name: 'CAMPBELL', color: 'FFF58025', logo: 'assets/images/caa/campbell.png' },
  { name: 'CHARLESTON', color: 'FF7B2431', logo: 'assets/images/caa/charleston.png' },
  { name: 'DREXEL', color: 'FF07294D', logo: 'assets/images/caa/drexel.png' },
  { name: 'ELON', color: 'FF73000A', logo: 'assets/images/caa/elon.png' },
  { name: 'HAMPTON', color: 'FF0067AC', logo: 'assets/images/caa/hampton.png' },
  { name: 'HOFSTRA', color: 'FF00337C', logo: 'assets/images/caa/hofstra.png' },
  { name: 'MONMOUTH', color: 'FF051844', logo: 'assets/images/caa/monmouth.png' },
  { name: 'N.C. A&T', color: 'FF004684', logo: 'assets/images/caa/nc-at.png' },
  { name: 'NORTHEASTERN', color: 'FFCC0001', logo: 'assets/images/caa/northeastern.png' },
  { name: 'STONY BROOK', color: 'FF990000', logo: 'assets/images/caa/stony-brook.png' },
  { name: 'TOWSON', color: 'FFFFC229', logo: 'assets/images/caa/towson.png' },
  { name: 'UNCW', color: 'FF00665E', logo: 'assets/images/caa/uncw.png' },
  { name: 'WILLIAM & MARY', color: 'FF115740', logo: 'assets/images/caa/william-mary.png' },
];

/** The away or home team when it is not a conference member: no row is tinted for it. */
export const NON_CONFERENCE = 'NONE';
