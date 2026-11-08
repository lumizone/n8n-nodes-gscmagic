import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { fieldProperties, operationProperty } from './descriptions';
import { gscMagicCredentialTest } from './methods/credentialTest';
import { getTools, siteSearch } from './methods/loadOptions';
import { McpError } from './shared/mcp';
import { buildToolArguments, getOperation, splitRows } from './shared/operations';
import { callTool } from './shared/transport';

const RANGE = ['dateRange', 'startDate', 'endDate'];
const PARAMETERS: Record<string, string[]> = {
	listSites: [],
	searchAnalytics: [...RANGE, 'dimensions', 'filters', 'limit', 'includeChart', 'options'],
	trafficDrops: [...RANGE, 'dimension', 'limit', 'includeChart'],
	quickWins: [...RANGE, 'minImpressions', 'limit', 'includeChart'],
	contentDecay: [...RANGE, 'minClicks', 'minDropPct', 'limit'],
	indexHealth: ['sitemapUrl', 'maxUrls'],
	inspectUrl: ['url', 'languageCode'],
	callAnyTool: ['argumentsJson'],
};

function readParameters(context: IExecuteFunctions, operation: string, index: number): IDataObject {
	const get = (name: string, fallback?: unknown, options?: { extractValue?: boolean }) =>
		context.getNodeParameter(name, index, fallback, options);
	const params: IDataObject = {};
	if (operation !== 'listSites' && operation !== 'callAnyTool') {
		params.site = get('site', '', { extractValue: true }) as string;
	}
	for (const name of PARAMETERS[operation] ?? []) {
		params[name] = get(name, name === 'startDate' || name === 'endDate' ? '' : undefined) as IDataObject;
	}
	return params;
}

function toNodeError(
	context: IExecuteFunctions,
	error: unknown,
	index: number,
): NodeApiError | NodeOperationError {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) return error;
	const node = context.getNode();
	if (error instanceof McpError) {
		return new NodeOperationError(node, error.message, { itemIndex: index });
	}
	return new NodeOperationError(node, error as Error, { itemIndex: index });
}

export class GscMagic implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'GSC Magic',
		name: 'gscMagic',
		icon: { light: 'file:gscmagic.svg', dark: 'file:gscmagic.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Google Search Console reports and analytics with GSC Magic',
		defaults: { name: 'GSC Magic' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'gscMagicApi', required: true, testedBy: 'gscMagicCredentialTest' }],
		properties: [operationProperty, ...fieldProperties],
	};

	methods = {
		credentialTest: { gscMagicCredentialTest },
		loadOptions: { getTools },
		listSearch: { siteSearch },
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let index = 0; index < items.length; index++) {
			try {
				const operation = this.getNodeParameter('operation', index) as string;
				const spec = getOperation(operation);
				const params = readParameters(this, operation, index);
				const toolName =
					operation === 'callAnyTool'
						? (this.getNodeParameter('tool', index) as string)
						: spec.tool;
				if (!toolName) throw new NodeOperationError(this.getNode(), 'Choose a tool to call', { itemIndex: index });
				const args = buildToolArguments(operation, params);

				const result = await callTool.call(this, toolName, args, index);

				const split =
					operation !== 'inspectUrl' && this.getNodeParameter('splitIntoItems', index, false) === true;
				const rows = split ? splitRows(operation, result.data) : undefined;
				const outputs: IDataObject[] = rows ?? [
					result.data && typeof result.data === 'object' && !Array.isArray(result.data)
						? (result.data as IDataObject)
						: { result: result.data as IDataObject },
				];

				for (let i = 0; i < outputs.length; i++) {
					const entry: INodeExecutionData = {
						json: outputs[i],
						pairedItem: { item: index },
					};
					if (i === 0 && result.images.length > 0) {
						const image = result.images[0];
						entry.binary = {
							chart: await this.helpers.prepareBinaryData(
								Buffer.from(image.data, 'base64'),
								'chart.png',
								image.mimeType,
							),
						};
					}
					returnData.push(entry);
				}
			} catch (error) {
				const nodeError = toNodeError(this, error, index);
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: nodeError.message },
						pairedItem: { item: index },
					});
					continue;
				}
				throw nodeError;
			}
		}
		return [returnData];
	}
}
