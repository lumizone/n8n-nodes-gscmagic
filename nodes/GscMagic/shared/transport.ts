import type {
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
} from 'n8n-workflow';

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

/** HTTP 401 from GSC Magic. The message is safe to show to the user. */
export class AuthRejectedError extends Error {
	constructor() {
		super(AUTH_REJECTED_MESSAGE);
		this.name = 'AuthRejectedError';
	}
}

/** Any other HTTP failure. The message is redacted and carries no request headers. */
export class HttpFailure extends Error {
	readonly httpCode?: string;

	constructor(message: string, httpCode?: string) {
		super(message);
		this.name = 'HttpFailure';
		this.httpCode = httpCode;
	}
}

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
		if (isUnauthorized(error)) throw new AuthRejectedError();
		const e = error as { message?: unknown; httpCode?: unknown };
		throw new HttpFailure(
			redactSecret(String(e?.message ?? 'Request to GSC Magic failed'), token),
			e?.httpCode === undefined ? undefined : String(e.httpCode),
		);
	}
	return unwrapRpc(parseRpcResponse(response, body.id));
}

export async function callTool(
	this: GscMagicFunctions,
	name: string,
	args: Record<string, unknown>,
): Promise<ToolResult> {
	const result = await send.call(this, buildToolCall(name, args), 120000);
	return extractToolResult(result);
}

export async function listTools(this: GscMagicFunctions): Promise<ToolInfo[]> {
	const result = await send.call(this, buildRpcRequest('tools/list'), 30000);
	return extractTools(result);
}
