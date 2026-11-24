import { main } from './server.js';

main().catch((err: unknown) => {
  console.error('[gamedna] fatal:', err);
  process.exit(1);
});
