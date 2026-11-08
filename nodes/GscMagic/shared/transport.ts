import type {
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import {
	AUTH_REJECTED_MESSAGE,
	REQUEST_HEADERS,
	buildRpcRequest,
	buildToolCall,
	extractToolResult,
	extractTools,
	isUnauthorized,
	normalizeEndpoint,
	parseRpcResponse,
	redactSecret,
	unwrapRpc,
	type RpcRequest,
	type ToolInfo,
	type ToolResult,
} from './mcp';

type GscMagicFunctions = IExecuteFunctions | ILoadOptionsFunctions;

export const CREDENTIAL_NAME = 'gscMagicApi';

export function buildRequestOptions(
	url: string,
	body: RpcRequest,
	timeout: number,
): IHttpRequestOptions {
	return {
		method: 'POST',
		url,
		headers: { ...REQUEST_HEADERS },
		body: body as unknown as IHttpRequestOptions['body'],
		json: true,
		timeout,
		disableFollowRedirect: true,
		sendCredentialsOnCrossOriginRedirect: false,
	};
}

async function send(
	this: GscMagicFunctions,
	body: RpcRequest,
	timeout: number,
	itemIndex?: number,
): Promise<unknown> {
	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const endpoint = normalizeEndpoint(String(credentials.endpoint ?? ''));
	const token = String(credentials.accessToken ?? '');
	let response: unknown;
	try {
		response = await this.helpers.httpRequestWithAuthentication.call(
			this,
			CREDENTIAL_NAME,
			buildRequestOptions(endpoint, body, timeout),
		);
	} catch (error) {
		if (isUnauthorized(error)) {
			// The message is safe to show to the user.
			throw new NodeApiError(this.getNode(), { message: AUTH_REJECTED_MESSAGE } as JsonObject, {
				message: AUTH_REJECTED_MESSAGE,
				httpCode: '401',
				itemIndex,
			});
		}
		const e = error as { message?: unknown; httpCode?: unknown };
		// Redacted and carries no request headers.
		const message = redactSecret(String(e?.message ?? 'Request to GSC Magic failed'), token);
		throw new NodeApiError(this.getNode(), { message } as JsonObject, {
			message,
			httpCode: e?.httpCode === undefined ? undefined : String(e.httpCode),
			itemIndex,
		});
	}
	return unwrapRpc(parseRpcResponse(response, body.id));
}

export async function callTool(
	this: GscMagicFunctions,
	name: string,
	args: Record<string, unknown>,
	itemIndex?: number,
): Promise<ToolResult> {
	const result = await send.call(this, buildToolCall(name, args), 120000, itemIndex);
	return extractToolResult(result);
}

export async function listTools(this: GscMagicFunctions): Promise<ToolInfo[]> {
	const result = await send.call(this, buildRpcRequest('tools/list'), 30000);
	return extractTools(result);
}
