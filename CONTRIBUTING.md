# Contributing

Thank you for contributing to PlayFab-Purchase-Service.

This repository contains a Node.js/Express API for Minecraft Bedrock Marketplace purchase, balance, entitlement, creator, and offer operations. Contributions should preserve transaction safety, authentication boundaries, and API compatibility.

## Before You Start

- Read [README.md](README.md) for architecture, configuration, and runtime behavior.
- Read [SECURITY.md](SECURITY.md) before reporting vulnerabilities.
- For larger features, behavioral changes, or breaking API updates, open an issue or start a discussion before investing significant implementation time.

## Development Setup

Requirements:

- Node.js 18 or newer
- npm

Install dependencies:

```bash
npm ci
```

Run the service locally:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

Project scripts:

- `npm run dev` starts the service in development mode with `nodemon`.
- `npm start` starts the service in production mode.
- `npm test` runs the Node test suite.

## Repository Structure

- `src/server.js`: application bootstrap
- `src/routes`: HTTP route definitions
- `src/services`: Minecraft, PlayFab, purchase, and marketplace integrations
- `src/middleware`: authentication, validation, rate limiting, and error handling
- `src/config`: environment and runtime configuration
- `src/utils`: shared helpers
- `test`: Node-based test suite

## Contribution Guidelines

- Prefer small pull requests with a single clear purpose.
- Do not mix unrelated refactors with bug fixes or features.
- Preserve existing API and purchase behavior unless a change is intentional and documented.
- Update OpenAPI documentation when routes, payloads, parameters, or responses change.
- Add or update tests for purchase calculations, validation, and error paths.
- Keep changes around authentication, tokens, currency, entitlements, and upstream requests conservative.
- Never commit credentials, session tokens, receipts, private environment values, or customer data.

## Coding Expectations

- Match the existing ESM style and current file organization.
- Prefer explicit validation and error handling over silent fallbacks.
- Keep external requests bounded by timeouts and validate upstream responses.
- Avoid logging authorization headers, tokens, purchase receipts, or account identifiers.
- Document new configuration variables in `README.md` and the relevant environment example.

## Testing Expectations

At minimum, contributors should:

- run `npm test`
- verify affected API examples and documentation
- add regression coverage for bug fixes where practical

If automated coverage is not practical, explain the manual verification in the pull request.

## Commit Messages

Follow the existing repository commit style and keep messages concise. For release-relevant changes, use clear prefixes such as `feat:`, `fix:`, `docs:`, `test:`, `ci:`, or `chore:`.

## Pull Requests

Include:

- the problem and intended solution
- API, configuration, security, or operational impact
- related issues
- tests and manual checks performed
- intentional follow-up work

## Security Reporting

Do not disclose vulnerability details in public issues or pull requests. Follow [SECURITY.md](SECURITY.md).

## Conduct

By participating in this project, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
