/* eslint-disable @n8n/community-nodes/no-restricted-imports */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { GscMagicApi } from '../credentials/GscMagicApi.credentials.ts';
import { GscMagic } from '../nodes/GscMagic/GscMagic.node.ts';

const node = new GscMagic();
const credential = new GscMagicApi();
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('credential stores the token as a secret and sends it as a Bearer header', () => {
	const token = credential.properties.find((p) => p.name === 'accessToken');
	assert.equal(token?.typeOptions?.password, true);
	assert.deepEqual(credential.authenticate.properties.headers, {
		Authorization: '=Bearer {{$credentials.accessToken}}',
	});
	const endpoint = credential.properties.find((p) => p.name === 'endpoint');
	assert.equal(endpoint?.default, 'https://mcp.gscmagic.com/mcp');
});

test('credential has a declarative test that lists the tools from the configured endpoint', () => {
	const request = credential.test.request;
	assert.equal(request.baseURL, '={{$credentials.endpoint}}');
	assert.equal(request.method, 'POST');
	assert.deepEqual(request.body, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
	assert.equal(request.headers?.Accept, 'application/json, text/event-stream');
	assert.equal(request.disableFollowRedirect, true);
	const entry = node.description.credentials?.find((c) => c.name === 'gscMagicApi');
	assert.equal(entry?.testedBy, undefined);
});

test('node is a usable AI tool and exposes exactly the reviewed operations', () => {
	assert.equal(node.description.usableAsTool, true);
	const operation = node.description.properties.find((p) => p.name === 'operation');
	assert.deepEqual(
		(operation?.options ?? []).map((o) => ('value' in o ? o.value : null)),
		['listSites', 'searchAnalytics', 'trafficDrops', 'quickWins', 'contentDecay', 'indexHealth', 'inspectUrl', 'callAnyTool'],
	);
});

test('node offers site search, tool list and Include Chart only where the tools support it', () => {
	assert.ok(node.methods.listSearch.siteSearch);
	assert.ok(node.methods.loadOptions.getTools);
	const chart = node.description.properties.find((p) => p.name === 'includeChart');
	assert.deepEqual(chart?.displayOptions?.show?.operation, ['searchAnalytics', 'trafficDrops', 'quickWins']);
	assert.equal(chart?.default, false);
	const split = node.description.properties.find((p) => p.name === 'splitIntoItems');
	assert.equal(split?.default, false);
});

test('package meets the community node verification basics', () => {
	assert.equal(pkg.license, 'MIT');
	assert.ok(pkg.keywords.includes('n8n-community-node-package'));
	assert.equal(pkg.dependencies, undefined);
	assert.ok(pkg.name.startsWith('n8n-nodes-'));
	assert.equal(pkg.n8n.strict, true);
	assert.deepEqual(pkg.n8n.nodes, ['dist/nodes/GscMagic/GscMagic.node.js']);
	assert.ok(existsSync(new URL('../nodes/GscMagic/gscmagic.svg', import.meta.url)));
});
