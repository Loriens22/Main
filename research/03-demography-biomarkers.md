# 03 — Human Demography, Mortality Mathematics, Aging Biomarkers, and the Measurement Problem

**Agent 3 of 5 · Research fleet on realistic extension of human lifespan and healthspan**
**Compiled 2026-08-04**

---

## 0. Methodological preamble — read this before using any number below

### 0.1 Environment constraints that shaped this report

Two hard constraints applied:

1. **`WebFetch` was blocked at the network proxy for every external host tested** (nature.com, science.org, biorxiv.org, journals.plos.org, arxiv.org, en.wikipedia.org, tandfonline.com, city st georges .ac.uk — all returned HTTP 403 at the egress proxy). I could not read a single primary full text directly.
2. **The session `WebSearch` budget (200 calls, shared across the 5-agent fleet) was exhausted after 24 of my queries.** I therefore could not cross-check every number with the two independently-worded searches the protocol requires.

Consequence: **most quantitative claims below are sourced from search-result extractions of abstracts, press releases, and secondary summaries, not from primary full texts I personally read.** Every claim is tagged accordingly. Nothing has been invented. Where I could not source a number, the field is `null` and the text says so.

### 0.2 Source-confidence tags used throughout

| Tag | Meaning |
|---|---|
| `primary_abstract` | Extracted from the paper's own abstract/results as surfaced in search, attributable to the authors |
| `secondary` | From a press release, institutional page, review, or reputable news summary of the primary |
| `derived` | Computed by me from stated inputs; the derivation is shown and reproducible |
| `uncertain` | I believe this is correct from background knowledge but **could not verify it in this session**. Treat as a lead to check, not as evidence. |
| `null` | Not obtained. Do not fill this in from memory. |

**Instruction to the lead researcher: do not promote any `uncertain` item into the synthesis without independent verification.** They are flagged individually in §10.

### 0.3 On the modelling

All Gompertz arithmetic in this report was computed by me in pure Python (scripts: `gompertz.py`, `gompertz2.py`, `gompertz3.py`, `gompertz4.py` in the session scratchpad; the code is short enough to be re-derived from the formulas given). The model is a **two-parameter Gompertz plus a Makeham constant**, numerically integrated at daily resolution. It is calibrated to published anchor hazards, not fitted to raw Human Mortality Database extracts — HMD was not reachable. **The model is an illustrative instrument for comparative arithmetic, not a fitted life table for any real country.** Its purpose is to answer "what does reducing X do relative to reducing Y", a question for which the absolute calibration matters much less than the structure.

Critically, I present **two calibrations** because the choice matters and hiding it would be dishonest (§1.4).

---

## 1. Mortality mathematics

### 1.1 The law

Benjamin Gompertz (1825) observed that the adult force of mortality rises approximately exponentially with age. William Makeham (1860) added an age-independent term. The combined law:

$$\mu(x) \;=\; \underbrace{M}_{\text{Makeham}} \;+\; \underbrace{A\,e^{\alpha x}}_{\text{Gompertz}}$$

where μ(x) is the *force of mortality* (instantaneous hazard, units yr⁻¹) at attained age *x*.

Three parameters, three completely different biological meanings:

| Parameter | Name | Interpretation | What reduces it |
|---|---|---|---|
| **M** | Makeham / extrinsic term | Age-independent background risk — accidents, homicide, most acute infection, war | Public health, seatbelts, antibiotics, gun control, road safety |
| **A** | Gompertz intercept (initial mortality rate, IMR) | Vulnerability level at the reference age; a vertical scaling of the senescent hazard | Better baseline health, risk-factor control, medical treatment of age-related disease, curing individual diseases |
| **α** | Gompertz slope / rate of actuarial ageing | How fast vulnerability *compounds* with age | **Nothing yet demonstrated in humans** |

**Only α is a rate of ageing.** M and A are levels. This distinction is the load-bearing wall of the entire longevity debate and it is routinely elided in press coverage.

### 1.2 Mortality rate doubling time (MRDT)

MRDT is the time for the senescent hazard to double:

$$\text{MRDT} = \frac{\ln 2}{\alpha} \qquad\Longleftrightarrow\qquad \alpha = \frac{\ln 2}{\text{MRDT}}$$

Published human values: *"In modern human populations, the rate of Gompertz aging ranges from 0.07 to 0.09 per year of age, which corresponds to a mortality rate doubling time of eight years for most human populations"* and *"when Gompertz–Makeham curves are fitted to adult human mortality, estimated values of α are often around 0.085 per year, which corresponds to a doubling time of about eight years."* [`secondary`; Gompertz–Makeham Wikipedia entry and the Strehler–Mildvan literature surfaced in search]

Derivation table (`derived`):

| MRDT (yr) | α (yr⁻¹) |
|---|---|
| 7.0 | 0.09902 |
| 7.5 | 0.09242 |
| **8.0** | **0.08664** |
| 8.5 | 0.08155 |
| 10.0 | 0.06931 |
| 12.0 | 0.05776 |
| 16.0 | 0.04332 |

The canonical "~8 years" figure applies best to the middle-adult window (roughly 30–80). At ages 85–105 the empirical curve is somewhat **steeper**, implying an effective MRDT nearer 7 years — see §1.4.

### 1.3 The Strehler–Mildvan correlation and the compensation law — and why it is partly an artifact

Strehler & Mildvan (1960) reported an inverse relationship between A and α across populations: populations with high initial mortality show shallow slopes, and vice versa, so that extrapolated mortality curves converge at a "species-specific" age near 95–100. This is the **compensation law of mortality** [`secondary`].

**This is a named error target** (§7.8). Tarkhov, Menshikov & Fedichev showed that *"the Strehler–Mildvan correlation is a degenerate manifold of Gompertz fit"* — i.e. the negative A–α correlation arises mechanically from the geometry of fitting a two-parameter exponential to data over a restricted age window, because the estimates of ln A and α are strongly negatively correlated in the likelihood. Much of the "compensation effect" is estimation covariance, not biology. [`primary_abstract`, J Theor Biol 2017 / bioRxiv 064477]

Practical implication for this study: **any claim that an intervention "reduced the rate of ageing" based on a fitted α from a narrow age range must report the joint uncertainty of (ln A, α), not marginal confidence intervals.** Almost none do.

### 1.4 Calibration — and an honest disclosure about it

I calibrated three variants. All use M in the range 0.0006–0.0008 yr⁻¹ (background non-senescent hazard in a modern rich country).

| Calibration | Anchors | α (yr⁻¹) | MRDT | A (yr⁻¹) | e₀ | P(reach 100) | P(reach 110) |
|---|---|---|---|---|---|---|---|
| **A "textbook"** | μ(65)=0.010, μ(85)=0.055 | 0.08524 | 8.13 y | 3.925×10⁻⁵ | 81.19 | 9.2% | 1 in 248 |
| **B "old-age anchored"** | μ(65)=0.010, μ(100)=0.300 | 0.09718 | 7.13 y | 1.806×10⁻⁵ | 80.19 | 4.2% | 1 in 3,785 |
| **C "HMD-like"** | μ(70)=0.017, μ(95)=0.185 | 0.09549 | 7.26 y | 2.126×10⁻⁵ | 80.09 | 4.2% | 1 in 3,565 |

**Disclosure:** Calibration A reproduces the textbook MRDT of ~8 years and a realistic e₀ of 81.2, but it **badly over-predicts extreme survival** — it implies 9% of a birth cohort reaches 100 and 1 in 248 reaches 110. The real figures for the best modern cohorts are on the order of 2–3% reaching 100 and roughly 1 in several thousand reaching 110. Calibration A is therefore wrong in the tail.

Calibrations B and C are anchored on old-age hazards and are far more realistic in the tail (1 in ~3,600–3,800 reach 110), at the cost of an MRDT of ~7.1–7.3 years rather than 8.1.

**This discrepancy is itself a finding, and it should be stated plainly in the synthesis:** the human hazard curve between 85 and 105 is *steeper* than a Gompertz fitted to the 30–85 window. Reality is worse than the textbook. Any argument built on the "8-year doubling time" that extrapolates into the 90s and 100s will systematically over-estimate how many people survive there.

**All headline scenario arithmetic below uses Calibration B**, the conservative, tail-realistic one.

### 1.5 The three levers, quantified

Baseline: Calibration B, e₀ = 80.19 years.

| Intervention | e₀ | Δe₀ | P(reach 100) | P(reach 110) |
|---|---|---|---|---|
| **Baseline** | 80.19 | — | 4.24% | 1 in 3,785 |
| **Makeham eliminated entirely** (M → 0: every accident, homicide, and acute non-age-related death abolished) | 81.32 | **+1.13** | 4.49% | 1 in 3,551 |
| Makeham halved | 80.75 | +0.56 | 4.36% | 1 in 3,666 |
| **Gompertz intercept A halved** | 86.78 | **+6.59** | 19.8% | 1 in 64 |
| Gompertz intercept A cut 10-fold | 102.07 | +21.88 | 68.1% | 1 in 2.5 |
| **Gompertz slope α reduced 5%** | 83.73 | **+3.54** | 12.6% | 1 in 166 |
| **Gompertz slope α reduced 10%** | 87.62 | **+7.43** | 25.4% | 1 in 24 |
| **Gompertz slope α reduced 20%** | 96.69 | **+16.50** | 53.5% | 1 in 3.6 |
| Gompertz slope α reduced 30% | 108.05 | +27.86 | 73.1% | 1 in 1.7 |
| Gompertz slope α halved (MRDT 14.3 y) | 142.38 | +62.19 | 88.5% | 85.2% |

**Read that table carefully. It contains the single most important quantitative fact in this section:**

> **Abolishing 100% of extrinsic mortality — every car crash, every murder, every fatal fall, every acute infection unrelated to ageing — buys approximately 1.1 years of life expectancy in a modern rich country.**

The Makeham term is already almost fully harvested. This is why further public-health gains in rich countries are small, and why the 20th century's spectacular gains cannot be repeated: those gains were mostly the *removal of the Makeham term and of early-life mortality*, which was a one-time windfall.

### 1.6 Why only slope reduction is "anti-ageing" — the geometry

Reducing A by a factor *k* is **exactly equivalent to translating the entire mortality curve to the right** by

$$\Delta x = \frac{\ln k}{\alpha}$$

`derived`. For Calibration B (α = 0.09718): halving A shifts the curve right by ln2/α = **7.13 years**; a 10-fold reduction shifts it by ln10/α = **23.7 years**.

Reducing α does not translate the curve — it **rotates and flattens it**, and the benefit compounds without bound with age. Concretely, the age at which the hazard reaches 0.5 yr⁻¹ (a useful "wall" marker; Calibration A shown for continuity with the textbook curve):

| Scenario | Age at which μ = 0.5 yr⁻¹ |
|---|---|
| Baseline | 110.9 |
| A halved | 119.0 |
| A cut 10× | 137.9 |
| α reduced 10% | 123.2 |
| α reduced 20% | 138.6 |
| α halved | 221.8 |

A 20% slope reduction and a 10-fold intercept reduction move the wall to roughly the same place — but the 10-fold intercept reduction requires abolishing 90% of all age-related mortality at every age, which is a far larger ask than slowing the compounding by one fifth. **Slope reduction is enormously more efficient per unit of biological effect, and it is the only lever that does not saturate.**

The saturation is the key asymmetry:
- **Intercept:** each successive halving of A buys the *same* ~6.6 years. You must keep halving forever. Halving is a fixed 50% cut in all age-related mortality — repeatedly.
- **Slope:** each successive 10% cut in α buys *more* than the last (+7.4, then +9.1, then +11.4 …), because you are compounding a compounding process downward.

### 1.7 What it would take, stated as a requirement

Two equivalent routes to a target e₀ (Calibration B, `derived`):

| Target e₀ | Route 1: cut all-cause hazard at **every** age by | Route 2: cut α by (new MRDT) |
|---|---|---|
| 85 | 36.6% | 6.7% (7.6 y) |
| 90 | 60.7% | 12.8% (8.2 y) |
| 95 | 75.7% | 18.3% (8.7 y) |
| **100** | **85.0%** | **23.2% (9.3 y)** |
| 110 | 94.4% | 31.5% (10.4 y) |
| 120 | 97.9% | 38.4% (11.6 y) |
| 150 | 99.9% | 53.1% (15.2 y) |

**To reach a life expectancy of 100 by conventional medicine you must delete 85% of all deaths at every age simultaneously.** That is: all cancer, all cardiovascular disease, all dementia, all diabetes, all respiratory disease, all kidney disease — and then some. Even that is not quite enough, because e₀ = 100 requires 85% and the six largest causes together are under 70% of deaths.

Alternatively, slow the ageing rate by 23%. That is a much smaller-sounding number and a much harder thing to do, because nobody has ever done it in a human by any amount that has been demonstrated to persist.

### 1.8 Rectangularization of the survival curve

"Rectangularization" describes the 20th-century transformation of l(x) from a concave decay into a shape approaching a rectangle: near-100% survival to old age, then a steep drop. It is the visual signature of Makeham-term removal plus early-life mortality removal, *with the Gompertz slope unchanged*.

Documented anchors [`secondary`, CDC/NCHS Aging Trends and NCHS historical life tables]:

| Cohort/period | % surviving to 65, male | % surviving to 65, female |
|---|---|---|
| US 1900 | 39% | 43% |
| US 2002 | 78% | 86% |

Alongside: US e₀ rose 47.3 (1900) → 68.2 (1950) → 76.83 (1999–2001) → 79.0 (2024).

**The critical demographic point, and it is not widely understood:** rectangularization has a floor. As l(x) approaches a rectangle, further removal of premature death adds progressively less to e₀, and the age at the "drop" — the modal age at death — is governed by α, which has not moved. Manton & Tolley (1991) and the more recent "maximum inner rectangle" reformulation (Population Studies, 2018) formalize this. In Calibration B the interquartile range of adult age at death is roughly 19 years wide and the median adult age at death is ~86 — the curve is already substantially rectangular, and the residual variance is dominated by the Gompertz tail, not by premature death.

**Corollary: the compression of mortality into old age is nearly complete in rich countries. The remaining variance is ageing itself.**

---

## 2. Late-life mortality plateaus

### 2.1 The claim: Barbi et al. 2018

Barbi, Lagona, Marsili, Vaupel & Wachter, *Science* 360:1459–1462 (2018), doi:10.1126/science.aat3119.

- Data: **all Italian residents aged 105+ between 2009 and 2015**, birth cohorts 1896–1910. **n = 3,836 documented cases.** [`primary_abstract`]
- Finding: the hazard **plateaus after age 105**. Semi-supercentenarians (105–109) had approximately a **50/50 chance of dying within the year** and a **remaining life expectancy of ~1.5 years**, and the same held for 110-year-olds. [`primary_abstract` / `secondary` press summary]
- Authors' claim: *"the estimates are free from artifacts of aggregation that limited earlier studies and provide the best evidence to date for the existence of extreme-age mortality plateaus in humans."* [`primary_abstract`]

Note the data-quality argument the authors made in their own favour: Italy's ISTAT-based validation used individual death certificates rather than aggregated age groups, which removes one class of artifact (aggregation) but **not** the class Newman and the Gavrilovs care about (age ascertainment).

### 2.2 The arithmetic of a plateau

If the hazard is genuinely constant at h beyond 105, then remaining life expectancy is exactly 1/h and survival is exponential (`derived`):

| Force of mortality h | Annual q = 1−e⁻ʰ | Remaining LE = 1/h | P(survive +10 y) | P(survive +15 y) |
|---|---|---|---|---|
| 0.475 yr⁻¹ | 0.378 | 2.11 y | 8.7×10⁻³ | 8.1×10⁻⁴ |
| 0.50 yr⁻¹ | 0.393 | 2.00 y | 6.7×10⁻³ | 5.5×10⁻⁴ |
| 0.70 yr⁻¹ | 0.503 | 1.43 y | 9.1×10⁻⁴ | 2.8×10⁻⁵ |

**A "plateau" is not immortality and it is not even good news.** A flat 50%-per-year hazard means a person at 105 has a ~1 in 1,200 chance of reaching 120. The plateau's significance is theoretical (it bears on whether there is a hard wall) not practical.

The Barbi finding as reported — "50/50 chance of dying within the year" with "remaining life expectancy 1.5 years" — is **internally slightly inconsistent**: q = 0.5 implies h = −ln(0.5) = 0.693 and remaining LE = 1/0.693 = **1.44 years**, whereas remaining LE of 1.5 years implies h = 0.667 and q = 0.487. These are close enough to be a rounding/reporting artifact in the secondary summaries rather than an error in the paper, but the study should quote the paper's own hazard estimate, which I could not retrieve (`null`).

### 2.3 The counter-argument I: Newman 2018 — plateaus as error artifacts

Newman SJ, *"Errors as a primary cause of late-life mortality deceleration and plateaus"*, **PLOS Biology 16(12):e2006776** (20 Dec 2018), doi:10.1371/journal.pbio.2006776.

Core claims [`primary_abstract`]:
- **Age estimation and cohort-blending errors introduced at rates below 1 in 10,000 are sufficient to produce late-life deceleration and plateaus.**
- In humans, **observed error rates of birth and death registration predict the magnitude of late-life mortality deceleration.**
- Conclusion: human late-life plateaus are *"largely, if not entirely, artifacts of error processes"* and can be explained without invoking biological, heterogeneity, or evolutionary models.

Newman published a paired critique of Barbi specifically: **"Plane inclinations: A critique of hypothesis and model choice in Barbi et al."**, PLOS Biology, doi:10.1371/journal.pbio.3000048.

### 2.4 I reproduced the mechanism

To check that this is not hand-waving, I built the contamination model directly (`derived`, script `gompertz3.py`).

Setup: a fraction ε of the cohort alive at 65 carries an age **overstatement** drawn uniformly on (0, 20] years. Their *true* hazard at reported age *a* is μ(a − D). The observed hazard at reported age *a* is the exposure-weighted mean of the true hazards of everyone whose record says *a*.

Result — observed hazard at reported age, Calibration A baseline:

| ε (fraction of records overstated) | μ̂(100) | μ̂(105) | μ̂(110) | μ̂(115) | μ̂(120) |
|---|---|---|---|---|---|
| 0 (truth) | 0.198 | 0.303 | 0.464 | 0.710 | 1.087 |
| 10⁻⁴ | 0.198 | 0.303 | 0.463 | 0.698 | 0.760 |
| 10⁻³ | 0.198 | 0.302 | 0.454 | 0.609 | 0.373 |
| 10⁻² | 0.194 | 0.288 | 0.388 | **0.342** | 0.277 |
| 10⁻¹ | 0.161 | 0.206 | 0.214 | 0.210 | 0.266 |

Apparent MRDT between reported ages 105 and 115:

| ε | apparent MRDT |
|---|---|
| 0 | 8.15 y (truth) |
| 10⁻⁴ | 8.31 y |
| 10⁻³ | 9.87 y |
| **10⁻²** | **40.1 y** |
| 10⁻¹ | 416 y (a flat plateau) |

**Threshold: ε ≈ 1.7% of records overstated is sufficient to flatten the 105→115 hazard ratio to 1.0 — i.e. to manufacture a perfect plateau out of a pure, unbroken Gompertz.**

Two honest observations:
1. My simplified model needs ε ≈ 1–2%, not Newman's headline "below 1 in 10,000". Newman's model also includes **cohort blending** (whole birth cohorts contaminating each other) and species where the effect is stronger; my single-mechanism model is a lower bound on the sensitivity.
2. **1–2% is a trivially low error rate for this data.** Newman reports that **only 18% of "exhaustively" validated supercentenarians have a birth certificate, falling to zero percent in the USA** (§4.2). An error rate of 1.7% in a population where 82% of records lack the primary document is not a worst case — it is optimistic by an order of magnitude.

Why the effect is so violent: it is a **base-rate problem**. Under Calibration B, only 1 in 3,785 births reaches 110 and 1 in 626,000 reaches 115. Any misclassification process that pushes younger people upward has an enormous reservoir to draw from and a vanishingly small genuine population to contaminate. At reported age 115 the erroneous records outnumber the genuine ones unless the error rate is below about 10⁻⁵.

### 2.5 The counter-argument II: Gavrilov & Gavrilova

Gavrilov LA & Gavrilova NS, *"Late-life mortality is underestimated because of data errors"*, **PLOS Biology 17(2):e3000148** (2019), doi:10.1371/journal.pbio.3000148.

Their position [`primary_abstract` / `secondary`]:
- Longevity records at ages 105+ **are often incorrect** and lead to spurious deceleration and plateaus.
- **Mortality deceleration is best observed in older, less accurate data; with more recent and more reliable data there is persistent mortality growth with age.** This is the crucial diagnostic: if the plateau were biology, it would not shrink as data quality improves. It does.
- Using IDL and Gerontology Research Group data, mortality after 110 **does not stay constant, especially in more recent data** (Gavrilova et al. 2017; Gavrilova & Gavrilov 2020).
- They also report *"Gompertzialization"* of the old-age mortality trajectory as a new trend (Gerontology 65(5):451, Karger) — i.e. the historical deceleration is disappearing as registration improves.
- Their prescription: *"after age 105 years, longevity claims should be considered as extraordinary claims that require extraordinary evidence; traditional methods of data cleaning are insufficient; new strict methodologies need to be developed; and all mortality estimates for ages above 105 years should be treated with caution."*

They also published a formal treatment of estimation uncertainty at extreme ages: *"The curse of the plateau. Measuring confidence in human mortality estimates at extreme ages"*, Theoretical Population Biology (2022), doi:10.1016/j.tpb.2022.01.002.

A further review — Alvarez, Villavicencio et al., *"The question of the human mortality plateau"*, **Demographic Research 48(11)** — surveys the state of the dispute [`secondary`].

### 2.6 Adjudication

On methodological grounds, **the error-artifact explanation currently has the stronger evidential position**, for three reasons:

1. **It makes a differential prediction that is confirmed.** The error hypothesis predicts that deceleration weakens as registration quality improves. Gavrilov & Gavrilova report exactly this. The biological hypothesis predicts no such gradient, and offers no explanation for it.
2. **It requires an implausibly small parameter.** As my own reproduction shows, ~1–2% record contamination suffices. The documented contamination in this data is far larger (§4).
3. **The alternative biological explanations are not independent of the data problem.** Frailty heterogeneity (gamma-Gompertz; Vaupel, Manton & Stallard 1979) genuinely *does* produce deceleration in a heterogeneous population — but heterogeneity in *measured age* is mathematically indistinguishable from heterogeneity in *frailty* given only the observed hazard. You cannot separate them without validated ages, which is precisely what is missing.

**However, this is not settled, and the study must not present it as settled.** Barbi et al.'s Italian data were individually validated by ISTAT and the authors argue the ascertainment problem is materially smaller in Italy than in the US or Okinawa. If the plateau survives in a fully birth-certificate-validated population, that is real information. The correct verdict for the synthesis is: **the plateau is unproven, its most parsimonious explanation is measurement error, and the question is answerable only with a registry designed for the purpose (§9.3).**

---

## 3. Is there a hard limit to human lifespan?

### 3.1 The claim: Dong, Milholland & Vijg 2016

Dong X, Milholland B, Vijg J. *"Evidence for a limit to human lifespan."* **Nature 538:257–259** (2016), doi:10.1038/nature19793.

Claims [`primary_abstract` / `secondary`]:
- Improvements in survival with age decline after 100.
- The **maximum reported age at death (MRAD)** of the world's oldest person **has not increased since the 1990s**.
- Inferred a limit near **115 years**, with 125 as an absolute outer bound.

### 3.2 What was wrong with it — the segmented regression

This is **Named Error #1** and it is the cleanest statistical error in the whole field.

**The procedure:** they plotted MRAD by calendar year (from the IDL, principally France, Japan, UK, USA), **inspected the plot visually**, saw an apparent levelling around 1995, **split the series at 1995**, fitted ordinary least squares separately to the pre- and post-1995 segments, obtained a positive slope before and a negative slope after, and reported the negative post-1995 slope as evidence of a ceiling.

**Five distinct defects:**

1. **Post-hoc breakpoint selection invalidates the inference.** The 1995 breakpoint was *"on the back of a visual inspection that appeared to show a leveling off around this year"* [`secondary`, Nature news and Salon coverage of the critiques]. When a changepoint is chosen to maximise the contrast between segments, the resulting test statistic no longer has its nominal null distribution. The p-value is meaningless unless the search over breakpoints is accounted for — by a Davies test, a supF/sup-Wald test with the appropriate non-standard critical values, or a Bayesian changepoint model with the breakpoint as a parameter carrying a prior.

2. **OLS is the wrong likelihood for an extreme order statistic.** MRAD is a yearly *maximum*. Under an exponential tail above 110 with hazard h, the yearly maximum follows a **Gumbel** distribution — right-skewed, non-normal, with scale β = 1/h. Least squares assumes symmetric Gaussian errors. `derived`: for h = 0.5 yr⁻¹, β = 2.00 y and SD(MRAD) = π/√6 · β = **2.57 years per year**; for h = 0.7 yr⁻¹, SD = **1.83 years**. Fitting a straight line to a Gumbel-distributed series with OLS both mis-states the standard errors and mis-weights the outliers.

3. **The series is dominated by a single observation.** Jeanne Calment (122y164d, d. 1997) is a ~7-year outlier above the next-highest record. She sits astride the chosen breakpoint. The pre-1995 "rise" and the post-1995 "fall" are both largely her. **Removing one data point flips the conclusion** — this is the definition of a non-robust result.

4. **MRAD is confounded with exposure.** `derived`: for an exponential tail with hazard h, the expected annual maximum age is 110 + (ln n + γ)/h where n is the number of deaths above 110 and γ ≈ 0.5772. **Doubling the number of supercentenarians adds only ln2/h ≈ 1.0–1.4 years to the expected record.** Conversely, MRAD is *logarithmically* insensitive to population growth, so a flat MRAD over a period when the supercentenarian population was still small tells you almost nothing about the underlying distribution. To move the record from 115 to 122 at h = 0.5 requires roughly a 33-fold increase in n. Any analysis of MRAD that does not condition on the size of the at-risk population is uninterpretable.

5. **Heterogeneous data coverage over time.** The IDL's national coverage changed over the study window; Japan's supercentenarian ascertainment improved markedly. A trend in reporting is indistinguishable from a trend in biology.

**Power context** (`derived`): with SD ≈ 1.8–2.6 y and ~20 post-1995 observations, SE(OLS slope) ≈ 0.07–0.10 y/yr. So a genuine trend of a few tenths of a year per year *would* be nominally detectable — the fatal problem is not raw power, it is that (a) the breakpoint was chosen from the data and (b) the estimate is not robust to the single most influential point.

**What should have been done instead (§9.5):** fit a generalized Pareto / generalized extreme value model to threshold exceedances above 110 and test the sign of the extreme-value index γ. γ < 0 ⟺ finite right endpoint; γ ≥ 0 ⟺ no finite endpoint. This is a single, pre-specified, one-degree-of-freedom test with correct asymptotics, and it uses every supercentenarian death rather than one maximum per year.

### 3.3 The five 2017 *Nature* rebuttals

All published as Brief Communications Arising, *Nature* 546 (2017):

| # | Title | DOI | Core objection [`primary_abstract`/`secondary`] |
|---|---|---|---|
| 1 | Hughes B, Hekimi S — *Many possible maximum lifespan trajectories* | 10.1038/nature22786 | Many trajectories fit the data equally well; the segmented fit is one arbitrary choice among many |
| 2 | Rozing MP, Kirkwood TBL, Westendorp RGJ — *Questionable evidence for a limit to human lifespan* | 10.1038/nature22790 | The statistical evidence does not support the conclusion drawn |
| 3 | Lenart A, Vaupel JW — *Questionable evidence for a limit to human lifespan* | (companion) | *"While there might be a limit to human lifespan, the Dong et al. results provide no evidence"* |
| 4 | de Beer J, Bardoutsos A, Janssen F — *Maximum human lifespan may increase to 125 years* | 10.1038/nature22792 | Even with unchanged death probabilities, the growing supercentenarian population implies Japanese women reach 118 before 2070; with continued mortality delay, **125 by 2070** |
| 5 | Brown NJL, Albers CJ, Ritchie SJ — *Contesting the evidence for limited human lifespan* | 10.1038/nature22784 | *"We believe these authors' analyses and conclusions to be flawed"*; the conclusion is *"unfounded and based on inappropriate use of statistics"* |

Dong et al. replied twice: doi:10.1038/nature22787 and doi:10.1038/nature22789. The rebuttals were not retracted and the original paper was not withdrawn.

**Note the structure of the failure.** This was a *Nature* paper whose central statistical procedure was, in the judgement of five independent groups including the field's most senior demographer (Vaupel), invalid. It has nonetheless been cited thousands of times as establishing a limit near 115. **This is the most consequential single error in modern longevity demography and the synthesis should treat "the ~115 limit" as an unsupported claim, not a datum.**

### 3.4 Evidence *for* a finite limit that does not depend on Dong et al.

**Einmahl J, Einmahl JHJ, de Haan L (2019).** *"Limits to Human Life Span Through Extreme Value Theory."* **JASA 114(527):1075–1080**, doi:10.1080/01621459.2018.1537912.

- Data: **~285,000 Dutch residents** born in the Netherlands who died 1986–2015 at age ≥ 92, ages at death recorded **in days**. [`primary_abstract`]
- Method: extreme value theory — the right thing to do.
- Result: *"compelling statistical evidence that there is indeed an upper limit to the life span of men and to that of women for all the 30 years they considered, and moreover, that there are no indications of trends in these upper limits over the last 30 years."* [`primary_abstract`]
- Point estimates: **average endpoint 114.1 y (men), 115.7 y (women)**; **maximum endpoint estimate 124.7 y (men)** [`secondary`; the corresponding maximum endpoint for women was not retrieved — `null`].

This is a much better paper than Dong et al. — correct method, huge sample, exact ages. But note three limits on what it shows: (i) it is one country; (ii) the "endpoint" of a GEV/GPD fit is a fitted extrapolation into a region with almost no data, and endpoint estimators have notoriously wide and asymmetric confidence intervals; (iii) it estimates the endpoint of the *current* mortality regime, not a biological constant.

### 3.5 Evidence *against* a hard cap

**Pearce M & Raftery AE (2021).** *"Probabilistic forecasting of maximum human lifespan by 2100 using Bayesian population projections."* **Demographic Research 44(52):1271–1294.**

Method: exponential (constant-hazard) survival model for the 110+ population, combined with Bayesian probabilistic population projections and IDL data, propagating population uncertainty. [`primary_abstract`]

Results [`primary_abstract`]:

| Event by 2100 | Probability |
|---|---|
| Current MRAD of 122 exceeded | **> 99%** |
| Someone reaches ≥ 126 | **89%** |
| Someone reaches ≥ 128 | **44%** |
| Someone reaches ≥ 130 | **13%** |

Note what drives this: it is almost entirely the *growth of the at-risk population*, not any assumed improvement in old-age mortality. Even a completely static hazard regime produces new records as the number of people entering the 110+ pool grows, because the expected maximum grows as ln(n)/h.

**This is the correct reconciliation of the "limit" debate and the synthesis should state it this way:**
- New maximum-age records are near-certain this century, and they mean **almost nothing** about whether ageing has been slowed. They are a population-size effect.
- Einmahl et al.'s finite endpoint and Pearce & Raftery's record-breaking forecast are **not contradictory**. A finite endpoint in the 125–135 region is entirely compatible with a 122-year record being broken.
- Nobody has produced credible evidence that the *shape* of the extreme tail has changed.

### 3.6 The Jeanne Calment record and its validation dispute

- **Jeanne Louise Calment, Arles, France. Died 4 August 1997 at 122 years 164 days.** The longest documented human lifespan. Validated by Michel Allard and Jean-Marie Robine. [`secondary`]
- **Zak N (2019).** *"Evidence That Jeanne Calment Died in 1934—Not 1997."* **Rejuvenation Research** (SAGE/Mary Ann Liebert). Hypothesis: Calment's daughter **Yvonne** assumed her mother's identity after Jeanne's death in 1934, to evade inheritance tax. Supporting points offered: inconsistencies in Calment's recollections, including a claim about a maid who accompanied her to school whose located birth certificate showed her to be ~10 years younger than Jeanne, so that she *"could only be taking her daughter Yvonne to school."* [`secondary`]
- **Refutation:** the original validators and colleagues published a defence in 2019 addressing Zak's points item by item. Critically, **the alleged motive was shown to be absent — there was no inheritance-tax advantage to be gained from the substitution.** [`secondary`] There is also a published *"Comment on 'The real facts supporting Jeanne Calment as the oldest ever human'"* continuing the exchange (2023). The French government publicly reaffirmed the validation (BBC, Sept 2019). [`secondary`]

**Verdict for the study:** the fraud allegation is **not** established and the mainstream demographic position is that Calment's age stands. But two things follow regardless of who is right:

1. The very fact that a serious dispute about the single most-scrutinised longevity record in history could persist for years, requiring archival re-investigation, tells you the evidentiary standard in this field is weak. **If the best-documented case is contestable, the median case is worthless.**
2. Calment is a **7-year outlier** above the next-longest verified life. In an exponential tail with h ≈ 0.5–0.7 yr⁻¹ a 7-year gap above the second-place record is a ~1-in-30 to 1-in-1,000 event depending on n (`derived`). That is unusual enough to *warrant* scrutiny without being impossible. The correct response is neither dismissal nor credulity but **a re-validation protocol with pre-specified evidentiary standards**, which is exactly what does not exist (§9.3).

---

## 4. The supercentenarian data-quality problem — major deliverable

### 4.1 Saul Justin Newman and the 2024 Ig Nobel

Newman (then Oxford/ANU, now UCL Institute of Education) received the **first Ig Nobel Prize in Demography, awarded 12 September 2024**, for demonstrating that extreme-age records are dominated by error and fraud. [`secondary`, UCL IOE and ANU press releases]

The central preprint: **"Supercentenarian and remarkable age records exhibit patterns indicative of clerical errors and pension fraud"**, bioRxiv 704080 (v1 July 2019 under the title *"Supercentenarians and the oldest-old are concentrated into regions with no birth certificates and short lifespans"*; v3 posted 14 March 2024), doi:10.1101/704080.

**Status caveat, stated up front because it matters:** as of the reporting in *Science* and *STAT*, the work *"still has not been formally published in a peer-reviewed scientific journal"* [`secondary`]. His 2018 *PLOS Biology* paper on error-driven plateaus (§2.3) **is** peer-reviewed. The synthesis must distinguish these.

### 4.2 The findings, with numbers

All from the bioRxiv 704080 abstract as surfaced in search [`primary_abstract`]:

| Finding | Number |
|---|---|
| Effect of state-by-state introduction of birth certificates in the USA on the number of supercentenarian records | **69–82% fall** |
| Share of "exhaustively" validated supercentenarians possessing a birth certificate | **18%** |
| Same, for the USA specifically | **0%** |
| Birthdate distribution of supercentenarians | **concentrated on days divisible by five** — the classic signature of age heaping / fabrication |

Predictors of "remarkable longevity" in Italy, England and France (countries with more uniform vital registration): **poverty, low per-capita income, shorter life expectancy, higher crime rates, worse health, higher deprivation, fewer 90+ year olds, and residence in remote, overseas and colonial territories.**

Note the internal contradiction that makes this so damaging: **regions reporting the most people over 105 report *fewer* people over 90.** There is no biological model in which a region has an unusual deficit of 90-year-olds and an unusual surplus of 110-year-olds. There is an obvious clerical model.

The **days-divisible-by-five** result deserves emphasis. Age heaping on multiples of 5 and 10 is the standard forensic marker of age misreporting in historical demography (measured by the Whipple and Myers indices). Its presence in *birth dates* of supposedly document-validated supercentenarians is close to dispositive of widespread fabrication in that subset.

### 4.3 Blue Zones under audit

Newman's finding on the designated Blue Zones [`primary_abstract`/`secondary`]:

> The designated 'blue zones' of **Sardinia, Okinawa, and Ikaria** corresponded to regions with **low incomes, low literacy, high crime rate and short life expectancy relative to their national average.**

**Okinawa specifically:** the prefecture has *"the highest murder rate per capita, the worst over-65 dependency ratio, the second-lowest median income, and the lowest median lifespan of all 47 Japanese prefectures."* [`primary_abstract`]

That last item is the one to hold on to: **Okinawa has the lowest median lifespan of all 47 Japanese prefectures and is simultaneously marketed worldwide as a longevity capital.** Both cannot be true in the way the popular literature asserts. (A defender's reply — that Okinawa's *older* cohorts were exceptional while its *younger* cohorts have deteriorated on Western diet — is a real and partially valid argument, but it is a different claim from the one the Blue Zones brand makes, and it needs cohort-specific validated data to test.)

**Additional structural problem for Okinawa specifically** [`uncertain` — widely reported but I could not verify the primary this session]: Okinawan pre-war family registers (*koseki*) were substantially destroyed during the 1945 Battle of Okinawa, which means the birth documentation on which Okinawan extreme-age claims rest is systematically weaker than mainland Japan's. **Flagged for verification.**

**Loma Linda and Nicoya:** Newman's work covers Nicoya (Costa Rica) among the Blue Zones; I did not obtain zone-specific numbers for Nicoya or Loma Linda in this session (`null`). Note that **Loma Linda is a methodologically different case** — it is a Seventh-day Adventist community studied through the Adventist Health Studies with individual-level cohort follow-up and US vital registration, not an extreme-age-attainment claim. It should not be lumped in with the others; its longevity claim (roughly a several-year advantage associated with vegetarianism, non-smoking and sabbath observance) rests on ordinary cohort epidemiology, which has its own confounding problems but not the age-validation problem. `uncertain` — verify the AHS-2 effect sizes separately.

### 4.4 The corroborating national scandals

These are not Newman's data; they are independent, and they are the reason his hypothesis is a priori plausible.

**Japan, 2010** [`secondary`, BBC, Japan Times, Demographic Research 26(11)]:
- Triggered 28 July 2010 by the discovery of **Sogen Kato**, listed as 111 years old, **mummified in his home; he had died around 1980.** His family had continued to collect his survivor's pension.
- A nationwide audit followed. **The Japan Times reported 234,000 centenarians listed in registries as unaccounted for; the BBC reported "more than 230,000."**
- Hundreds of the missing would have been **at least 150 years old** if alive.
- The definitive academic treatment: *"The mystery of Japan's missing centenarians explained"*, **Demographic Research 26(11)**, which reconciles the registry figures with the resident-survey figures. Note that the 230,000+ figure is a **family-registry** artifact (the *koseki* is not automatically purged on death or emigration) and is **not** the same as 230,000 fraudulent pensions — the confirmed fraud cases numbered in the hundreds (271 rising to 584 by October 2010 in the Ministry of Health, Labour and Welfare tallies). **The study must not conflate these two numbers.** [`secondary`]

**Greece, 2011** [`secondary`, GreekReporter, HuffPost, European Pensions — note these are news sources, not primaries]:
- Pension fraud investigation triggered when it was noticed that pensions were being paid to **over 9,000 pensioners aged over 100**.
- Mandatory in-person identification of all pensioners revealed **63,500 had died**, some long previously.
- Estimated **€7–8 billion** paid to relatives of the deceased over the preceding decade.
- Separately, ~4,500 deceased civil servants continued to receive pension cheques at >€16 million/year; benefits to ~200,000 people were halted; projected savings up to €800 million/year.
- **These figures come from journalism and should be tagged `uncertain` pending a primary (IKA/EFKA or Bank of Greece audit) source.** They are mutually somewhat inconsistent across outlets (4,500 vs 63,500 vs 200,000 refer to different categories).

**Interpretation.** Pension systems create a direct, continuing financial incentive to not report a death and to overstate age. The incentive is strongest exactly where registration is weakest and poverty is highest — which is exactly the correlation Newman reports. **This is a coherent causal story, not a coincidence.**

### 4.5 The defence

**Michel Poulain and colleagues, *The Gerontologist* (2025), "Validity of Blue Zones demography: a response to critiques", doi:10.1093/geront/gnaf246** [`secondary`].

Their case:
- Poulain personally conducted the Sardinian validation: **~40 municipalities in Ogliastra over 6 months**, interviewing centenarians and checking official documents.
- **Double certification**: for Sardinian supercentenarians identified to date, **civil and ecclesiastical (parish baptismal) records were cross-checked and no discrepancy was found, with one duly-published exception.** Independent parish records are a genuinely strong control, because they were kept by a different institution with different incentives and no pension implications.
- Effect size: people born in the Ogliastra longevity hotspot **between 1880 and 1900 were nearly three times as likely to live to 100** as Sardinians outside the area.
- Poulain has since applied the same criteria across 95 countries; four zones (Okinawa, Sardinia, Ikaria, Nicoya) meet the demographic criteria in his assessment; the "international scientific community generally accepts the Blue Zone concept."
- Blue Zones' own published response, *"Are Supercentenarian Claims Based on Age Exaggeration?"*, argues that the Blue Zone claims rest on **centenarian** rates (age 100), which are far better documented than **supercentenarian** claims (110+), and that Newman's critique is aimed at the latter. [`secondary`]

The dispute is live in the mainstream press: *Science*, "Do 'blue zones,' supposed havens of longevity, rest on shaky science?"; *STAT*, "Are 'blue zones' real? A science and wellness industry clash" (May 2026).

### 4.6 Adjudication — treated fairly, not softened

**Where the defence is right:**
- The 100 vs 110 distinction is real and important. Age validation at 100 is far more tractable than at 110, and the base-rate contamination problem (§2.4) is orders of magnitude milder at 100. Newman's strongest evidence — the 69–82% birth-certificate effect, the 18%/0% documentation rates, the divisible-by-five heaping — is about **supercentenarians**.
- Sardinian double certification against independent parish records is a strong methodological control and Newman's model does not obviously defeat it.
- The Ogliastra 3× centenarian relative risk in the 1880–1900 cohorts is a specific, checkable, cohort-defined claim of a kind the field needs more of.

**Where the defence fails:**
- It does not address the **ecological correlations at all**. Poverty, illiteracy, crime, and *deficits of 90-year-olds* predicting surpluses of 105+ year-olds is not answered by "we validated our cases." Validating the cases you found does not correct for the selection process that produced the candidate list.
- **Okinawa having the lowest median lifespan of Japan's 47 prefectures is not rebutted anywhere I could find.** It is the single hardest fact for the Blue Zones position and the response does not engage it.
- "The international scientific community generally accepts the concept" is an appeal to consensus, not evidence, and in a field where the flagship *Nature* paper on lifespan limits was statistically invalid (§3.2), consensus is weak currency.
- The Blue Zones concept is now a **commercial brand** (books, certified communities, a Netflix series, municipal consulting contracts). This does not make it wrong, but it does mean the incentive structure on the defence side is not neutral, and it should be declared.

**Net verdict for the synthesis:**

> The Blue Zones' *supercentenarian* claims should be treated as unreliable pending independent re-audit. The *centenarian-rate* claims for Sardinia (Ogliastra) are the best-supported and survive the strongest form of the critique, chiefly because of independent ecclesiastical cross-validation. Okinawa's claims are the weakest and are in direct tension with contemporary prefectural mortality. **Most importantly: even if every Blue Zone claim were true, the effect sizes are ~3× on the probability of reaching 100 — a change in A, not in α (§1.5). No Blue Zone shows a changed rate of ageing.** The dietary and lifestyle inferences drawn from Blue Zones in popular literature were never supported by the demography even before the demography was questioned, because the study designs are ecological and uncontrolled.

### 4.7 The forensic signature checklist

For downstream use, the diagnostic markers of an unreliable extreme-age dataset, consolidated:

1. **Age heaping** — excess of ages/birthdates on multiples of 5 and 10 (Whipple index, Myers blended index).
2. **Documentation rate** — fraction of cases with a contemporaneous birth record from an institution with no incentive to inflate.
3. **The 90-vs-110 inversion** — a region with fewer 90-year-olds than expected but more 110-year-olds.
4. **Registration-reform discontinuity** — a step change in reported extreme ages coincident with the introduction of birth certificates or ID reform. (The US 69–82% drop is the canonical example.)
5. **Pension-incentive gradient** — extreme-age reporting correlated with pension generosity and with weak death-registration linkage.
6. **Sex ratio anomalies** and implausible within-family age spacing.
7. **Terminal-digit preference in the reported *day* of birth**, not just the year.

---

## 5. Epigenetic and multi-omic aging clocks

### 5.1 The clocks

| Clock | Year | Type | Tissue | Features | r with chronological age | Median/mean error |
|---|---|---|---|---|---|---|
| **Hannum** | 2013 | 1st gen (chronological) | Whole blood | 71 CpGs | **0.96** | MAE 3.9 y |
| **Horvath pan-tissue** | 2013 | 1st gen (chronological) | 51 tissues/cell types | 353 CpGs | **0.96** | median error 3.6 y |
| **PhenoAge (Levine)** | 2018 | 2nd gen (clinical-phenotype-trained) | Blood | 513 CpGs | n/a (trained on phenotypic age) | — |
| **GrimAge (Lu)** | 2019 | 2nd gen (mortality/protein-trained) | Blood | DNAm surrogates of 7 plasma proteins + smoking pack-years | n/a | — |
| **GrimAge2** | 2022 | 2nd gen | Blood | GrimAge + DNAm logCRP + DNAm logA1C | n/a | — |
| **DunedinPoAm / DunedinPACE** | 2020 / 2022 | 3rd gen (pace-of-aging) | Blood | trained on 19 organ-system decline indicators over 20 y | n/a — it estimates a *rate*, not an age | — |
| **PC clocks (Higgins-Chen)** | 2022 | Reliability-hardened re-training of 6 clocks | Blood | principal components of CpG matrix | — | — |
| **Organ proteomic clocks (Oh/Wyss-Coray)** | 2023 | Proteomic | Plasma, 11 organs | organ-enriched plasma proteins, elastic net | — | — |

Provenance details [`primary_abstract` unless noted]:
- **Horvath 2013** (*Genome Biology* 14:R115): trained on thousands of samples across 39 datasets, 51 tissues; validated on 31 further datasets; r = 0.96, median error 3.6 y.
- **Hannum 2013** (*Molecular Cell* 49(2):359–367): 426 Caucasian + 230 Hispanic adults aged 19–101; elastic net; 71 CpGs; r = 0.96, MAE 3.9 y.
- **Levine 2018 PhenoAge** (*Aging* 10:573–591, doi:10.18632/aging.101414): 513 CpGs; **a one-year increase in DNAm PhenoAge is associated with a 4.5% increase in the risk of death (p = 9.9×10⁻⁴⁷)**; outperforms first-generation clocks for all-cause mortality, cancers, healthspan, physical functioning and Alzheimer's disease.
- **Lu 2019 GrimAge** (*Aging* 11:303–327): **HR = 1.81 per SD increase for all-cause mortality (p < 2×10⁻¹⁶)** in the eighth decade.
- **GrimAge2 2022** (*Aging*, doi:10.18632/aging.204434): evaluated in **13,399 blood samples across 9 cohorts**; adds DNAm-based logCRP and logHbA1c; outperforms GrimAge for mortality across racial/ethnic groups (**meta p = 3.6×10⁻¹⁶⁷ vs 2.6×10⁻¹⁴⁴**); multivariable-adjusted **HR per SD up to 2.12**, with a reported **HR of 2.57** in at least one comparative analysis [`secondary` for the 2.57].
- **DunedinPACE** (Belsky et al., *eLife* 11:e73420, 14 Jan 2022): derived from the Dunedin 1972–73 birth cohort tracking within-individual decline in **19 indicators of organ-system integrity across four timepoints spanning two decades**; associated with morbidity, disability and mortality; **effect sizes similar to GrimAge and adds incremental prediction beyond GrimAge**; faster pace in young adults with childhood adversity.
- **Oh, Wyss-Coray et al. 2023** (*Nature*, Dec 2023 cover): organ-aging signatures from **11 organs** using organ-enriched plasma proteins with elastic net; accelerated organ ageing associates with higher disease incidence and higher all-cause mortality. Successor work: proteomic aging clocks in *Nature Medicine* 2024 (doi:10.1038/s41591-024-03164-7) and *Nature Aging* 2025 (doi:10.1038/s43587-025-01016-8); brain/immune-specific analysis in *Nature Medicine* 2025 (doi:10.1038/s41591-025-03798-1).

### 5.2 Technical reliability — the number nobody quotes

**Higgins-Chen AT, Thrush KL, Levine ME et al. (2022), "A computational solution for bolstering reliability of epigenetic clocks", *Nature Aging* 2:644–661, doi:10.1038/s43587-022-00248-2.**

The headline finding [`primary_abstract`]:

> **Technical noise produces deviations of up to 9 years between replicates for six prominent epigenetic clocks.**

Their fix: compute principal components of the CpG matrix and predict from PCs rather than individual CpGs, discarding CpG-level noise. Result: **retrained PC versions of the six clocks agree between most replicates within 1.5 years**, with improved detection of associations and intervention effects and reliable longitudinal trajectories.

**Sit with the magnitude of the pre-fix number.** A ±9-year test–retest spread on *the same DNA sample* is larger than:
- the entire reported effect of the TRIIM trial (−2.5 years, §7.4);
- essentially every "epigenetic age reversal" effect published to date;
- the median error of the Horvath clock against chronological age (3.6 y).

**Any single-timepoint consumer clock reading, and any trial reporting a change in epigenetic age of a few years without replicate measurements and without a reliability-hardened clock, is uninterpretable.** This is the most actionable single fact in the biomarker section.

Individual clock ICCs: I obtained **DunedinPACE ICC = 0.96, 95% CI [0.92–0.98]** (Lehne replicate dataset) [`primary_abstract`, eLife 2022]. **I could not verify the per-clock ICCs for Horvath, Hannum, PhenoAge and GrimAge from the Higgins-Chen supplementary in this session — these are `null` in the JSON.** Do not fill them in from memory; they are the crux of the argument and must come from the source table.

### 5.3 The training-target problem

First-generation clocks (Horvath, Hannum) are **trained by penalized regression to predict chronological age**. The optimization target is |predicted age − actual age|. Therefore:

1. **The clock's loss function actively penalizes the very signal of interest.** A CpG that tracks biological deterioration *independently* of chronological age increases training error and is shrunk toward zero by the elastic-net penalty. The clock is, by construction, selected to *discard* pure biological-age signal. The residual ("age acceleration") that researchers then interpret as biological age is **the part of the model that failed**.
2. **r = 0.96 is a measure of how well the clock reproduces its trainer, not of biological validity.** Reporting r = 0.96 as evidence of a good ageing biomarker is a category error, and it is nearly universal in the popular and commercial literature. A perfect chronological clock (r = 1.0) would have zero biological-age information by definition.
3. This is acknowledged in the field: *"One critique of the Horvath clock is its dependence on chronological age as the training measure, which may result in an equation that estimates chronological age very accurately but does not capture biological age"*; and *"while more sophisticated algorithms and larger cohort sizes have improved the accuracy of epigenetic clocks in predicting chronological age, they do so at the cost of not fully capturing biological information."* [`secondary`, review literature]

Second- and third-generation clocks address this by changing the training target — PhenoAge to a clinical-chemistry phenotypic age, GrimAge to mortality and protein surrogates, DunedinPACE to a measured 20-year rate of multi-system decline. **This is the correct direction and the field deserves credit for it.** But it introduces a different problem: GrimAge is trained partly on smoking pack-years and plasma-protein surrogates, so a substantial part of its mortality prediction is *"this person smokes and has high CRP"* — information obtainable from a questionnaire and a blood panel. **The incremental value of the methylation measurement over cheap covariates is the quantity that matters and it is rarely reported.**

### 5.4 The surrogate-endpoint question — has clock reversal ever predicted reduced mortality?

**Short answer: I am aware of no demonstration that an intervention-induced reduction in any epigenetic clock has been shown to predict reduced mortality, and no clock has been qualified as a surrogate endpoint by any regulator.** [`uncertain` — I could not run confirming searches before the budget was exhausted. **Flagged as the single highest-priority item for the lead researcher to verify.**]

What *is* established is a different and much weaker thing: **cross-sectional and prospective association**. Clocks predict mortality (PhenoAge 4.5%/year, GrimAge HR 1.81/SD, GrimAge2 HR up to 2.12–2.57). Association is necessary but nowhere near sufficient for surrogacy.

**The Prentice criteria (Prentice RL, "Surrogate endpoints in clinical trials: definition and operational criteria", *Statistics in Medicine* 8:431–440, 1989):**

Let *Z* = treatment indicator, *S* = surrogate, *T* = true endpoint. A valid surrogate requires:

1. **Z has a significant effect on T** (the treatment actually works on the real endpoint);
2. **Z has a significant effect on S** (the treatment moves the surrogate);
3. **S has a significant effect on T** (the surrogate predicts the real endpoint);
4. **Z has no effect on T given S** — *the full-capture condition*: conditional on the surrogate, treatment carries no residual information about the true endpoint.

Prentice's operational statement: *"a surrogate for a true endpoint [must] yield a valid test of the null hypothesis of no association between treatment and the true response"* — the surrogate must **capture** the treatment's entire effect. [`primary_abstract`]

**Criterion 4 is the killer and it is the one nobody tests.** It cannot be assessed from observational data at all; it requires a randomized trial with the true endpoint (mortality) measured. Freedman et al. (1992) added the "proportion of treatment effect explained"; Buyse & Molenberghs (1998) and the meta-analytic framework (*Biostatistics* 1(1):49, 2000) extended validation to **trial-level** surrogacy — requiring that the treatment effect on S predict the treatment effect on T *across multiple trials*, which for ageing would require many completed mortality trials, which do not exist.

**Where every aging clock currently stands:**

| Prentice criterion | Status for aging clocks |
|---|---|
| 1. Z → T | **Never demonstrated.** No intervention has been shown to reduce all-cause mortality via an ageing mechanism in an RCT. |
| 2. Z → S | Demonstrated for several interventions (caloric restriction, some drugs) in small trials |
| 3. S → T | **Demonstrated** — this is the association literature |
| 4. Z ⊥ T \| S | **Never tested.** Cannot be tested without (1). |

**Conclusion: no aging clock satisfies the Prentice criteria; not one of them satisfies even criterion 1, because criterion 1 is not about the clock at all — it is about whether we have any intervention that demonstrably extends human life.** We do not. The entire clock-as-endpoint enterprise is therefore currently building a surrogate for an effect that has never been shown to exist.

This should be stated in the synthesis without hedging. It is not a criticism of the clocks as science; it is a statement of where the evidence chain is broken.

### 5.5 The direct-to-consumer clock industry

Structural problems, in decreasing order of severity:

1. **Reliability.** Per Higgins-Chen, up to ±9 years of technical noise on replicate measurements of the same sample for un-hardened clocks. Most consumer products do not disclose which clock, which array, whether PC-hardened, or any replicate/ICC data. A consumer receiving "your biological age is 42, three years younger than last year" cannot distinguish that from assay noise.
2. **No clinical validity chain.** The product implies actionability ("lower your biological age"), but there is no evidence that intervention-induced clock movement improves any outcome (§5.4).
3. **Reference-population and batch effects.** Clock outputs shift with array version (450K → EPIC → EPICv2), normalization pipeline, cell-composition adjustment, and reference cohort. Cross-vendor and cross-time comparisons are frequently not meaningful.
4. **Cell composition confounding.** Blood clocks are substantially driven by leukocyte composition shifts. An acute infection or a recent vaccination can move a blood clock. Immune-cell-composition-resistant clocks are an active research area precisely because of this (bioRxiv 2023.03.01.530561).
5. **Regression to the mean.** Consumers who buy a second test after a high first reading will on average read lower regardless of any intervention. Uncontrolled before/after consumer testimonials are therefore guaranteed to generate apparent successes.

**Minimum disclosure standard the field should demand of any clock result, consumer or academic** (§9.2).

### 5.6 Frailty indices and composite biological age

**Frailty index (Rockwood & Mitnitski):** a deficit-accumulation measure — the proportion of a pre-specified list of ~30–70 health deficits present in an individual. Its properties are unusually robust: it is largely insensitive to *which* deficits are chosen provided enough are used; it increases roughly exponentially with age; and it has a characteristic empirical ceiling near 0.7 above which survival is very rare. It predicts mortality, institutionalisation and adverse surgical outcomes.

**Why it matters for this report:** the frailty index is the strongest counter-example to the claim that "we cannot measure biological age." It measures it adequately, cheaply, without an assay, and with far better test–retest properties than any molecular clock. Its weakness is that it is a *late* marker — it is informative in the 65+ range and near-useless in a 40-year-old, which is exactly where an intervention trial would want to enrol.

[`uncertain` — I could not run confirming searches for specific Rockwood/Mitnitski effect sizes, the 0.7 limit, or the deficit-count insensitivity result this session. **Verify before citing numbers.** The qualitative description is standard.]

---

## 6. Healthspan, morbidity compression, and the current demographic reality

### 6.1 The healthspan–lifespan gap

Two independent measurements, in agreement:

**WHO / GBD 2021** [`primary_abstract`/`secondary`, WHO news release 24 May 2024; GBD 2021 *Lancet* 403:2133–2161]:

| Metric | 2019 | 2021 | Change |
|---|---|---|---|
| Global life expectancy at birth | 73.2 | **71.4** | −1.8 y |
| Global healthy life expectancy (HALE) at birth | 63.4 | **61.9** | −1.5 y |
| **Gap** | ~9.8 y | **9.5 y** | — |

Both metrics returned to their 2012 level — **COVID-19 erased approximately a decade of progress in two years.** The Americas and South-East Asia were hardest hit (~3 years of LE and ~2.5 years of HALE lost). The 2019 values of 73.2/63.4 are `derived` by addition from the stated 2021 values and stated changes.

**Garmany A & Terzic A (2024), "Global Healthspan–Lifespan Gaps Among 183 World Health Organization Member States", *JAMA Network Open* 7(12):e2450241** [`primary_abstract`/`secondary`]:

| Finding | Value |
|---|---|
| Global healthspan–lifespan gap | **9.6 years** (widened over the last two decades) |
| **US gap — the largest of any member state** | **12.4 years** |
| Female gap minus male gap | **+2.4 years** (women spend more years in poor health) |
| Association | positively with non-communicable disease burden and total morbidity; negatively with mortality |

**Convergent verdict: the global healthspan–lifespan gap is 9.5–9.6 years and it is widening. The United States has the worst gap in the world at 12.4 years.**

The negative association with mortality is worth flagging: **countries that reduce mortality accumulate morbidity.** That is the expansion-of-morbidity mechanism operating at national scale, and it is the empirical heart of the geroscience argument — reducing mortality without addressing ageing converts deaths into disability-years.

### 6.2 Compression vs expansion of morbidity — what the data actually show

- **Fries (1980, NEJM):** compression hypothesis — as death is postponed, onset of chronic illness is postponed *more*, so the morbid period shortens.
- **Gruenberg (1977):** expansion hypothesis — medicine postpones death from chronic disease without postponing onset, so the morbid period lengthens ("failures of success").
- **Manton (1982):** dynamic equilibrium — both move, roughly in proportion.

**What the data show** [`primary_abstract`/`secondary`]:

- *"Expansion, Compression, Neither, Both? Divergent Patterns in Healthy, Disability-Free, and Morbidity-Free Life Expectancy Across U.S. Birth Cohorts, 1998–2016"*, **Demography 59(3):949** (Duke University Press): **successive US cohorts are experiencing neither the compression Fries predicted nor the universal expansion Gruenberg predicted.** The pattern is *divergent* — it differs by the definition of morbidity used.
- *"most of the evidence does not support the idea that we have experienced a recent compression of morbidity"* [`secondary`, review].
- Some studies do find local compression (one analysis: disability-free LE up 1.6 y with disabled LE down 0.9 y).
- *"Disability-Free Life Expectancy Over 30 Years: A Growing Female Disadvantage in the US Population"* (Am J Public Health, 2016) documents a widening female disadvantage.
- *"Are We Adding Pain-Free Years to Life? A Test of Compression Versus Expansion of Morbidity"*, **J Gerontol A 79(8):glae157 (2024)** — pain-defined morbidity.

**Adjudication.** The answer depends decisively on the morbidity definition:
- **Disability-defined morbidity** (ADL/IADL limitation): roughly flat to mildly compressing in some cohorts. Assistive technology, hip replacement, cataract surgery and better housing genuinely reduce *disability* without touching the underlying disease.
- **Disease-defined morbidity** (years lived with a diagnosed chronic condition): **expanding**, and increasingly so, partly because diagnosis thresholds have moved and screening has intensified.
- **Multimorbidity and pain-defined morbidity:** expanding.

**The consolidated statement for the synthesis:** *Fries's compression hypothesis is not supported as a general description of recent decades. The dominant pattern is a stable-to-widening healthspan–lifespan gap, with disability partially compressed by technology while disease-years expand. Compression of morbidity is achievable in principle but it has not happened at population scale, and it will not happen by curing diseases one at a time — because curing a disease converts its deaths into survivorship with the remaining diseases.*

### 6.3 Current demographic reality, 2024–2026

**United States** [`primary_abstract`/`secondary`, CDC/NCHS Data Brief 521 (Dec 2024), NCHS press releases 19 Dec 2024 and 29 Jan 2026]:

| Year | e₀ (years) | Age-adjusted death rate /100k | Drug overdose death rate /100k |
|---|---|---|---|
| 2022 | 77.5 | 798.8 | 32.6 |
| 2023 | **78.4** | 750.5 (−6%) | 31.3 (−4%) |
| 2024 | **79.0** | 722.1 (−3.8%) | **23.1 (−26.2%)** |

Notes:
- The 2021–2024 rebound is **recovery from the COVID and overdose shocks, not new progress.** The 2019 US e₀ was ~78.8 [`uncertain`], so 2024's 79.0 represents roughly a return to the pre-pandemic level after a five-year round trip.
- COVID-19 fell from the 4th leading cause of death in 2022 to the 10th in 2023.
- **The 26.2% single-year fall in overdose mortality (2023→2024) is the largest driver of the 2024 gain** and is the most consequential recent US mortality event. It is a Makeham-term effect: it removes deaths concentrated at ages 25–55, which is why it moves e₀ so efficiently relative to its share of deaths.
- US life expectancy stagnation 2010–2019, before COVID, is a distinct phenomenon with distinct causes (drug overdose, alcohol-related liver disease, suicide — "deaths of despair"; plus a stalled decline in cardiovascular mortality attributable to obesity and diabetes, and the worst healthcare access among rich countries). [`uncertain` for the attribution weights — verify against the National Academies "Explaining Divergent Levels of Longevity in High-Income Countries" volume, which appeared in my search results.]

**Historical US series** [`secondary`, NCHS historical life tables]:

| Year | e₀ total | male | female |
|---|---|---|---|
| 1900 | 47.3 | 46.3 | 48.3 |
| 1950 | 68.2 | 65.6 | 71.1 |
| 1999–2001 | 76.83 | — | — |
| 2022 | 77.5 | — | — |
| 2023 | 78.4 | — | — |
| 2024 | 79.0 | — | — |

**Global** [`primary_abstract`, WHO/GBD]: global e₀ = **71.4 (2021)**; HALE = **61.9 (2021)**. Values for 2023–2025 were not obtained (`null`) — do not fill in.

### 6.4 Olshansky et al. 2024 — the deceleration argument

**Olshansky SJ, Willcox BJ, Demetrius L, Beltrán-Sánchez H (2024), "Implausibility of radical life extension in humans in the twenty-first century", *Nature Aging* 4:1635–1642, doi:10.1038/s43587-024-00702-3.**

[`primary_abstract`/`secondary`]:
- Populations: the **eight longest-lived countries (Australia, France, Italy, Japan, South Korea, Spain, Sweden, Switzerland) plus Hong Kong and the United States, 1990–2019.**
- **Since 1990, improvements in life expectancy have decelerated.**
- Life expectancy at birth in the world's longest-living populations has **increased by an average of only ~6.5 years since 1990** — i.e. roughly **2.2 years per decade**, and falling.
- Argument: the historically large gains came from eliminating early- and mid-life mortality (a Makeham/early-life effect, §1.5). That reservoir is nearly exhausted. What remains is *"the damaging effects of aging."*
- Conclusion: absent technologies that address ageing itself, **further radical life extension in already long-lived countries "remains implausible"**; *"there is really no evidence that survival to 100 will become a reality any time soon."*

**Assessment.** Olshansky's *empirical* claim (deceleration since 1990 in the leading populations) is well founded and is corroborated by independent cohort-forecast work [*"Cohort mortality forecasts indicate signs of deceleration in life expectancy gains"*, PMC12415247, `secondary`]. His *inferential* claim (that this implies a biological limit) is contested — a counter-preprint, *"Human life expectancies are still rising"* (bioRxiv 2025.05.01.651310), argues the opposite from cohort rather than period measures [`secondary`, abstract not retrieved]. **The period-vs-cohort distinction is the substance of that dispute and the synthesis should handle it explicitly: period life expectancy understates cohort life expectancy during a period of continuing improvement, so a deceleration in period e₀ is weaker evidence than it appears.**

But my own arithmetic (§1.7) supports Olshansky's conclusion *independently of any limit argument*: reaching e₀ = 100 requires an 85% cut in mortality at every age. Nothing in the pipeline of conventional medicine comes close.

---

## 7. Named errors and corrections

Nine cases. Each states the claim, the flaw, the correction, and the citation for the correction.

### 7.1 Dong, Milholland & Vijg (2016) — post-hoc segmented regression on an extreme order statistic
- **Claim:** human lifespan is capped near 115; the maximum reported age at death has declined since 1995. *Nature* 538:257–259.
- **Flaw:** the 1995 breakpoint was chosen by visual inspection of the same data used for the test, destroying the inference; OLS was applied to a Gumbel-distributed annual maximum; the result is driven by one outlier (Calment); MRAD was not conditioned on the size of the at-risk population, to which it responds only logarithmically; the underlying IDL coverage changed over the window.
- **Correction:** five *Nature* Brief Communications Arising, 2017 — Hughes & Hekimi (nature22786); Rozing, Kirkwood & Westendorp (nature22790); Lenart & Vaupel; de Beer, Bardoutsos & Janssen (nature22792); Brown, Albers & Ritchie (nature22784). Verdict: *"unfounded and based on inappropriate use of statistics."*
- **The right test:** GPD/GEV fit to threshold exceedances above 110, testing sign of the extreme-value index γ (the method Einmahl et al. 2019 subsequently used).

### 7.2 Barbi et al. (2018) — the mortality plateau
- **Claim:** human mortality plateaus after 105; evidence against a fixed lifespan limit. *Science* 360:1459.
- **Flaw:** the finding is not robust to age-ascertainment error; the model comparison did not adequately test error-contaminated alternatives.
- **Correction:** Newman, *"Plane inclinations: A critique of hypothesis and model choice in Barbi et al."*, PLOS Biology, doi:10.1371/journal.pbio.3000048; Gavrilov & Gavrilova, PLOS Biology 17(2):e3000148; Gavrilova & Gavrilov (Gerontology 65(5):451) documenting "Gompertzialization" as data improve. My own reproduction (§2.4): **1.7% record contamination is sufficient to manufacture a plateau from a pure Gompertz.**
- **Status:** disputed, not refuted. Barbi's Italian data are among the best available and the authors' aggregation-artifact defence is legitimate.

### 7.3 Blue Zones demography
- **Claim:** identified regions (Okinawa, Sardinia, Ikaria, Nicoya, Loma Linda) have exceptional documented longevity attributable to diet and lifestyle.
- **Flaw:** extreme-age attainment is predicted by poor birth registration, poverty, low literacy, high crime and pension-fraud incentive; Okinawa has the **lowest median lifespan of Japan's 47 prefectures**; regions claiming excess 105+ report **deficits of 90-year-olds**; **69–82%** drop in US supercentenarian records on introduction of state birth certificates; **18%** (0% in the US) of "exhaustively validated" supercentenarians hold a birth certificate; birthdates heap on days divisible by five.
- **Correction:** Newman, bioRxiv 704080 (v3, 2024); Ig Nobel in Demography 2024.
- **Counter-correction:** Poulain et al., *The Gerontologist* 2025, doi:10.1093/geront/gnaf246 — Sardinian double certification against independent parish records; Ogliastra 1880–1900 cohorts ~3× more likely to reach 100.
- **Adjudication:** §4.6. Centenarian-level Sardinian claims survive; supercentenarian claims broadly do not; Okinawa is the weakest case. **Even at face value the effect is on A, not α.**

### 7.4 TRIIM (Fahy et al. 2019) — thymic regeneration and "epigenetic age reversal"
- **Claim:** Fahy GM et al., *"Reversal of epigenetic aging and immunosenescent trends in humans"*, **Aging Cell 18(6):e13028** (8 Sept 2019). Nine men aged 51–65, treated 2015–2017 with recombinant human growth hormone + DHEA + metformin, showed thymic regeneration and **~2.5 years of epigenetic age reversal** after one year.
- **Flaws:**
  1. **n = 9.** Nine men. One arm.
  2. **No control group** — acknowledged by the authors. Every alternative explanation (regression to the mean, batch effects, seasonal variation, assay drift, lifestyle change from trial participation) is unexcluded.
  3. **The effect size is smaller than the assay's technical noise.** Higgins-Chen et al. subsequently showed up to **±9 years** of replicate-to-replicate deviation on unhardened clocks. A −2.5-year signal within a ±9-year noise band, measured once per participant, is not a measurement.
  4. **Multiple clocks reported.** Reporting the reversal across several clocks without pre-specification and multiplicity control is a garden-of-forking-paths problem.
  5. **The endpoint is unvalidated** (§5.4). Even a real 2.5-year clock reduction has no demonstrated relationship to mortality when produced by an intervention.
  6. **The intervention is not obviously benign.** Long-term recombinant growth hormone is associated with insulin resistance and, in the animal and human genetics literature, GH/IGF-1 signalling *reduction* is the direction associated with longevity. The trial is pushing the axis in the direction opposite to the best-supported longevity genetics. This deserves prominent statement.
- **Follow-up:** TRIIM-X, **NCT04375657**, registered 2020, designed with more subjects **and a control comparator group**. Control groups for biomarker variability and individual-drug contributions were stated as **"planned pending additional trial sponsorship."** [`primary_abstract`, ClinicalTrials.gov] **I could not obtain TRIIM-X results, enrolment status, or completion date in this session (`null`). As of my information the confirmatory result has not been published. Verify.**
- **Correction:** none published as a formal rebuttal that I could locate. The correction here is methodological, not a citation — and that is itself the point: **an uncontrolled n=9 trial received global press coverage as the first reversal of human ageing, and no correction was ever required of it.**

### 7.5 Age-ascertainment bias and the "validated" label
- **Claim:** supercentenarian datasets (IDL, GRG) consist of "validated" ages suitable for hazard estimation.
- **Flaw:** validation standards are heterogeneous and frequently do not include a contemporaneous birth record. **18% of "exhaustively" validated supercentenarians have a birth certificate; 0% in the USA.** Age heaping on divisible-by-five birthdates is present. The base-rate problem (§2.4) means even 1–2% contamination dominates the 110+ hazard.
- **Real-world corroboration:** Japan 2010 (Sogen Kato; 234,000 registry-unaccounted centenarians; Demographic Research 26(11)); Greece 2011 (>9,000 centenarian pensions; 63,500 deceased pensioners discovered). **Note the necessary distinction: Japan's 230,000+ is a family-registry artifact, not 230,000 frauds; confirmed fraud cases were in the hundreds.** Conflating these is itself a common error in secondary coverage of this topic.
- **Correction:** Newman 2018 PLOS Biology; Gavrilov & Gavrilova 2019 PLOS Biology; Gavrilova & Gavrilov, Theor Popul Biol 2022 ("The curse of the plateau").

### 7.6 Epigenetic clock overinterpretation — reliability and the correlation fallacy
- **Claim (implicit in hundreds of papers and every consumer product):** a clock reading is a measurement of biological age, and r = 0.96 with chronological age is evidence of its validity.
- **Flaws:** (a) **±9 years of technical noise** between replicates on six prominent clocks; (b) r with chronological age measures fidelity to the *training target* and is maximized by a clock with *zero* biological information; (c) blood clocks are confounded by leukocyte composition; (d) array version, normalization and batch shift results; (e) age-acceleration residuals inherit the regression-to-the-mean structure of the underlying fit, so extreme first readings systematically improve on retest.
- **Correction:** Higgins-Chen et al., *Nature Aging* 2:644–661 (2022), doi:10.1038/s43587-022-00248-2 — quantifies the noise and provides the PC-clock fix (replicate agreement within 1.5 y). Also Higgins-Chen et al., *Nature Aging* 2022 doi:10.1038/s43587-022-00253-5. Also the systematic curation framework in *Nature Aging* 2025, doi:10.1038/s43587-025-00987-y.
- **Minimum standard:** report ICC on technical replicates, use a PC-hardened or explicitly reliability-characterized clock, and report the incremental predictive value over age + sex + smoking + standard blood panel.

### 7.7 The "epigenetic age reversal" press-release genre
- **Pattern:** a small, usually uncontrolled or crossover study reports a reduction of 1–3 years in some clock; a press release describes it as reversing biological ageing; the technical-noise floor, the absent control, the unvalidated endpoint and the multiplicity across clocks are omitted.
- **Structural reasons it keeps happening:** (i) the effect sizes claimed are inside the assay noise band, so *any* small study will produce them at some rate; (ii) there are now dozens of clocks, so reporting "the clock that moved" is unconstrained multiple testing; (iii) there is no registered-endpoint discipline because the endpoint is not regulator-qualified; (iv) commercial sponsors benefit directly.
- **Correction:** apply Higgins-Chen's noise floor as a hard threshold — **no reported clock change smaller than the assay's replicate SD, measured in that study, should be reported as an effect** — and pre-register a single clock as the primary endpoint.

### 7.8 The Strehler–Mildvan correlation as a fitting artifact
- **Claim:** the inverse A–α relationship across populations reflects a real biological compensation, converging on a species-specific limiting age near 95–100.
- **Flaw:** the estimators of ln A and α from a Gompertz fit over a restricted age range are strongly negatively correlated. Much of the "compensation law" is the ridge of the likelihood surface, not biology.
- **Correction:** Tarkhov, Menshikov & Fedichev, *"Strehler–Mildvan correlation is a degenerate manifold of Gompertz fit"*, J Theor Biol (2017), doi:10.1016/j.jtbi.2017.01.009 (bioRxiv 064477).
- **Why it matters here:** every claim that an intervention "slowed the rate of ageing" by reducing fitted α must be evaluated against the joint (ln A, α) uncertainty. Reporting a marginal CI on α alone will find slope changes that are not there. **This is the specific statistical trap that any future geroprotector trial reporting a Gompertz slope will fall into.**

### 7.9 The Calment fraud allegation (an error in the sceptical direction)
- **Claim:** Zak (2019), *Rejuvenation Research* — Jeanne Calment died in 1934 and her daughter Yvonne assumed her identity for inheritance-tax reasons.
- **Flaw:** the asserted motive does not exist — **no inheritance-tax advantage was obtainable from the substitution**; the documentary and testimonial objections were addressed point by point by the original validators.
- **Correction:** Robine, Allard and colleagues' 2019 defence; the 2023 exchange (*"Comment on 'The real facts supporting Jeanne Calment as the oldest ever human'"*); French official reaffirmation (Sept 2019).
- **Included deliberately:** scepticism about extreme-age records is correct as a default posture, but it is not self-validating. Newman's ecological argument is strong precisely because it is statistical and testable; Zak's was a single-case narrative reconstruction, and it did not survive. The study should model the difference.

---

## 8. The Measurement Problem — consolidated

Everything above reduces to one structural problem, stated in four parts.

### 8.1 We cannot reliably measure how old people are at the ages that matter most
The 110+ population is where the shape of the human hazard function is determined, where the existence of a limit is decided, and where every claim about extreme longevity lives. It is also the population with the worst documentation: 18% birth-certificate coverage overall, 0% in the US, birthdate heaping on multiples of five, and a 69–82% drop in reported cases the moment a jurisdiction starts issuing birth certificates. The base-rate arithmetic (§2.4) means that at reported age 115, error rates above ~10⁻⁵ make erroneous records outnumber genuine ones. **The data at the ages that decide the question are, in Newman's phrase, "rotten from the inside out."**

### 8.2 We cannot reliably measure biological age
Molecular clocks either (a) are trained on chronological age, in which case their loss function actively suppresses the biological signal, or (b) are trained on mortality/phenotype, in which case they substantially recapitulate cheap covariates and their incremental value is rarely quantified. Either way, the assay carries up to ±9 years of technical noise on replicate measurements of the same sample — larger than every intervention effect ever reported. The best-behaved measure in the field, the deficit-accumulation frailty index, requires no assay at all and is uninformative before ~60.

### 8.3 We have no validated surrogate endpoint, and cannot get one
No clock satisfies the Prentice criteria. Criterion 1 — that the treatment demonstrably affects the true endpoint — has never been satisfied by any human ageing intervention. **A surrogate cannot be validated for an effect that has not been shown to exist.** This is a genuine chicken-and-egg problem and it is the single largest structural obstacle to the field, larger than any biological question. The way out is the meta-analytic surrogacy framework (Buyse & Molenberghs), which requires a portfolio of completed trials with hard endpoints — a decade-scale, multi-billion-dollar commitment nobody has made.

### 8.4 We conflate levels with rates
The Makeham term, the Gompertz intercept and the Gompertz slope are routinely reported under the single word "mortality." Every headline about extending life — a new cancer drug, a Blue Zone diet, a public-health campaign — is an intercept or Makeham intervention. **Not one demonstrated human intervention has moved α.** Because intercept effects and slope effects look identical over a short observation window and a narrow age range (and because their estimators are negatively correlated, §7.8), the field routinely cannot tell which it has produced — and defaults to describing every result as "slowing ageing."

---

## 9. Improvement — specific, implementable fixes

### 9.1 Build a clock trained on time-to-death, not chronological age

**The problem:** elastic-net regression on chronological age selects CpGs by |ŷ − age| and therefore penalizes exactly the deviations that constitute biological age.

**The fix — a survival-trained clock:**

1. **Objective:** replace the least-squares-on-age loss with a **penalized Cox partial likelihood** on time to all-cause death, or better, an **accelerated failure time (AFT)** model whose output is on a natural time scale:
   $$\log T_i = \beta_0 + \boldsymbol{\beta}^{\!\top}\mathbf{x}_i + \sigma \varepsilon_i$$
   with an elastic-net penalty on β. The AFT formulation is preferable to Cox because its coefficient is directly interpretable as years of life, so the output is a *biological age* in the intended units rather than a log-hazard.
2. **Force the residual structure:** include chronological age as an **unpenalized offset**. Then every methylation coefficient is selected *only* for the variance in survival that age does not explain. This single change converts the clock from "predicts age" to "predicts what age fails to predict about death," which is the definition of biological age.
3. **Force incremental value:** additionally offset on sex, smoking status, BMI and a standard clinical panel. Any CpG that survives this penalization is carrying information not obtainable from a questionnaire and a £20 blood test. **Report the C-statistic of the full model minus the C-statistic of the offset-only model.** This number — the *incremental* discrimination — is what should be on the front of every clock paper, and it currently appears in almost none.
4. **Estimand:** report the clock as **years of life expectancy gained or lost relative to a same-age, same-sex reference**, not as a "biological age." This forecloses the interpretive slippage that generates the press-release genre.
5. **Data requirement:** large cohorts with methylation at baseline and long mortality follow-up — UK Biobank, Framingham Offspring, Health and Retirement Study, the Lothian Birth Cohorts, ESTHER, the Women's Health Initiative. GrimAge and PhenoAge already move in this direction; the missing pieces are the unpenalized clinical offset and the mandatory reporting of incremental C-statistic.
6. **Reliability as a first-class constraint:** apply the Higgins-Chen PC transform *before* fitting, and **pre-register a minimum ICC on technical replicates as an inclusion criterion for the clock itself.** A clock whose replicate ICC is below, say, 0.95 should not be used for longitudinal intervention monitoring at all, because the intervention effects of interest are smaller than its noise.

### 9.2 A minimum reporting standard for any clock result

Every paper or product reporting a clock value should be required to state:

| Item | Why |
|---|---|
| Clock name, version, and citation | Dozens exist; "epigenetic age" is not a measurement |
| Array platform and version (450K / EPIC / EPICv2) | Values are not comparable across platforms |
| Normalization and cell-composition adjustment pipeline | Blood clocks track leukocyte composition |
| **ICC on technical replicates measured in this study** | The noise floor must be established locally, not cited |
| Number of clocks computed and which was pre-specified as primary | Multiplicity control |
| Effect size **relative to the study's own replicate SD** | An effect below the noise floor is not an effect |
| Incremental C-statistic / R² over age + sex + smoking + clinical panel | The only measure of what the assay adds |
| Whether the study had a randomized control arm | Regression to the mean otherwise unexcluded |

### 9.3 Registry design that makes age fraud detectable

Current validation is *case-by-case adjudication of candidates who presented themselves*. That is the wrong architecture — it validates the numerator and ignores the denominator. Replace it with:

1. **Prospective cohort enrolment at age 100, not retrospective adjudication at 110.** Enrol every centenarian in a jurisdiction, with documentation captured at 100 while it is still findable and while independent witnesses are alive. Then the 110+ population is a *followed cohort*, not a self-selected set of claims, and the denominator is known.
2. **Mandatory independent dual-source documentation:** a civil birth record *plus* a record from an institution with orthogonal incentives — parish baptismal register, school enrolment, military conscription list, early census enumeration. Sardinia's civil + ecclesiastical double certification is the existing gold standard and it should be the minimum, not the exception.
3. **Pre-registered evidentiary tiers**, published before any case is examined, with cases assigned to tiers and **hazard estimates reported separately by tier.** If the plateau appears in tier 3 and vanishes in tier 1, the question is answered. This single design change would settle the plateau debate.
4. **Routine forensic audits, published as standing statistics for every contributing jurisdiction:**
   - **Whipple and Myers indices** on reported ages and on birth-date terminal digits;
   - **the 90/110 ratio** — flag any region reporting excess 110+ alongside deficit 90+;
   - **discontinuity tests at registration reforms** — the US birth-certificate natural experiment should be run continuously wherever ID systems change;
   - **pension-linkage audits** — automated death-registry-to-pension-payment reconciliation, published as a rate.
5. **Adversarial validation.** Fund a standing, independent team whose remit is to *falsify* extreme-age claims, structurally separate from the teams that collect them, with publication rights regardless of findings. The Calment episode showed that scrutiny arrives only from outsiders and is then treated as an attack rather than as the system working.
6. **Blinded ascertainment.** Age validators should be blinded to whether a case comes from a claimed longevity hotspot. Blue Zone status currently increases both the search intensity and the prior, which is a textbook ascertainment feedback loop: you find more supercentenarians where you look harder, which makes you look harder there.

### 9.4 Validating a clock as a surrogate — the actual path

1. **Establish criterion 1 first.** Nothing else is possible until some intervention is shown to affect a hard endpoint. The realistic near-term candidates are composite morbidity/mortality endpoints in an adequately powered trial (the TAME design — metformin against a composite of incident cardiovascular disease, cancer, dementia and death — is the archetype).
2. **Embed the biomarker in that trial** with pre-specified analysis, adequately powered for the *mediation* question, not merely measured.
3. **Test criterion 4 explicitly** — fit the treatment effect on the true endpoint with and without conditioning on the surrogate, and report the **proportion of treatment effect explained** with its confidence interval. Note that PTE confidence intervals are notoriously wide; the trial must be powered for this, which typically means several-fold larger than powering for the primary effect alone.
4. **Move to trial-level surrogacy** across a portfolio of trials (Buyse & Molenberghs meta-analytic framework, *Biostatistics* 1(1):49, 2000): regress the treatment effect on T against the treatment effect on S across trials and report R²_trial. **Only a high R²_trial licenses using the clock as a decision endpoint in a new trial.** Individual-level association — everything published so far — does not.
5. **Interim discipline:** until R²_trial exists, clocks may be used for **enrichment** (selecting high-risk participants, which requires only prognostic value and is well supported) and for **futility stopping**, but **not for efficacy claims.** This distinction is cheap to adopt and would eliminate most of the field's overclaiming immediately.

### 9.5 The statistical tests that should replace the ones used

| Instead of | Use | Because |
|---|---|---|
| Segmented regression with an eyeballed breakpoint on MRAD (Dong et al.) | **GPD/GEV fit to threshold exceedances above 110; test sign of the extreme-value index γ** (γ<0 ⟺ finite endpoint) | Single pre-specified 1-df test, correct asymptotics, uses all deaths not one max per year |
| OLS on annual maxima | **Gumbel/GEV regression with a covariate for exposure (number at risk above the threshold)** | Annual maxima are Gumbel-distributed and depend on n as ln(n)/h |
| Visual breakpoint selection | **Bayesian changepoint model with the breakpoint as a parameter**, or a **supF / Davies test** with non-standard critical values | Restores valid inference under breakpoint search |
| Marginal CI on fitted Gompertz α | **Joint (ln A, α) confidence region**; report the correlation | The estimators are strongly negatively correlated (§7.8) |
| Single-timepoint clock measurement | **Replicate measurement with reported ICC; effect size expressed in units of the study's own replicate SD** | Effects below the noise floor are not effects |
| Uncontrolled before/after clock change | **Randomized parallel-arm with a pre-specified single primary clock** | Regression to the mean guarantees apparent success otherwise |
| Hazard estimation pooled over all "validated" supercentenarians | **Stratified hazard estimation by pre-registered documentation tier** | Directly tests the error-artifact hypothesis |
| Period life expectancy for claims about limits | **Cohort life expectancy, or explicit period/cohort sensitivity analysis** | Period e₀ understates cohort e₀ during improvement, biasing deceleration claims |

### 9.6 An honest, decision-relevant reporting standard for longevity claims

Any claim that an intervention "extends lifespan" or "slows ageing" in humans should be required to state which parameter it claims to have moved:

- **"We reduced the Makeham term"** — extrinsic mortality. Maximum available benefit in a rich country: **~1.1 years** (§1.5). Nearly exhausted.
- **"We reduced the Gompertz intercept"** — equivalent to shifting the mortality curve right by ln(k)/α years. Halving it: **~6.6 years**. Requires halving *all* age-related mortality. Saturates: each further halving buys the same amount again.
- **"We reduced the Gompertz slope"** — the only true anti-ageing claim. Requires demonstrating a change in α with a joint confidence region, over an age range wide enough to identify the slope, in a randomized design. **Never yet demonstrated in humans.**

Adopting this three-way classification as an editorial requirement would, on its own, defuse most of the overclaiming documented in §7.

---

## 10. Items flagged `uncertain` — verification queue for the lead researcher

Listed in descending priority. **None of these should enter the synthesis without independent confirmation.**

1. **"No epigenetic clock reversal has ever been shown to predict reduced mortality."** (§5.4) — I believe this is correct and it is a load-bearing claim of the whole report. Verify against a systematic review of aging-biomarker surrogacy and against FDA/EMA biomarker qualification registers.
2. **TRIIM-X (NCT04375657) status and results.** (§7.4) — enrolment, completion, publication. If a controlled replication has reported, it changes the assessment materially.
3. **Per-clock ICC values from Higgins-Chen 2022 supplementary tables** for Horvath, Hannum, PhenoAge, GrimAge, DunedinPoAm. (§5.2) — currently `null`; these are the crux numbers.
4. **Exact cause-deleted gains from NVSR 61(9), "United States Life Tables Eliminating Certain Causes of Death, 1999–2001."** (§11) — I have only "heart disease almost 4 years, cancer more than 3 years." The per-cause table (especially Alzheimer's, diabetes, stroke, respiratory) is needed.
5. **Olshansky et al. 2024 per-country decadal improvement rates and their projected probability of surviving to 100.** (§6.4) — I have only the aggregate "~6.5 years since 1990."
6. **Global life expectancy and HALE for 2023–2025** (WHO/UN WPP). (§6.3) — currently `null`.
7. **Okinawan koseki destruction in the 1945 Battle of Okinawa** as a documented cause of weak birth records. (§4.3)
8. **Greek pension-fraud figures from a primary audit source** rather than journalism. (§4.4)
9. **Rockwood/Mitnitski frailty index quantitative properties** — the ~0.7 empirical limit, deficit-count insensitivity, mortality HRs. (§5.6)
10. **Einmahl et al. maximum endpoint estimate for women** (I have 124.7 for men only). (§3.4)
11. **US e₀ in 2019 (~78.8) and the attribution weights for 2010–2019 stagnation.** (§6.3)
12. **Olshansky, Carnes & Cassel 1990 *Science*, "In search of Methuselah"** — the classic cause-elimination bound (e₀ ≈ 85 as a practical ceiling). Referenced conceptually in §11 but **not verified this session**; I did not obtain it before the search budget was exhausted.

---

## 11. Quantitative Reality Check — what would it actually take?

This is the section the brief called the most important. Three independent lines of evidence converge.

### 11.1 Published cause-deleted life tables

**NCHS, "United States Life Tables Eliminating Certain Causes of Death, 1999–2001", National Vital Statistics Reports 61(9), 31 May 2013.** Cause-elimination life tables for 33 causes by race and sex. [`primary_abstract`/`secondary`]

| Quantity | Value |
|---|---|
| Gain in e₀ from **eliminating all heart disease** | **"almost 4 years"** |
| Gain in e₀ from **eliminating all cancer** | **"more than 3 years"** |
| Lifetime probability of dying **of heart disease** | **31%** |
| Lifetime probability of dying **of cancer** | **22%** |

Also [`secondary`, Demography/PMC2822405, an integrated cause-deleted decomposition]: in both 1970 and 2000, heart disease and cancer are the two causes whose elimination would most advance e₀. In 1970 heart disease accounted for ~2.4× the life-years lost to neoplasms; **by 2000 the ratio was only 1.2** — cardiovascular mortality fell dramatically while cancer did not, so cancer's *relative* weight rose. Notably, **cancer was responsible for more years of life lost in 2000 than in 1970 despite falling cancer mortality rates** — because people survived long enough to get it.

That last fact is the competing-risks principle in its purest form, and it is the central reason disease-by-disease elimination cannot deliver radical life extension.

### 11.2 My independent reconstruction

I computed the same quantities from Calibration B under a proportional-hazards approximation (removing a cause that accounts for share *s* of deaths ⇒ multiply all-cause hazard by (1−s)). `derived`:

| Cause eliminated | Share of US deaths | Modelled Δe₀ | Published Δe₀ | Agreement |
|---|---|---|---|---|
| **All cancer** | 22% | **+2.63 y** | "more than 3 years" | Good; model slightly low |
| **All heart disease** | 31% | **+3.92 y** | "almost 4 years" | **Excellent** |
| All cardiovascular disease (incl. stroke) | ~40% | +5.39 y | — | — |
| **All Alzheimer's/dementia** | ~6% | **+0.66 y** | — (`null`, see §10) | — |
| All diabetes | ~3% | +0.36 y | — | — |
| **Cancer AND heart disease, both** | 53% | **+7.95 y** | — | — |

The agreement on heart disease (3.92 modelled vs "almost 4" published) is close to exact, and the cancer figure is low by the expected amount and in the expected direction — cancer deaths are concentrated at somewhat younger ages than all-cause deaths, so a flat proportional-hazards approximation understates its cost. **This mutual corroboration between an independent structural model and the published cause-deleted life tables is the strongest quantitative result in this report.** It means the numbers can be trusted.

### 11.3 The headline reality check

> **Curing all cancer, everywhere, permanently, adds approximately 3 years to life expectancy.**
> **Curing all heart disease adds approximately 4 years.**
> **Curing all cardiovascular disease including stroke adds approximately 5 years.**
> **Curing all dementia adds well under 1 year.**
> **Curing both cancer and all heart disease together adds approximately 8 years — not 3 + 4 = 7 and certainly not 25.**
> **Abolishing every accident, homicide and non-age-related acute death adds approximately 1 year.**

Why these numbers are so much smaller than intuition expects:

1. **Competing risks.** Removing a cause does not grant immortality to the people it would have killed — it returns them to the remaining hazard, which at their age is already high and doubling every ~7 years. A 78-year-old saved from a heart attack faces a ~4%/yr hazard from everything else, rising to ~30%/yr by 100.
2. **The deaths are already old.** The great majority of cancer and cardiovascular deaths occur after 65, where the remaining life expectancy is modest and where the Gompertz slope is steep. Deleting a death at 82 buys the population far less than deleting a death at 30 — which is exactly why the 26% single-year fall in US overdose deaths (concentrated at ages 25–55) moved e₀ so efficiently in 2024.
3. **Sub-additivity.** Cancer alone is +2.6, heart disease alone +3.9, but both together is +8.0, not +6.5 — the gains become *super*-additive at the margin once a large fraction of the hazard is removed, because survivors reach ages where the removed causes would have dominated. But this only becomes powerful when the removed fraction approaches unity, which is unattainable.

### 11.4 The requirement, stated as a target

From §1.7, Calibration B:

> **Life expectancy of 100 requires an 85% reduction in mortality at every age — OR a 23% reduction in the Gompertz slope.**

The six leading causes of death together account for well under 70% of deaths. **Curing every one of them does not reach e₀ = 100.** There is no combination of disease-specific cures that gets there. The only route is a change in α.

And that is precisely the argument Olshansky et al. (2024) make from the demographic side: the gains of 1900–1990 came from Makeham and early-life mortality, which is a finite and nearly-spent resource; e₀ in the leading populations has risen only ~6.5 years since 1990 and is decelerating; *"unless new technologies address aging itself, further radical life extension in already long-lived countries remains implausible."*

**Two independent methods — a structural Gompertz model and 30 years of observed population data — reach the same conclusion. That convergence is the most robust finding in this section.**

### 11.5 The one genuinely encouraging number

Everything above is a constraint on *lifespan*. The healthspan picture contains the actionable opportunity:

**The global healthspan–lifespan gap is 9.6 years; in the United States it is 12.4 years.** Closing that gap does not require moving α at all. It requires compressing morbidity — moving disease onset later without moving death later. It is not subject to the competing-risks arithmetic that defeats disease-by-disease lifespan extension, because it is measured in quality-adjusted years within an existing lifespan rather than in additional years.

**Twelve years of disability-free life is a larger prize than any lifespan intervention on the table, and it is the only one whose feasibility is not in dispute.** Whether *that* is achievable is a question for the intervention agents; the demography merely establishes that the prize exists and how big it is.

---

## 12. Data series for charting

Provided in machine-readable form in `research/data/03-demography.json`. Summary of what is and is not there:

**Included and sourced:**
- US life expectancy anchor points: 1900, 1950, 1999–2001, 2022, 2023, 2024 (`secondary`, NCHS).
- Global e₀ and HALE, 2019 and 2021 (`primary_abstract`, WHO/GBD 2021).
- US age-adjusted death rate and drug-overdose death rate, 2022–2024 (`secondary`, NCHS).
- Survival to age 65 by sex, US 1900 and 2002 (`secondary`, CDC Aging Trends).
- Gompertz parameter sets for three calibrations, all `derived` with the derivation shown.
- **Model-generated** survival curves l(x) for all three calibrations and for every intervention scenario, explicitly tagged `"model_generated": true`. **These are not empirical life tables and must be labelled as model output in any chart.**
- Cause-deleted gains: published values (`secondary`) and my modelled values (`derived`), side by side.
- Clock table with r, ICC, mortality HR and surrogate status — with `null` wherever I could not source the value.
- Named errors with flaw and correction.

**Deliberately absent (do not fill in from memory):**
- Year-by-year empirical life-expectancy time series. HMD, Our World in Data and the CDC data files were all unreachable. **Only anchor points are given.** A synthetic annual series would be fabrication.
- Empirical l(x) survival curves for real populations in 1900/1950/2000/2020. I have only the survival-to-65 anchors above. **Every survival curve in the JSON is model output, tagged as such.**
- Per-clock ICCs other than DunedinPACE.
- Per-cause cause-deleted gains other than heart disease and cancer.

---

## 13. Sources

Grouped by section. **All were surfaced via WebSearch; none could be fetched in full text (§0.1).** DOIs and canonical URLs are given so the primaries can be verified directly.

### Mortality mathematics
1. Gompertz–Makeham law of mortality — https://en.wikipedia.org/wiki/Gompertz%E2%80%93Makeham_law_of_mortality
2. Tarkhov AE, Menshikov LI, Fedichev PO. *Strehler–Mildvan correlation is a degenerate manifold of Gompertz fit.* J Theor Biol (2017). doi:10.1016/j.jtbi.2017.01.009 — https://www.biorxiv.org/content/10.1101/064477
3. Gavrilova NS, Gavrilov LA. *Compensation Effect of Mortality as a Challenge to Life Extension.* SOA Living to 100 (2023) — https://www.soa.org/4ad103/globalassets/assets/files/resources/essays-monographs/2023-living-to-100-compendium/2023-living-to-100-comp-gavrilova-compensation.pdf
4. *The Compensation Effect of Mortality: A Global Analysis of Human Populations.* PMC12721371
5. Missov TI, Lenart A. *The Gompertz force of mortality in terms of the modal age at death.* Demographic Research 32(36) — https://www.demographic-research.org/volumes/vol32/36/32-36.pdf
6. *Individualizing Life Expectancy Estimates for Older Adults Using the Gompertz Law of Human Mortality.* PMC4180452
7. Manton KG, Tolley HD. *Rectangularization of the Survival Curve.* J Aging Health 3(2) (1991). doi:10.1177/089826439100300204
8. *Rectangularization of the survival curve reconsidered: the maximum inner rectangle approach.* Population Studies (2018). doi:10.1080/00324728.2017.1414299
9. Wilmoth JR, Horiuchi S. *Rectangularization revisited: variability of age at death within human populations.* Demography (1999). doi:10.2307/2648085

### Late-life plateaus
10. Barbi E, Lagona F, Marsili M, Vaupel JW, Wachter KW. *The plateau of human mortality: demography of longevity pioneers.* Science 360:1459 (2018). doi:10.1126/science.aat3119
11. Newman SJ. *Errors as a primary cause of late-life mortality deceleration and plateaus.* PLOS Biology 16(12):e2006776 (2018). doi:10.1371/journal.pbio.2006776
12. Newman SJ. *Plane inclinations: a critique of hypothesis and model choice in Barbi et al.* PLOS Biology. doi:10.1371/journal.pbio.3000048
13. Gavrilov LA, Gavrilova NS. *Late-life mortality is underestimated because of data errors.* PLOS Biology 17(2):e3000148 (2019). doi:10.1371/journal.pbio.3000148
14. Gavrilova NS, Gavrilov LA. *New trend in old-age mortality: Gompertzialization of mortality trajectory.* Gerontology 65(5):451
15. Gavrilova NS, Gavrilov LA. *The curse of the plateau: measuring confidence in human mortality estimates at extreme ages.* Theor Popul Biol (2022). doi:10.1016/j.tpb.2022.01.002
16. *Comment on "The plateau of human mortality".* Science (2018). doi:10.1126/science.aav1200
17. Alvarez J-A, Villavicencio F, et al. *The question of the human mortality plateau.* Demographic Research 48(11) — https://www.demographic-research.org/volumes/vol48/11/48-11.pdf
18. *Regularities in human mortality after age 105.* PMC8279393
19. Vaupel JW, Manton KG, Stallard E (1979) frailty/gamma-Gompertz; and *Information measures and design issues in the study of mortality deceleration: findings for the gamma-Gompertz model.* Lifetime Data Anal (2021). doi:10.1007/s10985-021-09518-4
20. *Revisiting mortality deceleration patterns in a gamma-Gompertz-Makeham framework.* (Univ. Évora repository)
21. *Human mortality at extreme age.* arXiv:2001.04507
22. *Is there a cap on longevity? A statistical review.* arXiv:2104.07843

### The limit debate
23. Dong X, Milholland B, Vijg J. *Evidence for a limit to human lifespan.* Nature 538:257–259 (2016). doi:10.1038/nature19793
24. Hughes BG, Hekimi S. *Many possible maximum lifespan trajectories.* Nature 546 (2017). doi:10.1038/nature22786
25. Rozing MP, Kirkwood TBL, Westendorp RGJ. *Questionable evidence for a limit to human lifespan.* Nature 546 (2017). doi:10.1038/nature22790
26. de Beer J, Bardoutsos A, Janssen F. *Maximum human lifespan may increase to 125 years.* Nature 546 (2017). doi:10.1038/nature22792
27. Brown NJL, Albers CJ, Ritchie SJ. *Contesting the evidence for limited human lifespan.* Nature 546 (2017). doi:10.1038/nature22784 — https://www.casperalbers.nl/files/nature22784.pdf
28. Lenart A, Vaupel JW. *Questionable evidence for a limit to human lifespan.* Nature 546 (2017).
29. Dong X et al. *Dong et al. reply.* Nature (2017). doi:10.1038/nature22787 and doi:10.1038/nature22789
30. Einmahl JJ, Einmahl JHJ, de Haan L. *Limits to human life span through extreme value theory.* JASA 114(527):1075–1080 (2019). doi:10.1080/01621459.2018.1537912
31. Pearce M, Raftery AE. *Probabilistic forecasting of maximum human lifespan by 2100 using Bayesian population projections.* Demographic Research 44(52):1271–1294 (2021) — https://www.demographic-research.org/articles/volume/44/52/ ; PMC11448547
32. Pearce M, Raftery AE. *Will this be a record-breaking century for human longevity?* Significance (2021). doi:10.1111/1740-9713.01582
33. Zak N. *Evidence that Jeanne Calment died in 1934 — not 1997.* Rejuvenation Research (2019). doi:10.1089/rej.2018.2167
34. *Comment on "The real facts supporting Jeanne Calment as the oldest ever human."* (2023)
35. BBC News, *France insists world's "oldest woman" was not fake* (Sept 2019) — https://feeds.bbci.co.uk/news/world-europe-49746060
36. *Why Gilgamesh failed: the mechanistic basis of the limits to human lifespan.* Nature Aging (2022). doi:10.1038/s43587-022-00291-z

### Data quality and Blue Zones
37. Newman SJ. *Supercentenarian and remarkable age records exhibit patterns indicative of clerical errors and pension fraud.* bioRxiv 704080 v3 (14 Mar 2024). doi:10.1101/704080 — **not peer-reviewed as of latest reporting**
38. Newman SJ. *Supercentenarians and the oldest-old are concentrated into regions with no birth certificates and short lifespans.* bioRxiv 704080 v1 (2019)
39. UCL IOE. *UCL demographer's work debunking "Blue Zone" regions wins Ig Nobel prize* (Sept 2024) — https://www.ucl.ac.uk/ioe/news/2024/sep/ucl-demographers-work-debunking-blue-zone-regions-exceptional-lifespans-wins-ig-nobel-prize
40. Newman SJ. *"The data on extreme human ageing is rotten from the inside out."* The Conversation (2024)
41. Poulain M et al. *Validity of Blue Zones demography: a response to critiques.* The Gerontologist 65(12):gnaf246 (2025). doi:10.1093/geront/gnaf246
42. Blue Zones. *Are supercentenarian claims based on age exaggeration?* — https://www.bluezones.com/news/are-supercentenarian-claims-based-on-age-exaggeration/
43. Science. *Do "blue zones," supposed havens of longevity, rest on shaky science?* — https://www.science.org/content/article/do-blue-zones-supposed-havens-longevity-rest-shaky-science
44. STAT. *Are "blue zones" real? A science and wellness industry clash* (May 2026)
45. PRX/The World. *Fake news? Unpacking the "Blue Zone" myth in Okinawa* (Dec 2024)
46. *The mystery of Japan's missing centenarians explained.* Demographic Research 26(11) — https://www.demographic-research.org/volumes/vol26/11/26-11.pdf
47. BBC News. *More than 230,000 Japanese centenarians "missing"* (Sept 2010); Japan Times, *234,000 centenarians listed in registries missing*
48. GreekReporter / European Pensions / HuffPost coverage of the 2011–2013 Greek pension audits (`uncertain` — journalism, primary audit not obtained)

### Aging clocks and biomarkers
49. Horvath S. *DNA methylation age of human tissues and cell types.* Genome Biology 14:R115 (2013)
50. Hannum G et al. *Genome-wide methylation profiles reveal quantitative views of human aging rates.* Molecular Cell 49(2):359–367 (2013)
51. Levine ME et al. *An epigenetic biomarker of aging for lifespan and healthspan.* Aging 10(4):573–591 (2018). doi:10.18632/aging.101414
52. Lu AT et al. *DNA methylation GrimAge strongly predicts lifespan and healthspan.* Aging 11:303–327 (2019)
53. Lu AT et al. *DNA methylation GrimAge version 2.* Aging (2022). doi:10.18632/aging.204434 — https://www.aging-us.com/article/204434/text
54. Belsky DW et al. *DunedinPACE, a DNA methylation biomarker of the pace of aging.* eLife 11:e73420 (2022). doi:10.7554/eLife.73420
55. Higgins-Chen AT, Thrush KL, Levine ME et al. *A computational solution for bolstering reliability of epigenetic clocks: implications for clinical trials and longitudinal tracking.* Nature Aging 2:644–661 (2022). doi:10.1038/s43587-022-00248-2 ; PMC9586209
56. *Principal component analysis improves reliability of epigenetic aging biomarkers.* Nature Aging (2022). doi:10.1038/s43587-022-00253-5
57. Oh HS-H, Wyss-Coray T et al. *Organ aging signatures in the plasma proteome track health and disease.* Nature (Dec 2023)
58. *Proteomic aging clock predicts mortality and risk of common age-related diseases in diverse populations.* Nature Medicine (2024). doi:10.1038/s41591-024-03164-7
59. *Organ-specific proteomic aging clocks predict disease and longevity across diverse populations.* Nature Aging (2025). doi:10.1038/s43587-025-01016-8
60. *Plasma proteomics links brain and immune system aging with healthspan and longevity.* Nature Medicine (2025). doi:10.1038/s41591-025-03798-1
61. *A unified framework for systematic curation and evaluation of aging biomarkers.* Nature Aging (2025). doi:10.1038/s43587-025-00987-y
62. *Development of a novel epigenetic clock resistant to changes in immune cell composition.* bioRxiv 2023.03.01.530561
63. *Epigenetic Clocks: Beyond Biological Age, Using the Past to Predict the Present and Future.* PMC12539533
64. *Uncertainty quantification in epigenetic clocks via conformalized quantile regression.* medRxiv 2024.09.06.24313192
65. Fahy GM et al. *Reversal of epigenetic aging and immunosenescent trends in humans.* Aging Cell 18(6):e13028 (2019). doi:10.1111/acel.13028
66. ClinicalTrials.gov NCT04375657 — TRIIM-X — https://clinicaltrials.gov/study/NCT04375657

### Surrogate endpoints
67. Prentice RL. *Surrogate endpoints in clinical trials: definition and operational criteria.* Statistics in Medicine 8:431–440 (1989). doi:10.1002/sim.4780080407
68. Buyse M, Molenberghs G et al. *The validation of surrogate endpoints in meta-analyses of randomized experiments.* Biostatistics 1(1):49 (2000)
69. *Criteria for the validation of surrogate endpoints in randomized experiments.* Biometrics (1998). PMID:9840970

### Healthspan, morbidity, current demography
70. WHO. *COVID-19 eliminated a decade of progress in global level of life expectancy* (24 May 2024) — https://www.who.int/news/item/24-05-2024-covid-19-eliminated-a-decade-of-progress-in-global-level-of-life-expectancy
71. GBD 2021 Diseases and Injuries Collaborators. *Global incidence, prevalence, YLDs, DALYs and HALE for 371 diseases and injuries, 1990–2021.* The Lancet (2024). PMC11122111
72. WHO. *World Health Statistics 2025* — https://iris.who.int/server/api/core/bitstreams/c992fbdc-11ef-43db-a478-7e7a195403ae/content
73. Garmany A, Terzic A. *Global healthspan-lifespan gaps among 183 World Health Organization member states.* JAMA Network Open 7(12):e2450241 (2024)
74. *Healthspan-lifespan gap differs in magnitude and disease contribution across world regions.* PMC12402540
75. Fries JF. *Aging, natural death, and the compression of morbidity.* NEJM 303:130–135 (1980)
76. *Expansion, compression, neither, both? Divergent patterns in healthy, disability-free, and morbidity-free life expectancy across U.S. birth cohorts, 1998–2016.* Demography 59(3):949 (2022)
77. *Are we adding pain-free years to life? A test of compression versus expansion of morbidity.* J Gerontol A 79(8):glae157 (2024)
78. *Disability-free life expectancy over 30 years: a growing female disadvantage in the US population.* Am J Public Health (2016). PMID:26985619
79. *Disability and morbidity among US birth cohorts, 1998–2018: a multidimensional test of dynamic equilibrium theory.* PMC10625143
80. NCHS. *Mortality in the United States, 2023.* NCHS Data Brief 521 (Dec 2024) — https://www.cdc.gov/nchs/data/databriefs/db521.pdf
81. NCHS press release, *U.S. life expectancy hits record high as drug overdose deaths decline in 2024* (29 Jan 2026) — https://www.cdc.gov/nchs/pressroom/releases/20260129.html
82. NCHS press release, *New reports confirm U.S. life expectancy increased while drug overdose deaths decreased in 2023* (19 Dec 2024)
83. NCHS. *United States Life Tables Eliminating Certain Causes of Death, 1999–2001.* NVSR 61(9) (2013) — https://www.cdc.gov/nchs/data/nvsr/nvsr61/nvsr61_09.pdf ; https://stacks.cdc.gov/view/cdc/231833
84. NCHS. *United States Life Tables, 2000.* NVSR 51(3) — https://www.cdc.gov/nchs/data/nvsr/nvsr51/nvsr51_03.pdf
85. Beltrán-Sánchez H et al. *An integrated approach to cause-of-death analysis: cause-deleted life tables and decompositions of life expectancy.* Demographic Research (2008). PMC2822405
86. CDC. *Trends in health and aging: older persons.* — https://www.cdc.gov/nchs/data/ahcd/agingtrends/06olderpersons.pdf
87. SSA. *Life tables for the United States Social Security Area 1900–2100.* Actuarial Study 120 — https://www.ssa.gov/oact/NOTES/pdf_studies/study120.pdf
88. SSA. *Actuarial life table* — https://www.ssa.gov/oact/STATS/table4c6.html
89. National Academies. *Explaining Divergent Levels of Longevity in High-Income Countries* (2011) — https://www.ncbi.nlm.nih.gov/books/NBK62373/
90. Olshansky SJ, Willcox BJ, Demetrius L, Beltrán-Sánchez H. *Implausibility of radical life extension in humans in the twenty-first century.* Nature Aging 4:1635–1642 (2024). doi:10.1038/s43587-024-00702-3
91. *Cohort mortality forecasts indicate signs of deceleration in life expectancy gains.* PMC12415247 (2025)
92. *Human life expectancies are still rising.* bioRxiv 2025.05.01.651310 (counter-argument to Olshansky)
93. *Gains in life expectancy from decreasing cardiovascular disease and cancer mortality — an analysis of 28 European countries 1995–2019.* PMC10663201
94. *Biological restraints on indefinite survival.* PMC10071417
95. Frontiers in Public Health. *Limits to lifespan growth.* doi:10.3389/fpubh.2022.1037544

---

## 14. One-paragraph summary

The Gompertz–Makeham law separates human mortality into an age-independent extrinsic term, a level term, and a slope term, and only the slope is ageing. Abolishing all extrinsic mortality in a rich country buys ~1.1 years of life expectancy; halving all age-related mortality buys ~6.6; curing all cancer buys ~3, all heart disease ~4, both together ~8; reaching a life expectancy of 100 requires an 85% cut in mortality at every age or a 23% reduction in the Gompertz slope, and no human intervention has ever been shown to move the slope at all. The claim that human lifespan is capped near 115 rests on a *Nature* paper whose post-hoc segmented regression was rejected by five independent groups; the claim that mortality plateaus after 105 rests on data in which fewer than one in five "validated" supercentenarians holds a birth certificate, where a 1.7% record-contamination rate is sufficient to manufacture the plateau from a pure Gompertz, and where introducing birth certificates in the US removed 69–82% of supercentenarian records. Epigenetic clocks carry up to ±9 years of technical noise between replicates of the same sample — larger than every intervention effect ever reported — the first-generation clocks are optimized to discard the biological signal they are said to measure, and no clock satisfies even the first Prentice criterion for surrogacy, because no human ageing intervention has been shown to affect a hard endpoint. The one number that is both large and uncontested is the healthspan–lifespan gap: 9.6 years globally and 12.4 years in the United States, widening.
