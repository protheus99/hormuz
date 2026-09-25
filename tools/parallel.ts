// Running a harness's independent games at the same time (2026-09-25).
//
// A year of Sandbox costs about eight seconds, and seven of those are card projections: building one
// card forks the whole thirty-one-company world and steps it thirty days, once per option. That is
// the right price for a player — a card is built once and two hundred milliseconds is imperceptible
// — and the wrong price for a harness playing eighteen whole years in a row.
//
// So the harnesses spread their games across the machine instead. Every game in `pacing` and
// `campaign` is independent: its own session, its own seed, nothing shared. Node runs one thread, so
// this spawns a child per job and lets the operating system use the cores.
//
// Each child runs the same script with `--only <index>`, prints its own line, and the parent prints
// them back in the order they were asked for, so the output is identical to running them in series.

import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';

/** Where a child reports what it found, and what it cost. */
export interface JobResult {
  readonly index: number;
  readonly out: string;
  readonly failed: boolean;
}

/**
 * Runs `count` copies of `script`, each with `--only <index>` and whatever else was on the command
 * line, at most `availableParallelism()` at a time. Returns their output in index order.
 */
export async function runJobs(script: string, count: number, extra: readonly string[] = []): Promise<JobResult[]> {
  const width = Math.max(1, Math.min(count, availableParallelism()));
  const results: JobResult[] = new Array(count) as JobResult[];
  let next = 0;

  const worker = async (): Promise<void> => {
    for (let i = next++; i < count; i = next++) {
      results[i] = await runOne(script, i, extra);
    }
  };
  await Promise.all(Array.from({ length: width }, worker));
  return results;
}

function runOne(script: string, index: number, extra: readonly string[]): Promise<JobResult> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', script, '--only', String(index), ...extra], {
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    child.on('close', (code) => {
      resolve({ index, out: code === 0 ? out.trimEnd() : `${out.trimEnd()}\n${err.trimEnd()}`.trim(), failed: code !== 0 });
    });
  });
}

/** The index this child was told to run, or null in the parent. */
export function onlyJob(argv: readonly string[]): number | null {
  const at = argv.indexOf('--only');
  if (at < 0) return null;
  const n = Number(argv[at + 1]);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** The arguments to hand a child: everything except our own `--only`. */
export function passThrough(argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') { i += 1; continue; }
    out.push(argv[i] as string);
  }
  return out;
}
