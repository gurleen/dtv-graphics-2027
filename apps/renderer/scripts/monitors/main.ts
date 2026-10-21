/**
 * Two renderers on one page, as the controller's monitors will run them: program at
 * 640 x 360 and an operator's preview at 480 x 270, each its own output stream.
 *
 *   /monitors?operator=<id>&rpc=ws://localhost:8986/rpc
 */

import { connect, watch } from '@dtv/api';
import { GRAPHICS } from '@dtv/graphics';
import { createRenderer } from '@dtv/renderer';

const query = new URLSearchParams(location.search);
const operator = query.get('operator')!;
const { api } = connect({ url: query.get('rpc')!, client: `monitors-${operator}` });

const monitors = (['program', 'preview'] as const).map((id) => {
  const host = document.getElementById(id)!;
  const renderer = createRenderer({
    host,
    registry: GRAPHICS,
    rivUrl: (scene) => `/riv/${scene.file.replace(/\.rml$/, '.riv')}`,
    blankImage: '/assets/images/blank.png',
  });
  const monitor = { id, host, renderer, status: 'connecting' };
  const bus = id === 'program' ? ({ kind: 'program' } as const) : ({ kind: 'preview', operator } as const);
  void watch((signal) => api.output.watch({ bus }, { signal }), renderer.render, {
    onStatus: (status) => {
      monitor.status = status;
    },
  });
  return monitor;
});

Object.assign(window, { dtvMonitors: monitors });
