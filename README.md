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
  hall**; larger flats get extra rooms. Furnished throughout (beds, sofas, kitchens,
  sanitary ware, dining sets…), with party walls, windows, balconies, a stair/lift
  core, entrance canopy and a rooftop with solar panels.
- **View controls:** hide the roof, explode the floors apart (dollhouse), isolate a
  single level, toggle furniture/name tags, and jump to iso / front / top cameras.

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
(`https://integrate.api.nvidia.com/v1/chat/completions`). The key stays in your
browser. If a request fails (no key / CORS), a built-in offline persona engine keeps
the dialogues flowing.

## Encounters & dialogue
When two neighbors meet, a 💬 cloud pops above their heads with model-generated
talk. **Tap the cloud** to read the full conversation. Clashing personalities and
high tempers produce **scandals** and even hallway **fights** — everything is allowed.

## Tech
Pure HTML/CSS/JS in one file. Three.js + OrbitControls loaded from a CDN. Touch
controls, responsive layout and a lightweight render path tuned for mobile GPUs.
