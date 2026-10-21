import { parentPort, workerData } from 'node:worker_threads';
import { analyzeRepository } from './analyze';
const input = workerData as { repository: string; base: string; head: string };
analyzeRepository(input.repository, input.base, input.head).then(
  graph => parentPort?.postMessage({ graph }),
  error => parentPort?.postMessage({ error: error instanceof Error ? error.message : 'Analysis failed.' })
);
