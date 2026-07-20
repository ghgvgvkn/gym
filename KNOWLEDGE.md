# IRONMAP — AI Knowledge Base

Distilled from the four research briefs the founder supplied (2026-07-18). This is
the reference layer: the runtime **engines** (`packages/core`) and **DB seeds**
(`sql/`) encode the parts that must be deterministic; this doc holds the parts the
coaching LLM cites and the pipelines the team builds against. Every claim traces to
one of the four briefs.

Governing principle (unchanged from the architecture doc): **deterministic engines
own the numbers; LLMs own language, perception, and judgment at the edges.** No LLM
free-hands a set count, a calorie target, or a muscle-activation figure.

**Catalog (v0.3):** 40 muscles (with MEV/MAV/MRV volume landmarks), 60 machines, 86
exercises with EMG-grounded activation maps — all in `data/*.json`, the single source
of truth that both the engines and the SQL seed derive from. **Engines:** `metabolic`,
`nutrition`, `biomechanics`, plus **`progression`** (1RM, double progression, RIR
autoregulation, deloads) and **`planner`** (machine-bound weekly plan respecting volume
landmarks). **Model stack:** Claude 5 family, **Fable 5** as the default conversational
tier, escalating to a deeper model on safety/plan-change turns.

---

## 1 · Machine recognition (computer vision)  → `gym.machine_types`, `config.vision_pipeline`

**The problem is Fine-Grained Visual Classification (FGVC):** high intra-class
variance (same machine, different makers/colors/geometry) and low inter-class
variance (different machines, identical stacks/upholstery/tubing). Standard CNNs
confuse lat pulldown vs seated row, leg press vs hack squat, crossover vs
functional trainer.

**How we separate them — part-based attention on discriminative local regions,**
not the whole chassis. The cues are seeded in `machine_types.fgvc_cues`. Canonical
example (lat pulldown vs seated row):

| Cue | Lat pulldown | Seated row |
|---|---|---|
| Pull orientation | vertical, overhead → torso | horizontal → abdomen |
| Primary anchor | **high** pulley, above user | **low/mid** pulley, in front |
| Stabilizers | horizontal thigh pads | vertical footplates |
| AI cue | pulley housing HIGH in bbox | pulley housing LOW; flat footplates |

**Model:** YOLO26n — natively **NMS-free** (dual one-to-one assignment) and
**DFL-removed**, so ~43% faster CPU inference than YOLO11 and a clean CoreML export
(`nms=false`) that runs entirely on the Apple Neural Engine. ~2.5M params. Trained
with MuSGD + ProgLoss + STAL (small-target-aware, so a background dumbbell rack is
still caught). Benchmarks: 3.8 ms single image / 11.3 ms live on iPhone 17 Pro → 30+ FPS.

**Hierarchical head:** predict a coarse superclass first (`machine_types.superclass`,
e.g. `cable_back`) then route to the fine head — don't spend depth separating a
pulldown from a treadmill.

**Data pipeline (don't train a classifier first):**
- Bootstrap from public sets (Roboflow gym-equipment 6,620 · all-gym-equipment 4,717 · ycu8l 698) — expect **domain shift** in a specific franchise; clean aggressively.
- Proprietary data via **video frame extraction** (FFmpeg/OpenCV, ~1 fps, circumambulate each machine) + VLM pre-filter (Grounding DINO / CLIP zero-shot).
- Annotate in **CVAT** (SAM one-click masks, DeepSORT/ByteTrack temporal consistency).
- **Active learning loop:** seed-train → infer on the pool → route split-confidence frames (e.g. 45% row / 42% pulldown) to humans, auto-label the confident ones. This is exactly the gym-dashboard **review queue** — every staff "Confirm" is a training label.

**Edge deployment:** iOS → CoreML `.mlpackage`; Android → TFLite/LiteRT, MNN (~400 KB),
or NCNN. Local inference = 1–10 ms vs 50–200 ms cloud round-trip, and works in
basement gyms with no signal.

**Quantization:** use **QAT (Quantization-Aware Training)** for INT8, not PTQ. PTQ
INT8 can drop >25% accuracy on exactly the fine spatial detail FGVC depends on
(cable thickness, seat-back angle); QAT recovers near-FP32 by simulating quantization
noise during fine-tuning. FP16 is safe with minimal loss.

---

## 2 · Biomechanics — vector → muscle  → `gym.exercises`, `gym.exercise_muscle_activation`, engine `biomechanics.mjs`

Once CV names the machine, the plan engine maps its **resistance vector** to muscle
recruitment. Force-vector taxonomy (`gym.force_vectors`): axial (super/infero-inferior),
anteroposterior, posteroanterior, lateromedial, torsional. Real movements blend
vectors (a 45° incline press is axial+anteroposterior).

**Torque = lever-arm × force vector.** Max load when the limb is perpendicular to the
line of pull (90°), zero at parallel. Cam machines flatten the resistance curve for
constant tension; free weights leave dead spots. The engine uses this to judge whether
a user holds tension or uses momentum.

**Ground truth is surface EMG (%MVIC).** The vertical/horizontal pull dichotomy is the
worked example (seeded in `exercise_muscle_activation`):
- **Lat pulldown (axial, vertical):** lats prime → back **width**. Pronated grip > lats; supinated grip lifts biceps (radioulnar advantage); front-of-neck path raises prime-mover excitation incl. pec eccentric.
- **Seated row (posteroanterior, horizontal):** rhomboids + mid-traps **maximal** → back **thickness** via scapular retraction; higher core demand (rectus abdominis 20–35% MVIC) to hold an upright torso.

**OpenSim** is the offline refinement engine (research 2): scale → inverse kinematics →
inverse dynamics → static optimization (or **Moco** direct collocation) turns 3D pose +
external load into per-muscle force, solving muscle redundancy by minimizing summed
squared activations. Runtime uses the seeded activation weights; OpenSim generates the
richer dataset offline. Live pose is MediaPipe on-device.

**Segmental asymmetry** (left/right lean-mass gap from InBody) drives unilateral
programming — the depth nobody else surfaces.

---

## 3 · Nutrition  → `gym.metabolic_equations`, `gym.diet_modes`, `gym.foods`, engines `metabolic.mjs` + `nutrition.mjs`

**Energy chain (all deterministic, all in `metabolic.mjs`):**
1. **BMR** — pick by data available: **Katch-McArdle** `370 + 21.6·LBM` when InBody LBM/body-fat is present (factors out inert fat); else **Mifflin-St Jeor** `10w + 6.25h − 5·age + (♂+5 / ♀−161)`. Harris-Benedict is cross-validation only (overestimates 5–15%).
2. **TDEE** = BMR × activity (1.2 / 1.375 / 1.55 / 1.725 / 1.9). Users over-report activity — the coach challenges a claimed multiplier against described habits.
3. **Goal** — fat loss −250…−500 kcal/day (≤1 kg/wk; 7,700 kcal/kg); muscle gain +10–15%. **Hard floor: never prescribe below BMR** (enforced in code, `floorApplied`).

**Macros** via Atwater (P·4, C·4, F·9). The 5 product modes are seeded with ranges +
query constraints (`gym.diet_modes`) and executed by `nutrition.mjs`:

| Mode | Protein | Fat | Carbs | Key rule |
|---|---|---|---|---|
| Full Healthy | 25–35% | 25–35% | 35–45% | whole-food only, 0 added sugar, ≥14g fiber/1000 kcal |
| Mid Healthy (80/20) | 22–30% | 25–35% | 40–50% | ≤20% weekly kcal flexible |
| Junk Allowed (IIFYM) | 25–35% | 20–35% | 35–50% | any food if protein+fiber floors & kcal ceiling hold |
| Aggressive Recomp | 30–40% | 20–30% | 30–45% | LBM protein floor 2.4–2.8 g/kg, weekly ±100–150 kcal, fat floor 0.6 g/kg |
| Therapeutic/Recovery | 20–30% | 25–35% | 40–50% | anti-inflammatory/fermented priority; **wellness framing only** |

The **LBM protein floor** overrides the % split when higher — it exists to protect
muscle on a cut, where the percentage underfeeds protein (proven in `selfcheck.mjs`).
Meal assembly is a constrained-optimization / knapsack problem: hit the macro vector
within 5%, respect cultural coherence.

**Food data:** USDA FoodData Central (Foundation + Branded, 300k+ foods, 1,000 req/hr —
cache + watch `X-RateLimit-Remaining`; monthly ETL for corrections) **plus** regional
DBs to kill Western bias: **EMFID**, **Jordanian Food Composition Table**, **myfood24
Arabic** (~2,100 products). Switch by geolocation/preference. NOVA class flags
ultra-processed. A curated Levantine starter set (labneh, freekeh, ful, mansaf…) is
already seeded in `gym.foods`. Ramadan mode re-slots to suhoor/iftar.

---

## 4 · Coaching AI (voice + text)  → `gym.coaching_stages`, `config.coach_model` / `voice_pipeline`

**Persona = personal trainer + registered dietitian, never a diagnostician.** Grounded
in the **Transtheoretical Model** (`gym.coaching_stages`): detect stage → switch
technique. Precontemplation/Contemplation → **Motivational Interviewing** (open
questions, explore ambivalence, don't prescribe). Preparation → **SFBT** (one small
step). Action/Maintenance → behavioral activation + reinforcement.

**Training recipe (research 4):** **QLoRA** fine-tune (rank 16, NF4 4-bit base, double
quant, paged optimizer, lr 1e-5) on 200–300 high-quality coaching transcripts →
**SFT** (ChatML) → **DPO** (chosen = concise/empathetic/TTS-ready; rejected =
verbose/robotic/bulleted). **Safe-LoRA** projects weights into a safety subspace so
fine-tuning can't strip guardrails. Router: Haiku-tier default, smart-tier on
safety/plan-change/medical triggers.

**Voice — sub-300 ms budget** (human turn-gap ≈ 300 ms; miss it and it feels broken).
Streaming, overlapped stages over **WebSocket/WebRTC** (never REST per-turn):
- **STT:** Deepgram Nova-3 Arabic (17 variants) / Speechmatics AR-EN (6.3% WER on code-switch), semantic VAD, keyterm prompting for fitness vocab.
- **TTS:** SILMA / AnySpeech / VOBOX for Jordanian/Levantine/Egyptian accents; a TextChunker dispatches on sentence-end > semantic-break > word-count to cut perceived latency 50–70%; Arabic needs tashkeel inference + sun/moon-letter assimilation.
- **Code-switching** ("three sets of deadlifts wa ba'dein protein shake"): measured by Code Mixing Index; trained on Mixat, lahgtna-levantine-tts, DEAST; normalize Alef أإآ→ا, ى→ي, ة→ه.

**Safety** (`config.safety_guardrails`, shared with nutrition): pain red-flags (sharp
joint pain, chest pain, numbness, locking) → stop-now + refer; ED signals → supportive
redirect, never a stricter plan; log **event kind + severity only, never content**.

---

## Provenance

Brief 1 → §1 + `config.vision_pipeline`. Brief 2 → §2 + `config.biomech_pipeline`.
Brief 3 → §3 + `metabolic_equations`, `diet_modes`, `foods`. Brief 4 → §4 +
`coaching_stages`, `config.coach_model`/`voice_pipeline`. Full text retained in the
founder's 2026-07-18 message.
