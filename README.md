# Dental Insurance Verification Pipeline

Dental offices run 20+ insurance verifications a day. Each one means a staff member logging into a carrier portal, hunting for the patient, reading benefits tables across multiple screens, and manually typing everything into the practice management system. Five to ten minutes per patient, every day, with no feedback loop when a claim gets denied.

I built this to automate that entire workflow end-to-end.

---

## What It Does

A staff member submits a patient name, date of birth, insurance carrier, and procedure codes. The pipeline handles the rest:

1. Logs into the carrier portal autonomously using browser automation
2. Intercepts the portal's own API responses instead of scraping rendered HTML
3. Parses, chunks, and embeds the raw data into pgvector for semantic retrieval
4. Routes each category of benefits data through its own LLM mapper node, with past staff corrections injected as few-shot examples via RAG
5. Runs a multi-dimensional QA pass across every extracted field
6. Queues low-confidence cases for human review in Label Studio
7. Embeds every correction back into pgvector so accuracy improves with use

---

## Stack

| Layer | Tech |
|-------|------|
| Login agent | Python, DeepAgents, LangGraph, Playwright |
| Extraction pipeline | TypeScript, LangGraph JS, OpenAI |
| Vector store | PostgreSQL 16 + pgvector |
| Local embeddings | Ollama (no PHI to external APIs) |
| Frontend | Next.js 14, shadcn/ui, Tailwind CSS |
| Annotation | Label Studio, Redis |
| Infra | Docker Compose, Turbo monorepo, LangSmith |

---

## Architecture

Two distinct layers with different jobs:

**Ingestion** runs first: the Python login agent authenticates the portal and captures raw benefits data via API interception. That data goes through PreParser, Chunker, and Embedder before landing in pgvector.

**Extraction** runs after: the LangGraph supervisor fires parallel mapper nodes that query pgvector semantically, retrieve relevant past corrections, and extract each field category independently.

The mappers never touch raw portal data. They only search over embedded chunks. This keeps each mapper independently testable and the retrieval layer clean.

---

## Pipeline

### 1. Request parsing

An LLM with a Zod-enforced tool schema parses the incoming request into a typed object. A deterministic BCBS validation guard runs before any expensive calls: BCBS requires DOB plus member ID or SSN, and it fails fast with a clear error if those fields are missing. No point burning a browser session on an incomplete request.

### 2. Portal login (Python DeepAgents)

The login agent calls `write_todos` to decompose the task before acting, then delegates to three specialized subagents: one reads the form structure, one detects CAPTCHAs and MFA prompts, one fills and submits credentials.

Memory is split: per-session state is ephemeral, but portal-specific patterns (form selectors, CAPTCHA variants, session flows) go to a persistent store keyed by carrier. Those patterns survive across separate sessions, so the agent gets smarter about each portal over time.

When CAPTCHA or 2FA blocks automation, the agent checkpoints its full state with LangGraph `MemorySaver`, puts the request in a HITL queue with a screenshot and a description of what failed, and waits. After a staff member resolves it, the agent resumes from exactly where it paused. No restarting from scratch.

The agent intercepts XHR and fetch responses from the carrier's own frontend rather than scraping the rendered DOM. The carrier already parses its API into structured JSON. Reading that directly is faster and far more resilient than scraping HTML that breaks on every UI redesign.

### 3. Preprocessing (parse, chunk, embed)

Before any LLM mapper touches anything, the raw portal data goes through:

- **PreParser** converts it to structured JSON
- **Chunker** splits into semantically sized chunks tuned for the embedding model's context window
- **Embedder** runs Ollama locally and writes vectors plus metadata to PostgreSQL with pgvector

Ollama runs locally because patient data should not leave the network. It also eliminates per-call embedding costs at scale.

This step runs before the mappers because the mappers query these embeddings. The preprocessing stage can also be re-run independently if chunking or embedding strategy changes without touching the extraction logic.

### 4. Parallel extraction, Batch 1

The supervisor fires Patient Info and Insurance Info mappers simultaneously using LangGraph's `Send` primitive. They have zero dependency on each other, so running them in parallel cuts this batch from about 6 seconds to about 3 seconds.

Each mapper follows the same four-step pattern:
1. Query `feedback_corrections` for the top-5 most relevant past staff corrections, filtered by mapper, provider, office ID, and portal version, then ranked by cosine similarity
2. Inject those corrections as few-shot examples into the system prompt
3. Run a ReAct loop: search embedded portal chunks semantically, extract, submit
4. Return each field with a confidence score from 0.0 to 1.0, the source JSON path, and a reasoning string

### 5. Parallel extraction, Batch 2

Once Batch 1 completes, patient context is available to inject into the remaining prompts. The supervisor fires five mappers simultaneously: Coverage and Benefits, Orthodontic Benefits, Waiting Periods, Procedure Details (one agent per requested dental code), and Treatment History. Running them in parallel cuts this batch from about 15 seconds to about 4 seconds.

### 6. QA validation

After all mappers complete, a validation pass runs four checks:

- **Completeness**: percentage of required fields populated across all mappers
- **Accuracy**: average confidence weighted by field criticality
- **Consistency**: no logical contradictions (yearly max used cannot exceed yearly max, etc.)
- **Coverage**: every requested dental code has procedure details extracted

Each verification gets an overall score from 0-100, a count of critical issues, and a count of warnings.

### 7. Human review and active learning

Verifications route to Label Studio for annotation. An uncertainty scorer prioritizes which ones reach reviewers first using six weighted factors: stated confidence level, extraction inconsistency across attempts, edge case indicators, known portal quirks, field criticality, and estimated learning value from the correction.

Reviewers correct field values, source paths, and add a reason for each correction. The reason is what matters. "BCBS requires MM/DD/YYYY format" becomes the few-shot example for future runs, not just the corrected date string.

### 8. RAG feedback loop

Each correction gets embedded as a document that captures the mapper, carrier, office, portal version, what was extracted, what the correct value is, and why it was wrong. That document goes into pgvector.

The next time a mapper runs for that same carrier-office combination, it retrieves the most relevant past corrections and has the correct behavior demonstrated before extracting anything. One correction covers every future verification for that carrier. No retraining.

---

## What Was Actually Hard

**Bot detection before the login form.** Several portals flag Playwright's default configuration before any credentials are filled. Behavioral fingerprinting runs at the JavaScript level, not just CAPTCHA. The CAPTCHA detector subagent now classifies the specific obstacle type first. If the classification is behavioral detection, the agent escalates to HITL immediately instead of retrying and risking an IP-level block.

**HTML embedded inside JSON.** Two portals returned benefits data as HTML fragments encoded as JSON string values. The assumption that API interception always gives clean structured data was wrong. The PreParser now runs a secondary extraction pass on any JSON string value that contains HTML. It's a regex check, not a second LLM call, because this is a deterministic problem.

**Retrieval cross-contamination.** Early builds used only cosine similarity with no metadata filtering. A correction made for BCBS California would surface for BCBS Washington queries because the embedding space doesn't encode carrier geography. The fix was applying exact-match pre-filters on mapper, provider, office ID, and portal version before ranking by similarity. Similarity only ranks within an already-filtered candidate set.

**Hallucination on sparse plans.** When a patient's plan genuinely has minimal data, mappers would return plausible-looking values with high confidence scores. The ReAct loop was filling gaps from training knowledge when semantic search returned weak results. Fixed with a minimum similarity floor of 0.4. Below that threshold, the search tool returns nothing, the mapper returns `confidence: 0` with "field not found in portal data," and QA routes it to human review. A confident wrong answer is worse than an honest null.

---

## What I'd Do Next

**HNSW over IVFFlat.** Better recall at scale with only a modest memory increase. The difference is marginal now but compounds as the corrections database grows.

**Golden dataset per carrier for mapper regression tests.** LangSmith is already in the stack for tracing. When a prompt or model changes, there should be a benchmark that catches accuracy drops before they surface as claim denials.

**Production HITL queue.** The current file-based queue works, but it's not durable under concurrent requests. The PostgreSQL instance is already running. Moving the queue there is straightforward.

**Deterministic fallback for high-criticality fields.** For fields like `yearly_maximum` and `member_id`, a regex pass over raw portal data would act as a sanity check against the LLM extraction. If they agree, confidence is high. If they disagree, route to human review regardless of stated confidence.

---

## Getting Started

```bash
# Configure environment
cp .env.example .env

# Start infrastructure (PostgreSQL + pgvector, Redis, Label Studio)
cd LANGGRAPH_SUPERVISOR_CHAT && docker-compose up -d

# Initialize the database
cd apps/agents && pnpm install && npx ts-node scripts/init-database.ts

# Start the supervisor and frontend
cd LANGGRAPH_SUPERVISOR_CHAT && pnpm install && pnpm dev
# Web UI:        http://localhost:3000
# LangGraph API: http://localhost:2024

# Run the login agent
cd agents/universal_login_deep_agent
pip install -r requirements.txt
python cli.py --portal "https://your-carrier-portal.com" --office "OFFICE_A"
```

Ollama runs locally outside Docker. Install from [ollama.com](https://ollama.com) and pull the embedding model before the embedder step. See `.env.example` for all required variables including per-carrier credentials and infrastructure ports.

---

## Project Structure

```
.
├── agents/universal_login_deep_agent/       # Python login agent
│   ├── agent.py                             # DeepAgents graph, CompositeBackend memory
│   ├── tools.py                             # Playwright browser tools
│   ├── hitl_integration.py                  # HITL queue and checkpoint resume
│   └── cli.py                               # CLI entry point
├── LANGGRAPH_SUPERVISOR_CHAT/
│   ├── docker-compose.yml                   # PostgreSQL, Redis, Label Studio
│   ├── apps/agents/src/supervisor-agent/    # LangGraph graph + 7 mapper nodes
│   ├── apps/agents/src/shared/              # pgvector, RAG, QA, active learning
│   ├── apps/agents/migrations/              # PostgreSQL schema (run in order)
│   └── apps/web/                            # Next.js review and annotation UI
├── label-studio-config/                     # Label Studio annotation project config
└── docs/diagrams/ai_focused_end_to_end_flow.mmd
```
