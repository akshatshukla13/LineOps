import { pathToFileURL } from 'node:url';
import { app, start } from './src/index.js';

export { app };
export default app;

const isDirectExecution = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  start().catch((error) => {
    console.error('Failed to start server', error);
    process.exit(1);
  });
}