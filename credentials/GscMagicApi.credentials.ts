import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class GscMagicApi implements ICredentialType {
	name = 'gscMagicApi';
	displayName = 'GSC Magic API';
	icon = 'file:../nodes/GscMagic/gscmagic.svg' as const;
	documentationUrl = 'https://gscmagic.com/integrations';

	properties: INodeProperties[] = [
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Token starting with gsm_. Create it in app.gscmagic.com under Connect, then Access tokens. A read-only token with an expiry date is recommended.',
		},
		{
			displayName: 'Endpoint',
			name: 'endpoint',
			type: 'string',
			default: 'https://mcp.gscmagic.com/mcp',
			required: true,
			description:
				'GSC Magic MCP endpoint. Change it only for self-hosted installations or local testing.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.accessToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.endpoint}}',
			url: '',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json, text/event-stream',
			},
			body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
		},
	};
}
