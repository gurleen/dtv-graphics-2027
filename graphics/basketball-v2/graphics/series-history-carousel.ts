import { type TeamView, Url } from '@dtv/domain';
import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { SERIES } from './big5';
import { teamOf } from './shared';

/** A photo for the meeting in the same place, or blank for none, so a photo can be given for a later meeting alone. */
const Photo = z.string().regex(/^$|^(https?:\/\/|\/)/, 'A photo is an http(s) URL or a /path, or blank for none');

/** `Drexel`, or the abbreviation (`SJU`) when the short name is more than one word. */
const siteName = (host: TeamView) => (/\s/.test(host.school.shortName) ? host.brand.abbreviation : host.school.shortName);

export const seriesHistoryCarousel = defineGraphic({
  id: 'basketball-v2/series-history-carousel',
  scene: SCENES.series_history_carousel,
  params: z.object({
    footer: z.string().min(1).default('First meeting 1919 · Drexel has won 2 of the last 4'),
    photos: z.array(Photo).max(SERIES.meetings.length).default([]),
  }),
})({
  name: 'Series History Carousel',
  sport: 'basketball',
  layer: 'card',
  demo: {},
  site: 'full-frame',
  label: () => 'Series history carousel',
  bind(params, context) {
    const leader = teamOf(context, SERIES.leader);
    return {
      seriesLeader: `${leader.school.name} leads`,
      seriesRecord: `${SERIES.leaderWins}-${SERIES.trailerWins}`,
      footer: params.footer,
      meeting: SERIES.meetings.map((meeting, index) => {
        const winner = teamOf(context, meeting.winner);
        const photo = params.photos[index];
        return {
          year: meeting.year,
          site: `at ${siteName(teamOf(context, meeting.host))}`,
          winner: winner.school.name,
          score: meeting.score,
          caption: `${meeting.date} · ${meeting.caption}`,
          logo: winner.brand.logo,
          primaryColor: winner.brand.primaryColor,
          photo: photo ? Url.parse(photo) : null,
        };
      }),
    };
  },
});
