# Vertex OS

Vertex OS is a bilingual Arabic-English operations workspace for customers, projects, invoices, cash flow, and AI-assisted business decisions.

## Run locally

```bash
pnpm install
pnpm run typecheck
pnpm --filter @workspace/vertex-os run dev
```

The API runs separately with:

```bash
pnpm --filter @workspace/api-server run dev
```

## Vercel deployment

The repository is configured as a Vercel monorepo project. The recommended Vercel
Root Directory is the repository root (`.`), so Vercel can discover both the
frontend build and the root `api/[...path].ts` serverless function:

- Build command: `pnpm --filter @workspace/api-server run build && pnpm --filter @workspace/vertex-os run build`
- Output directory: `artifacts/vertex-os/dist/public`
- API functions: `api/[...path].js`
- SPA routes: `/customers`, `/projects`, `/invoices`, and `/activity` rewrite to `index.html`

If the Vercel project must keep `artifacts/vertex-os` as its Root Directory,
use the artifact-local `api/[...path].ts` and `vercel.json` instead.

Add these environment variables to the Vercel project before enabling production traffic:

- `DATABASE_URL`
- `GEMINI_API_KEY`

The values belong in Vercel's encrypted Environment Variables settings and should never be committed to this repository.