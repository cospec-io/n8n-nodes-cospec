import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { cospecApiRequest, flattenRunOutput } from '../Cospec/GenericFunctions';

// ---------------------------------------------------------------------------
// Webhook lifecycle
// ---------------------------------------------------------------------------

async function checkExists(this: IHookFunctions): Promise<boolean> {
	const webhookData = this.getWorkflowStaticData('node');

	if (!webhookData.webhookId) {
		return false;
	}

	try {
		const response = await cospecApiRequest.call(this, 'GET', '/v1/webhooks');
		const webhooks = response.data as IDataObject[];
		const exists = webhooks.some((wh) => wh.id === webhookData.webhookId);

		if (!exists) {
			delete webhookData.webhookId;
		}

		return exists;
	} catch {
		delete webhookData.webhookId;
		return false;
	}
}

async function createWebhook(this: IHookFunctions): Promise<boolean> {
	const webhookUrl = this.getNodeWebhookUrl('default') as string;
	const events = this.getNodeParameter('events') as string[];

	let response: IDataObject;
	try {
		response = await cospecApiRequest.call(this, 'POST', '/v1/webhooks', {
			url: webhookUrl,
			events,
		});
	} catch (error) {
		const apiMessage = (error as Error).message || 'Unknown error';
		throw new NodeOperationError(
			this.getNode(),
			`Failed to register webhook: ${apiMessage}`,
		);
	}

	const webhookData = this.getWorkflowStaticData('node');
	webhookData.webhookId = response.id;

	return true;
}

async function deleteWebhook(this: IHookFunctions): Promise<boolean> {
	const webhookData = this.getWorkflowStaticData('node');
	const webhookId = webhookData.webhookId as string;

	if (webhookId) {
		try {
			await cospecApiRequest.call(this, 'DELETE', `/v1/webhooks/${webhookId}`);
		} catch {
			// Webhook may already be deleted externally
		}
		delete webhookData.webhookId;
	}

	return true;
}

// ---------------------------------------------------------------------------
// Webhook payload handler
// ---------------------------------------------------------------------------

function buildTriggerOutput(body: IDataObject): IDataObject {
	const run = body.run as IDataObject | undefined;

	if (!run) {
		return { event: body.event, timestamp: body.timestamp };
	}

	return {
		event: body.event,
		timestamp: body.timestamp,
		...flattenRunOutput(run),
	};
}

// ---------------------------------------------------------------------------
// Node class
// ---------------------------------------------------------------------------

export class CospecTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'coSPEC Trigger',
		name: 'cospecTrigger',
		icon: {
			light: 'file:../../icons/cospec.svg',
			dark: 'file:../../icons/cospec.dark.svg',
		},
		group: ['trigger'],
		version: 1,
		subtitle: 'Run Finished',
		description: 'Triggers when a coSPEC agent run completes, fails, or is cancelled',
		defaults: { name: 'coSPEC Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'cospecApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				default: ['run.completed', 'run.failed', 'run.cancelled'],
				options: [
					{ name: 'Run Completed', value: 'run.completed' },
					{ name: 'Run Failed', value: 'run.failed' },
					{ name: 'Run Cancelled', value: 'run.cancelled' },
				],
				description: 'Which run events to subscribe to',
				required: true,
			},
		],
	};

	webhookMethods = {
		default: {
			checkExists,
			create: createWebhook,
			delete: deleteWebhook,
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData() as IDataObject;
		const output = buildTriggerOutput(body);

		return {
			workflowData: [this.helpers.returnJsonArray([output])],
		};
	}
}
