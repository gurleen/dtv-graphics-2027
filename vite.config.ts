import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { spawn } from 'node:child_process';

function refreshRivePreview() {
  return {
    name: 'refresh-rive-preview',
    configureServer(server: import('vite').ViteDevServer) {
      const sources = [
        'graphics/10_ncaa_basketball_scorebug/10_ncaa_basketball_scorebug.rml',
        'graphics/10_ncaa_basketball_scorebug/basketball_score_scroll.luau',
        'assets/fonts/Roboto-Variable.ttf',
        'assets/images/scorebug/saint-josephs.png',
        'assets/images/scorebug/drexel.png',
      ];
      server.watcher.add(sources);
      let rendering = false;
      server.watcher.on('change', (file) => {
        if (!sources.some((source) => file.endsWith(source)) || rendering) return;
        rendering = true;
        const process = spawn('bun', ['run', 'preview:generate'], { stdio: 'inherit' });
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
