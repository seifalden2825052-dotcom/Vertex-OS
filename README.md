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

The repository is configured as a Vercel monorepo project:

- Build command: `pnpm run build`
- Output directory: `artifacts/vertex-os/dist/public`
- API functions: `api/[...path].ts`

Add these environment variables to the Vercel project before enabling production traffic:

- `DATABASE_URL`
- `GEMINI_API_KEY`

The values belong in Vercel's encrypted Environment Variables settings and should never be committed to this repository.