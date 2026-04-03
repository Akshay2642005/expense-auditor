# Security Policy

## Supported Versions

Expense Auditor is still evolving quickly, so security fixes are focused on the actively maintained codebase.

| Version | Supported |
| --- | --- |
| `master` | Yes |
| Older branches, forks, and local snapshots | No |

If you are running a long-lived fork or an older deployment, upgrade to the latest `master` state before expecting a security fix to apply cleanly.

## Reporting A Vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities.

Instead, use one of the following private channels:

1. GitHub private vulnerability reporting for this repository, if it is enabled.
2. A private GitHub security advisory draft for this repository.
3. Direct contact with the repository owner through GitHub if private reporting is temporarily unavailable.

When reporting, please include:

- a short summary of the issue
- affected area or files
- impact and severity as you understand it
- reproduction steps or proof of concept
- required configuration, credentials, or environment context
- suggested mitigation if you already have one

## What To Expect

We will try to:

- acknowledge receipt within 3 business days
- assess severity and impact as quickly as possible
- coordinate a fix and disclosure plan before public discussion
- credit the reporter when appropriate and desired

Response time can vary depending on the complexity of the issue and current maintainer availability.

## Disclosure Guidelines

- Do not publicly disclose the vulnerability until a fix or mitigation is available.
- Avoid posting proof-of-concept exploit details in public issues, discussions, or pull requests.
- If the issue affects a third-party dependency or provider, coordinated disclosure may require additional time.

## Security Scope

This repository includes:

- a Go backend API and background job system
- a React frontend
- organization and authentication flows
- OCR, policy retrieval, and AI-assisted audit logic
- shared schemas and OpenAPI contracts

Security reports are especially helpful for issues involving:

- authentication or authorization bypass
- organization or tenant isolation failures
- claim, policy, or receipt data exposure
- unsafe file upload or storage behavior
- prompt-injection, policy-bypass, or audit-manipulation paths
- secret handling or environment configuration leaks
- unsafe admin actions or privilege escalation

## Sensitive Data Handling

Please do not include real employee receipts, production secrets, API keys, or personal data in reports unless absolutely necessary. If you need to share sensitive examples, sanitize them first where possible.

## Operational Guidance For Contributors

If you are contributing code to this repository:

- never commit secrets, credentials, or production tokens
- use environment files and secret managers instead of hardcoding values
- avoid logging sensitive receipt, policy, or auth data unless required and appropriately redacted
- preserve authorization checks around organization-scoped resources
- treat AI-generated audit reasoning as sensitive business data when it includes policy excerpts or claim details

## Dependency And Infrastructure Notes

This project relies on external services and libraries, including authentication, storage, email, AI, database, and queue infrastructure. Some security issues may require fixes in both this repository and external configuration before the risk is fully resolved.
