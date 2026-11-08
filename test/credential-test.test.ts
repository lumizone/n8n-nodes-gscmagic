/* eslint-disable @n8n/community-nodes/no-restricted-imports */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ICredentialTestFunctions } from 'n8n-workflow';

import { gscMagicCredentialTest } from '../nodes/GscMagic/methods/credentialTest.ts';
import { AUTH_REJECTED_MESSAGE } from '../nodes/GscMagic/shared/mcp.ts';

const TOKEN = 'gsm_secret_value';

function credential(value: { accessToken: string; endpoint: string }) {
	return { data: value } as Parameters<typeof gscMagicCredentialTest>[0];
}

function context(request: (options: Record<string, unknown>) => unknown) {
	return { helpers: { request: async (o: Record<string, unknown>) => request(o) } } as unknown as ICredentialTestFunctions;
}

test('a wrong or revoked token (HTTP 401) gets the friendly message', async () => {
	for (const err of [{ statusCode: 401, message: '401 - {"error":"invalid_token"}' }, { httpCode: '401', message: 'Unauthorized' }]) {
		const result = await gscMagicCredentialTest.call(
			context(() => {
				throw Object.assign(new Error(err.message), err);
			}),
			credential({ accessToken: TOKEN, endpoint: 'https://mcp.gscmagic.com/mcp' }),
		);
		assert.deepEqual(result, { status: 'Error', message: AUTH_REJECTED_MESSAGE });
	}
});

test('a good token lists the tools with the expected request and does not follow redirects', async () => {
	let options: Record<string, unknown> | undefined;
	const result = await gscMagicCredentialTest.call(
		context((o) => {
			options = o;
			return { jsonrpc: '2.0', id: 1, result: { tools: [{ name: 'gsc_list_sites' }, { name: 'x' }] } };
		}),
		credential({ accessToken: ` ${TOKEN} `, endpoint: 'https://mcp.gscmagic.com/mcp' }),
	);
	assert.equal(result.status, 'OK');
	assert.match(result.message, /2 tools/);
	assert.equal(options?.uri, 'https://mcp.gscmagic.com/mcp');
	assert.equal(options?.followRedirect, false);
	assert.deepEqual(options?.body, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
	const headers = options?.headers as Record<string, string>;
	assert.equal(headers.Authorization, `Bearer ${TOKEN}`);
	assert.equal(headers.Accept, 'application/json, text/event-stream');
});

test('an empty token, an insecure endpoint and a bad response are rejected without leaking the token', async () => {
	let calls = 0;
	const ctx = context(() => {
		calls++;
		return '<html>not mcp</html>';
	});
	const empty = await gscMagicCredentialTest.call(ctx, credential({ accessToken: '  ', endpoint: 'https://mcp.gscmagic.com/mcp' }));
	assert.equal(empty.status, 'Error');
	const insecure = await gscMagicCredentialTest.call(ctx, credential({ accessToken: TOKEN, endpoint: 'http://example.com/mcp' }));
	assert.match(insecure.message, /HTTPS/);
	assert.equal(calls, 0);
	const html = await gscMagicCredentialTest.call(ctx, credential({ accessToken: TOKEN, endpoint: 'https://mcp.gscmagic.com/mcp' }));
	assert.equal(html.status, 'Error');
	assert.equal(html.message.includes(TOKEN), false);
});

test('other failures redact the token', async () => {
	const result = await gscMagicCredentialTest.call(
		context(() => {
			throw new Error(`connect ECONNREFUSED while sending ${TOKEN}`);
		}),
		credential({ accessToken: TOKEN, endpoint: 'https://mcp.gscmagic.com/mcp' }),
	);
	assert.equal(result.status, 'Error');
	assert.equal(result.message.includes(TOKEN), false);
	assert.match(result.message, /ECONNREFUSED/);
});
