import { describe, expect, it } from 'vitest';
import { ENGINE_NAME } from '../src/engine/index';

describe('toolchain', () => {
  it('compiles and runs a TypeScript test against engine code', () => {
    expect(ENGINE_NAME).toBe('GEMS');
  });
});
