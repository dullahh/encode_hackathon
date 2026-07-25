import { existsSync } from 'node:fs';

const sourceRoot = new URL('../src/', import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') {
    return { url: 'data:text/javascript,export%20{}', shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    const file = new URL(`${specifier.slice(2)}.ts`, sourceRoot);
    return { url: existsSync(file) ? file.href : new URL(`${specifier.slice(2)}/index.ts`, sourceRoot).href, shortCircuit: true };
  }
  if (specifier.startsWith('.') && !specifier.endsWith('.ts') && !specifier.endsWith('.tsx') && !specifier.endsWith('.js') && !specifier.endsWith('.json')) {
    const file = new URL(`${specifier}.ts`, context.parentURL);
    return { url: existsSync(file) ? file.href : new URL(`${specifier}/index.ts`, context.parentURL).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
