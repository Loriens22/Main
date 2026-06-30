# 🏢 Co-op 3D — Apartment Building & AI Neighbors

A single-file, mobile-friendly 3D web app (Three.js) that builds a realistic modern
4-storey housing co-op and lets you populate it with AI-driven neighbor characters
who walk around, meet, talk, gossip — and occasionally fight.

Open **`index.html`** in any modern browser. No build step, no server required.

## The building
- **4 storeys** built to real residential proportions (2.8 m clear ceilings,
  0.2 m slabs, code-sized rooms, 24 × 13 m footprint).
- **Floors 1–3:** three flats each (two 2-bedroom corner flats + one 1-bedroom).
- **Top floor:** **two large maisonettes** — double-height duplexes with internal
  staircases, mezzanine bedrooms and a gallery overlooking the living room.
- Every flat meets code: **≥ 1 bedroom, 1 bathroom with WC, 1 kitchen, 1 living
  hall**; larger flats get extra rooms — all furnished (beds with duvets, sofas,
  bookshelves, TV units, kitchens with islands, dining sets, sanitary ware, rugs,
  lamps, plants, wall art…).
- **Highly detailed exterior:** procedural plaster / wood / tile / brick / grass /
  paving textures, a base plinth, string courses between floors, corner & mid
  pilasters, protruding window sills, mullioned glazing, **glass balconies with
  planters**, window flower boxes, rainwater downpipes, a glazed entrance lobby with
  canopy, and a rooftop with parapet, solar array, HVAC, water tank, skylights,
  flue and vent pipes. Landscaped grounds: lawn, paved plaza, hedged path, benches,
  lamp posts, flower beds, trees and a small car park with cars.
- **See-through controls:** one-tap **Peek inside (dollhouse)**, plus a
  see-through-walls slider, a section-cut slider, ceilings/roof/furniture/name-tag
  toggles, explode-floors, single-level isolation and iso/front/top/corner cameras.

## Neighbors (heroes)
Tap **＋ New neighbor** to create a character:
- **Body shape** (slim / average / heavy / tall / short / athletic) + height & build sliders
- **Clothes & looks** — skin, shirt, trousers, hair, hat
- **Name**, **walking speed**, **personality** and **temper**
- **Choose which flat** they move into (or random)
- **🔌 NVIDIA API section** (per-hero): endpoint, model, API key and **custom
  instructions** — all reviewed on a confirmation step *before* the hero is created
  and placed in the building.

The default endpoint targets NVIDIA's OpenAI-compatible API
(`https://integrate.api.nvidia.com/v1/chat/completions`, default model
`meta/llama-3.1-70b-instruct`). The key stays in your browser and is remembered
between heroes.

> **Important — CORS:** NVIDIA's endpoint does **not** send CORS headers, so a
> browser cannot call it directly; the request is blocked and the hero falls back
> to the offline engine. To get true model-generated dialogue, put a **CORS proxy**
> prefix in the hero's API settings (your own, or a public one — it will see your
> key). Use the **Test connection** button: it tells you exactly whether you're
> connected or why not. Reasoning-model output (`<think>…</think>`) is stripped
> automatically, and each transcript shows which engine produced it.

## Encounters & dialogue
When two neighbors meet, a 💬 cloud pops above their heads with model-generated
talk. **Tap the cloud** to read the full conversation. Clashing personalities and
high tempers produce **scandals** and even hallway **fights** — everything is allowed.

## Tech
Pure HTML/CSS/JS in one file. Three.js + OrbitControls loaded from a CDN. Touch
controls, responsive layout and a lightweight render path tuned for mobile GPUs.
