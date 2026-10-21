import { z } from 'zod';
import type { ProgramCode } from './programs';

/**
 * Every id is a branded slug. Seeded and imported rows get deterministic ids from their
 * natural key (`idFor`), so a seed or an import that runs twice writes the same rows.
 * An id never changes after creation, even when the name it was made from is edited.
 */
const SLUG = /^[a-z0-9]+(?:[-@./][a-z0-9]+)*$/;
const slugId = <B extends string>() => z.string().regex(SLUG).brand<B>();

export const ConferenceId = slugId<'ConferenceId'>();
export const SchoolId = slugId<'SchoolId'>();
export const TeamId = slugId<'TeamId'>();
export const SeasonId = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .brand<'SeasonId'>();
export const TeamSeasonId = slugId<'TeamSeasonId'>();
export const PlayerId = slugId<'PlayerId'>();
export const StaffId = slugId<'StaffId'>();
export const TalentId = slugId<'TalentId'>();
export const SponsorId = slugId<'SponsorId'>();
export const VenueId = slugId<'VenueId'>();
export const GameId = slugId<'GameId'>();
export const ShowId = slugId<'ShowId'>();
export const CueId = slugId<'CueId'>();
/** `<package>/<graphic>`, e.g. `basketball-v2/scorebug`. Checked against the registry at the API boundary. */
export const GraphicId = slugId<'GraphicId'>();
/** Who wrote a live update: `operator`, or a live-data package such as `statcrew`. */
export const SourceId = slugId<'SourceId'>();

export type ConferenceId = z.infer<typeof ConferenceId>;
export type SchoolId = z.infer<typeof SchoolId>;
export type TeamId = z.infer<typeof TeamId>;
export type SeasonId = z.infer<typeof SeasonId>;
export type TeamSeasonId = z.infer<typeof TeamSeasonId>;
export type PlayerId = z.infer<typeof PlayerId>;
export type StaffId = z.infer<typeof StaffId>;
export type TalentId = z.infer<typeof TalentId>;
export type SponsorId = z.infer<typeof SponsorId>;
export type VenueId = z.infer<typeof VenueId>;
export type GameId = z.infer<typeof GameId>;
export type ShowId = z.infer<typeof ShowId>;
export type CueId = z.infer<typeof CueId>;
export type GraphicId = z.infer<typeof GraphicId>;
export type SourceId = z.infer<typeof SourceId>;

/** `Saint Joseph's` becomes `saint-josephs`; `Miami (OH)` becomes `miami-oh`. */
export const slugify = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** A person's slug is last name first, so a roster sorts by family name. Empty for a name with no a-z or digits. */
export const personSlug = (firstName: string, lastName: string) => slugify(`${lastName} ${firstName}`);

export const idFor = {
  school: (name: string) => SchoolId.parse(slugify(name)),
  conference: (shortName: string) => ConferenceId.parse(slugify(shortName)),
  team: (school: SchoolId, program: ProgramCode) => TeamId.parse(`${school}-${program}`),
  teamSeason: (team: TeamId, season: SeasonId) => TeamSeasonId.parse(`${team}@${season}`),
  player: (team: TeamId, season: SeasonId, firstName: string, lastName: string) =>
    PlayerId.parse(`${team}@${season}/${personSlug(firstName, lastName)}`),
  staff: (team: TeamId, season: SeasonId, firstName: string, lastName: string) =>
    StaffId.parse(`${team}@${season}/${personSlug(firstName, lastName)}`),
  talent: (firstName: string, lastName: string) => TalentId.parse(slugify(`${firstName} ${lastName}`)),
  sponsor: (name: string) => SponsorId.parse(slugify(name)),
  venue: (name: string) => VenueId.parse(slugify(name)),
  /** `date` is the local game day, `YYYY-MM-DD`. */
  game: (season: SeasonId, date: string, away: TeamId, home: TeamId) => GameId.parse(`${season}/${date}/${away}.at.${home}`),
};
