/* eslint-disable @n8n/community-nodes/no-restricted-imports */
import assert from 'node:assert/strict';
import test from 'node:test';

import { GscMagic } from '../nodes/GscMagic/GscMagic.node.ts';
import { siteSearch } from '../nodes/GscMagic/methods/loadOptions.ts';

const TOKEN = 'gsm_super_secret_token';

type Handler = (body: { method: string; params?: { name?: string; arguments?: Record<string, unknown> } }) => unknown;

function context(params: Record<string, unknown>, handler: Handler, extra: { continueOnFail?: boolean; items?: number } = {}) {
	const calls: Array<{ name?: string; args?: Record<string, unknown>; options: Record<string, unknown> }> = [];
	const ctx = {
		getInputData: () => Array.from({ length: extra.items ?? 1 }, () => ({ json: {} })),
		getNodeParameter: (name: string, _i: number, fallback?: unknown) =>
			name in params ? params[name] : fallback,
		getNode: () => ({ name: 'GSC Magic', type: 'n8n-nodes-gscmagic.gscMagic', typeVersion: 1, position: [0, 0], parameters: {}, id: 'x' }),
		getCredentials: async () => ({ accessToken: TOKEN, endpoint: 'https://mcp.gscmagic.com/mcp' }),
		continueOnFail: () => extra.continueOnFail === true,
		helpers: {
			httpRequestWithAuthentication: async (_cred: string, options: { body: { method: string; id: number; params?: { name?: string; arguments?: Record<string, unknown> } } } & Record<string, unknown>) => {
				calls.push({ name: options.body.params?.name, args: options.body.params?.arguments, options });
				const out = handler(options.body);
				if (out instanceof Error) throw out;
				return out;
			},
			prepareBinaryData: async (buffer: Buffer, fileName: string, mimeType: string) => ({
				data: buffer.toString('base64'),
				fileName,
				mimeType,
			}),
		},
	};
	return { ctx, calls };
}

const ok = (payload: unknown, images: Array<{ data: string; mimeType: string }> = []) => ({
	jsonrpc: '2.0',
	id: 1,
	result: {
		content: [
			{ type: 'text', text: JSON.stringify(payload) },
			...images.map((i) => ({ type: 'image', ...i })),
		],
	},
});

const run = (ctx: unknown) => new GscMagic().execute.call(ctx as never);

test('Search Analytics calls gsc_query_analytics and returns the parsed JSON', async () => {
	const { ctx, calls } = context(
		{ operation: 'searchAnalytics', site: 'sc-domain:example.com', dateRange: 'last_7_days', dimensions: ['query'], limit: 10, includeChart: false, splitIntoItems: false },
		() => ok({ summary: { rows_total: 1 }, rows: [{ query: 'x', clicks: 3 }] }),
	);
	const [[item]] = await run(ctx);
	assert.equal(calls[0].name, 'gsc_query_analytics');
	assert.deepEqual(calls[0].args, { site: 'sc-domain:example.com', range: 'last_7_days', dimensions: ['query'], limit: 10 });
	assert.deepEqual(item.json, { summary: { rows_total: 1 }, rows: [{ query: 'x', clicks: 3 }] });
	assert.equal(item.binary, undefined);
	assert.deepEqual(item.pairedItem, { item: 0 });
});

test('Split Into Items emits one item per row', async () => {
	const { ctx } = context({ operation: 'quickWins', site: 'a', splitIntoItems: true }, () =>
		ok({ rows: [{ q: 1 }, { q: 2 }, { q: 3 }] }),
	);
	const [out] = await run(ctx);
	assert.deepEqual(out.map((i) => i.json), [{ q: 1 }, { q: 2 }, { q: 3 }]);
});

test('an SSE response body is understood', async () => {
	const { ctx } = context({ operation: 'listSites' }, () => `event: message\ndata: ${JSON.stringify(ok([{ siteUrl: 'a' }]))}\n\n`);
	const [[item]] = await run(ctx);
	assert.deepEqual(item.json, { result: [{ siteUrl: 'a' }] });
});

test('chart images become binary.chart on the first item', async () => {
	const { ctx } = context({ operation: 'trafficDrops', site: 'a', includeChart: true, splitIntoItems: true }, () =>
		ok({ losers: [{ key: 'p' }], gainers: [{ key: 'q' }] }, [{ data: 'iVBORw0KGgo=', mimeType: 'image/png' }]),
	);
	const [out] = await run(ctx);
	assert.equal(out.length, 2);
	assert.equal(out[0].binary?.chart.mimeType, 'image/png');
	assert.equal(out[0].binary?.chart.fileName, 'chart.png');
	assert.equal(out[1].binary, undefined);
});

test('401 becomes the friendly message and never leaks the token', async () => {
	const failure = Object.assign(new Error(`Request failed with Authorization: Bearer ${TOKEN}`), { httpCode: '401' });
	const { ctx } = context({ operation: 'listSites' }, () => failure);
	await assert.rejects(run(ctx), (e: Error) => {
		assert.equal(
			e.message,
			'GSC Magic rejected the access token (wrong, expired or revoked). Create a new token in the dashboard → Connect → Access tokens.',
		);
		assert.ok(!JSON.stringify(e).includes(TOKEN));
		return true;
	});
});

test('other HTTP failures are redacted', async () => {
	const failure = Object.assign(new Error(`Bad gateway for ${TOKEN}`), { httpCode: '502' });
	const { ctx } = context({ operation: 'listSites' }, () => failure);
	await assert.rejects(run(ctx), (e: Error) => {
		assert.match(e.message, /Bad gateway for \[REDACTED\]/);
		assert.ok(!e.message.includes(TOKEN));
		return true;
	});
});

test('isError results pass the server message through, including plan limits', async () => {
	const message = 'Daily limit reached: 10 of 10 calls used today.';
	const { ctx } = context({ operation: 'listSites' }, () => ({
		jsonrpc: '2.0',
		id: 1,
		result: { isError: true, content: [{ type: 'text', text: message }] },
	}));
	await assert.rejects(run(ctx), (e: Error) => e.message === message);
});

test('continueOnFail keeps the run going and pairs the error with its input item', async () => {
	let n = 0;
	const { ctx } = context(
		{ operation: 'listSites' },
		() =>
			++n === 1
				? { jsonrpc: '2.0', id: 1, result: { isError: true, content: [{ type: 'text', text: 'nope' }] } }
				: ok([{ siteUrl: 'a' }]),
		{ continueOnFail: true, items: 2 },
	);
	const [out] = await run(ctx);
	assert.deepEqual(out[0].json, { error: 'nope' });
	assert.deepEqual(out[0].pairedItem, { item: 0 });
	assert.deepEqual(out[1].json, { result: [{ siteUrl: 'a' }] });
	assert.deepEqual(out[1].pairedItem, { item: 1 });
});

test('Call Any Tool uses the selected tool and the JSON arguments', async () => {
	const { ctx, calls } = context({ operation: 'callAnyTool', tool: 'ga_list_properties', argumentsJson: '{"x":1}', splitIntoItems: false }, () => ok({ done: true }));
	await run(ctx);
	assert.equal(calls[0].name, 'ga_list_properties');
	assert.deepEqual(calls[0].args, { x: 1 });
});

test('the token is never part of the request options handed to n8n', async () => {
	const { ctx, calls } = context({ operation: 'listSites' }, () => ok([]));
	await run(ctx);
	assert.ok(!JSON.stringify(calls[0].options).includes(TOKEN));
});

test('siteSearch lists and filters properties', async () => {
	const { ctx } = context({}, () => ok([{ siteUrl: 'sc-domain:b.com' }, { siteUrl: 'https://a.com/' }]));
	assert.deepEqual(await siteSearch.call(ctx as never, 'a.com'), {
		results: [{ name: 'https://a.com/', value: 'https://a.com/' }],
	});
	assert.equal((await siteSearch.call(ctx as never)).results.length, 2);
});
