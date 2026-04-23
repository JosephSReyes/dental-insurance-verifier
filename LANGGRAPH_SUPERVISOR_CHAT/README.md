# LangGraph Supervisor

The TypeScript layer of the insurance verification pipeline. A LangGraph graph that intercepts carrier portal API responses and maps them to a structured verification document.

## Structure

```
apps/
  agents/   - LangGraph supervisor with mapper nodes and shared utilities
  web/      - Next.js review and submission interface
```

## Running

```bash
pnpm install
pnpm dev
```

Web UI starts at `http://localhost:3000`. LangGraph API at `http://localhost:2024`.

See the root `README.md` and `.env.example` for full setup instructions.
