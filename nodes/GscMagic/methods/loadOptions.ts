import type {
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
} from 'n8n-workflow';

import { callTool, listTools } from '../shared/transport';

interface SiteEntry {
	siteUrl?: string;
	permissionLevel?: string;
}

export async function getTools(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const tools = await listTools.call(this);
	return tools
		.map((tool) => {
			const args = Object.keys(tool.inputSchema?.properties ?? {});
			const description = [tool.description, args.length ? `Arguments: ${args.join(', ')}` : '']
				.filter(Boolean)
				.join(' ');
			return {
				name: tool.title ? `${tool.title} (${tool.name})` : tool.name,
				value: tool.name,
				description,
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function siteSearch(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const { data } = await callTool.call(this, 'gsc_list_sites', {});
	const entries = Array.isArray(data) ? (data as SiteEntry[]) : [];
	const needle = (filter ?? '').trim().toLowerCase();
	const results = entries
		.filter((entry) => typeof entry.siteUrl === 'string')
		.map((entry) => ({
			name: entry.siteUrl as string,
			value: entry.siteUrl as string,
		}))
		.filter((entry) => !needle || entry.name.toLowerCase().includes(needle))
		.sort((a, b) => a.name.localeCompare(b.name));
	return { results };
}
