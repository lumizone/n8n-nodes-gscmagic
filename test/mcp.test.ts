/* eslint-disable @n8n/community-nodes/no-restricted-imports */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
	AUTH_REJECTED_MESSAGE,
	McpError,
	buildRpcRequest,
	buildToolCall,
	extractToolResult,
	extractTools,
	isUnauthorized,
	normalizeEndpoint,
	parseRpcResponse,
	parseSse,
	redactSecret,
	unwrapRpc,
} from '../nodes/GscMagic/shared/mcp.ts';
import { buildRequestOptions } from '../nodes/GscMagic/shared/transport.ts';

test('buildToolCall produces a JSON-RPC tools/call request', () => {
	assert.deepEqual(buildToolCall('gsc_list_sites', {}, 7), {
		jsonrpc: '2.0',
		id: 7,
		method: 'tools/call',
		params: { name: 'gsc_list_sites', arguments: {} },
	});
	assert.deepEqual(buildRpcRequest('tools/list'), { jsonrpc: '2.0', id: 1, method: 'tools/list' });
});

test('buildRequestOptions posts JSON, accepts SSE and refuses redirects', () => {
	const options = buildRequestOptions('https://mcp.gscmagic.com/mcp', buildRpcRequest('tools/list'), 5000);
	assert.equal(options.method, 'POST');
	assert.deepEqual(options.headers, {
		'Content-Type': 'application/json',
		Accept: 'application/json, text/event-stream',
	});
	assert.equal(options.disableFollowRedirect, true);
	assert.equal(options.sendCredentialsOnCrossOriginRedirect, false);
	assert.equal(options.timeout, 5000);
	assert.ok(!JSON.stringify(options).toLowerCase().includes('bearer'));
});

test('normalizeEndpoint accepts HTTPS and loopback HTTP only, without credentials', () => {
	assert.equal(normalizeEndpoint(' https://mcp.gscmagic.com/mcp '), 'https://mcp.gscmagic.com/mcp');
	assert.equal(normalizeEndpoint('http://127.0.0.1:8787/mcp'), 'http://127.0.0.1:8787/mcp');
	assert.throws(() => normalizeEndpoint('http://example.com/mcp'), /must use HTTPS/);
	assert.throws(() => normalizeEndpoint('https://u:p@example.com/mcp'), /must not include credentials/);
	assert.throws(() => normalizeEndpoint('nope'), /valid absolute URL/);
});

test('parseSse reads data lines and skips keep-alives', () => {
	const body =
		': ping\n\nevent: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\ndata: not json\n\n';
	assert.deepEqual(parseSse(body), [{ jsonrpc: '2.0', id: 1, result: { ok: true } }]);
});

test('parseRpcResponse handles object, JSON string and SSE bodies', () => {
	const message = { jsonrpc: '2.0', id: 1, result: { tools: [] } };
	assert.deepEqual(parseRpcResponse(message, 1), message);
	assert.deepEqual(parseRpcResponse(JSON.stringify(message), 1), message);
	assert.deepEqual(parseRpcResponse(`event: message\ndata: ${JSON.stringify(message)}\n\n`, 1), message);
});

test('parseRpcResponse picks the message matching the request id', () => {
	const sse = [
		'data: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}',
		'',
		'data: {"jsonrpc":"2.0","id":2,"result":{"a":1}}',
		'',
		'data: {"jsonrpc":"2.0","id":1,"result":{"a":2}}',
		'',
	].join('\n');
	assert.deepEqual(parseRpcResponse(sse, 1).result, { a: 2 });
});

test('parseRpcResponse rejects empty bodies and unwrapRpc raises JSON-RPC errors', () => {
	assert.throws(() => parseRpcResponse(''), /empty or unreadable/);
	assert.throws(() => parseRpcResponse({ hello: 'world' }), /empty or unreadable/);
	const failing = parseRpcResponse({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'Boom' } });
	assert.throws(() => unwrapRpc(failing), (e: unknown) => e instanceof McpError && e.message === 'Boom' && e.kind === 'rpc');
});

test('extractToolResult parses JSON text and collects chart images', () => {
	const result = extractToolResult({
		content: [
			{ type: 'text', text: '{"summary":{"rows_total":2},"rows":[{"a":1},{"a":2}]}' },
			{ type: 'image', data: 'AAEC', mimeType: 'image/png' },
		],
	});
	assert.deepEqual(result.data, { summary: { rows_total: 2 }, rows: [{ a: 1 }, { a: 2 }] });
	assert.deepEqual(result.images, [{ data: 'AAEC', mimeType: 'image/png' }]);
});

test('extractToolResult keeps non JSON text and arrays as they are', () => {
	assert.deepEqual(extractToolResult({ content: [{ type: 'text', text: 'plain words' }] }).data, {
		text: 'plain words',
	});
	assert.deepEqual(extractToolResult({ content: [{ type: 'text', text: '[{"siteUrl":"a"}]' }] }).data, [
		{ siteUrl: 'a' },
	]);
	assert.deepEqual(extractToolResult({ content: [{ type: 'text', text: 'null' }] }).data, null);
	assert.deepEqual(extractToolResult({ content: [] }).data, {});
});

test('extractToolResult turns isError results into McpError with the server message', () => {
	assert.throws(
		() =>
			extractToolResult({
				isError: true,
				content: [{ type: 'text', text: 'Daily limit reached (10 calls). Resets at midnight UTC.' }],
			}),
		(e: unknown) =>
			e instanceof McpError && e.kind === 'tool' && e.message.startsWith('Daily limit reached'),
	);
	assert.throws(() => extractToolResult('nope'), McpError);
});

test('extractTools returns the tool list and ignores junk', () => {
	assert.deepEqual(
		extractTools({ tools: [{ name: 'a', title: 'A' }, null, { nope: 1 }, { name: 'b' }] }).map((t) => t.name),
		['a', 'b'],
	);
	assert.deepEqual(extractTools(undefined), []);
});

test('isUnauthorized recognises the shapes the n8n HTTP helper throws', () => {
	assert.equal(isUnauthorized({ httpCode: '401' }), true);
	assert.equal(isUnauthorized({ statusCode: 401 }), true);
	assert.equal(isUnauthorized({ response: { status: 401 } }), true);
	assert.equal(isUnauthorized({ cause: { status: 401 } }), true);
	assert.equal(isUnauthorized({ httpCode: '500' }), false);
	assert.equal(isUnauthorized(new Error('x')), false);
	assert.equal(isUnauthorized(null), false);
});

test('redactSecret removes the token and the auth message is the documented one', () => {
	assert.equal(redactSecret('failed for gsm_abc at gsm_abc', 'gsm_abc'), 'failed for [REDACTED] at [REDACTED]');
	assert.equal(redactSecret('nothing', ''), 'nothing');
	assert.equal(
		AUTH_REJECTED_MESSAGE,
		'GSC Magic rejected the access token (wrong, expired or revoked). Create a new token in the dashboard → Connect → Access tokens.',
	);
});
