import { Color, emptySnapshot, type EntityKind, type EntityOf, Game, GameId, indexWorld, Show, Talent, TalentId, type World } from '@dtv/domain';
import { z } from 'zod';
import { showContext } from './context';
import { defineGraphic, type Registry, type ShowContext } from './graphic';
import type { SceneFacts } from './scene';

const facts = { artboard: 'Main', stateMachine: 'Main', layers: ['Display'], internal: { _onScreen: 'number' }, defaults: {} } as const;

const BUG_SCENE = {
  ...facts,
  file: 'bug.rml',
  viewModel: 'Bug',
  animations: { Intro: 1000, Outro: 400 },
  props: { isPlaying: 'boolean', title: 'string', score: 'number', logo: 'image' },
  groups: {},
} as const satisfies SceneFacts;

const NAME_SCENE = {
  ...facts,
  file: 'name.rml',
  viewModel: 'Name',
  animations: { Intro: 1000, Outro: 400 },
  props: { isPlaying: 'boolean', name: 'string', role: 'string', color: 'color', headshot: 'image', live: 'boolean' },
  groups: {},
} as const satisfies SceneFacts;

const STEPS_SCENE = {
  ...facts,
  file: 'steps.rml',
  viewModel: 'Steps',
  animations: { Intro: 1000, Outro: 400, 'Away To Home': 600 },
  props: { isPlaying: 'boolean', title: 'string', side: 'string' },
  groups: {},
} as const satisfies SceneFacts;

const TABLE_SCENE = {
  ...facts,
  file: 'table.rml',
  viewModel: 'Table',
  animations: { Intro: 1000, Outro: 400 },
  props: { isPlaying: 'boolean', title: 'string' },
  groups: { row: { count: 3, fields: { team: 'string', logo: 'image', wins: 'number' } } },
} as const satisfies SceneFacts;

const talentOf = (context: ShowContext, id: TalentId) => {
  const talent = context.world.get('talent', id);
  if (!talent) throw new Error(`Talent ${id} is gone`);
  return talent;
};

const bug = defineGraphic({ id: 'test/bug', scene: BUG_SCENE, params: z.object({}) })({
  name: 'Bug',
  sport: null,
  layer: 'bug',
  demo: {},
  site: 'scorebug',
  free: () => ({}),
  label: () => 'Bug',
  bind: (_params, context) => ({ title: context.show?.id ?? 'No show', score: context.now, logo: context.sponsor?.logoOnDark ?? null }),
});

const name = defineGraphic({ id: 'test/name', scene: NAME_SCENE, params: z.object({ talent: TalentId, live: z.boolean().default(false) }) })({
  name: 'Name',
  sport: null,
  layer: 'lower',
  demo: { talent: 'rob-brooks' },
  site: 'with-scorebug',
  label: (params, context) => {
    const talent = talentOf(context, params.talent);
    return `${talent.firstName} ${talent.lastName}`;
  },
  bind: (params, context) => {
    const talent = talentOf(context, params.talent);
    return { name: `${talent.firstName} ${talent.lastName}`, role: talent.role, color: Color.parse('#07294d'), headshot: null, live: params.live };
  },
});

const steps = defineGraphic({ id: 'test/steps', scene: STEPS_SCENE, params: z.object({ title: z.string().default('Starting Five') }) })({
  name: 'Steps',
  sport: null,
  layer: 'lower',
  demo: {},
  site: 'with-scorebug',
  label: () => 'Steps',
  bind: (params) => ({ title: params.title, side: 'Away' }),
  steps: { count: 2, values: (step) => ({ side: step === 0 ? 'Away' : 'Home' }), transition: 'Away To Home' },
});

/** Covers the scorebug, as the double talent lower third does. */
const wide = defineGraphic({ id: 'test/wide', scene: NAME_SCENE, params: z.object({ talent: TalentId }) })({
  name: 'Wide',
  sport: null,
  layer: 'lower',
  clears: ['bug'],
  demo: { talent: 'mike-tuberosa' },
  site: 'full-frame',
  free: (context) => (context.crew[1] ? { talent: context.crew[1].talent.id } : null),
  label: () => 'Wide',
  bind: (params, context) => ({ name: talentOf(context, params.talent).lastName, role: 'Wide', color: Color.parse('#000000'), headshot: null, live: false }),
});

const table = defineGraphic({ id: 'test/table', scene: TABLE_SCENE, params: z.object({ rows: z.number().int().max(4).default(2) }) })({
  name: 'Table',
  sport: null,
  layer: 'card',
  demo: {},
  site: 'full-frame',
  label: () => 'Table',
  bind: (params) => ({
    title: 'Standings',
    row: Array.from({ length: params.rows }, (_, index) => ({ team: `Team ${index + 1}`, logo: null, wins: 10 - index })),
  }),
});

export const REGISTRY: Registry = { [bug.id]: bug, [name.id]: name, [steps.id]: steps, [wide.id]: wide, [table.id]: table };

const talent = [
  Talent.parse({ id: 'rob-brooks', firstName: 'Rob', lastName: 'Brooks', role: 'Play-by-Play' }),
  Talent.parse({ id: 'mike-tuberosa', firstName: 'Mike', lastName: 'Tuberosa', role: 'Color Analyst' }),
];

/** Games enough to key shows by; their teams and season are not in the World, so none resolves. */
const games = ['demo', 'other', 'bare'].map((id) =>
  Game.parse({ id, seasonId: '2026-27', program: 'mbb', awayTeamId: 'away', homeTeamId: 'home', startsAt: '2026-11-08T19:00:00-05:00' }),
);

const shows = [
  Show.parse({
    id: 'demo',
    crew: [{ talentId: 'rob-brooks' }, { talentId: 'mike-tuberosa', role: 'Analyst' }],
    rundown: [
      { id: 'brooks', graphic: 'test/name', params: { talent: 'rob-brooks' } },
      { id: 'tuberosa', graphic: 'test/name', params: { talent: 'mike-tuberosa' }, overrides: { role: 'Tonight' } },
      { id: 'starters', graphic: 'test/steps', params: {} },
      { id: 'standings', graphic: 'test/table', params: { rows: 3 } },
      { id: 'missing-talent', graphic: 'test/name', params: { talent: 'nobody' } },
    ],
  }),
  Show.parse({ id: 'other', crew: [{ talentId: 'rob-brooks' }] }),
];

/** A World with two talent and three games: `demo` and `other` have shows, `bare` has none stored. Pass rows to replace a kind. */
export const fixtureWorld = (patch: Partial<{ [K in EntityKind]: EntityOf<K>[] }> = {}): World => {
  const snapshot = emptySnapshot();
  return indexWorld({ ...snapshot, entities: { ...snapshot.entities, talent, game: games, show: shows, ...patch } });
};

export const fixtureContext = (world: World = fixtureWorld(), gameId: GameId | null = GameId.parse('demo'), now = 1_000): ShowContext =>
  showContext({ world, gameId, live: () => undefined, now });
