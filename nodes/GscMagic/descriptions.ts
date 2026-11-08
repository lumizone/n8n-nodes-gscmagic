import type { INodeProperties } from 'n8n-workflow';

import { OPERATIONS } from './shared/operations';

const SITE_OPERATIONS = [
	'searchAnalytics',
	'trafficDrops',
	'quickWins',
	'contentDecay',
	'indexHealth',
	'inspectUrl',
];
const RANGE_OPERATIONS = ['searchAnalytics', 'trafficDrops', 'quickWins', 'contentDecay'];
const CHART_OPERATIONS = OPERATIONS.filter((op) => op.chart).map((op) => op.value);

const show = (...operations: string[]) => ({ show: { operation: operations } });

export const operationProperty: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	options: OPERATIONS.map((op) => ({
		name: op.name,
		value: op.value,
		action: op.action,
		description: op.description,
	})),
	default: 'listSites',
};

export const fieldProperties: INodeProperties[] = [
	{
		displayName: 'Site',
		name: 'site',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'Search Console property to use',
		displayOptions: show(...SITE_OPERATIONS),
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'siteSearch',
					searchable: true,
				},
			},
			{
				displayName: 'By Name',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. sc-domain:example.com or example.com',
			},
		],
	},

	// Date range
	{
		displayName: 'Date Range',
		name: 'dateRange',
		type: 'options',
		default: 'last_28_days',
		description: 'Period ending yesterday. Pick Custom to set exact dates.',
		displayOptions: show(...RANGE_OPERATIONS),
		options: [
			{ name: 'Custom', value: 'custom' },
			{ name: 'Last 12 Months', value: 'last_12_months' },
			{ name: 'Last 16 Months', value: 'last_16_months' },
			{ name: 'Last 28 Days', value: 'last_28_days' },
			{ name: 'Last 3 Months', value: 'last_3_months' },
			{ name: 'Last 6 Months', value: 'last_6_months' },
			{ name: 'Last 7 Days', value: 'last_7_days' },
		],
	},
	{
		displayName: 'Start Date',
		name: 'startDate',
		type: 'dateTime',
		default: '',
		required: true,
		displayOptions: { show: { operation: RANGE_OPERATIONS, dateRange: ['custom'] } },
	},
	{
		displayName: 'End Date',
		name: 'endDate',
		type: 'dateTime',
		default: '',
		required: true,
		displayOptions: { show: { operation: RANGE_OPERATIONS, dateRange: ['custom'] } },
	},

	// Search Analytics
	{
		displayName: 'Dimensions',
		name: 'dimensions',
		type: 'multiOptions',
		default: ['query'],
		description: 'How to group the rows',
		displayOptions: show('searchAnalytics'),
		options: [
			{ name: 'Country', value: 'country' },
			{ name: 'Date', value: 'date' },
			{ name: 'Device', value: 'device' },
			{ name: 'Hour', value: 'hour' },
			{ name: 'Page', value: 'page' },
			{ name: 'Query', value: 'query' },
			{ name: 'Search Appearance', value: 'searchAppearance' },
		],
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		default: {},
		placeholder: 'Add Filter',
		description: 'All filters must match. Country uses ISO 3166-1 alpha-3 codes (POL), device is DESKTOP, MOBILE or TABLET.',
		displayOptions: show('searchAnalytics'),
		options: [
			{
				displayName: 'Filter',
				name: 'filter',
				values: [
					{
						displayName: 'Dimension',
						name: 'dimension',
						type: 'options',
						default: 'query',
						options: [
							{ name: 'Country', value: 'country' },
							{ name: 'Device', value: 'device' },
							{ name: 'Page', value: 'page' },
							{ name: 'Query', value: 'query' },
							{ name: 'Search Appearance', value: 'searchAppearance' },
						],
					},
					{
						displayName: 'Operator',
						name: 'operator',
						type: 'options',
						default: 'equals',
						options: [
							{ name: 'Contains', value: 'contains' },
							{ name: 'Equals', value: 'equals' },
							{ name: 'Excluding Regex', value: 'excludingRegex' },
							{ name: 'Including Regex', value: 'includingRegex' },
							{ name: 'Not Contains', value: 'notContains' },
							{ name: 'Not Equals', value: 'notEquals' },
						],
					},
					{
						displayName: 'Expression',
						name: 'expression',
						type: 'string',
						default: '',
					},
				],
			},
		],
	},

	// Traffic drops
	{
		displayName: 'Group By',
		name: 'dimension',
		type: 'options',
		default: 'page',
		displayOptions: show('trafficDrops'),
		options: [
			{ name: 'Page', value: 'page' },
			{ name: 'Query', value: 'query' },
		],
	},

	// Quick wins
	{
		displayName: 'Minimum Impressions',
		name: 'minImpressions',
		type: 'number',
		typeOptions: { minValue: 0 },
		default: 100,
		description: 'Ignore query and page pairs with fewer impressions',
		displayOptions: show('quickWins'),
	},

	// Content decay
	{
		displayName: 'Minimum Clicks',
		name: 'minClicks',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 20,
		description: 'Minimum clicks in the oldest window',
		displayOptions: show('contentDecay'),
	},
	{
		displayName: 'Minimum Drop (%)',
		name: 'minDropPct',
		type: 'number',
		typeOptions: { minValue: 0, maxValue: 100 },
		default: 20,
		description: 'Minimum total drop from the oldest to the newest window, in percent',
		displayOptions: show('contentDecay'),
	},

	// Index health
	{
		displayName: 'Sitemap URL',
		name: 'sitemapUrl',
		type: 'string',
		default: '',
		placeholder: 'https://example.com/sitemap.xml',
		description: 'Leave empty to use the sitemaps submitted in Search Console',
		displayOptions: show('indexHealth'),
	},
	{
		displayName: 'Max URLs',
		name: 'maxUrls',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 200 },
		default: 50,
		description: 'How many URLs to inspect. Uses URL Inspection quota (2000 per day).',
		displayOptions: show('indexHealth'),
	},

	// Inspect URL
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'https://example.com/page',
		description: 'Full URL of the page to inspect. It must belong to the selected site.',
		displayOptions: show('inspectUrl'),
	},
	{
		displayName: 'Language Code',
		name: 'languageCode',
		type: 'string',
		default: 'en-US',
		description: 'Language of the inspection messages',
		displayOptions: show('inspectUrl'),
	},

	// Row limit
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 25000 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: show('searchAnalytics'),
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 500 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: show('trafficDrops'),
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 500 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: show('quickWins', 'contentDecay'),
	},

	// Call any tool
	{
		displayName: 'Tool Name or ID',
		name: 'tool',
		type: 'options',
		default: '',
		required: true,
		description:
			'Tool to call. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		typeOptions: { loadOptionsMethod: 'getTools' },
		displayOptions: show('callAnyTool'),
	},
	{
		displayName: 'Arguments (JSON)',
		name: 'argumentsJson',
		type: 'json',
		default: '{}',
		description: 'Arguments of the tool as a JSON object. The tool list shows the argument names.',
		displayOptions: show('callAnyTool'),
	},

	// Chart
	{
		displayName: 'Include Chart',
		name: 'includeChart',
		type: 'boolean',
		default: false,
		description:
			'Whether to also return a PNG chart of the result as binary data (property chart)',
		displayOptions: show(...CHART_OPERATIONS),
	},

	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show('searchAnalytics'),
		options: [
			{
				displayName: 'Data State',
				name: 'dataState',
				type: 'options',
				default: 'final',
				description: 'Whether to include fresh data that Google has not finalized yet',
				options: [
					{ name: 'All (Include Fresh Data)', value: 'all' },
					{ name: 'Final', value: 'final' },
					{ name: 'Hourly All', value: 'hourly_all' },
				],
			},
			{
				displayName: 'Search Type',
				name: 'searchType',
				type: 'options',
				default: 'web',
				options: [
					{ name: 'Discover', value: 'discover' },
					{ name: 'Google News', value: 'googleNews' },
					{ name: 'Image', value: 'image' },
					{ name: 'News', value: 'news' },
					{ name: 'Video', value: 'video' },
					{ name: 'Web', value: 'web' },
				],
			},
		],
	},
	{
		displayName: 'Split Into Items',
		name: 'splitIntoItems',
		type: 'boolean',
		default: false,
		description:
			'Whether to output one item per row instead of one item with the whole result. Traffic Drops rows get a direction field (loser or gainer).',
		displayOptions: { hide: { operation: ['inspectUrl'] } },
	},
];
