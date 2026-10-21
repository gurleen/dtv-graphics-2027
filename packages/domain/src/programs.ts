import { z } from 'zod';

export const SPORTS = ['basketball'] as const;
export const Sport = z.enum(SPORTS);
export type Sport = z.infer<typeof Sport>;

/**
 * A sport program, as athletics departments name them. A Team is one school's program
 * (`drexel-mbb`). Women's soccer is one more row here plus a sport module in `sports/`.
 */
export const PROGRAMS = {
  mbb: { sport: 'basketball', gender: 'men', name: "Men's Basketball" },
  wbb: { sport: 'basketball', gender: 'women', name: "Women's Basketball" },
} as const satisfies Record<string, { sport: Sport; gender: 'men' | 'women'; name: string }>;

export type ProgramCode = keyof typeof PROGRAMS;
export const PROGRAM_CODES = Object.keys(PROGRAMS) as [ProgramCode, ...ProgramCode[]];
export const ProgramCode = z.enum(PROGRAM_CODES);
export type ProgramOf<S extends Sport> = { [P in ProgramCode]: (typeof PROGRAMS)[P]['sport'] extends S ? P : never }[ProgramCode];
