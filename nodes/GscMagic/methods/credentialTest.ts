import type {
	ICredentialTestFunction,
	ICredentialTestFunctions,
	IHttpRequestOptions,
	INodeCredentialTestResult,
} from 'n8n-workflow';

import {
	AUTH_REJECTED_MESSAGE,
	buildRpcRequest,
	extractTools,
	isUnauthorized,
	normalizeEndpoint,
	parseRpcResponse,
	redactSecret,
	unwrapRpc,
	type RpcRequest,
} from '../shared/mcp';
import { buildRequestOptions } from '../shared/transport';

const TEST_TIMEOUT_MS = 30000;

type HttpRequestHelper = (options: IHttpRequestOptions) => Promise<unknown>;

/**
 * POSTs the JSON-RPC request without following redirects. Uses `helpers.httpRequest` when the n8n
 * runtime exposes it. Today n8n's credential-test context only offers the deprecated `request`
 * helper (not `httpRequest`), so the fallback is the built-in `fetch`, which works on Node 20+.
 */
async function postJson(
	context: ICredentialTestFunctions,
	url: string,
	body: RpcRequest,
	token: string,
): Promise<unknown> {
	const headers = { ...buildRequestOptions(url, body, TEST_TIMEOUT_MS).headers, Authorization: `Bearer ${token}` };
	const httpRequest = (context.helpers as unknown as { httpRequest?: HttpRequestHelper }).httpRequest;
	if (typeof httpRequest === 'function') {
		return await httpRequest.call(context.helpers, {
			...buildRequestOptions(url, body, TEST_TIMEOUT_MS),
			headers,
		});
	}
	const response = await fetch(url, {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
		redirect: 'manual',
		signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
	});
	if (response.status === 401) throw Object.assign(new Error('Unauthorized'), { httpCode: '401' });
	if (!response.ok) {
		throw Object.assign(new Error(`GSC Magic responded with HTTP ${response.status}`), {
			httpCode: String(response.status),
		});
	}
	const text = await response.text();
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

/**
 * Credential test: lists the tools (does not count against the plan). A wrong, expired or revoked
 * token gets a plain-language message instead of n8n's generic "Unauthorized".
 */
export const gscMagicCredentialTest: ICredentialTestFunction = async function (
	this: ICredentialTestFunctions,
	credential,
): Promise<INodeCredentialTestResult> {
	const data = credential.data ?? {};
	const token = String(data.accessToken ?? '').trim();
	if (!token) {
		return { status: 'Error', message: 'Enter the access token (it starts with gsm_).' };
	}
	try {
		const endpoint = normalizeEndpoint(String(data.endpoint ?? ''));
		const request = buildRpcRequest('tools/list');
		const response = await postJson(this, endpoint, request, token);
		const tools = extractTools(unwrapRpc(parseRpcResponse(response, request.id)));
		return {
			status: 'OK',
			message: `Connection successful (${tools.length} tools available)`,
		};
	} catch (error) {
		if (isUnauthorized(error)) {
			return { status: 'Error', message: AUTH_REJECTED_MESSAGE };
		}
		const message = error instanceof Error ? error.message : 'Connection failed';
		return { status: 'Error', message: redactSecret(message, token) };
	}
};
