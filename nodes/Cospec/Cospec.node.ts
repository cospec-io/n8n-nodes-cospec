import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError, sleep } from 'n8n-workflow';

import { cospecApiRequest, flattenRunOutput } from './GenericFunctions';

const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_BUFFER_MS = 60_000;
const DEFAULT_TIMEOUT_SECONDS = 1800;
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

// ---------------------------------------------------------------------------
// Operation handlers
// ---------------------------------------------------------------------------

async function createRun(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const body = buildRequestBody.call(this, itemIndex);
	const response = await cospecApiRequest.call(this, 'POST', '/v1/runs', body);

	const shouldWait = this.getNodeParameter('waitForCompletion', itemIndex, true) as boolean;
	if (!shouldWait) {
		return response;
	}

	const timeoutSeconds = getTimeoutSeconds.call(this, itemIndex);
	return pollUntilComplete.call(this, response.id as string, timeoutSeconds, itemIndex);
}

async function getRun(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const runId = this.getNodeParameter('runId', itemIndex) as string;
	const run = await cospecApiRequest.call(this, 'GET', `/v1/runs/${runId}`);
	return flattenRunOutput(run);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequestBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const body: IDataObject = {
		repo: this.getNodeParameter('repo', itemIndex) as string,
		prompt: this.getNodeParameter('prompt', itemIndex) as string,
		template: this.getNodeParameter('template', itemIndex) as string,
		model: this.getNodeParameter('model', itemIndex, 'sonnet') as string,
	};

	const branch = this.getNodeParameter('branch', itemIndex, '') as string;
	if (branch) {
		body.branch = branch;
	}

	const guardrails = this.getNodeParameter('guardrails', itemIndex, {}) as IDataObject;
	if (Object.keys(guardrails).length > 0) {
		body.guardrails = guardrails;
	}

	appendEnvVars.call(this, body, itemIndex);

	return body;
}

function appendEnvVars(
	this: IExecuteFunctions,
	body: IDataObject,
	itemIndex: number,
): void {
	const envData = this.getNodeParameter('env', itemIndex, {}) as IDataObject;
	if (!envData.values || !Array.isArray(envData.values)) {
		return;
	}

	const env: Record<string, string> = {};
	for (const entry of envData.values as IDataObject[]) {
		env[entry.key as string] = entry.value as string;
	}
	body.env = env;
}

function getTimeoutSeconds(this: IExecuteFunctions, itemIndex: number): number {
	const guardrails = this.getNodeParameter('guardrails', itemIndex, {}) as IDataObject;
	return (guardrails.timeoutSeconds as number) || DEFAULT_TIMEOUT_SECONDS;
}

async function pollUntilComplete(
	this: IExecuteFunctions,
	runId: string,
	timeoutSeconds: number,
	itemIndex: number,
): Promise<IDataObject> {
	const deadline = Date.now() + timeoutSeconds * 1000 + TIMEOUT_BUFFER_MS;

	while (Date.now() < deadline) {
		await sleep(POLL_INTERVAL_MS);

		const run = await cospecApiRequest.call(this, 'GET', `/v1/runs/${runId}`);

		if (TERMINAL_STATUSES.has(run.status as string)) {
			return flattenRunOutput(run);
		}
	}

	throw new NodeOperationError(
		this.getNode(),
		`Run ${runId} did not complete within ${timeoutSeconds}s timeout`,
		{ itemIndex },
	);
}

// ---------------------------------------------------------------------------
// Node class
// ---------------------------------------------------------------------------

export class Cospec implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'coSPEC',
		name: 'cospec',
		icon: {
			light: 'file:../../icons/cospec.svg',
			dark: 'file:../../icons/cospec.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Create, run, and manage AI coding agents on repositories',
		defaults: { name: 'coSPEC' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'cospecApi', required: true }],
		properties: [
			// -- Operation --
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'Create Run',
				options: [
					{
						name: 'Create Run',
						value: 'Create Run',
						action: 'Create a run',
						description: 'Create an agent run and optionally wait for completion',
					},
					{
						name: 'Get Run',
						value: 'Get Run',
						action: 'Get a run',
						description: 'Fetch run details by ID including status, outputs, and usage',
					},
				],
			},

			// -- Create Run: required fields --
			{
				displayName: 'Repository',
				name: 'repo',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'owner/repo',
				description: 'GitHub repository (owner/repo format or full URL)',
				displayOptions: { show: { operation: ['Create Run'] } },
			},
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: { rows: 4 },
				required: true,
				default: '',
				placeholder: 'Fix the bug in auth.ts and create a PR',
				description: 'Instruction for the AI agent (supports n8n expressions)',
				displayOptions: { show: { operation: ['Create Run'] } },
			},
			{
				displayName: 'Template',
				name: 'template',
				type: 'string',
				required: true,
				default: 'node',
				placeholder: 'node',
				description: 'Template slug or ID (e.g., node, python-3.12)',
				displayOptions: { show: { operation: ['Create Run'] } },
			},

			// -- Create Run: optional fields --
			{
				displayName: 'Branch',
				name: 'branch',
				type: 'string',
				default: '',
				placeholder: 'main',
				description: 'Git branch to clone (defaults to repo default branch)',
				displayOptions: { show: { operation: ['Create Run'] } },
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				default: 'sonnet',
				options: [
					{ name: 'Sonnet', value: 'sonnet' },
					{ name: 'Opus', value: 'opus' },
					{ name: 'Haiku', value: 'haiku' },
				],
				description: 'Claude model to use for the agent',
				displayOptions: { show: { operation: ['Create Run'] } },
			},
			{
				displayName: 'Wait for Completion',
				name: 'waitForCompletion',
				type: 'boolean',
				default: true,
				description:
					'Whether to poll until the run completes. If false, returns immediately with run ID.',
				displayOptions: { show: { operation: ['Create Run'] } },
			},

			// -- Create Run: guardrails --
			{
				displayName: 'Guardrails',
				name: 'guardrails',
				type: 'collection',
				placeholder: 'Add Guardrail',
				default: {},
				displayOptions: { show: { operation: ['Create Run'] } },
				options: [
					{
						displayName: 'Timeout (Seconds)',
						name: 'timeoutSeconds',
						type: 'number',
						default: 1800,
						description: 'Max execution time (30-3600 seconds)',
						typeOptions: { minValue: 30, maxValue: 3600 },
					},
					{
						displayName: 'Max Turns',
						name: 'maxTurns',
						type: 'number',
						default: 100,
						description: 'Max agent conversation turns (1-1000)',
						typeOptions: { minValue: 1, maxValue: 1000 },
					},
					{
						displayName: 'Max Cost (USD)',
						name: 'maxCostUsd',
						type: 'number',
						default: 5,
						description: 'Max cost in USD (0.01-1000)',
						typeOptions: { minValue: 0.01, maxValue: 1000 },
					},
				],
			},

			// -- Create Run: environment variables --
			{
				displayName: 'Environment Variables',
				name: 'env',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				default: {},
				placeholder: 'Add Variable',
				displayOptions: { show: { operation: ['Create Run'] } },
				options: [
					{
						name: 'values',
						displayName: 'Variable',
						values: [
							{
								displayName: 'Key',
								name: 'key',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
							},
						],
					},
				],
			},

			// -- Get Run --
			{
				displayName: 'Run ID',
				name: 'runId',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'run_abc123',
				description: 'The ID of the run to fetch',
				displayOptions: { show: { operation: ['Get Run'] } },
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;

				const result =
					operation === 'Create Run'
						? await createRun.call(this, i)
						: await getRun.call(this, i);

				returnData.push({ json: result, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}

				if ((error as NodeOperationError).context) {
					(error as NodeOperationError).context.itemIndex = i;
					throw error;
				}

				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
