import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { spawn } from 'node:child_process';

// The files each preview graphic is generated from; a change regenerates only that graphic.
const PREVIEW_SOURCES: Record<string, string[]> = {
  'ncaa-basketball-scorebug': [
    'graphics/10_ncaa_basketball_scorebug/10_ncaa_basketball_scorebug.rml',
    'graphics/10_ncaa_basketball_scorebug/basketball_score_scroll.luau',
    'assets/fonts/Roboto-Variable.ttf',
    'assets/images/scorebug/saint-josephs.png',
    'assets/images/scorebug/drexel.png',
  ],
  'basketball-halftime-adjustments': [
    'graphics/basketball-v2/halftime_adjustments.rml',
    'assets/fonts/Zuume-Bold.ttf',
    'assets/fonts/Zuume-Regular.ttf',
    'assets/images/scorebug/saint-josephs.png',
    'assets/images/scorebug/drexel.png',
    'assets/images/sponsors/rothman_orthopaedics.png',
  ],
};

function refreshRivePreview() {
  return {
    name: 'refresh-rive-preview',
    configureServer(server: import('vite').ViteDevServer) {
      server.watcher.add(Object.values(PREVIEW_SOURCES).flat());
      let rendering = false;
      server.watcher.on('change', (file) => {
        const slugs = Object.entries(PREVIEW_SOURCES)
          .filter(([, sources]) => sources.some((source) => file.endsWith(source)))
          .map(([slug]) => slug);
        if (slugs.length === 0 || rendering) return;
        rendering = true;
        const process = spawn('bun', ['preview/scripts/generate.ts', ...slugs], { stdio: 'inherit' });
        process.on('exit', (code) => {
          rendering = false;
          if (code === 0) server.ws.send({ type: 'full-reload' });
        });
      });
    },
  };
}

export default defineConfig({
  root: 'preview',
  plugins: [react(), tailwindcss(), refreshRivePreview()],
  build: { outDir: '../preview-dist', emptyOutDir: true },
});
