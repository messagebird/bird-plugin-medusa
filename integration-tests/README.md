# Medusa module integration tests

These tests use Medusa 2.21.2's [`moduleIntegrationTestRunner`](https://docs.medusajs.com/learn/debugging-and-testing/testing-tools/modules-tests) with Jest. They load the real Notification Module, its PostgreSQL models, the compiled Bird public provider entry, and Medusa's local `feed` provider. Bird HTTP requests are mocked with synthetic credentials and recipients. No Bird account or running store is needed.

The suite covers email, SMS, WhatsApp, template data, attachments, provider and external IDs, persisted status, notification idempotency, feed registration, validation before HTTP, and error propagation. Unit tests own detailed payload validation and transport failures; these tests exercise the Medusa loader and persistence boundary.

## Run from a fresh checkout

Use a Node version supported by this package. In the Bird monorepo, use the pnpm version pinned in the root `package.json` and run `pnpm install --frozen-lockfile` from the repository root, then:

```sh
beak check integrations/medusa:integration
```

In the public source mirror, use Node 22.19.0 and pnpm 11.19.0, matching its CI workflows. Run both commands from the package root:

```sh
pnpm install --frozen-lockfile
pnpm test:integration
```

The command builds the package before testing its public provider export. Docker must be running and able to pull `postgres:15-alpine`. Testcontainers starts an isolated PostgreSQL container and stops it after the suite. Missing Docker or a failed database connection fails the command; it never skips the suite. Docker-in-Docker CI may require `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1`.

## Use an existing test PostgreSQL server

To avoid Docker, explicitly set `MEDUSA_TEST_POSTGRES_URL` to a local test server. Use a PostgreSQL user with `CREATEDB` permission and access to its `postgres` maintenance database. Supply credentials through your shell or secret store; URL-encode special characters. Query parameters, including SSL options, are unsupported by this local test configuration.

For a Bird local stack, read its current direct PostgreSQL host and port from the worktree's `.dev-info`; do not assume the default PostgreSQL port. Configure `MEDUSA_TEST_POSTGRES_URL` with those values and a test-only database user before running `pnpm test:integration`. For a separate PostgreSQL server, use the connection details supplied by that server.

The URL selects the server and credentials, not the database under test. Each suite creates a unique `medusa_bird_test_<random>` database, resets its schema between tests, and drops that database after the Medusa connections close, including after assertion failures. It does not use your store database or stop your PostgreSQL server. A hard process kill can leave that suite's randomly named database behind; remove only the matching `medusa_bird_test_` database after confirming its test process has stopped.

Run `pnpm test` for the separate type-consumer and unit checks. Source mirrors include these integration tests and their development dependencies. The npm package's `files` allowlist excludes the tests, runner configuration, and development tooling.
