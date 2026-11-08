/* eslint-disable @n8n/community-nodes/no-restricted-imports */
import assert from 'node:assert/strict';
import test from 'node:test';

import agentWorkflow from '../examples/seo-assistant-agent.json';
import dropsWorkflow from '../examples/weekly-traffic-drops-email.json';
import { OPERATIONS } from '../nodes/GscMagic/shared/operations.ts';

const operations = new Set(OPERATIONS.map((op) => op.value));

test('example workflows are inactive and only use read operations of this node', () => {
	for (const workflow of [dropsWorkflow, agentWorkflow]) {
		assert.equal(workflow.active, false);
		for (const node of workflow.nodes) {
			if (!node.type.startsWith('n8n-nodes-gscmagic.')) continue;
			assert.ok(operations.has(String(node.parameters.operation)), String(node.parameters.operation));
			assert.equal(node.typeVersion, 1);
		}
	}
});

test('example workflows hold no secrets', () => {
	for (const workflow of [dropsWorkflow, agentWorkflow]) {
		const text = JSON.stringify(workflow);
		assert.doesNotMatch(text, /gsm_[A-Za-z0-9_-]{8,}/);
		assert.doesNotMatch(text, /Bearer\s+[A-Za-z0-9]/);
		assert.doesNotMatch(text, /"(apiKey|secret|token|password|accessToken)"\s*:\s*"[^"]/i);
	}
});

test('every connection in the examples points at an existing node', () => {
	for (const workflow of [dropsWorkflow, agentWorkflow]) {
		const names = new Set(workflow.nodes.map((n) => n.name));
		for (const [from, outputs] of Object.entries(workflow.connections)) {
			assert.ok(names.has(from), from);
			for (const lanes of Object.values(outputs as Record<string, Array<Array<{ node: string }>>>)) {
				for (const lane of lanes) for (const target of lane) assert.ok(names.has(target.node), target.node);
			}
		}
	}
});
