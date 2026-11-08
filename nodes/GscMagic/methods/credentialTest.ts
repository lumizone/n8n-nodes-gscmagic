import type {
	ICredentialTestFunction,
	ICredentialTestFunctions,
	INodeCredentialTestResult,
} from 'n8n-workflow';

import {
	AUTH_REJECTED_MESSAGE,
	REQUEST_HEADERS,
	buildRpcRequest,
	extractTools,
	isUnauthorized,
	normalizeEndpoint,
	parseRpcResponse,
	redactSecret,
	unwrapRpc,
} from '../shared/mcp';

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
		// ICredentialTestFunctions currently exposes only the legacy request helper.
		// eslint-disable-next-line @n8n/community-nodes/no-deprecated-workflow-functions
		const response: unknown = await this.helpers.request({
			method: 'POST',
			uri: endpoint,
			headers: { ...REQUEST_HEADERS, Authorization: `Bearer ${token}` },
			body: request,
			json: true,
			timeout: 30000,
			followRedirect: false,
			followAllRedirects: false,
		});
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
