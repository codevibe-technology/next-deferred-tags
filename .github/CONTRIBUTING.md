# Contributing to next-deferred-tags

Thanks for helping. next-deferred-tags is a Next.js component that loads marketing tags after the first interaction, maintained by [Codevibe](https://codevibe.in).

## Ground rules

- Open an issue before a large change, so we can agree on the approach first.
- Keep pull requests focused: one fix or feature per PR.
- Add or update tests for any behaviour change.
- Be kind. This project follows our [Code of Conduct](CODE_OF_CONDUCT.md).

## Development

```bash
git clone https://github.com/codevibe-technology/next-deferred-tags.git
cd next-deferred-tags
npm install
npm test
npm run build
```

`npm test` runs the scheduler and vendor-queue tests. CI also builds the example app.

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Make your change with tests.
3. Run `npm test` and `npm run build`.
4. Describe what changed and why in the PR. Link the issue if there is one.

A maintainer will review it. All changes to `main` go through a reviewed pull request with passing CI.

## Releases

Maintainers publish to npm. Notable changes are listed in [CHANGELOG.md](../CHANGELOG.md).
