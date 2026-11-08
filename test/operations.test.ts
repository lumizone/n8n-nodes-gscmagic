/* eslint-disable @n8n/community-nodes/no-restricted-imports */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
	OPERATIONS,
	buildRangeArguments,
	buildToolArguments,
	splitRows,
	toIsoDay,
} from '../nodes/GscMagic/shared/operations.ts';

test('every operation maps to the intended MCP tool', () => {
	assert.deepEqual(
		Object.fromEntries(OPERATIONS.map((op) => [op.value, op.tool])),
		{
			listSites: 'gsc_list_sites',
			searchAnalytics: 'gsc_query_analytics',
			trafficDrops: 'report_traffic_drops',
			quickWins: 'report_quick_wins',
			contentDecay: 'report_content_decay',
			indexHealth: 'report_index_health',
			inspectUrl: 'gsc_inspect_url',
			callAnyTool: '',
		},
	);
});

test('toIsoDay accepts dates and date-times and rejects garbage', () => {
	assert.equal(toIsoDay('2026-03-04', 'x'), '2026-03-04');
	assert.equal(toIsoDay('2026-03-04T00:00:00.000+00:00', 'x'), '2026-03-04');
	assert.throws(() => toIsoDay('04/03/2026', 'Start Date'), /Start Date must be a date/);
	assert.throws(() => toIsoDay('2026-02-31', 'x'), /not a real calendar date/);
	assert.throws(() => toIsoDay('', 'x'), /must be a date/);
});

test('buildRangeArguments uses presets or explicit dates', () => {
	assert.deepEqual(buildRangeArguments({ dateRange: 'last_7_days' }), { range: 'last_7_days' });
	assert.deepEqual(buildRangeArguments({}), { range: 'last_28_days' });
	assert.deepEqual(
		buildRangeArguments({ dateRange: 'custom', startDate: '2026-01-01T00:00:00', endDate: '2026-01-31' }),
		{ start_date: '2026-01-01', end_date: '2026-01-31' },
	);
	assert.throws(
		() => buildRangeArguments({ dateRange: 'custom', startDate: '2026-02-01', endDate: '2026-01-01' }),
		/must not be after/,
	);
	assert.throws(() => buildRangeArguments({ dateRange: 'last_1_day' }), /Unknown date range/);
});

test('Search Analytics arguments carry dimensions, filters, options and chart', () => {
	assert.deepEqual(
		buildToolArguments('searchAnalytics', {
			site: 'sc-domain:example.com',
			dateRange: 'last_3_months',
			dimensions: ['date', 'device'],
			limit: 250,
			filters: { filter: [{ dimension: 'query', operator: 'contains', expression: 'seo' }] },
			options: { searchType: 'news', dataState: 'all' },
			includeChart: true,
		}),
		{
			site: 'sc-domain:example.com',
			range: 'last_3_months',
			dimensions: ['date', 'device'],
			limit: 250,
			search_type: 'news',
			data_state: 'all',
			filters: [{ dimension: 'query', operator: 'contains', expression: 'seo' }],
			chart: true,
		},
	);
	const minimal = buildToolArguments('searchAnalytics', { site: 'example.com', dimensions: [] });
	assert.deepEqual(minimal, { site: 'example.com', range: 'last_28_days', dimensions: ['query'], limit: 50 });
	assert.ok(!('chart' in minimal));
});

test('Search Analytics validates site, limit and filters', () => {
	assert.throws(() => buildToolArguments('searchAnalytics', { site: ' ' }), /Site is required/);
	assert.throws(() => buildToolArguments('searchAnalytics', { site: 'a', limit: 0 }), /Limit must be/);
	assert.throws(() => buildToolArguments('searchAnalytics', { site: 'a', limit: 30000 }), /Limit must be/);
	assert.throws(
		() => buildToolArguments('searchAnalytics', { site: 'a', filters: { filter: [{ dimension: 'page', expression: '' }] } }),
		/needs a dimension and an expression/,
	);
});

test('report operations map their fields and only send chart where supported', () => {
	assert.deepEqual(
		buildToolArguments('trafficDrops', { site: 'a', dimension: 'query', limit: 10, includeChart: true }),
		{ site: 'a', range: 'last_28_days', dimension: 'query', limit: 10, chart: true },
	);
	assert.deepEqual(buildToolArguments('quickWins', { site: 'a', minImpressions: 200, limit: 20 }), {
		site: 'a',
		range: 'last_28_days',
		min_impressions: 200,
		limit: 20,
	});
	const decay = buildToolArguments('contentDecay', { site: 'a', includeChart: true, minClicks: 30, minDropPct: 35 });
	assert.deepEqual(decay, { site: 'a', range: 'last_28_days', min_clicks: 30, min_drop_pct: 35, limit: 50 });
	assert.deepEqual(buildToolArguments('indexHealth', { site: 'a', sitemapUrl: '', maxUrls: 20 }), {
		site: 'a',
		max_urls: 20,
	});
	assert.deepEqual(
		buildToolArguments('indexHealth', { site: 'a', sitemapUrl: 'https://a.com/sitemap.xml', maxUrls: 200 }),
		{ site: 'a', sitemap_url: 'https://a.com/sitemap.xml', max_urls: 200 },
	);
	assert.throws(() => buildToolArguments('indexHealth', { site: 'a', maxUrls: 201 }), /Max URLs must be/);
	assert.throws(() => buildToolArguments('contentDecay', { site: 'a', minDropPct: 120 }), /between 0 and 100/);
});

test('Inspect URL and List Sites arguments', () => {
	assert.deepEqual(buildToolArguments('inspectUrl', { site: 'a', url: 'https://a.com/x' }), {
		site: 'a',
		url: 'https://a.com/x',
		language_code: 'en-US',
	});
	assert.throws(() => buildToolArguments('inspectUrl', { site: 'a', url: 'a.com/x' }), /must start with http/);
	assert.deepEqual(buildToolArguments('listSites', {}), {});
});

test('Call Any Tool parses JSON text, accepts objects and rejects non objects', () => {
	assert.deepEqual(buildToolArguments('callAnyTool', { argumentsJson: '{"site":"a","chart":true}' }), {
		site: 'a',
		chart: true,
	});
	assert.deepEqual(buildToolArguments('callAnyTool', { argumentsJson: { x: 1 } }), { x: 1 });
	assert.deepEqual(buildToolArguments('callAnyTool', { argumentsJson: '' }), {});
	assert.throws(() => buildToolArguments('callAnyTool', { argumentsJson: '{oops' }), /valid JSON/);
	assert.throws(() => buildToolArguments('callAnyTool', { argumentsJson: '[1]' }), /JSON object/);
});

test('splitRows finds the primary array of each result shape', () => {
	assert.deepEqual(splitRows('listSites', [{ siteUrl: 'a' }, { siteUrl: 'b' }]), [{ siteUrl: 'a' }, { siteUrl: 'b' }]);
	assert.deepEqual(splitRows('searchAnalytics', { summary: {}, rows: [{ query: 'x' }] }), [{ query: 'x' }]);
	assert.deepEqual(splitRows('quickWins', { rows: [] }), []);
	assert.deepEqual(
		splitRows('trafficDrops', { losers: [{ key: 'a' }], gainers: [{ key: 'b' }] }),
		[
			{ direction: 'loser', key: 'a' },
			{ direction: 'gainer', key: 'b' },
		],
	);
	assert.deepEqual(splitRows('indexHealth', { coverage: {}, not_indexed: [{ url: 'u' }] }), [{ url: 'u' }]);
	assert.equal(splitRows('callAnyTool', { ok: true }), undefined);
	assert.equal(splitRows('callAnyTool', null), undefined);
});
