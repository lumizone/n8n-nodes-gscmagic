/**
 * Pure helpers for talking to the GSC Magic MCP endpoint (Streamable HTTP, JSON-RPC 2.0).
 * Nothing in here touches n8n, the network, the filesystem or the environment, so every
 * function can be unit-tested directly.
 */

export const DEFAULT_ENDPOINT = 'https://mcp.gscmagic.com/mcp';

export interface RpcRequest {
	jsonrpc: '2.0';
	id: number;
	method: string;
	params?: Record<string, unknown>;
}

export interface RpcError {
	code: number;
	message: string;
	data?: unknown;
}

export interface RpcMessage {
	jsonrpc?: string;
	id?: number | string | null;
	result?: unknown;
	error?: RpcError;
}

export interface ToolImage {
	data: string;
	mimeType: string;
}

export interface ToolResult {
	/** Parsed JSON from the first text block, or `{ text }` when the block was not JSON. */
	data: unknown;
	/** The raw text of all text blocks. */
	text: string;
	images: ToolImage[];
}

export interface ToolInfo {
	name: string;
	title?: string;
	description?: string;
	inputSchema?: { properties?: Record<string, unknown> };
}

/** The server reported a failure (JSON-RPC error or `isError` tool result). */
export class McpError extends Error {
	readonly kind: 'rpc' | 'tool';

	constructor(message: string, kind: 'rpc' | 'tool') {
		super(message);
		this.name = 'McpError';
		this.kind = kind;
	}
}

export const AUTH_REJECTED_MESSAGE =
	'GSC Magic rejected the access token (wrong, expired or revoked). Create a new token in the dashboard → Connect → Access tokens.';

function isLoopback(hostname: string): boolean {
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function normalizeEndpoint(value: string): string {
	const trimmed = value.trim();
	if (!URL.canParse(trimmed)) throw new Error('Endpoint must be a valid absolute URL');
	const url = new URL(trimmed);
	if (url.username || url.password) {
		throw new Error('Endpoint must not include credentials');
	}
	if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
		throw new Error('Endpoint must use HTTPS unless it points to a local development server');
	}
	url.hash = '';
	return url.toString();
}

export function buildRpcRequest(
	method: string,
	params?: Record<string, unknown>,
	id = 1,
): RpcRequest {
	return { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) };
}

export function buildToolCall(name: string, args: Record<string, unknown>, id = 1): RpcRequest {
	return buildRpcRequest('tools/call', { name, arguments: args }, id);
}

export const REQUEST_HEADERS = {
	'Content-Type': 'application/json',
	Accept: 'application/json, text/event-stream',
} as const;

/** Extracts the JSON payloads from the `data:` lines of a Server-Sent Events body. */
export function parseSse(text: string): unknown[] {
	const messages: unknown[] = [];
	for (const event of text.split(/\r?\n\r?\n/)) {
		const data = event
			.split(/\r?\n/)
			.filter((line) => line.startsWith('data:'))
			.map((line) => line.slice(5).replace(/^ /, ''))
			.join('\n')
			.trim();
		if (!data) continue;
		try {
			messages.push(JSON.parse(data));
		} catch {
			// ignore keep-alive or non-JSON events
		}
	}
	return messages;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Accepts a parsed JSON-RPC object, a JSON string, or an SSE body, and returns the response message. */
export function parseRpcResponse(body: unknown, id?: number): RpcMessage {
	let candidates: unknown[];
	if (typeof body === 'string') {
		const trimmed = body.trim();
		if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
			try {
				const parsed: unknown = JSON.parse(trimmed);
				candidates = Array.isArray(parsed) ? parsed : [parsed];
			} catch {
				candidates = parseSse(trimmed);
			}
		} else {
			candidates = parseSse(trimmed);
		}
	} else if (Array.isArray(body)) {
		candidates = body;
	} else {
		candidates = [body];
	}
	const messages = candidates.filter(
		(m): m is RpcMessage => isRecord(m) && ('result' in m || 'error' in m),
	);
	const match = messages.find((m) => id === undefined || m.id === id) ?? messages[messages.length - 1];
	if (!match) {
		throw new McpError('GSC Magic returned an empty or unreadable response', 'rpc');
	}
	return match;
}

/** Returns `result` or throws McpError for a JSON-RPC error. */
export function unwrapRpc(message: RpcMessage): unknown {
	if (message.error) {
		throw new McpError(message.error.message || 'GSC Magic returned an error', 'rpc');
	}
	return message.result;
}

interface ContentBlock {
	type?: string;
	text?: string;
	data?: string;
	mimeType?: string;
}

/** Turns an MCP `tools/call` result into JSON data plus any chart images. Throws McpError on `isError`. */
export function extractToolResult(result: unknown): ToolResult {
	if (!isRecord(result)) {
		throw new McpError('GSC Magic returned an unexpected tool result', 'rpc');
	}
	const blocks: ContentBlock[] = Array.isArray(result.content) ? (result.content as ContentBlock[]) : [];
	const text = blocks
		.filter((b) => b?.type === 'text' && typeof b.text === 'string')
		.map((b) => b.text as string)
		.join('\n');
	if (result.isError === true) {
		throw new McpError(text || 'GSC Magic reported an error', 'tool');
	}
	const images = blocks
		.filter((b) => b?.type === 'image' && typeof b.data === 'string' && b.data.length > 0)
		.map((b) => ({ data: b.data as string, mimeType: b.mimeType || 'image/png' }));
	let data: unknown;
	const first = blocks.find((b) => b?.type === 'text' && typeof b.text === 'string');
	if (first) {
		try {
			data = JSON.parse(first.text as string);
		} catch {
			data = { text: text };
		}
	} else {
		data = {};
	}
	return { data, text, images };
}

export function extractTools(result: unknown): ToolInfo[] {
	if (!isRecord(result) || !Array.isArray(result.tools)) return [];
	return (result.tools as ToolInfo[]).filter((t) => t && typeof t.name === 'string');
}

/** Replaces every occurrence of the secret in a message. */
export function redactSecret(message: string, secret: string): string {
	return secret ? message.split(secret).join('[REDACTED]') : message;
}

/** True when an error thrown by the n8n HTTP helper represents HTTP 401. */
export function isUnauthorized(error: unknown): boolean {
	if (!isRecord(error)) return false;
	const candidates = [
		error.httpCode,
		error.statusCode,
		error.status,
		isRecord(error.response) ? error.response.status : undefined,
		isRecord(error.response) ? error.response.statusCode : undefined,
		isRecord(error.cause) ? error.cause.status : undefined,
		isRecord(error.cause) ? error.cause.httpCode : undefined,
	];
	return candidates.some((c) => String(c) === '401');
}
