/**
 * A monitor: one `@dtv/renderer` drawing one bus from `output.watch`, as /renderer does
 * for OBS. Each monitor is on `window.dtvMonitors` by name, so a test can read what it drew.
 */

import type { BusRef, OutputFrame } from '@dtv/playout';
import { createRenderer, type Renderer } from '@dtv/renderer';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useController } from '../app/context';
import { useStream } from '../app/streams';

interface MonitorHandle {
  readonly renderer: Renderer;
  frame: OutputFrame | null;
}

declare global {
  interface Window {
    dtvMonitors?: Record<string, MonitorHandle>;
  }
}

export function Monitor(props: { readonly name: string; readonly bus: BusRef; readonly className?: string; readonly children?: ReactNode }) {
  const { api, registry } = useController();
  const host = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<MonitorHandle | null>(null);
  const busKey = JSON.stringify(props.bus);

  useEffect(() => {
    const renderer = createRenderer({
      host: host.current!,
      registry,
      rivUrl: (scene) => `/riv/${scene.file.replace(/\.rml$/, '.riv')}`,
      blankImage: '/assets/images/blank.png',
    });
    const created: MonitorHandle = { renderer, frame: null };
    window.dtvMonitors = { ...window.dtvMonitors, [props.name]: created };
    setHandle(created);
    return () => {
      renderer.dispose();
      if (window.dtvMonitors?.[props.name] === created) delete window.dtvMonitors[props.name];
    };
  }, [registry, props.name]);

  const frame = useStream((signal) => api.output.watch({ bus: props.bus }, { signal }), [api, busKey]);
  useEffect(() => {
    if (!frame || !handle) return;
    handle.frame = frame;
    handle.renderer.render(frame);
  }, [frame, handle]);

  const problem = frame?.layers.find((layer) => layer.error)?.error;
  return (
    <div className={`monitor ${props.className ?? ''}`} data-monitor={props.name}>
      <div className="monitor-screen" ref={host} />
      {props.children}
      {problem && <div className="monitor-problem">{problem}</div>}
    </div>
  );
}
