# Changelog

## 0.1.0

Initial release.

- **coSPEC** action node: Create Run (with polling) and Get Run operations
- **coSPEC Trigger** node: webhook-based trigger for run completion events
- Grouped output fields: `pr`, `issue`, `branch`, `summary` extracted from `outputs[]`
- Dynamic template loading via `GET /v1/templates`
- Metadata key-value pairs for cross-workflow correlation
- AI agent tool support (`usableAsTool`)
