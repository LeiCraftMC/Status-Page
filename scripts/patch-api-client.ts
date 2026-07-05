#!/usr/bin/env node
// Patch @hey-api/openapi-ts v0.98.2 generated Nuxt client files
//
// Two fixes:
//   1. sdk.gen.ts — function return types use DefaultT for the error slot,
//      but the actual `.post<T, ResT, SomeErrorType, DefaultT>(...)` calls
//      return RequestResult with the concrete error type. TypeScript can't
//      prove SomeErrorType is assignable to the generic DefaultT. Fix:
//      replace the hand-written return type annotation with `any` so the
//      real return type is inferred.
//
//   2. client.gen.ts — the SSE helper spreads Nuxt fetch options (which
//      allow `cache: false`) into createSseClient, whose parameter type
//      (Omit<RequestInit, 'method'>) only allows RequestCache | undefined.
//      Fix: override the Nuxt-specific `cache` with `undefined` before the
//      other known-safe explicit properties.
// @ts-ignore
import { readFileSync, writeFileSync } from 'node:fs';

const SDK_PATH = 'app/api-client/sdk.gen.ts';
const CLIENT_PATH = 'app/api-client/client/client.gen.ts';

// ---------------------------------------------------------------------------
// Fix 1: sdk.gen.ts — replace problematic return type annotations with `any`
// ---------------------------------------------------------------------------
let sdk = readFileSync(SDK_PATH, 'utf-8');

sdk = sdk.replace(
  /: RequestResult<TComposable, .+? \| DefaultT, DefaultT>(?= =>)/g,
  ': any',
);

writeFileSync(SDK_PATH, sdk);
console.log('✓ Patched sdk.gen.ts');

// ---------------------------------------------------------------------------
// Fix 2: client.gen.ts — suppress Nuxt-specific `cache` option in SSE helper
// ---------------------------------------------------------------------------
let client = readFileSync(CLIENT_PATH, 'utf-8');

// The spread `...unwrapRefs(opts)` carries `cache: false` (from Nuxt's
// useFetch options) into the object literal passed to createSseClient.
// Insert `cache: undefined` right after the spread so it wins over the
// spread value and satisfies RequestInit['cache'].
client = client.replace(
  '...unwrapRefs(opts),',
  '...unwrapRefs(opts),\n      cache: undefined,',
);

writeFileSync(CLIENT_PATH, client);
console.log('✓ Patched client.gen.ts');
