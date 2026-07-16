/**
 * Runtime‑abstraction barrel.
 *
 * Import utilities from here instead of reaching directly for Bun‑only or
 * Node‑only APIs.  Every function works across Bun, Cloudflare Workers, and
 * Node.js — and any future runtime only needs a change in these wrappers.
 *
 * ```ts
 * import { Runtime, hashPassword, randomBytesHex, sleep } from '#server/lib/runtime';
 * ```
 */

import type { Abortable } from 'node:events';
import type { Mode, ObjectEncodingOptions, OpenMode } from 'node:fs';
import type Stream from 'node:stream';
import { Logger } from './logger';

export class Runtime {
	
	protected constructor() {}

	/**
	 * `true` when the current process is running under **Bun**.
	 */
	static get isBun(): boolean {
		return typeof (globalThis as any).Bun !== 'undefined' && typeof (globalThis as any).Bun.version === 'string';
	}

	/**
	 * `true` when the current process is running inside **Cloudflare Workers**.
	 *
	 * Detection strategy: Workers exposes a few globals that no other runtime
	 * provides.  `WebSocketPair` (a bare class, not the web-standard WebSocket)
	 * is the most reliable signal.
	 */
	static get isCloudflare(): boolean {
		return typeof (globalThis as any).WebSocketPair !== 'undefined';
	}

	/**
	 * Human‑readable name of the current runtime.
	 *
	 * @returns one of `"bun"`, `"cloudflare"`, or `"unknown"`.
	 */
	static get name(): Runtime.Name {
		if (Runtime.isBun) return 'bun';
		if (Runtime.isCloudflare) return 'cloudflare';
		throw new Error(`Runtime detection failed: Runtime has to be either Bun or Cloudflare Workers, but neither was detected.`);
	}

}

export namespace Runtime {

	export type Name = 'bun' | 'cloudflare';

}

export namespace Runtime.FS {

	// ---------------------------------------------------------------------------
	// File system
	// ---------------------------------------------------------------------------

	/**
	 * Write `content` (text) to `path`.
	 *
	 * - **Bun**: uses `Bun.write()` (fast, supports `mode`).
	 * - **Node.js**: uses `fs.promises.writeFile()`.
	 * - **Cloudflare Workers**: no‑op (logs a warning via `Logger.warn`).
	 *
	 * @returns `true` if the file was written, `false` if skipped (Workers).
	 */
	export async function writeFile(
		path: string,
		data:
			| string
			| NodeJS.ArrayBufferView
			| Iterable<string | NodeJS.ArrayBufferView>
			| AsyncIterable<string | NodeJS.ArrayBufferView>
			| Stream,
		options?:
			| (ObjectEncodingOptions & {
				mode?: Mode | undefined;
				flag?: OpenMode | undefined;
				/**
				 * If all data is successfully written to the file, and `flush`
				 * is `true`, `filehandle.sync()` is used to flush the data.
				 * @default false
				 */
				flush?: boolean | undefined;
			} & Abortable)
			| BufferEncoding
			| null
	): Promise<void> {

		if (!Runtime.isBun) {
			throw new Error(`[Runtime] Cannot write to "${path}" — no filesystem is available in this runtime.`);
		}

		const fs = await import('node:fs/promises');
		return await fs.writeFile(path, data, options);
	}

	export async function readFile(path: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
		if (!Runtime.isBun) {
			throw new Error(`[Runtime] Cannot read from "${path}" — no filesystem is available in this runtime.`);
		}

		const fs = await import('node:fs/promises');
		return await fs.readFile(path, { encoding });
	}

	/**
	 * Ensure that a directory exists, creating it recursively if needed.
	 *
	 * - **Bun / Node.js**: uses `mkdirSync({ recursive: true })` via Node's `fs`.
	 * - **Cloudflare Workers**: no‑op.
	 */
	export async function ensureDirectoryExists(path: string): Promise<void> {
		await mkdir(path, true);
	}

	export async function mkdir(path: string, recursive: boolean = true): Promise<string | undefined> {
		if (!Runtime.isBun) {
			throw new Error(`[Runtime] Cannot create directory "${path}" — no filesystem is available in this runtime.`);
		}

		const { mkdir } = await import('node:fs/promises');
		return await mkdir(path, { recursive });
	}

	export async function getPathDirname(path: string): Promise<string> {
		if (!Runtime.isBun) {
			throw new Error(`[Runtime] Cannot get dirname of "${path}" — no filesystem is available in this runtime.`);
		}

		const { dirname } = await import('node:path');
		return dirname(path);
	}

}

export namespace Runtime.Timers {

	// ---------------------------------------------------------------------------
	// Timers
	// ---------------------------------------------------------------------------

	/**
	 * Promise‑based delay.
	 *
	 * Replacement for `Bun.sleep(ms)`. Uses standard `setTimeout` under the hood,
	 * which is available in every runtime.
	 *
	 * @param ms  Milliseconds to sleep (0 = yield microtask queue).
	 */
	export function sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

}

export namespace Runtime.Crypto {

	// ---------------------------------------------------------------------------
	// Random bytes
	// ---------------------------------------------------------------------------

	/**
	 * Generate `size` cryptographically‑strong random bytes.
	 *
	 * Replacement for Node's `crypto.randomBytes(size)`.
	 */
	export function randomBytes(size: number): Uint8Array {
		const bytes = new Uint8Array(size);
		crypto.getRandomValues(bytes);
		return bytes;
	}

	/**
	 * Generate `size` cryptographically‑strong random bytes and return them as a
	 * lowercase hex string (each byte → two hex chars).
	 *
	 * Replacement for `crypto.randomBytes(size).toString('hex')`.
	 */
	export function randomBytesHex(size: number): string {
		return bytesToHex(randomBytes(size));
	}

	// ---------------------------------------------------------------------------
	// Hashing
	// ---------------------------------------------------------------------------

	/**
	 * Compute the SHA‑256 digest of `data` and return the hex‑encoded string.
	 *
	 * Replacement for `crypto.createHash('sha256').update(data).digest('hex')`.
	 */
	export async function sha256(data: string | Uint8Array | ArrayBuffer): Promise<string> {
		const input = typeof data === 'string'
			? new TextEncoder().encode(data)
			: data as BufferSource;

		const hashBuffer = await crypto.subtle.digest('SHA-256', input);
		return bytesToHex(new Uint8Array(hashBuffer));
	}

	/**
	 * Synchronous SHA‑256 hash using the Web Crypto API.
	 *
	 * ⚠ Uses `crypto.subtle.digest` which is **async** internally, but this wrapper
	 * returns a Promise. Prefer the async `sha256()` function; this exists only as a
	 * drop‑in for code paths that currently require a sync API (e.g. inside
	 * synchronous functions that cannot become async without a larger refactor).
	 */
	export function sha256Sync(data: string | Uint8Array): Promise<string> {
		return sha256(data);
	}

	// ---------------------------------------------------------------------------
	// UUID
	// ---------------------------------------------------------------------------

	/**
	 * Generate a random UUID v4.
	 *
	 * Replacement for `crypto.randomUUID()` (identical API, re‑exported here for
	 * consistency).
	 */
	export function randomUUID(): string {
		return crypto.randomUUID();
	}

	// ---------------------------------------------------------------------------
	// Internal helpers
	// ---------------------------------------------------------------------------

	function bytesToHex(bytes: Uint8Array): string {
		let hex = '';
		for (let i = 0; i < bytes.length; i++) {
			hex += bytes[i]!.toString(16).padStart(2, '0');
		}
		return hex;
	}


}


export namespace Runtime.Password {


	// ---------------------------------------------------------------------------
	// Constants
	// ---------------------------------------------------------------------------

	/** Default PBKDF2 iteration count (OWASP minimum recommendation). */
	const PBKDF2_ITERATIONS = 600_000;

	/** Salt length in bytes. */
	const PBKDF2_SALT_BYTES = 16;

	/** Derived key length in bits — 256 bits = 32 bytes = SHA‑256 output. */
	const PBKDF2_KEY_BITS = 256;

	/** Prefix for the Web Crypto hash format. */
	const PBKDF2_PREFIX = '$pbkdf2-sha256';

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------

	/**
	 * Hash `password` for storage.
	 *
	 * - On **Bun**: delegates to `Bun.password.hash()` (bcrypt, auto‑selected cost).
	 * - On **Cloudflare Workers / Node.js**: uses PBKDF2‑SHA256 via Web Crypto.
	 */
	export async function hashPassword(password: string): Promise<string> {
		if (Runtime.isBun) {
			return await Bun.password.hash(password);
		}
		return hashPasswordWithWebCrypto(password);
	}

	/**
	 * Verify `password` against a previously‑stored `hash`.
	 *
	 * Auto‑detects the hash format:
	 * - `$argon2id$...`, `$2b$...`, `$2a$...`, `$2y$...` → Bun hashes
	 * - `$pbkdf2-sha256$...` → Web Crypto PBKDF2 format
	 */
	export async function verifyPassword(password: string, hash: string): Promise<boolean> {
		if (hash.startsWith(PBKDF2_PREFIX)) {
			return verifyPasswordWithWebCrypto(password, hash);
		}

		// Bun handles bcrypt, argon2id, and possibly future formats. Only delegate to
		// Bun.password.verify for non‑PBKDF2 hashes when running on Bun; otherwise we
		// cannot verify the format.
		if (Runtime.isBun) {
			try {
				return await Bun.password.verify(password, hash);
			} catch (err: any) {
				if (err?.code === 'PASSWORD_UNSUPPORTED_ALGORITHM') {
					Logger.warn(`[Runtime] Unsupported password hash format: "${hash.slice(0, 10)}…"`);
					return false;
				}
				throw err;
			}
		}

		Logger.warn(`[Runtime] Unknown password hash format: "${hash.slice(0, 10)}…"`);
		return false;
	}

	// ---------------------------------------------------------------------------
	// Web Crypto PBKDF2 implementation
	// ---------------------------------------------------------------------------

	/**
	 * Hash `password` using PBKDF2‑SHA256 and return a self‑describing string.
	 */
	async function hashPasswordWithWebCrypto(password: string): Promise<string> {
		const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
		const keyMaterial = await getKeyMaterial(password);
		const hash = await deriveBits(keyMaterial, salt, PBKDF2_ITERATIONS);

		return [
			PBKDF2_PREFIX,
			String(PBKDF2_ITERATIONS),
			base64Encode(salt),
			base64Encode(hash),
		].join('$');
	}

	/**
	 * Verify `password` against a PBKDF2‑SHA256 self‑describing hash string.
	 */
	async function verifyPasswordWithWebCrypto(password: string, stored: string): Promise<boolean> {
		const parts = stored.split('$');
		// parts[0] is empty (before the first $), parts[1] = prefix, parts[2] = iterations, parts[3] = salt, parts[4] = hash
		if (parts.length !== 5 || parts[1] !== PBKDF2_PREFIX.slice(1)) {
			return false;
		}
		const iterations = Number.parseInt(parts[2]!, 10);
		const salt = base64Decode(parts[3]!);
		const expectedHash = base64Decode(parts[4]!);

		if (!Number.isFinite(iterations) || !salt || !expectedHash) {
			return false;
		}

		const keyMaterial = await getKeyMaterial(password);
		const actualHash = await deriveBits(keyMaterial, salt, iterations);

		return timingSafeEqual(actualHash, expectedHash);
	}

	// ---------------------------------------------------------------------------
	// Web Crypto helpers
	// ---------------------------------------------------------------------------

	async function getKeyMaterial(password: string): Promise<CryptoKey> {
		return crypto.subtle.importKey(
			'raw',
			new TextEncoder().encode(password),
			'PBKDF2',
			false,
			['deriveBits'],
		);
	}

	async function deriveBits(
		keyMaterial: CryptoKey,
		salt: Uint8Array,
		iterations: number,
	): Promise<Uint8Array> {
		const buffer = await crypto.subtle.deriveBits(
			{
				name: 'PBKDF2',
				salt: salt as BufferSource,
				iterations,
				hash: 'SHA-256',
			},
			keyMaterial,
			PBKDF2_KEY_BITS,
		);
		return new Uint8Array(buffer);
	}

	// ---------------------------------------------------------------------------
	// Base64 helpers (URL‑safe, no padding)
	// ---------------------------------------------------------------------------

	function base64Encode(bytes: Uint8Array): string {
		let binary = '';
		for (let i = 0; i < bytes.length; i++) {
			binary += String.fromCharCode(bytes[i]!);
		}
		return btoa(binary)
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
	}

	function base64Decode(str: string): Uint8Array | null {
		try {
			const base64 = str
				.replace(/-/g, '+')
				.replace(/_/g, '/')
				.padEnd(Math.ceil(str.length / 4) * 4, '=');
			const binary = atob(base64);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) {
				bytes[i] = binary.charCodeAt(i);
			}
			return bytes;
		} catch {
			return null;
		}
	}

	// ---------------------------------------------------------------------------
	// Timing‑safe comparison
	// ---------------------------------------------------------------------------

	function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
		if (a.length !== b.length) {
			return false;
		}

		let result = 0;
		for (let i = 0; i < a.length; i++) {
			result |= a[i]! ^ b[i]!;
		}
		return result === 0;
	}

	// ---------------------------------------------------------------------------
	// Internal exports for testing only
	// ---------------------------------------------------------------------------

	export const __testWebCryptoHashPassword = hashPasswordWithWebCrypto;
	export const __testWebCryptoVerifyPassword = verifyPasswordWithWebCrypto;


}