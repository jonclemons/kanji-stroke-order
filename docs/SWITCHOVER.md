# Workers Switchover Checklist

This app can be tested on a new Worker endpoint before any production domain cutover.

## Recommended rollout

1. Keep the current Pages site as-is.
2. Deploy the Honox app to the Worker's `workers.dev` URL.
3. Smoke-test the Worker there.
4. Optionally attach a staging custom domain such as `next.kokugo.app`.
5. Only after that, move `kokugo.app` and `www.kokugo.app` to the Worker.

That gives us a clean staging lane and avoids any downtime while we validate the new runtime.

## Local checks

Run these before touching Cloudflare:

```bash
bun install
bun run test
bun run build
bun run dev
```

Useful local endpoints:

- `http://127.0.0.1:8000/`
- `http://127.0.0.1:8000/api/health`

For local Worker secrets, copy `.dev.vars.example` to `.dev.vars` and fill in real values.

## Cloudflare setup

### 1. Confirm the Worker runtime config

The source of truth is [wrangler.jsonc](/Users/jonathanclemons/code/jc/kanji-stroke-order/wrangler.jsonc:1).

Important settings already in place:

- `workers_dev: true`
- R2 binding: `SHEETS`
- build command: `bun run build`
- required secrets: `READ_KEY`, `UPLOAD_KEY`

### 2. Create or confirm the R2 bucket

The Worker expects an R2 bucket named `kanji-sheets`.

### 3. Set deploy-time secrets

```bash
bunx wrangler secret put READ_KEY
bunx wrangler secret put UPLOAD_KEY
```

These are now declared as required secrets in `wrangler.jsonc`, so deploys should fail loudly if they are missing.

### 4. Ensure a `workers.dev` subdomain exists

Cloudflare gives each account a `workers.dev` subdomain. The deployed Worker URL will look like:

```txt
https://kanji-stroke-order.<your-account-subdomain>.workers.dev
```

## First deploy

Deploy the Worker without changing any custom domains yet:

```bash
bun run deploy
```

Then test the new endpoint:

```bash
bun run smoke:worker -- https://kanji-stroke-order.<your-account-subdomain>.workers.dev
```

Manual checks:

- open `/`
- open `/api/health`
- open `/manifest.json`
- open `/data/v1/grades/grade-1.json`
- install/open the PWA from the new endpoint if you want a full staging pass

## Optional staging custom domain

If you want a friendlier test URL before production cutover, use a temporary custom domain such as:

- `next.kokugo.app`
- `staging.kokugo.app`

If the `kokugo.app` zone is in Cloudflare, add that custom domain to the Worker first and test there. This is the nicest path if multiple devices need to test the new runtime before launch.

## Production cutover

### If `kokugo.app` is not yet attached anywhere

1. Add `kokugo.app` as a Worker Custom Domain.
2. Add `www.kokugo.app` as a Worker Custom Domain.
3. Wait for DNS/cert issuance.
4. Re-run the smoke test on both hosts.

### If `kokugo.app` is already attached to Pages or another Cloudflare app

1. Leave the existing site live.
2. Verify the Worker on `workers.dev` or a staging custom domain.
3. Remove the old custom-domain attachment for `kokugo.app`.
4. Add `kokugo.app` to the Worker.
5. Repeat for `www.kokugo.app`.
6. Re-run smoke tests immediately after the switch.

If a hostname has an existing conflicting CNAME/custom-domain attachment, Cloudflare will block creating the Worker custom domain until that conflict is removed.

## Post-cutover verification

Run:

```bash
bun run smoke:worker -- https://kokugo.app
bun run smoke:worker -- https://www.kokugo.app
```

Then check:

- root HTML loads
- grade JSON serves as JSON, not HTML
- `/api/health` reports the current app/data version
- installed PWA updates successfully
- a sample kanji detail page loads and animates

## GitHub Actions

The workflow at [.github/workflows/deploy-worker.yml](/Users/jonathanclemons/code/jc/kanji-stroke-order/.github/workflows/deploy-worker.yml:1) now:

1. installs dependencies
2. runs tests
3. deploys with `cloudflare/wrangler-action`
4. optionally runs `smoke:worker`

Repository secrets to add:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `READ_KEY`
- `UPLOAD_KEY`

Optional repository variable:

- `WORKER_BASE_URL`

If `WORKER_BASE_URL` is set, CI will automatically run:

```bash
bun run smoke:worker -- "$WORKER_BASE_URL"
```

Good values for that variable:

- `https://kanji-stroke-order.<your-account-subdomain>.workers.dev`
- `https://next.kokugo.app`

## Rollback

If something goes wrong after cutover:

1. Roll back the Worker deployment in Cloudflare Workers Deployments.
2. Or reattach the old custom-domain target if needed.
3. Re-run the smoke test to confirm the rollback host is healthy.

Because the Pages site can stay untouched until the final domain move, the lowest-risk rollback path is to delay the custom-domain switch until the Worker has already been proven on `workers.dev`.
