import type {
	IAllExecuteFunctions,
	IDataObject,
	IHttpRequestMethods,
	IHttpRequestOptions,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

/**
 * Makes an authenticated request to the coSPEC API.
 * Handles base URL resolution, auth headers, and error wrapping.
 */
export async function cospecApiRequest(
	this: IAllExecuteFunctions,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
): Promise<IDataObject> {
	const credentials = await this.getCredentials('cospecApi');
	const baseUrl = (credentials.baseUrl as string).replace(/\/$/, '');

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${path}`,
		json: true,
		headers: {
			'X-Cospec-Source': 'n8n',
		},
	};

	if (body) {
		options.body = body;
	}

	try {
		return await this.helpers.httpRequestWithAuthentication.call(this, 'cospecApi', options);
	} catch (error) {
		// httpRequestWithAuthentication wraps errors in NodeApiError with generic
		// HTTP status messages (e.g. "Bad request - please check your parameters").
		// The actual API response is stored in error.cause.
		const message = extractApiErrorMessage(error);
		throw new NodeOperationError(this.getNode(), message);
	}
}

/**
 * Extracts a user-facing error message from a NodeApiError.
 *
 * httpRequestWithAuthentication wraps errors in NodeApiError which overwrites
 * the message with generic HTTP status text (e.g. "Bad request — please check
 * your parameters"). The original response body is stored at:
 *   1. error.cause.response.data  — the original AxiosError's response
 *   2. error.context.data         — copy made by NodeApiError constructor
 *
 * The coSPEC API returns RFC 9457 errors: { type, title, status, detail, errors[] }.
 */
function extractApiErrorMessage(error: unknown): string {
	const err = error as Record<string, unknown>;

	// NodeApiError stores response body at context.data
	const contextData = (err.context as Record<string, unknown>)?.data as
		| Record<string, unknown>
		| undefined;

	if (contextData) {
		const msg = extractFromBody(contextData);
		if (msg) return msg;
	}

	// Fallback: original AxiosError at error.cause.response.data
	const cause = err.cause as Record<string, unknown> | undefined;
	const causeData = (cause?.response as Record<string, unknown>)?.data as
		| Record<string, unknown>
		| undefined;

	if (causeData) {
		const msg = extractFromBody(causeData);
		if (msg) return msg;
	}

	// n8n may have extracted something into description via findProperty
	if (typeof err.description === 'string') return err.description;

	return (err.message as string) || 'Unknown API error';
}

/** Extracts a message from an RFC 9457 response body. */
function extractFromBody(data: Record<string, unknown>): string | undefined {
	// Most specific first: detail, then validation errors, then generic title
	if (typeof data.detail === 'string') return data.detail;

	if (Array.isArray(data.errors) && data.errors.length > 0) {
		const first = data.errors[0] as Record<string, unknown>;
		if (typeof first.message === 'string') return first.message;
	}

	if (typeof data.title === 'string') return data.title;

	return undefined;
}

/**
 * Builds a clean output from the run object.
 * Groups outputs[] by type into structured objects and strips internal fields.
 */
const INTERNAL_FIELDS = new Set([
	'callbackUrl',
	'callbackStatus',
	'cancelRequestedAt',
	'templateId',
]);

export function flattenRunOutput(run: IDataObject): IDataObject {
	const filtered = Object.fromEntries(
		Object.entries(run).filter(([key]) => !INTERNAL_FIELDS.has(key)),
	) as IDataObject;

	const outputs = (filtered.outputs ?? []) as IDataObject[];

	const firstOfType = (type: string): IDataObject | undefined =>
		outputs.find((o) => o.type === type);

	const pr = firstOfType('pr');
	const issue = firstOfType('issue');
	const branch = firstOfType('branch');
	const text = firstOfType('text');

	return {
		...filtered,
		pr: pr ? { url: pr.url, title: pr.title, number: pr.number } : null,
		issue: issue ? { url: issue.url, title: issue.title, number: issue.number } : null,
		branch: branch ? { name: branch.name } : null,
		summary: (text?.content as string) ?? null,
	};
}
