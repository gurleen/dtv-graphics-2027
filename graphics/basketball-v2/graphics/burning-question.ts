import { TeamId } from '@dtv/domain';
import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { teamOf } from './shared';

export const burningQuestion = defineGraphic({
  id: 'basketball-v2/burning-question',
  scene: SCENES.burning_question,
  params: z.object({ question: z.string().min(1), answer: z.string().min(1), team: TeamId }),
})({
  name: 'Burning Question',
  sport: 'basketball',
  layer: 'lower',
  demo: {
    question: "What Drexel women's basketball player scored her 1000th point in the 2013 WNIT championship game?",
    answer: 'Taylor Wootton',
    team: 'drexel-wbb',
  },
  site: 'with-scorebug',
  label: (params) => `Burning question · ${params.answer}`,
  bind(params, context) {
    const { brand } = teamOf(context, params.team);
    return {
      question: params.question,
      answer: params.answer,
      showAnswer: false,
      teamLogo: brand.logo,
      teamPrimaryColor: brand.primaryColor,
      teamSecondaryColor: brand.secondaryColor,
      sponsorLogo: context.sponsor?.logoOnLight ?? null,
    };
  },
  steps: { count: 2, values: (step) => ({ showAnswer: step === 1 }), transition: 'Answer Reveal' },
});
