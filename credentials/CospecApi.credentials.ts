import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

export class CospecApi implements ICredentialType {
	name = 'cospecApi';

	displayName = 'coSPEC API';

	documentationUrl = 'https://www.cospec.io/docs/api-keys';

	icon: Icon = {
		light: 'file:../icons/cospec.svg',
		dark: 'file:../icons/cospec.dark.svg',
	};

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			placeholder: 'csk_live_...',
			description: 'Your coSPEC API key. Found in coSPEC Dashboard → API Keys.',
			required: true,
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.cospec.io',
			description: 'Override for self-hosted deployments',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials?.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials?.baseUrl}}',
			url: '/v1/api-keys/me',
			method: 'GET',
		},
	};
}
