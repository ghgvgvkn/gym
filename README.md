# IRONMAP

**Dual-sided AI fitness SaaS.** Gyms photograph their floor once and get a living
digital twin of every machine; members get a voice-and-text AI coach whose every
workout is built from their InBody data and mapped to the **exact machines in their
gym**. Powered by the **Claude 5 family — Fable 5** as the always-on conversational +
perception tier, escalating hard safety/planning turns to a deeper reasoning model.

This repo is the **knowledge + engine + prototype layer**, distilled from four research
briefs into a database schema, deterministic engines, and a clickable app. Wire it to
Supabase and it runs.

```
ironmap/
├─ data/                 ← SINGLE SOURCE OF TRUTH (JSON)
│  ├─ muscles.json          40 muscles + weekly volume landmarks (MEV/MAV/MRV)
│  ├─ machines.json         60 machines across 6 categories + FGVC cues
│  ├─ exercises.json        86 exercises + EMG-grounded muscle-activation maps
│  ├─ foods.json            Levantine + staple foods (per 100g, NOVA class)
│  ├─ diet_modes.json       the 5 product diet modes + macro rules
│  ├─ force_vectors.json    the 6 resistance-vector taxonomy
│  ├─ coaching.json         Transtheoretical-Model coaching stages
│  └─ config.json           every engine constant + the model stack (Fable 5)
├─ packages/core/        ← deterministic engines (the math the LLM must NOT free-hand)
│  ├─ data.mjs              loads the JSON; the engines + SQL both derive from it
│  ├─ metabolic.mjs         BMR (Mifflin/Katch/Harris/Cunningham), TDEE, never-below-BMR floor
│  ├─ nutrition.mjs         5-mode macro partitioning + LBM protein floor
│  ├─ mealplan.mjs          macros → real foods (exact 3×3 linear meal solver)
│  ├─ biomechanics.mjs      force-vector → muscle activation, volume, injury/equipment filters
│  ├─ progression.mjs       1RM (Epley/Brzycki), double progression, RIR autoregulation, deloads
│  ├─ planner.mjs           machine-bound weekly plan, filled toward volume landmarks
│  ├─ safety.mjs            pain/ED screening + contraindication gate (event-only logging)
│  ├─ coaching.mjs          TTM stage detection, technique, tool surface, system prompt
│  ├─ program.mjs           ← the orchestrator: profile+gym+goal → complete program
│  ├─ types.d.ts            TypeScript definitions for editor support
│  └─ selfcheck.mjs         51 assertions proving the engines + API match the research
├─ api/                  ← serverless surface (thin handlers wrapping the engines)
│  ├─ program.mjs           POST → deterministic program (no LLM in path)
│  ├─ coach.mjs             POST → safety gate → stage → Fable 5 system prompt
│  └─ recognize.mjs         POST photo → ranked machine candidates for review
├─ sql/                  ← Postgres 16 + pgvector, Supabase-ready
│  ├─ 001_gym_schema.sql    canonical `gym.*` DDL + RLS (read-auth / write-service-role)
│  ├─ 002_public_schema.sql per-tenant `public.*` DDL + RLS (owner/member privacy wall)
│  └─ 100_seed_gym.sql      GENERATED from /data by scripts/gen-sql.mjs (474 rows)
├─ web/index.html           marketing website (hero, dual-sided, the AI, pricing)
├─ app/index.html           the clickable prototype (member app + gym + HQ dashboards)
├─ examples/                sample-program.json + .html — real orchestrator output, rendered
├─ scripts/                 gen-sql · validate-sql · data-integrity · build-web · build-example · serve
└─ .github/workflows/ci.yml runs `npm run verify` on every push
```

## Quick start

```bash
npm run verify     # data-integrity → gen SQL → 51 engine+API checks → validate SQL → build web + example
npm run app        # serve everything → http://localhost:4173
```

No dependencies — pure Node ≥ 20 and standard Postgres. `npm run verify` should end with
`✅ 51 passed, 0 failed · v0.4.0 · 40 muscles · 60 machines · 86 exercises`. Then:

- **http://localhost:4173/** — the marketing website
- **http://localhost:4173/app/** — the app prototype (now shows real catalog counts, live engine)
- **http://localhost:4173/examples/sample-program.html** — a full program, rendered from real engine output

## One call → a complete program

```js
import { buildProgram } from "./packages/core/program.mjs";
const program = buildProgram(
  { weightKg: 82, heightCm: 178, age: 29, sex: "male", bodyFatPct: 0.18,
    segmental: { leftArmKg: 3.6, rightArmKg: 3.85 } },
  { goal: "recomp", daysPerWeek: 4, dietMode: "mid_healthy", availableMachines: [...] }
);
// → energy (BMR/TDEE/target) · macros · a day of meals (0% off target) · a machine-bound
//   weekly workout filled to volume landmarks · segmental-asymmetry note · coach rationale
```

## Connect Supabase

1. Create a Supabase project (or `supabase init` locally).
2. Apply migrations in order:
   ```bash
   supabase db push   # or: psql "$DATABASE_URL" -f sql/001_gym_schema.sql \
                      #        -f sql/002_public_schema.sql -f sql/100_seed_gym.sql
   ```
   `gym.*` (canonical) + `public.*` (tenant) tables, RLS enabled, and 474 seeded
   knowledge rows land ready. The `authenticated` / `service_role` roles are Supabase
   built-ins the RLS policies use.
3. Point the app at your project URL + anon key. `machine_types`/`foods` `embedding`
   columns (pgvector) fill in via the recognition + food-ingestion loops.

## Why the JSON-first design

`data/*.json` is the source of truth; **both** the runtime engines (`import` it) and the
SQL seed (`npm run gen`) derive from it, so the database and the code can never drift.
Change a muscle activation or add a machine in one place → regenerate → done. CI enforces
it: `npm run verify` fails if the generated SQL or engine math ever breaks.

## What each research brief became

| Brief | Lands as |
|---|---|
| 1 · Gym-equipment CV (FGVC, YOLO26, edge/QAT) | `machines.json` FGVC cues · `config.vision_pipeline` · the review-queue flywheel |
| 2 · Biomechanics (vector→muscle, OpenSim, EMG) | `exercises.json` activation maps · `biomechanics.mjs` · `config.biomech_pipeline` |
| 3 · Nutrition (USDA+regional, BMR eqs, 5 modes) | `metabolic.mjs` · `nutrition.mjs` · `diet_modes.json` · `foods.json` |
| 4 · Coaching AI (QLoRA/DPO, sub-300ms voice) | `coaching.json` · `config.coach_model` (Fable 5) / `voice_pipeline` |

See [KNOWLEDGE.md](KNOWLEDGE.md) for the distilled reference the coaching AI cites.

## Status

- **Runtime-ready:** the metabolic, nutrition, biomechanics, progression, and planner
  engines run today and are covered by `npm run verify`.
- **Pipelines (specs, not runtime yet):** CV recognition, voice, and LLM fine-tuning —
  captured in `config.json` + `KNOWLEDGE.md`; they need training data + budget to build.
- **Next:** wire the prototype's Food Dr. / workout screens to the engines, then Supabase.
