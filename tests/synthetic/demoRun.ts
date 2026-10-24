import * as fs from 'node:fs';
import * as path from 'node:path';
import { runSyntheticScenario, PipelineRunReport, ScenarioDefinition } from './runner';

const DEFAULT_CACHE_PATH = path.join(__dirname, 'cached', 'demo-run.json');
const SCENARIO_1_PATH = path.join(__dirname, 'acme-deletion', 'scenario-1-normal-responsive.json');

export interface ReplayReport extends PipelineRunReport {
  replayed: true;
}

export function loadScenario1(): ScenarioDefinition {
  const content = fs.readFileSync(SCENARIO_1_PATH, 'utf-8');
  return JSON.parse(content) as ScenarioDefinition;
}

export async function runAndCacheDemo(
  cachePath: string = DEFAULT_CACHE_PATH,
): Promise<PipelineRunReport> {
  const scenario = loadScenario1();
  const report = await runSyntheticScenario(scenario);

  const cacheDir = path.dirname(cachePath);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  fs.writeFileSync(cachePath, JSON.stringify(report, null, 2), 'utf-8');
  return report;
}

export function replay(cachePath: string = DEFAULT_CACHE_PATH): ReplayReport {
  if (!fs.existsSync(cachePath)) {
    throw new Error(`Demo run cache not found at ${cachePath}. Run runAndCacheDemo() first.`);
  }

  const raw = fs.readFileSync(cachePath, 'utf-8');
  const parsed = JSON.parse(raw) as PipelineRunReport;

  return {
    ...parsed,
    replayed: true,
  };
}
