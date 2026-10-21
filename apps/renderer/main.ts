/**
 * The /renderer page for OBS: a transparent 1920 x 1080 page that draws program. Every
 * output frame is complete, so a reload rebuilds what is on air from the first frame.
 *
 *   /renderer                               program
 *   /renderer?bus=preview&operator=alex     alex's preview
 */

import { connect, watch } from '@dtv/api';
import { GRAPHICS } from '@dtv/graphics';
import { createRenderer } from '@dtv/renderer';

const query = new URLSearchParams(location.search);
const operator = query.get('operator');
const bus = query.get('bus') === 'preview' && operator ? ({ kind: 'preview', operator } as const) : ({ kind: 'program' } as const);

const renderer = createRenderer({
  host: document.getElementById('program')!,
  registry: GRAPHICS,
  rivUrl: (scene) => `/riv/${scene.file.replace(/\.rml$/, '.riv')}`,
  blankImage: '/assets/images/blank.png',
});

const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
const { api } = connect({ url: `${scheme}://${location.host}/rpc`, client: bus.kind === 'program' ? 'renderer' : `renderer-${operator}` });

void watch((signal) => api.output.watch({ bus }, { signal }), renderer.render, {
  onStatus: (status) => {
    document.body.dataset.status = status;
  },
});

// A driver or the console can read each layer's phase.
Object.assign(window, { dtvRenderer: renderer });
