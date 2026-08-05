# Lead Researcher — Synthesis & Breakthrough Working Notes

## Purpose
These are the lead model's own notes. The five domain agents supply evidence;
this file develops the unifying argument and the original contribution.

## Verified anchor facts (lead-checked, not delegated)

| Fact | Value | Source |
|---|---|---|
| Human mortality rate doubling time (MRDT) | ~8 yr → α = ln2/8 ≈ 0.0866 /yr | Gompertz literature, standard |
| Naked mole-rat hazard | Does NOT increase with age across 3,299 animals / 30 yr; confirmed 2024 with ~2× data | Ruby, Smith & Buffenstein 2018 eLife 31157; reviewed preprint eLife 88057 |
| Somatic mutation rate scales inversely with lifespan | 208 crypts, 56 individuals, 16 mammal species; similar end-of-life burden across species | Cagan et al. 2022 Nature 604:517 |
| Loss of resilience / critical slowing | DOSI autocorrelation time rises with age (~2 wk recovery at 40s → >8 wk at 90s); inverse variance extrapolates to zero at 120–150 yr | Pyrkov et al. 2021 Nat Commun 12:2765 |
| Temporal scaling | Diet, temperature, oxidative stress, hsf-1, hif-1, daf-2, age-1, daf-16 all collapse onto ONE universal survival curve by rescaling the time axis | Stroustrup et al. 2016 Nature 530:103 |
| Strehler–Mildvan correlation is largely artifact | Least-squares Gompertz fitting is ill-posed; yields a *degenerate manifold* of (A, α) | Tarkhov/Fedichev; Burger & Missov 2016; PNAS 2025 "Mathematical artifacts in slope–intercept correlations" |
| No epigenetic clock is a validated surrogate endpoint | Not qualified by any regulator; responsiveness ≠ surrogacy | multiple reviews |
| Life-expectancy gains are decelerating | 8 longest-lived countries + HK + US, 1990–2019; P(survive to 100) unlikely to exceed ~15% F / ~5% M | Olshansky et al. 2024 Nat Aging |

## THE CENTRAL ARGUMENT

### Step 1 — Two kinds of intervention, and only one of them compounds

Gompertz hazard: μ(t) = A·e^(αt)

**Offset intervention** — divides hazard by constant k at every age:
    μ'(t) = (A/k)·e^(αt) = A·e^(α(t − ln k/α))
which is *exactly* a backward shift in age of
    **Δt = ln(k)/α = MRDT · log₂(k)**

**Rate intervention** — reduces α itself by factor s: the entire aging timescale stretches.

### Step 2 — THE LOGARITHMIC TRAP (the key quantitative result)

Because Δt = MRDT·log₂(k), benefit from *any* hazard-multiplying intervention is
**logarithmic in effort**, with the exchange rate fixed by the Gompertz slope:

> **Halving all-cause mortality at every age buys exactly one MRDT ≈ 8 years. No more.**

Consequences (α = 0.0866/yr):
- 2× hazard reduction  → ~8.0 yr
- 10× →  ~26.6 yr
- 100× → ~53.2 yr
- 1000× → ~79.8 yr
- To reach a ~150 yr median you need ≈10^5-fold hazard suppression **at every age**.

### Step 3 — This *derives* the cause-deleted life-table puzzle in one line
If a cause contributes fraction f of hazard at all ages, eliminating it gives
    Δt = −ln(1−f)/α
- f = 0.20 (all cancer) → **≈2.6 yr**  (published cause-deleted estimates ≈3 yr)
- f = 0.30 (all CVD)   → **≈4.1 yr**  (published ≈4 yr)

The model reproduces the demographic literature from first principles.
The reason curing entire disease categories buys so little is not medical — it is
the Gompertz exponent. *Caveat to state explicitly:* cause shares are age-dependent
and competing risks make the exact calculation more subtle; this is a first-order model.

### Step 4 — Why this reframes the whole field
Essentially every intervention with real human evidence — statins, BP control,
smoking cessation, exercise, vaccination, senolytics, GLP-1s — is an **offset**.
They are trapped in the logarithm. Meanwhile **no intervention has been demonstrated
to reduce α in humans**, and the naked mole-rat proves α is not a physical constant:
it is a species-tunable parameter that evolution has already set to ~0 at least once.

**So: the ceiling is not thermodynamic. It is that we are pushing on the wrong parameter.**

### Step 5 — The measurement crisis (why the field can't tell the difference)
1. Gompertz (A, α) are **statistically non-identifiable** from typical survival data —
   least-squares fitting yields a degenerate manifold. So "this drug slowed aging" claims
   based on fitted α are usually unsupported.
2. Aging clocks measure **state**, not **rate**, and are trained on chronological age,
   so they cannot in principle certify a rate change; none is a validated surrogate.
3. Therefore the field's two main instruments are both blind to the one parameter that matters.

## MY ORIGINAL CONTRIBUTIONS (be honest about what is new vs synthesis)

**Contribution A — The Offset/Rate Ledger + Logarithmic Trap constant.**
The Gompertz shift equivalence is known in demography; framing it as a universal
*exchange rate* (one MRDT per halving) that bounds every offset intervention, and using
it to unify the cause-deleted puzzle with geroscience intervention results, is the synthesis.

**Contribution B — The Q–Q Shape Test (a concrete methodological fix).**
Gompertz (A, α) are non-identifiable, but the offset-vs-rate distinction *is* identifiable
non-parametrically. Regress treated quantiles on control quantiles:
    q_treated(p) = λ·q_control(p) + Δ
- Pure rate change (time rescaling): λ > 1, Δ ≈ 0 — line through the origin.
- Pure offset: λ ≈ 1, Δ > 0 — unit slope, positive intercept.
Report **both λ and Δ with confidence intervals** as the mandatory summary of every
lifespan experiment, replacing "median lifespan +X%". This sidesteps the degenerate
Gompertz manifold entirely because it never fits A and α separately.
Stroustrup used rescaling collapse; the addition here is the *two-parameter discriminating*
version and the proposal to make it a reporting standard.

**Contribution C — τ as the in-vivo rate readout (the trial design).**
Survival trials can't identify rate in humans (you'd need decades and deaths).
But critical slowing down gives a rate observable *without* deaths: the recovery time
constant τ of physiological perturbations (Pyrkov's DOSI autocorrelation).
Under critical slowing, τ(age) rises and its divergence sets the dynamic limit.
**Prediction/criterion: a genuine rate intervention must reduce dτ/dage (the slope),
not merely lower τ at a point.** A drug that lowers τ once is an offset in disguise.
This is measurable per individual in weeks from wearables + serial CBC — turning an
intergenerational question into a within-subject one.

**Contribution D — The falsification test that discriminates the theories.**
Apply the Q–Q test + dτ/dage to the naked mole-rat vs mouse, and to any candidate
geroprotector. Prediction: mouse rapamycin will show λ>1 (partial rate effect);
senolytics and NAD+ precursors will show λ≈1, Δ>0 (pure offset). If senolytics show
λ>1 the framework is wrong. That is a real falsifiable claim.

## Honest limitations to state in the document
- WebFetch was blocked in this environment; full texts were not retrievable.
  All figures come from search-surfaced abstracts/summaries and must be verified
  against the linked primaries before any use.
- The session web-search budget (200 calls) was exhausted, so coverage is bounded.
- The Gompertz two-parameter model is itself an approximation (late-life plateaus,
  heterogeneity/frailty, Makeham term). The offset/rate ledger inherits those limits.
- τ-divergence (120–150 yr) is an *extrapolation* from data that stops well before
  those ages, and extrapolating a linear fit to its zero-crossing is exactly the kind of
  move this document criticises elsewhere. Must be flagged, not hidden.
