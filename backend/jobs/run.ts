import 'dotenv/config';
import { AnalysisWorker } from './worker';

/**
 * Worker entrypoint. Start with `npm run worker`.
 */
const worker = new AnalysisWorker();

// Graceful shutdown on SIGTERM / SIGINT (Ctrl+C)
process.on('SIGTERM', () => {
  console.log('[Worker] SIGTERM received — shutting down gracefully...');
  worker.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Worker] SIGINT received — shutting down gracefully...');
  worker.stop();
  process.exit(0);
});

worker.start();
console.log('[Worker] DataTrace Analysis Worker running. Press Ctrl+C to stop.');
