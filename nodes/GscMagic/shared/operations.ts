import type { IDataObject } from 'n8n-workflow';

export const RANGE_PRESETS = [
	'last_7_days',
	'last_28_days',
	'last_3_months',
	'last_6_months',
	'last_12_months',
	'last_16_months',
] as const;

export interface OperationSpec {
	value: string;
	name: string;
	action: string;
	description: string;
	/** MCP tool this operation calls. Empty for Call Any Tool. */
	tool: string;
	/** True when the tool accepts `chart: true`. */
	chart: boolean;
}

export const OPERATIONS: OperationSpec[] = [
	{
		value: 'listSites',
		name: 'List Sites',
		action: 'List Search Console properties',
		description: 'List the Search Console properties this account can access',
		tool: 'gsc_list_sites',
		chart: false,
	},
	{
		value: 'searchAnalytics',
		name: 'Search Analytics',
		action: 'Query search performance',
		description: 'Clicks, impressions, CTR and position by query, page, country, device or date',
		tool: 'gsc_query_analytics',
		chart: true,
	},
	{
		value: 'trafficDrops',
		name: 'Traffic Drops',
		action: 'Find traffic drops and gains',
		description: 'Biggest click losers and gainers versus the previous period',
		tool: 'report_traffic_drops',
		chart: true,
	},
	{
		value: 'quickWins',
		name: 'Quick Wins',
		action: 'Find quick win opportunities',
		description: 'Queries ranking at positions 4-20 with many impressions',
		tool: 'report_quick_wins',
		chart: true,
	},
	{
		value: 'contentDecay',
		name: 'Content Decay',
		action: 'Find pages losing clicks',
		description: 'Pages whose clicks fell in each of the last three windows',
		tool: 'report_content_decay',
		chart: false,
	},
	{
		value: 'indexHealth',
		name: 'Index Health',
		action: 'Check index health from the sitemap',
		description: 'Inspect sitemap URLs with the URL Inspection API and group by coverage state',
		tool: 'report_index_health',
		chart: false,
	},
	{
		value: 'inspectUrl',
		name: 'Inspect URL',
		action: 'Inspect a URL in Google',
		description: 'Index status, canonicals, last crawl and robots state of one URL',
		tool: 'gsc_inspect_url',
		chart: false,
	},
	{
		value: 'callAnyTool',
		name: 'Call Any Tool',
		action: 'Call any GSC Magic tool',
		description: 'Call any tool available to your token, with JSON arguments',
		tool: '',
		chart: false,
	},
];

export function getOperation(value: string): OperationSpec {
	const op = OPERATIONS.find((o) => o.value === value);
	if (!op) throw new Error(`Unknown operation: ${value}`);
	return op;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts `YYYY-MM-DD` or an ISO date-time (as produced by the n8n date picker) and returns `YYYY-MM-DD`. */
export function toIsoDay(value: unknown, label: string): string {
	const text = String(value ?? '').trim();
	const day = text.length >= 10 ? text.slice(0, 10) : text;
	if (!ISO_DAY.test(day)) {
		throw new Error(`${label} must be a date in YYYY-MM-DD format`);
	}
	const parsed = new Date(`${day}T00:00:00Z`);
	if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
		throw new Error(`${label} is not a real calendar date`);
	}
	return day;
}

export function buildRangeArguments(params: IDataObject): Record<string, unknown> {
	const range = String(params.dateRange ?? 'last_28_days');
	if (range === 'custom') {
		const start = toIsoDay(params.startDate, 'Start Date');
		const end = toIsoDay(params.endDate, 'End Date');
		if (start > end) throw new Error('Start Date must not be after End Date');
		return { start_date: start, end_date: end };
	}
	if (!(RANGE_PRESETS as readonly string[]).includes(range)) {
		throw new Error(`Unknown date range: ${range}`);
	}
	return { range };
}

function site(params: IDataObject): string {
	const value = String(params.site ?? '').trim();
	if (!value) throw new Error('Site is required');
	return value;
}

const INVALID_JSON = Symbol('invalid-json');

function tryParseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return INVALID_JSON;
	}
}

function parseJsonObject(value: unknown, label: string): Record<string, unknown> {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	const text = String(value ?? '').trim();
	if (!text) return {};
	const parsed = tryParseJson(text);
	if (parsed === INVALID_JSON) throw new Error(`${label} must be valid JSON`);
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`${label} must be a JSON object`);
	}
	return parsed as Record<string, unknown>;
}

interface FilterInput {
	dimension?: string;
	operator?: string;
	expression?: string;
}

function buildFilters(params: IDataObject): Array<Record<string, string>> | undefined {
	const group = params.filters as { filter?: FilterInput[] } | undefined;
	const list = group?.filter ?? [];
	if (list.length === 0) return undefined;
	return list.map((f) => {
		if (!f.dimension || f.expression === undefined || f.expression === '') {
			throw new Error('Every filter needs a dimension and an expression');
		}
		return {
			dimension: f.dimension,
			operator: f.operator || 'equals',
			expression: f.expression,
		};
	});
}

function int(value: unknown, label: string, min: number, max: number, fallback: number): number {
	if (value === undefined || value === null || value === '') return fallback;
	const n = Number(value);
	if (!Number.isInteger(n) || n < min || n > max) {
		throw new Error(`${label} must be a whole number between ${min} and ${max}`);
	}
	return n;
}

/** Maps n8n node parameters to the argument object of the MCP tool behind the operation. */
export function buildToolArguments(operation: string, params: IDataObject): Record<string, unknown> {
	const op = getOperation(operation);
	const chart = op.chart && params.includeChart === true ? { chart: true } : {};
	switch (operation) {
		case 'listSites':
			return {};
		case 'searchAnalytics': {
			const options = (params.options as IDataObject | undefined) ?? {};
			const dimensions = (params.dimensions as string[] | undefined) ?? [];
			const filters = buildFilters(params);
			return {
				site: site(params),
				...buildRangeArguments(params),
				dimensions: dimensions.length > 0 ? dimensions : ['query'],
				limit: int(params.limit, 'Limit', 1, 25000, 50),
				...(options.searchType ? { search_type: options.searchType } : {}),
				...(options.dataState ? { data_state: options.dataState } : {}),
				...(filters ? { filters } : {}),
				...chart,
			};
		}
		case 'trafficDrops':
			return {
				site: site(params),
				...buildRangeArguments(params),
				dimension: String(params.dimension || 'page'),
				limit: int(params.limit, 'Limit', 1, 500, 50),
				...chart,
			};
		case 'quickWins':
			return {
				site: site(params),
				...buildRangeArguments(params),
				min_impressions: int(params.minImpressions, 'Minimum Impressions', 0, 100000000, 100),
				limit: int(params.limit, 'Limit', 1, 500, 50),
				...chart,
			};
		case 'contentDecay': {
			const minDrop = Number(params.minDropPct ?? 20);
			if (!Number.isFinite(minDrop) || minDrop < 0 || minDrop > 100) {
				throw new Error('Minimum Drop (%) must be between 0 and 100');
			}
			return {
				site: site(params),
				...buildRangeArguments(params),
				min_clicks: int(params.minClicks, 'Minimum Clicks', 1, 100000000, 20),
				min_drop_pct: minDrop,
				limit: int(params.limit, 'Limit', 1, 500, 50),
			};
		}
		case 'indexHealth': {
			const sitemap = String(params.sitemapUrl ?? '').trim();
			return {
				site: site(params),
				...(sitemap ? { sitemap_url: sitemap } : {}),
				max_urls: int(params.maxUrls, 'Max URLs', 1, 200, 50),
			};
		}
		case 'inspectUrl': {
			const url = String(params.url ?? '').trim();
			if (!/^https?:\/\//i.test(url)) throw new Error('URL must start with http:// or https://');
			return {
				site: site(params),
				url,
				language_code: String(params.languageCode || 'en-US'),
			};
		}
		case 'callAnyTool':
			return parseJsonObject(params.argumentsJson, 'Arguments');
		default:
			throw new Error(`Unknown operation: ${operation}`);
	}
}

function asRows(value: unknown): IDataObject[] | undefined {
	if (!Array.isArray(value)) return undefined;
	return value.map((row) =>
		row && typeof row === 'object' && !Array.isArray(row)
			? (row as IDataObject)
			: ({ value: row as string } as IDataObject),
	);
}

/**
 * Rows for "Split Into Items", or undefined when the result has no primary array.
 * The array root of List Sites, `rows` of Search Analytics / Quick Wins / Content Decay,
 * `losers` + `gainers` (tagged with `direction`) of Traffic Drops, `not_indexed` of Index Health.
 */
export function splitRows(operation: string, data: unknown): IDataObject[] | undefined {
	const root = asRows(data);
	if (root) return root;
	if (!data || typeof data !== 'object') return undefined;
	const obj = data as IDataObject;
	if (operation === 'trafficDrops') {
		const losers = asRows(obj.losers);
		const gainers = asRows(obj.gainers);
		if (!losers && !gainers) return undefined;
		return [
			...(losers ?? []).map((row) => ({ direction: 'loser', ...row })),
			...(gainers ?? []).map((row) => ({ direction: 'gainer', ...row })),
		];
	}
	if (operation === 'indexHealth') return asRows(obj.not_indexed);
	return asRows(obj.rows);
}
