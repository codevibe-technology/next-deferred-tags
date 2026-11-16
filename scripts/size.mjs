// Fails CI when the browser code a site downloads grows past the budget.
// Each case is bundled the way a site's build would do it (minified, unused code dropped,
// React and Next.js left out because the site already has them) and measured gzipped.
// The server entry is not counted: it never reaches the browser.
// 0.2.0 for reference: DeferredTags only 3.1 KB, with ConsentBanner 5.2 KB.
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = resolve('.');
const CASES = [
  ['DeferredTags only', `import { DeferredTags } from './dist/index.js'; window.x = DeferredTags;`, 7],
  ['DeferredTags + ConsentBanner', `import { DeferredTags, ConsentBanner } from './dist/index.js'; window.x = [DeferredTags, ConsentBanner];`, 10],
  ['Pages Router DeferredTags', `import { DeferredTags } from './dist/pages/index.js'; window.x = DeferredTags;`, 7],
  ['ConsentBridge', `import { ConsentBridge } from './dist/adapters/index.js'; window.x = ConsentBridge;`, 4],
];

let failed = false;
for (const [name, contents, budget] of CASES) {
  const out = await build({
    stdin: { contents, resolveDir: root, loader: 'js' },
    bundle: true,
    minify: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['react', 'react/*', 'react-dom', 'next', 'next/*'],
    logLevel: 'silent',
  });
  const kb = gzipSync(out.outputFiles[0].contents).length / 1024;
  if (kb > budget) failed = true;
  console.log(`${kb > budget ? 'OVER' : 'ok  '} ${name}: ${kb.toFixed(1)} KB (budget ${budget} KB)`);
}
if (failed) process.exit(1);
