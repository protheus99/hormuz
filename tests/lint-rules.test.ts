import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

// Lints a snippet as if it were saved at filePath, so each layer's rules apply
// without keeping deliberately broken files in the repository.
async function ruleIdsFor(code: string, filePath: string): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.map((m) => m.ruleId) ?? [];
}

const IMPORT_RULE = '@typescript-eslint/no-restricted-imports';

describe('determinism rules (spec G10)', () => {
  it('bans Math.random in the engine', async () => {
    expect(await ruleIdsFor('export const x = Math.random();\n', 'src/engine/fixture.ts'))
      .toContain('no-restricted-properties');
  });

  it('bans Date.now in the engine', async () => {
    expect(await ruleIdsFor('export const t = Date.now();\n', 'src/engine/fixture.ts'))
      .toContain('no-restricted-properties');
  });

  it('bans new Date() in the engine', async () => {
    expect(await ruleIdsFor('export const d = new Date();\n', 'src/engine/fixture.ts'))
      .toContain('no-restricted-syntax');
  });

  it('bans browser and timer globals in the engine', async () => {
    expect(await ruleIdsFor('setTimeout(() => {}, 0);\n', 'src/engine/fixture.ts'))
      .toContain('no-restricted-globals');
  });

  it('allows Math.random outside the engine', async () => {
    expect(await ruleIdsFor('export const x = Math.random();\n', 'src/cli/fixture.ts'))
      .not.toContain('no-restricted-properties');
  });
});

describe('module boundaries (spec §14.2)', () => {
  it('bans the engine importing the game layer', async () => {
    expect(await ruleIdsFor("import { x } from '../game/session';\nexport const y = x;\n", 'src/engine/fixture.ts'))
      .toContain(IMPORT_RULE);
  });

  it('bans the engine importing Node built-ins', async () => {
    expect(await ruleIdsFor("import { readFileSync } from 'node:fs';\nexport const r = readFileSync;\n", 'src/engine/fixture.ts'))
      .toContain(IMPORT_RULE);
  });

  it('bans the web layer importing the engine directly', async () => {
    expect(await ruleIdsFor("import { x } from '../src/engine/clearing';\nexport const y = x;\n", 'web/fixture.ts'))
      .toContain(IMPORT_RULE);
  });

  it('lets ai/ import engine types but not engine code', async () => {
    const typeOnly = "import type { Order } from '../engine/model';\nexport type O = Order;\n";
    const runtime = "import { clear } from '../engine/clearing';\nexport const c = clear;\n";
    expect(await ruleIdsFor(typeOnly, 'src/ai/fixture.ts')).not.toContain(IMPORT_RULE);
    expect(await ruleIdsFor(runtime, 'src/ai/fixture.ts')).toContain(IMPORT_RULE);
  });

  it('lets data/ import engine enums only', async () => {
    expect(await ruleIdsFor("import { Grade } from '../engine/enums';\nexport const g = Grade;\n", 'src/data/fixture.ts'))
      .not.toContain(IMPORT_RULE);
    expect(await ruleIdsFor("import { clear } from '../engine/clearing';\nexport const c = clear;\n", 'src/data/fixture.ts'))
      .toContain(IMPORT_RULE);
  });

  it('lets the game layer import the engine', async () => {
    expect(await ruleIdsFor("import { clear } from '../engine/clearing';\nexport const c = clear;\n", 'src/game/fixture.ts'))
      .not.toContain(IMPORT_RULE);
  });
});
