// Installed runtime image renderer, generated SVG only; no provider modules.
import { createRequire } from 'node:module';
const require = createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/package.json');
const sharp = require('sharp');
await sharp(new URL('./view.svg', import.meta.url).pathname).png().toFile(new URL('./view.png', import.meta.url).pathname);
