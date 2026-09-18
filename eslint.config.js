import { builtinModules } from 'node:module';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

// Module boundaries (spec §14.2). Each layer may only reach the layers beneath it.
const ENGINE = '**/engine/**';
const DATA = '**/data/**';
const GAME = '**/game/**';
const AI = '**/ai/**';
const CONTENT = '**/content/**';
const WEB = '**/web/**';
const CLI = '**/cli/**';

const noNodeBuiltins = [
  ...builtinModules.map((name) => ({ name, message: 'Node built-ins stay out of this layer (spec §14.2).' })),
];

const boundary = (layer, banned, extra = {}) => ({
  files: [`src/${layer}/**/*.ts`, ...(layer === 'web' ? ['web/**/*.ts'] : [])],
  rules: {
    '@typescript-eslint/no-restricted-imports': ['error', {
      paths: layer === 'cli' ? [] : noNodeBuiltins,
      patterns: [
        { group: [...banned, ...(layer === 'cli' ? [] : ['node:*'])], message: `${layer}/ may not import this layer (spec §14.2).` },
        ...(extra.patterns ?? []),
      ],
    }],
  },
});

export default defineConfig(
  { ignores: ['dist/', 'node_modules/', 'coverage/', 'archive/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // A parameter an implementation must accept but does not need is named with a leading underscore.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },

  boundary('engine', [GAME, AI, CONTENT, WEB, CLI]),
  boundary('data', ['**/engine/*', '!**/engine/enums', '!**/engine/enums.js', '!**/engine/enums.ts', GAME, AI, CONTENT, WEB, CLI]),
  boundary('ai', [GAME, CONTENT, WEB, CLI], {
    patterns: [{ group: [ENGINE], allowTypeImports: true, message: 'ai/ may import engine/ types only (spec §14.2).' }],
  }),
  boundary('game', [WEB, CLI]),
  boundary('content', [WEB, CLI]),
  boundary('web', [ENGINE, DATA, AI, CONTENT, CLI]),
  boundary('cli', [WEB]),

  // Determinism (spec G10). The engine's only clock is the tick counter and its only randomness is rngFor().
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Use rngFor(seed, stream) — spec G10.' },
        { object: 'Date', property: 'now', message: 'Engine time is the tick counter — spec G10.' },
        { object: 'performance', property: 'now', message: 'Engine time is the tick counter — spec G10.' },
      ],
      'no-restricted-syntax': ['error',
        { selector: "NewExpression[callee.name='Date']", message: 'Engine time is the tick counter — spec G10.' },
      ],
      'no-restricted-globals': ['error',
        ...['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'process', 'setTimeout', 'setInterval']
          .map((name) => ({ name, message: 'The engine is pure and synchronous: no browser, Node or timer globals (spec §14.2).' })),
      ],
    },
  },
);
