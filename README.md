# n8n-nodes-cospec

This is an n8n community node. It lets you use [coSPEC](https://www.cospec.io) in your n8n workflows.

coSPEC lets you run AI coding agents securely on your repositories. Connect your repo, send a prompt, get PRs, branches, and fixes back. This node brings coSPEC into your n8n workflows.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation) |
[Operations](#operations) |
[Credentials](#credentials) |
[Compatibility](#compatibility) |
[Usage](#usage) |
[Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

### coSPEC (Action Node)

| Operation | Description |
|-----------|-------------|
| **Create Run** | Create an AI agent run on a GitHub repository. Optionally polls until completion. |
| **Get Run** | Fetch run details by ID, including status, outputs, and usage. |

**Create Run** parameters:
- **Repository** — GitHub repo in `owner/repo` format
- **Prompt** — Instruction for the AI agent (supports n8n expressions)
- **Template** — Sandbox template (dynamically loaded from your account)
- **Model** — Claude model: Sonnet, Opus, or Haiku
- **Branch** — Git branch to clone (optional, defaults to repo default)
- **Wait for Completion** — Poll until the run finishes (default: true)
- **Guardrails** — Timeout, max turns, max cost limits
- **Environment Variables** — Key-value pairs passed to the sandbox

### coSPEC Trigger

Starts a workflow when an agent run completes, fails, or is cancelled. Uses webhooks — no polling.

| Event | Description |
|-------|-------------|
| Run Completed | Agent finished successfully |
| Run Failed | Agent hit an error, limit, or timeout |
| Run Cancelled | Run was cancelled |

### Output Fields

Both nodes output the run object with convenience fields:

| Field | Example |
|-------|---------|
| `status` | `completed`, `failed`, `cancelled` |
| `prUrl` | `https://github.com/owner/repo/pull/42` |
| `prTitle` | Fix login validation bug |
| `prNumber` | 42 |
| `issueUrl` | `https://github.com/owner/repo/issues/10` |
| `branchName` | `fix/login-bug` |
| `outputSummary` | First text output content |
| `usage.totalCostUsd` | 1.23 |
| `failReason` | `null`, `error`, `max_turns`, `max_cost`, `timeout` |

## Credentials

1. Sign up at [cospec.io](https://www.cospec.io)
2. Go to **Dashboard → API Keys** and create a new key
3. In n8n, add a **coSPEC API** credential and paste your key (starts with `csk_live_...`)

The credential test verifies your API key automatically.

## Compatibility

- Tested with n8n v1.91+
- Requires Node.js 22+

## Usage

### Basic: Create a Run and Wait

1. Add a **Manual Trigger** node
2. Add a **coSPEC** node → operation **Create Run**
3. Set your repository, prompt, and template
4. Execute — the node polls until the agent finishes and returns the result

### Fire and Forget

Set **Wait for Completion** to `false`. The node returns immediately with the run ID. Use **Get Run** later to check the status.

### Webhook Trigger

1. Add a **coSPEC Trigger** node to a new workflow
2. Select which events to listen for
3. Activate the workflow — a webhook is registered with the coSPEC API
4. When a run finishes, the workflow starts automatically

> **Note:** The trigger requires a publicly accessible HTTPS URL. It works on n8n Cloud out of the box. For local/self-hosted n8n, use a tunnel (e.g. `cloudflared tunnel --url http://localhost:5678`) or use the **Create Run** action node with **Wait for Completion** enabled instead.

### AI Agent Tool

Both nodes have `usableAsTool` enabled. You can use them as tools in n8n's AI agent workflows — let an AI assistant create and monitor coding agent runs.

## Resources

- [coSPEC Documentation](https://www.cospec.io/docs)
- [coSPEC API Reference](https://www.cospec.io/docs/api)
- [API Keys Setup](https://www.cospec.io/docs/api-keys)
- [n8n Community Nodes Documentation](https://docs.n8n.io/integrations/#community-nodes)
