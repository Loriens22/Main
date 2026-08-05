# 01 — Molecular and Cellular Mechanisms of Aging
## Damage, Senescence, and Epigenetic Reprogramming

**Agent 1 of 5 · Domain report · Compiled 2026-08-04**

---

## 0. Method, provenance, and an important epistemic warning

### 0.1 What I could and could not do

This container's egress policy **blocked WebFetch to every external host tested** — nature.com, cell.com, science.org, sciencedirect.com, pubmed.ncbi.nlm.nih.gov, pmc.ncbi.nlm.nih.gov, europepmc.org, eutils.ncbi.nlm.nih.gov, biorxiv.org, and even a plain PDF on a university server. All returned HTTP 403. This was confirmed at the proxy itself, which logged `connect_rejected — gateway answered 403 to CONNECT (policy denial or upstream failure)` for each host. Direct `curl` via Bash is likewise restricted to an allowlist that excludes all publisher and NCBI hosts.

**Consequence: I have not read a single full text or a single verbatim abstract in this session.** Every quantity below was surfaced through WebSearch result summaries, which synthesise from abstracts, full texts, press releases, reviews and news coverage without always distinguishing them.

### 0.2 Source-confidence tagging (applies throughout, and in the JSON)

Every quantitative claim carries one of:

| Tag | Meaning |
|---|---|
| `primary_abstract` | The number appeared in phrasing that is clearly the paper's own abstract or title, and I cross-checked it in ≥2 independently-worded searches. |
| `secondary` | The number was reported by a review, news outlet, press release, institutional page, or full-text-derived summary — not the abstract. |
| `uncertain` | Surfaced once, in ambiguous phrasing, or with internal inconsistency. Treat as a lead to verify, not as evidence. |
| `null` | I could not establish it. **A null here is a correct outcome, not a gap I have papered over.** |

Where a number is commonly quoted in the field but I could not verify it in this session, I have written `null` and said so, rather than reproducing it from memory. There are a number of such cases and they are flagged explicitly.

**Every reader of this report should treat the numbers as verification leads with canonical URLs attached, not as independently confirmed values.** I have supplied DOIs/PMIDs/URLs throughout precisely so that the lead researcher, or anyone with unrestricted network access, can check them.

### 0.3 Evidence grading scale (defined here, used in §11)

| Grade | Definition |
|---|---|
| **A** | ≥2 independent, adequately-powered human RCTs with **hard clinical endpoints** (all-cause mortality, MI, stroke, incident disease, fracture) showing concordant direction; or a Cochrane-grade meta-analysis of such trials. |
| **B** | **One** adequately-powered human RCT (n sufficient for its stated primary endpoint) with a hard or regulator-accepted surrogate endpoint, **primary endpoint met**, not yet independently replicated. |
| **C** | Human RCT(s) restricted to functional/performance or biomarker endpoints; **or** RCTs that missed their pre-specified primary endpoint but showed secondary signals; **or** triangulated human observational + Mendelian randomization evidence for the *target* (not the drug). |
| **D** | Human single-arm, open-label, or uncontrolled pilot studies (typically n < 50); human mechanistic/biomarker studies with no clinical endpoint and no control arm. |
| **E** | Non-human in vivo only — mouse, primate, killifish, invertebrate — including transgenic/genetic models; or in vitro only. **No human efficacy data of any kind.** |
| **F** | **Contradicted.** The best available evidence is null, or points in the opposite direction to the mechanistic hypothesis. |

Two modifiers are appended where relevant:
- `‡` — **replication status is poor**: the only supporting in vivo work comes from the originating laboratory or its commercial affiliate.
- `¤` — **material conflict of interest** in the pivotal report (company-employed authors, company-affiliated journal, or founder-owned IP).

---

## 1. The Hallmarks of Aging framework — a critical assessment

### 1.1 What the framework is

López-Otín, Blasco, Partridge, Serrano and Kroemer published nine hallmarks in *Cell* in 2013 and expanded to **twelve** in the 2023 update, "Hallmarks of aging: An expanding universe," *Cell* 186:243–278 ([doi:10.1016/j.cell.2022.11.001](https://www.cell.com/cell/fulltext/S0092-8674(22)01377-0), [PMID 36599349](https://pubmed.ncbi.nlm.nih.gov/36599349/)).

The twelve: genomic instability, telomere attrition, epigenetic alterations, loss of proteostasis, **disabled macroautophagy** (new), deregulated nutrient-sensing, mitochondrial dysfunction, cellular senescence, stem cell exhaustion, altered intercellular communication, **chronic inflammation** (new), **dysbiosis** (new). `source_confidence: primary_abstract`

The authors' own three admission criteria, as reported: (1) age-associated manifestation; (2) experimental accentuation accelerates aging; (3) therapeutic intervention decelerates, stops or reverses aging. `source_confidence: primary_abstract`

They classify hallmarks as **primary** (causes of damage), **antagonistic** (compensatory responses that become deleterious), and **integrative** (culprits of phenotype).

### 1.2 Is it a mechanistic theory or a descriptive taxonomy?

**It is a taxonomy, and the field's most serious critics say so explicitly.**

The sharpest published critique is **Gems & de Magalhães, "The hoverfly and the wasp: A critique of the hallmarks of aging as a paradigm," *Ageing Research Reviews* 2021** ([PMID 34271186](https://pubmed.ncbi.nlm.nih.gov/34271186/), [PMC7611451](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7611451/)). Their central argument, as surfaced: whereas the hallmarks of cancer provide "a paradigmatic account of the causes of cancer with profound explanatory power," the hallmarks of aging **do not**; they are "a group of ideas dressed up to mimic a paradigm, when there isn't one." The title's metaphor is Batesian mimicry — the hoverfly (hallmarks of aging) mimics the wasp (hallmarks of cancer) without possessing the sting (explanatory power). `source_confidence: secondary` — the quoted phrases were surfaced by search; I have not read the paper.

A more recent critique in the same journal, "The Hallmarks of aging: Paradigms and scientific progress" ([ScienceDirect S156816372600173X](https://www.sciencedirect.com/science/article/pii/S156816372600173X)), makes the structural point precisely: the framework "mainly accounts for the manifestations of aging rather than the root causal architecture," and "there are no strong mechanisms for establishing causal ordering among these processes." Several hallmarks are plausibly **downstream** rather than primary, creating "confusion over what constitutes drivers versus passengers of aging." `source_confidence: secondary`

### 1.3 The criteria are weaker than they look — four structural problems

**(a) Criterion 2 is satisfied by any sufficiently toxic perturbation.** "Experimentally accentuating it accelerates aging" is satisfied by lesions that are simply damaging. A mouse in which you break DNA, poison mitochondria, or ablate stem cells will look old and die early. This does not establish that the corresponding process is what makes a *normal* mouse old. This is precisely the objection later levelled at the ICE mouse (§6.2) — accelerated-aging phenocopies are not evidence of the normal causal pathway, because sickness is a convergent phenotype.

**(b) Criterion 3 is satisfied by disease-specific rescue.** An intervention can extend median lifespan by suppressing one strain-specific lethal pathology without touching aging rate. This is the substantive content of the "900-day rule" critique (§10.1) and of the ITP's repeated non-replications.

**(c) The criteria are never applied with a stated threshold.** No effect size, no replication requirement, no species requirement. In practice "dysbiosis" was admitted in 2023 on an evidence base that would not have supported "telomere attrition" in 2013.

**(d) The hallmarks are not independent, and the framework has no formal structure to handle that.** Senescence causes chronic inflammation; genomic instability causes senescence; epigenetic alteration is partly a *readout* of both. A taxonomy of twelve mutually-causal, mutually-confounded processes cannot be used to attribute causal weight, and yet it is routinely used that way in grant applications and company decks.

### 1.4 Causal evidence, hallmark by hallmark — honest assessment

The ratings in §11.2 and the JSON are **my subjective analyst judgements on a 0–10 scale, not measured quantities.** I state that explicitly in the JSON so downstream consumers cannot mistake them for data. The reasoning:

- **Strongest causal case: cellular senescence.** Genetic ablation (INK-ATTAC) in wild-type mice extends median lifespan; transplantation of senescent cells into young mice causes dysfunction. This is a bidirectional (necessity + sufficiency) argument, which none of the other hallmarks can currently make in mammals. **But it is undercut by Grosse 2020 (§2.4) and by the ITP fisetin null (§2.6).**
- **Strong comparative case: genomic instability.** Cagan 2022 (§6.1) — end-of-life somatic mutation burden is conserved within ~3-fold across mammals whose lifespans vary ~30-fold. Powerful, but *correlational across species*.
- **Human-genetics case, pointing the wrong way: telomere attrition.** Mendelian randomization is the strongest causal tool available in humans, and it says longer telomeres *increase* cancer risk (§3.3). This is the single most important honest finding in this domain.
- **Weakest causal case: loss of proteostasis.** There is, as of my searches, **no demonstration that systemic chaperone or HSF1 overexpression extends mammalian lifespan** (§7.1).
- **Actively falsified as a therapeutic target: oxidative damage.** The Cochrane record (§7.3) is a Grade-A human refutation.

---

## 2. Cellular senescence

### 2.1 SASP biology

The founding characterisation is **Coppé et al., "Senescence-associated secretory phenotypes reveal cell-nonautonomous functions of oncogenic RAS and the p53 tumor suppressor," *PLoS Biology* 2008;6:e301** ([PMID 19053174](https://pubmed.ncbi.nlm.nih.gov/19053174/), [journal link](https://journals.plos.org/plosbiology/article?id=10.1371%2Fjournal.pbio.0060301)).

Key reported findings: human cells senesced by genotoxic stress secrete a broad inflammatory/malignancy-associated factor set; the SASP develops **slowly, over ≥4 days** in cultured fibroblasts, and only after DNA damage sufficient to induce senescence; oncogenic RAS intensifies it; **p53 loss intensifies it further**; SASP-intense senescent cells promote growth and aggressiveness of neighbouring pre-malignant cells. `source_confidence: primary_abstract`

The kinetic point matters and is routinely ignored: **SASP is not an instantaneous marker of the senescent state.** Assays that score senescence at 24–48 h after an insult are scoring growth arrest, not SASP.

Current synthesis: Birch & Gil-lineage review, *Nat Rev Mol Cell Biol* 2024, "The senescence-associated secretory phenotype and its physiological and pathological implications" ([s41580-024-00727-x](https://www.nature.com/articles/s41580-024-00727-x)).

### 2.2 The problem of quantifying senescent cell burden — this is the field's binding constraint

There is **no validated, commercially available measure of total-body senescent cell burden in humans.** Human data come from tissue biopsy in research settings or post-mortem analysis. `source_confidence: secondary`

Markers in use and their specific failures:

- **p16INK4a in human skin** — Ressler et al. 2006 ([PMID 16911562](https://pubmed.ncbi.nlm.nih.gov/16911562/)) reported p16INK4A+ cell numbers significantly higher in elderly than young, in both epidermis and dermis. `source_confidence: secondary`
- **p16INK4a mRNA in peripheral blood T cells** — proposed as a low-cost blood biomarker of molecular age, rising with age and associated with smoking and physical inactivity ([PMC2752333](https://pmc.ncbi.nlm.nih.gov/articles/PMC2752333/)). `source_confidence: secondary`
- **p16INK4a is not senescence-specific.** p16Ink4a and SA-β-gal are induced in macrophages as part of a *reversible* physiological response to immune stimuli, and can be induced in **p53-null mice** — unlike bona fide senescence ([Aging (Albany NY), PMC5611982](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5611982/)). `source_confidence: primary_abstract`

  **This is not a minor caveat. It means that an unknown fraction of the "senescent cells" cleared in every p16-based mouse experiment, and counted in every human senolytic biomarker trial, are activated macrophages.**
- **Single-cell transcriptomics does not rescue it** — *Cdkn2a*/*Cdkn1a* are low-expression genes with high dropout; canonical markers are "weak and non-specific."
- The field's own response is **MICSE: "Guidelines for minimal information on cellular senescence experimentation in vivo," *Cell* 2024** ([S0092-8674(24)00640-8](https://www.cell.com/cell/fulltext/S0092-8674(24)00640-8)) — an explicit admission that pre-2024 in vivo senescence literature is not comparable across labs. Cell-type-specific signature tools have followed (SenePy, *Nat Commun* 2025, [s41467-025-57047-7](https://www.nature.com/articles/s41467-025-57047-7)) and a "senotypes" taxonomy in *Nature Aging* 2026 ([s43587-026-01148-5](https://www.nature.com/articles/s43587-026-01148-5)).

### 2.3 The Baker / van Deursen transgenic clearance experiments

**Baker et al. 2011, *Nature* 479:232–236** ([PMID 22048312](https://pubmed.ncbi.nlm.nih.gov/22048312/)) — INK-ATTAC in the **BubR1 hypomorphic progeroid** background. Clearance of p16Ink4a+ cells delayed onset of age-related phenotypes in eye, adipose tissue and skeletal muscle. **Lifespan effect in this paper: `null` — I could not verify from search whether BubR1H/H lifespan was extended, and I am not going to assert it from memory.** The model limitation is acknowledged in the literature: "It remains an open question as to whether BubR1 is also relevant in normal aging." `source_confidence: secondary`

**Baker et al. 2016, *Nature* 530:184–189** ([doi:10.1038/nature16932](https://www.nature.com/articles/nature16932), [PMID 26840489](https://pubmed.ncbi.nlm.nih.gov/26840489/)) — INK-ATTAC in **wild-type** mice; AP20187 twice weekly from 12 months of age. This is the pivotal experiment for the whole senolytic field.

| Quantity | Value | Confidence |
|---|---|---|
| Median lifespan, mixed background | **+27%, p < 0.001** | `secondary` |
| Median lifespan, pure C57BL/6 | **+24%, p < 0.001** | `secondary` |
| Maximum lifespan, mixed background, **sexes pooled** | significant, **p = 0.0295** | `secondary` |
| Maximum lifespan, mixed background, **each sex separately** | **not significant** | `secondary` |
| Maximum lifespan, C57BL/6, pooled or separate | **not extended** | `secondary` |
| N per arm, per sex | `null` | — |
| Cage/litter accounted for in analysis | `null` | — |

**Cross-check discrepancy, reported honestly:** a second, independently-worded search that specifically requested the abstract returned only the qualitative statement — "AP20187 treatment extended median lifespan in both male and female mice of two distinct genetic backgrounds" — **with no percentages**. The 24%/27% figures therefore appear to come from the full text or from secondary summaries, **not the abstract**. I am reporting both what the abstract says and where the numbers came from.

**The maximum-lifespan result is the most under-reported fact in the senolytics literature.** Maximum lifespan was extended in exactly one of four pre-specifiable comparisons (two backgrounds × pooled/separate), and only after pooling sexes — which is the analysis most vulnerable to inflated type-I error. The honest summary is: **senescent cell clearance compresses morbidity and shifts the median; the evidence that it moves the tail of the survival distribution is weak.**

### 2.4 The counter-experiment that the field under-weights

**Grosse et al., "Defined p16High Senescent Cell Types Are Indispensable for Mouse Healthspan," *Cell Metabolism* 2020;32:87–99** ([PMID 32485135](https://pubmed.ncbi.nlm.nih.gov/32485135/), [journal](https://www.cell.com/cell-metabolism/fulltext/S1550-4131(20)30241-2)).

Reported findings: age-induced p16High senescence appears around **10–12 months**; the **majority of p16High cells are vascular endothelial cells, mostly liver sinusoidal endothelial cells (LSECs)**, with lesser contributions from macrophages and adipocytes; **continuous or acute elimination of p16High cells disrupted blood–tissue barriers, causing liver and perivascular fibrosis and health deterioration**; senescent LSECs are **not replaced** after removal; early-stage senescent LSECs show *enhanced* capacity to clear macromolecular waste including oxidised LDL. `source_confidence: primary_abstract`

This is a direct, same-technology contradiction of the "senescent cells are uniformly deleterious" premise. It is not reconciled with Baker 2016 anywhere I could find. **Both results are probably right, and the reconciliation is that "p16High" labels at least two biologically opposite populations** — which is exactly what the marker-specificity problem in §2.2 predicts.

### 2.5 Transplantation — the sufficiency argument

**Xu et al., "Senolytics improve physical function and increase lifespan in old age," *Nature Medicine* 2018;24:1246–1256** ([doi:10.1038/s41591-018-0092-9](https://www.nature.com/articles/s41591-018-0092-9), [PMID 29988130](https://pubmed.ncbi.nlm.nih.gov/29988130/)).

Two claims:
1. Transplanting **relatively small numbers** of senescent cells into young mice causes persistent physical dysfunction and spreads senescence to host tissues. `source_confidence: primary_abstract`
2. Intermittent oral D+Q in naturally aged mice (treatment initiated at ~24–27 months) **increased post-treatment survival by 36% and lowered the mortality hazard to 65%** (i.e. HR ≈ 0.65). `source_confidence: primary_abstract` — this phrasing recurred consistently and reads as abstract text.

**The critical, routinely-mangled distinction: "post-treatment survival," not lifespan.** This is *remaining* life measured from a start age of ~24–27 months, in a cohort already selected by surviving to that age. It is **not** a 36% lifespan extension, and it is quoted as one constantly. The corresponding total-lifespan effect is `null` — not reported in what I could surface, and much smaller arithmetically.

### 2.6 Senolytic pharmacology and the ITP verdict

**The single most important result in this section is a negative one.**

**Harrison et al., ITP, *GeroScience* 2024** — "Astaxanthin and meclizine extend lifespan in UM-HET3 male mice; **fisetin**, SG1002, dimethyl fumarate, mycophenolic acid, and 4-phenylbutyrate **do not significantly affect lifespan in either sex** at the doses and schedules used" ([PMC10828146](https://pmc.ncbi.nlm.nih.gov/articles/PMC10828146/)).

Additional reported detail: **fisetin, at the dose and route used, did not significantly lower p16Ink4a mRNA in UM-HET3 liver, kidney or brain.** `source_confidence: secondary`

That second sentence is decisive and is almost never quoted. It means the ITP fisetin arm was not merely a failed efficacy test — **it was a failed target-engagement test.** Fisetin, the most widely self-administered "senolytic" in the consumer longevity market, did not measurably reduce a senescence marker in three organs of the most rigorously studied mouse population in gerontology.

Same paper, sex-specificity: **astaxanthin +12% median lifespan in males only; meclizine +8% median in males only** ([JAX repository copy](https://mouseion.jax.org/cgi/viewcontent.cgi?article=1031&context=stfb2024)). `source_confidence: secondary`

**Navitoclax (ABT-263).** Dose-limiting **thrombocytopenia** from on-target BCL-xL inhibition in platelets, which depend on BCL-XL for survival ([PK/PD meta-analysis, *Cancer Chemother Pharmacol* 2014](https://link.springer.com/article/10.1007/s00280-014-2530-9)). Independently: navitoclax **decreased trabecular bone volume fraction in aged female and male mice despite reducing senescent cell burden** (*Front Cell Dev Biol* 2020;8:354, [PMC7252306](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7252306/)). `source_confidence: primary_abstract` — **Navitoclax is not a viable systemic geroprotector.** Its senolytic effect and its toxicity are the same molecular event.

### 2.7 The human trial record — precisely what has and has not been shown

**Nothing in humans has been shown to extend lifespan, extend healthspan on a hard endpoint, or reduce mortality.** What exists:

| Trial | Design | n | Endpoint status | Grade |
|---|---|---|---|---|
| **Justice 2019**, IPF ([PMID 30616998](https://pubmed.ncbi.nlm.nih.gov/30616998/)) | Two-centre, **open-label**, no control | **14** | Primary endpoints were **retention and completion rates** — i.e. feasibility, not efficacy. D 100 mg/d + Q 1250 mg/d, 3 d/wk × 3 wk. 6MWD change: `null` | D |
| **Hickson 2019**, diabetic kidney disease ([PMID 31542391](https://pubmed.ncbi.nlm.nih.gov/31542391)) | Open-label, no control | **9** | Reduced adipose p16+/p21+ cells, SA-β-gal, macrophage infiltration, circulating SASP. **Required a corrigendum — see §10.3** | D |
| **SToMP-AD**, mild AD (*Nat Med* 2023, [s41591-023-02543-w](https://www.nature.com/articles/s41591-023-02543-w)) | Open-label, no control | **5 completers** | Dasatinib detectable in CSF in 4/5 (0.281–0.536 ng/ml); **quercetin not detected in CSF at all**; CSF **IL-6 and GFAP increased**; cognitive and neuroimaging endpoints unchanged | D |
| **AFFIRM-LITE** fisetin, NCT03675724 | Phase 2 RCT, placebo-controlled | `null` | **No results published as of my searches** (record updated Nov 2025) | — |
| **UBX0101**, knee OA (Unity) | Phase 2, **randomised, double-blind, placebo-controlled** | **183** | **FAILED.** No significant difference vs placebo in WOMAC-A at 12 weeks at any of 0.5/2.0/4.0 mg. Programme discontinued; share price −66% | **F** |
| **UBX1325 / foselutoclax ASPIRE**, DME | Phase 2b, randomised, double-masked, **active-controlled vs aflibercept** | **52** | **Missed the pre-specified primary non-inferiority endpoint** (NI achieved at 88% CI vs a 90% threshold at the average of weeks 20 & 24); BCVA +5.2 ETDRS letters at 24 wk; NI achieved at 9/10 timepoints through 36 wk | C |

`source_confidence` for the trial table: `secondary` throughout except the SToMP-AD CSF concentrations, which are `primary_abstract`.

A 2026 landscape summary states **≥14 human D+Q trials completed or underway**, most **under 50 participants and under 6 months**, and that neither senolytics nor partial reprogramming has been shown to extend human lifespan ([Beyond Tomorrow, 2026](https://beyondtmrw.org/article/senolytics-and-partial-reprogramming-human-trial-status-in-2026)). `source_confidence: secondary`

Registered trials of note: **NCT04733534** (St. Jude, childhood cancer survivors, D+Q and fisetin arms, primary outcomes walking speed and blood senescent cell abundance); **NCT05758246** STOP-Sepsis (Minnesota, primary completion est. Aug 2026); **TROFFi** fisetin in breast cancer survivors ([PMID 41835341](https://pubmed.ncbi.nlm.nih.gov/41835341/)).

**Bottom line for senescence in humans: the one adequately-powered, properly-blinded, placebo-controlled senolytic efficacy trial ever conducted (UBX0101, n=183) failed outright.** Everything positive in humans is open-label, uncontrolled, and n ≤ 14.

---

## 3. Telomeres and telomerase

### 3.1 Foundational biology

Blackburn and Greider's discovery of telomerase, and the Blackburn/Greider/Szostak 2009 Nobel, established the mechanism. Not in dispute, not restated here.

### 3.2 TERT gene therapy in mice

**Bernardes de Jesus, Vera, Schneeberger, Tejera, Ayuso, Bosch & Blasco, "Telomerase gene therapy in adult and old mice delays aging and increases longevity without increasing cancer," *EMBO Molecular Medicine* 2012;4:691–704** ([PMID 22585399](https://pubmed.ncbi.nlm.nih.gov/22585399/), [journal](https://www.embopress.org/doi/full/10.1002/emmm.201200245)).

Single tail-vein injection of AAV9-mTERT into normal adult mice at 1 and 2 years.

| Quantity | Value | Confidence |
|---|---|---|
| Lifespan increase, treated at **1 year** | **+24%** | `secondary` |
| Lifespan increase, treated at **2 years** | **+13%** | `secondary` |
| Median or mean? | **AMBIGUOUS — see below** | `uncertain` |
| N per group | `null` | — |
| Sex distribution | `null` | — |
| Cancer incidence | Not increased vs control littermates | `primary_abstract` |

**Flagged ambiguity, and it matters.** The phrasing surfaced was "lived **on average** 24% longer." "On average" is not "median." My search query explicitly asked for *median* and the summary answered with "on average," which is a non-answer. **Median and mean lifespan diverge substantially in mouse cohorts with early deaths, and the two are conflated across the entire geroscience literature.** I am recording this as `uncertain` rather than assigning it to either.

### 3.3 The Mendelian randomization evidence — and it points the wrong way

This is the most important honest finding in this section, and it is systematically soft-pedalled in longevity communications.

**Telomeres Mendelian Randomization Collaboration, "Association Between Telomere Length and Risk of Cancer and Non-Neoplastic Diseases: A Mendelian Randomization Study," *JAMA Oncology* 2017;3(5):636–651** ([PMID 28241208](https://pubmed.ncbi.nlm.nih.gov/28241208/?dopt=Abstract), [journal](https://jamanetwork.com/journals/jamaoncology/fullarticle/2604820)).

**Genetically longer telomeres INCREASE the risk of several cancers, and DECREASE the risk of coronary heart disease.** `source_confidence: primary_abstract`

Per-cancer odds ratios with confidence intervals: `null` — I could not surface them and will not invent them. The direction is unambiguous and independently corroborated:

- **Codd et al., "Polygenic basis and biomedical consequences of telomere length variation," *Nature Genetics* 2021;53** ([PMID 34611362](https://pubmed.ncbi.nlm.nih.gov/34611362/), [journal](https://www.nature.com/articles/s41588-021-00944-6)) — **n = 472,174** UK Biobank; **197 independent sentinel variants at 138 loci (108 new)**; genetically determined LTL causally linked to traits from height to bone marrow function and to **neoplastic, vascular and inflammatory disease**. `source_confidence: primary_abstract`
- **Kuo et al., *Aging Cell* 2019** — MR in **~261,000** older participants ([doi:10.1111/acel.13017](https://onlinelibrary.wiley.com/doi/10.1111/acel.13017)).
- Long LTL → increased soft tissue sarcoma risk ([PMC7139681](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7139681/)); long LTL → increased colorectal cancer ([PMC12729187](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12729187/)); longer TL → decreased coronary atherosclerosis, MI, ischaemic heart disease, stroke.

**Interpretation.** Telomere length is not a "youth" dial. It is a **cell-division-permissiveness dial with an antagonistically pleiotropic sign**: more permissive → less vascular/degenerative disease, more cancer. Any intervention that lengthens telomeres systemically in humans is buying cardiovascular benefit with oncological risk, and human MR is the best causal instrument we have for saying so. The mouse TERT experiments reporting "no increase in cancer" (§3.2) were conducted in short-lived, cancer-prone laboratory strains over ≤2 years — **the wrong system, over the wrong timescale, to detect the human risk that MR identifies.**

### 3.4 The measurement problem

qPCR relative telomere length — the method underlying most epidemiology — "has received recent critique for being too error-prone and yielding unreliable results," with significant lab-to-lab variability.

Mechanism of the failure (Nettle et al., *PLoS ONE* 2019, [journal](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0216118)): errors at the Cq level are **magnified** in the T/S ratio; if Cq errors are normally distributed and independent of true TL, errors in the T/S ratio are **positively skewed and proportional to true telomere length**. "A small increase in error in Cq values can have large consequences for the power and interpretability of qPCR estimates." `source_confidence: primary_abstract`

Pre-analytic variables — DNA extraction/purification method, storage conditions — introduce substantial variability ([*PLoS ONE* 2017, PMC5590866](https://pmc.ncbi.nlm.nih.gov/articles/PMC5590866/)).

Counterpoint for balance: some groups report qPCR–Southern blot correlations > 0.9 under tight control ([PMID 28805012](https://pubmed.ncbi.nlm.nih.gov/28805012/)). The consensus is that reliability is achievable but is **not the default**, and that heterogeneous published associations are partly a methods artefact.

### 3.5 Human telomerase activation

**TA-65 / cycloastragenol.** Two RCTs surfaced:
- 1-year RCT, **n = 117**, CMV-positive, aged 53–87: 250 U TA-65 increased telomere length by **530 ± 180 bp (p = 0.005)**; placebo **lost 290 ± 100 bp (p = 0.01)** ([PMC5178008](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5178008/)). `source_confidence: secondary`
- **n = 500**, multi-arm parallel: CD8+CD28− immunosenescent T cells fell by **28 cells/µl** (100 U and 250 U arms) and **22 cells/µl** (500 U), vs an **increase of 4.38 cells/µl** on placebo; AEs mild–moderate in 34.6%; 9 SAEs, none deemed related ([*OBM Geriatrics* 2021](https://www.lidsen.com/journals/geriatrics/geriatrics-05-02-168)). `source_confidence: secondary`

**Assessment: Grade C at best, and the non-monotonic dose response (250 U > 500 U) in the immune trial is a red flag for a real pharmacological effect.** No hard endpoints. No mortality data. Given §3.3, a telomere-lengthening supplement in humans is an intervention whose *own mechanism* is genetically associated with increased cancer risk, and no trial has been remotely long enough or large enough to detect that.

---

## 4. Epigenetic alterations and partial reprogramming

### 4.1 Ocampo 2016 — the founding in vivo experiment

**Ocampo et al., "In Vivo Amelioration of Age-Associated Hallmarks by Partial Reprogramming," *Cell* 2016;167:1719–1733** ([journal](https://www.cell.com/fulltext/S0092-8674(16)31664-6), [PMC5679279](https://pmc.ncbi.nlm.nih.gov/articles/PMC5679279/)).

Design: LAKI (*Lmna*^G609G^ homozygous, Hutchinson-Gilford-like progeria) crossed to 4F (polycistronic OSKM + rtTA). **Cyclic induction: 2 days doxycycline on, 5 days off.**

| Quantity | Value | Confidence |
|---|---|---|
| **Median** lifespan, LAKI 4F | **+33%** | `secondary` (via Paine et al. 2024 review) |
| **Maximum** lifespan, LAKI 4F | **+18%** | `secondary` (same review) |
| Absolute LAKI median lifespan | `null` (~18 weeks commonly cited; **I could not verify it**) | `uncertain` |
| N per arm, sex breakdown | `null` | — |
| Teratoma / cancer at ≤35 dox cycles | None reported | `secondary` |
| **Lifespan effect in wild-type mice** | **NOT MEASURED** | — |

Hallmarks reported as rejuvenated: epigenetic modifications, cellular senescence, DNA damage, mitochondrial dysfunction — four of twelve, with no gross histological change.

**The two facts that must travel with this result:**
1. **It is a progeria model, not aging.** *Lmna*^G609G^ mice die of a specific structural lamin defect. Rescuing a monogenic lethal disease demonstrates that OSKM can counteract *that lesion*. It is not evidence about the rate of normal aging, and the relative percentages are inflated by the model's short baseline — 33% of ~18 weeks is roughly 6 weeks.
2. **In wild-type mice, Ocampo et al. showed improved regeneration after pancreatic and muscle injury — not lifespan.**

### 4.2 Partial reprogramming in physiologically aged wild-type mice

**Browder et al., "In vivo partial reprogramming alters age-associated molecular changes during physiological aging in mice," *Nature Aging* 2022;2:243–253** ([journal](https://www.nature.com/articles/s43587-022-00183-2)).

Long-term partial reprogramming regimens with varying onset produced rejuvenating effects in kidney and skin; **duration of treatment determined the extent of benefit**. `source_confidence: secondary`

**No lifespan extension was demonstrated in wild-type mice in this paper.** This is the honest state of the flagship in vivo reprogramming result: **molecular and histological rejuvenation, without survival benefit.**

### 4.3 The one wild-type lifespan claim — and why it needs heavy discounting

**Cano Macip et al., "Gene Therapy-Mediated Partial Reprogramming Extends Lifespan and Reverses Age-Related Changes in Aged Mice," *Cellular Reprogramming* 2024;26:24–32** ([PMC10909732](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10909732/), [publisher](https://journals.sagepub.com/doi/10.1089/cell.2023.0072)).

Systemic **AAV9-OSK** delivered to **124-week-old** mice. Reported: **+109% median REMAINING lifespan**, with improved frailty scores. Untreated controls "usually live to 129 weeks." `source_confidence: secondary`

**Four discounts, all of which must be applied simultaneously:**

1. **"Remaining" lifespan from 124 weeks.** If control mice live to ~129 weeks, median remaining life at treatment is on the order of **~5 weeks**. A 109% increase on ~5 weeks is roughly **+5 weeks of absolute life**, against a total lifespan of ~130 weeks — i.e. of order **+4% of total lifespan**. The headline "109%" and the underlying effect differ by a factor of ~25. This is the most misleading number in the entire reprogramming literature.
2. **Survivorship selection.** A cohort enrolled at 124 weeks is pre-selected for exceptional robustness. Effects in such cohorts do not generalise to lifetime treatment.
3. **Conflict of interest.** All authors are Rejuvenate Bio-affiliated; the CSO is quoted in the accompanying press release. The paper is in a specialty journal, not a general one. `¤`
4. **No independent replication.** `‡`

### 4.4 Lu 2020 — OSK and the optic nerve

**Lu et al., "Reprogramming to recover youthful epigenetic information and restore vision," *Nature* 2020;588:124–129** ([PMID 33268865](https://pubmed.ncbi.nlm.nih.gov/33268865/), [journal](https://www.nature.com/articles/s41586-020-2975-4)).

AAV2-delivered polycistronic **OSK** (Oct4/Sox2/Klf4 — **c-Myc deliberately omitted**) in retinal ganglion cells.

| Quantity | Value | Confidence |
|---|---|---|
| Surviving RGCs after optic nerve crush | **~2-fold increase** | `secondary` |
| Axon regrowth | **~5-fold increase** | `secondary` |
| Mechanism | **DNA demethylation is REQUIRED**; OSK acts via Tet1 and Tet2 | `primary_abstract` |
| Effect in glaucoma model | Visual function improved — rejuvenating dysfunctional, not dead, RGCs | `secondary` |

The Tet1/Tet2 dependency is the mechanistically strongest claim in the reprogramming field, because it is a **necessity** experiment, not a correlation.

**Replication status: poor, and I want to be precise about why.** I searched specifically for independent replication or failed replication of Lu 2020 and found **neither**. What exists is a follow-up — **Karg et al., "Sustained Vision Recovery by OSK Gene Therapy in a Mouse Model of Glaucoma," *Cellular Reprogramming* 2023** ([publisher](https://www.liebertpub.com/doi/10.1089/cell.2023.0074)) — whose senior authors are **Sinclair and Ksander, the same senior authors as Lu 2020**, with Life Biosciences co-authors. **That is a follow-up, not an independent replication, and it should never be cited as one.** `‡¤`

Translation status: Life Biosciences reports non-human primate data for **ER-100**, and a report dated February 2026 states FDA clearance for a first-in-human OSK trial ([Ophthalmology Times](https://www.ophthalmologytimes.com/view/life-biosciences-reports-advances-in-nonhuman-primate-studies-on-partial-epigenetic-reprogramming-for-restoring-visual-function); [The Niche, ipscell.com, Feb 2026](https://ipscell.com/2026/02/fda-oks-risky-pioneering-osk-rejuvenation-trial-with-sinclairs-er-100/)). **`source_confidence: uncertain` — these two URLs surfaced as titles only; I could not open either page and have not verified their content. Flagged for the lead researcher to check.**

### 4.5 Dose-limiting toxicity — the fact that constrains the whole field

**Parras et al., "In vivo reprogramming leads to premature death linked to hepatic and intestinal failure," *Nature Aging* 2023;3** ([PMID 38012287](https://pubmed.ncbi.nlm.nih.gov/38012287/), [journal](https://www.nature.com/articles/s43587-023-00528-5)).

- Continuous OSKM induction causes **hepatic and intestinal dysfunction → premature death within ~1 week**.
- **Sickness — weight loss, reduced activity, mortality — appears in as little as 4 days, BEFORE teratomas develop.**
- Mortality varies by **genetic background and by OSKM cassette locus**: higher in *Col1a1*-driven 4Fj than *Pparg*-driven 4Fs-B, correlating with OCT4 expression in gut and liver.

`source_confidence: primary_abstract`

Companion paper ([PMID 38012288](https://pubmed.ncbi.nlm.nih.gov/38012288/)): a transgenic strain avoiding OSKM expression in liver and intestine reduces early lethality **and** lowers organismal biological age.

**Three consequences the field frequently elides:**
- **Teratoma is not the dose-limiting toxicity.** Acute gut/liver failure is, and it arrives first. Safety framing built entirely around teratoma risk is aimed at the wrong hazard.
- **The therapeutic window is set by the least reprogramming-tolerant tissue,** not by the target tissue. This is why every credible clinical programme is tissue-restricted (eye, liver) rather than systemic.
- **Toxicity is genetic-background- and construct-dependent,** which means a safety result in one reprogrammable strain does not transfer to another.

### 4.6 Chemical reprogramming, 2023–2026

**Yang et al., "Chemically induced reprogramming to reverse cellular aging," *Aging (Albany NY)* 2023;15** ([PMID 37437248](https://pubmed.ncbi.nlm.nih.gov/37437248/), [journal](https://www.aging-us.com/article/204896/text)). Six cocktails of 5–7 small molecules reported to reverse cellular/transcriptomic age within a week without loss of cell identity.

**Status, reported honestly:** **in vitro only**; no in vivo lifespan or healthspan data; published in *Aging (Albany NY)*, a journal with which the senior author has editorial association `¤`. **I searched specifically for a retraction or expression of concern and found none.** I am recording that as a negative finding, not as an endorsement.

Independent-ish corroboration of the *concept*: "Multi-omics characterization of partial chemical reprogramming reveals evidence of cell rejuvenation," *eLife* 2023 ([article 90579](https://elifesciences.org/articles/90579)).

Field synthesis: "The long and winding road of reprogramming-induced rejuvenation," *Nat Commun* 2024 ([s41467-024-46020-5](https://www.nature.com/articles/s41467-024-46020-5)); "Partial cellular reprogramming: A deep dive into an emerging rejuvenation technology," Paine et al., *Aging Cell* 2024 ([doi:10.1111/acel.14039](https://onlinelibrary.wiley.com/doi/10.1111/acel.14039)).

### 4.7 Industry programmes, 2025–2026

`source_confidence: secondary` throughout — company communications and trade press, not peer-reviewed.

- **Retro Biosciences** — first human trial began **December 2025**: **RTR242**, an oral autophagy-enhancing compound for Alzheimer's. Note this is **an autophagy programme, not a reprogramming programme.** Separately, an August 2025 OpenAI partnership announcement claimed AI-designed factors made reprogramming "50× more efficient" — a company claim, unverified. ([Contrary Research](https://research.contrary.com/company/retro-biosciences))
- **NewLimit** — Jan/Feb 2026 update: first candidate moved into large-scale manufacturing; a second payload restoring multiple youthful functions; third preclinical programme. $130M Series B (May 2025, Kleiner Perkins) + $45M convertible note (Oct 2025). ([NewLimit blog](https://blog.newlimit.com/p/january-february-2026-progress-update); [Longevity.Technology](https://longevity.technology/news/newlimit-close-to-clinic-ready-epigenetic-reprogramming-therapy/))
- **Altos Labs** — reported to have begun early human safety testing August 2025; explicitly disease-agnostic positioning. `uncertain`

### 4.8 Primate data

**"Reprogramming aging: genetically enhanced mesenchymal progenitor cells show systemic rejuvenation in primates," *Life Medicine* 2025** ([PMC12277565](https://pmc.ncbi.nlm.nih.gov/articles/PMC12277565/)); companion, "Attenuation of primate aging via systemic infusion of senescence-resistant mesenchymal progenitor cells" ([PMC12202244](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12202244/)).

Two phospho-null mutations (**FOXO3 S253A + S315A**) knocked into hESCs; mesenchymal differentiation yields "senescence-resistant cells" (SRCs). IV infusion into aged cynomolgus monkeys over **44 weeks**. Reported reversal of age-related changes across brain, immune system, bone, skin and reproductive tissue by behavioural, histological, transcriptomic and methylomic readouts; improved cognition; no tumorigenicity or immunogenicity.

**Caveats that make this Grade E despite the species:** **N of monkeys is `null` and is almost certainly in the single digits per arm** — NHP aging studies essentially always are. No survival data. This is **allogeneic gene-edited cell therapy, not partial reprogramming** — it belongs in a different mechanistic bucket and is frequently miscategorised in longevity coverage. It is a genuinely important result and it is nowhere near what its press treatment implies.

---

## 5. (reserved — nutrient sensing is Agent 2's domain, deliberately not covered)

---

## 6. Genomic instability and the "loss of epigenetic information" experiments

### 6.1 The strongest comparative evidence for genomic instability

**Cagan et al., "Somatic mutation rates scale with lifespan across mammals," *Nature* 2022;604:517–524** ([doi:10.1038/s41586-022-04618-z](https://www.nature.com/articles/s41586-022-04618-z)).

Whole-genome sequencing of intestinal crypts from **16 mammalian species**.

| Finding | Value | Confidence |
|---|---|---|
| Somatic mutation rate vs lifespan | **Inversely scales** | `primary_abstract` |
| Lifespan range across species | **~30-fold** | `primary_abstract` |
| Body mass range | **~40,000-fold** | `primary_abstract` |
| **End-of-lifespan somatic mutation burden variation** | **only ~3-fold** | `primary_abstract` |

**This is the single most striking quantitative regularity in the aging literature.** A ~3-fold spread in terminal mutation burden across animals spanning 30-fold in lifespan and 40,000-fold in mass implies mutation accumulation is under strong evolutionary constraint and plausibly rate-limiting.

**The honest caveat: it is a cross-species correlation.** It is compatible with mutation burden causing death, with both being caused by a third factor (e.g. metabolic rate, cell turnover), and with mutation rate being *tuned to* lifespan by selection rather than setting it. It is not an intervention experiment.

### 6.2 The ICE mouse — and the criticism, which is substantial

**Yang et al., "Loss of epigenetic information as a cause of mammalian aging," *Cell* 2023;186:305–326** ([PMID 36638792](https://pubmed.ncbi.nlm.nih.gov/36638792/), [journal](https://www.cell.com/cell/fulltext/S0092-8674(22)01570-7)). **Erratum: *Cell* 2024** ([S0092-8674(24)00118-1](https://www.cell.com/cell/pdf/S0092-8674(24)00118-1.pdf)).

Design: **ICE** (Inducible Changes to the Epigenome). Tamoxifen-inducible **I-PpoI** homing endonuclease cutting **20 canonical genomic sites**, producing non-mutagenic double-strand breaks. Claim: the *act of faithful DNA repair* — not mutation — erodes the epigenome and drives aging.

| Quantity | Value | Confidence |
|---|---|---|
| Blood clock CpGs | **743** | `secondary` |
| Muscle clock CpGs | **2,048** | `secondary` |
| Reported epigenetic aging acceleration | **~50% faster** | `secondary` |
| Phenotype assessment | ~10 months post-induction | `secondary` |
| **Lifespan / survival curve** | **`null` — I could not confirm that survival was measured at all** | `uncertain` |

**THE CRITIQUE — Timmons & Brenner, "The information theory of aging has not been tested," *Cell* 2024** ([S0092-8674(24)00050-3](https://www.cell.com/cell/fulltext/S0092-8674(24)00050-3); preprint [SSRN 4509193](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4509193)). Three specific charges, as surfaced:

1. **I-PpoI is cytotoxic, and the corresponding author knew it.** There is extensive evidence that I-PpoI is cytotoxic, and **the corresponding author published two papers — neither cited in the original submission — showing that I-PpoI targeted to specific cell types causes a p53 response and cell elimination within a month.**
2. **Survivorship sampling bias.** Cell death occurred long before the measurement timepoint; molecular profiling of tissue one month after tamoxifen withdrawal profiles **the cells that survived**, not the cells that were perturbed. Any "epigenetic drift" signature may be a composition shift from selective cell loss.
3. **The critical window was never analysed.** I-PpoI was globally induced for **seven times as long as is required to produce a progeric effect**, yet **no analysis of mice during that window was presented.**

**Response — Yang et al., *Cell* 2024** ([S0092-8674(24)00051-5](https://www.cell.com/cell/fulltext/S0092-8674(24)00051-5)): the induction protocol was specifically designed for low-level endonuclease expression not causing cell-cycle arrest or apoptosis; they were unable to detect acute DNA damage, overt DNA damage responses, cell death, or cell elimination.

**My assessment.** The rebuttal is an assertion of a **negative result from the authors' own assays**, against a **positive result from the same author's own prior publications**. That is a weak epistemic position. The critique identifies a confound — differential cell loss producing apparent epigenetic drift — that is (a) mechanistically plausible, (b) known to occur with this exact reagent, and (c) **not addressed by any experiment in the original paper**, because the critical window went unsampled.

**The information theory of aging remains an interesting, unfalsified, and importantly untested hypothesis.** The ICE mouse does not currently establish it. §12 gives the experiment that would.

`source_confidence`: the three charges and the response are `secondary` — surfaced from search summaries of the Matters Arising and its reply, not read directly.

### 6.3 Clonal haematopoiesis — genomic instability with hard human endpoints

**Jaiswal et al., "Clonal Hematopoiesis and Risk of Atherosclerotic Cardiovascular Disease," *NEJM* 2017;377:111–121** ([journal](https://www.nejm.org/doi/full/10.1056/NEJMoa1701719)).

| Finding | Value | Confidence |
|---|---|---|
| CHIP prevalence, < 50 y | **< 0.5%** | `secondary` |
| CHIP prevalence, 70–80 y | **~10%** | `secondary` |
| ASCVD risk | **~2-fold increase** | `secondary` |
| Relative risk of haematologic malignancy | **10–100-fold** | `secondary` |
| **Leading cause of death in CHIP carriers** | **ASCVD, not leukaemia** | `secondary` |
| Commonest driver genes | **DNMT3A, TET2, JAK2, ASXL1** | `secondary` |

**This is the best human evidence that age-related somatic mutation causally produces age-related disease**, and note that two of the four commonest drivers (DNMT3A, TET2) are **epigenetic regulators** — a genuine mechanistic bridge between the genomic-instability and epigenetic-alteration hallmarks. The predominant mechanism is reported as inflammatory, connecting to §8.

---

## 7. Proteostasis, autophagy, mitochondria, mitophagy

### 7.1 Proteostasis — the weakest hallmark on causal evidence

**"Although there are no data showing that overexpression of HSF1 in mice increases lifespan,"** such animals show enhanced proteotoxic stress protection and maintained proteostasis. And: while invertebrate lifespan extension via HSP augmentation has often succeeded, **"it has not been demonstrated that systemic and lifelong HSP overexpression can extend mammalian lifespan,"** with the further note that systemic chaperone overexpression may have **dissimilar effects on longevity in vertebrates versus invertebrates**. `source_confidence: secondary` ([HSF1 Regulation in Aging and Its Role in Longevity, Springer](https://link.springer.com/chapter/10.1007/978-4-431-55852-1_5); [Determinants of rodent longevity in the chaperone-protein degradation network, PMC4837185](https://pmc.ncbi.nlm.nih.gov/articles/PMC4837185/))

**Loss of proteostasis satisfies hallmark criterion 1 (it happens with age) and arguably criterion 2. It does not satisfy criterion 3 in any mammal.** It should be graded accordingly and is not.

### 7.2 Autophagy — the best-evidenced positive genetic result

**Fernández et al., "Disruption of the beclin 1–BCL2 autophagy regulatory complex promotes longevity in mice," *Nature* 2018;558:136–140** ([PMID 29849149](https://pubmed.ncbi.nlm.nih.gov/29849149/), [journal](https://www.nature.com/articles/s41586-018-0162-7)).

*Becn1*^F121A/F121A^ knock-in reduces BECN1–BCL2 interaction, raising basal autophagy constitutively.

| Quantity | Value | Confidence |
|---|---|---|
| Lifespan | **Significantly increased in BOTH sexes** | `primary_abstract` |
| **Effect size (%)** | **`null` — I could not verify a percentage and will not supply one** | — |
| Median vs maximum | `null` | — |
| Healthspan | Reduced age-related renal and cardiac pathology; reduced spontaneous tumorigenesis | `primary_abstract` |
| N, genetic background | `null` | — |

**Flag: an Author Correction to this paper exists** ([ResearchGate record](https://www.researchgate.net/publication/325856374_Author_Correction_Disruption_of_the_beclin_1-BCL2_autophagy_regulatory_complex_promotes_longevity_in_mice)). Its content is `null` — I could not retrieve what was corrected. **This should be checked before the result is relied upon.**

Follow-up: *BECN1*^F121A^ increases autophagic flux in aged mice and improves aging phenotypes **in an organ-dependent manner** — i.e. the benefit is not uniform ([*Autophagy* 2022, PMID 35993269](https://pubmed.ncbi.nlm.nih.gov/35993269/)).

**Why this result matters more than it is credited:** it is a **both-sexes** lifespan extension from a **single point mutation** with a clean mechanistic rationale. Both-sexes results are rare (§9.2). It has not been repeated by the ITP, which is the obvious next step.

### 7.3 Mitochondria — where the field's foundational theory was falsified

**The mtDNA mutator mouse.** Trifunovic et al., *Nature* 2004;429:417–423; Kujoth et al., *Science* 2005;309:481–484. Proofreading-deficient PolgA; high mtDNA mutation load; premature aging — reduced lifespan and fertility, anaemia, osteoporosis, greying, alopecia.

**The decisive finding: mutator mice show decreased OXPHOS complex stability "without any marked increase of oxidative stress or oxidative damage."** `source_confidence: secondary` ([*Aging (Albany NY)*, "The mtDNA mutator mouse"](https://www.aging-us.com/article/100109/text))

**This falsifies the simple mitochondrial free-radical theory of aging in its own flagship model.** mtDNA damage produced aging phenotypes *without* ROS as intermediary.

**Unresolved measurement controversy — a 300-fold discrepancy.** Reported mtDNA mutation frequency in Polg^mut/mut^ vs wild-type varies **from 3–8-fold (Kujoth 2005; Trifunovic 2004) to ~2,500-fold (Vermulst et al.)**. `source_confidence: secondary` **A 300-fold disagreement about the central independent variable of a model system is a methods failure, not a nuance.** Vermulst et al., *Nat Genet* 2008 ([ng.95](https://www.nature.com/articles/ng.95)) further argued that **deletions and clonal mutations**, not point-mutation load, drive the phenotype. Newer designs use mating schemes preventing maternal transmission so that all mtDNA mutations are de novo — an explicit acknowledgment that earlier cohorts were confounded by inherited mutations.

Also relevant: "Mitochondrial Respiratory Dysfunction Is Not Correlated With Mitochondrial Genotype in Premature Aging Mice" ([PMC12266765](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12266765/)) — genotype–phenotype dissociation in the same model class.

**The Grade-A human refutation of antioxidant therapy.** **Bjelakovic et al., Cochrane Database Syst Rev 2012, CD007176.pub2** ([Cochrane](https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD007176.pub2/abstract)).

**78 RCTs, 296,707 participants.** In low-risk-of-bias trials excluding selenium:

| Agent | RR for mortality | 95% CI | Confidence |
|---|---|---|---|
| **Vitamin A** | **1.16** | **1.10–1.24** | `primary_abstract` |
| **Beta-carotene** | **1.07** | **1.02–1.11** | `primary_abstract` |
| **Vitamin E** | **1.04** | **1.01–1.07** | `primary_abstract` |

Vitamin A dose was significantly associated with increased mortality in univariate meta-regression.

**Antioxidant supplementation is the only aging-hallmark intervention with Grade-A human evidence — and the evidence says it increases mortality.** This is the field's most important cautionary result and deserves far more weight in intervention prioritisation than it receives.

### 7.4 Mitophagy — urolithin A, and a textbook endpoint-switch

**Liu et al., *JAMA Network Open* 2022;5(1):e2144279** ([PMID 35050355](https://pubmed.ncbi.nlm.nih.gov/35050355/)). RCT, adults **65–90 y**, 1000 mg urolithin A. Reported: significant improvement in **muscle endurance** (contractions to fatigue, hand and leg) vs placebo; decreased plasma acylcarnitines, ceramides and **CRP**; safe and well tolerated. **Whether the pre-specified primary endpoint (6-minute walk distance) was met: `uncertain` — the search summary listed 6MWD among the evaluated outcomes but reported significance only for endurance.**

**Singh et al., *Cell Reports Medicine* 2022;3:100633** ([PMID 35584623](https://pubmed.ncbi.nlm.nih.gov/35584623/)). RCT, **40–64 y**, two doses, 4 months.

| Outcome | Result | Confidence |
|---|---|---|
| **Pre-specified PRIMARY endpoint — peak power output** | **NOT MET** | `primary_abstract` |
| Muscle strength | **~12% improvement** | `primary_abstract` |
| VO2peak, 6MWT | "clinically meaningful improvements" (secondary) | `primary_abstract` |

**This is a canonical primary-endpoint miss followed by promotion of secondaries**, and it is marketed as a positive trial. Note also the commercial context: the compound is sold as Mitopure by the trial sponsor `¤`. Grade **C**, not B.

---

## 8. Stem cell exhaustion, intercellular communication, inflammaging, dysbiosis

### 8.1 Stem cell exhaustion and heterochronic parabiosis

Reported lifespan effect of heterochronic parabiosis in the old partner: **+6 weeks median, +2 weeks maximum** in old mice detached from heterochronic pairs vs isochronic controls ([*Nature Aging* / bioRxiv 2021, PMC8680621](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8680621/)). `source_confidence: secondary` **In absolute terms this is a small effect requiring surgical conjoinment.** In the reciprocal direction, young mice in heterochronic pairs showed **decreased** lifespan.

**The Conboy reinterpretation, which changes the target entirely.** Neutral blood exchange / plasma dilution — replacing old plasma with saline-albumin, with no young blood — reproduces much of the benefit. The inference: benefits arise from **dilution of deleterious factors in old blood**, not from restorative factors in young blood. `source_confidence: secondary`

**This inverts the therapeutic strategy.** "Add young factors" (a discovery problem across an unbounded proteome) becomes "remove old factors" (an achievable apheresis problem). It also predicts that young-plasma-transfusion clinics — which sell the discredited version — are selling the wrong mechanism.

### 8.2 GDF11 — the reagent-specificity scandal, and a model for how to catch this class of error

**Egerman et al., *Cell Metabolism* 2015;22:164–174** ([journal](https://www.cell.com/cell-metabolism/fulltext/S1550-4131(15)00221-1)), commentary "GDF11 and the Mythical Fountain of Youth"; press coverage in [*Science*](https://www.science.org/content/article/doubts-cast-rejuvenating-protein).

The refutation:
- **GDF11 and myostatin share 89% amino-acid identity in the mature protein.** `primary_abstract`
- The **SOMAmer** reagent used in the original reports **could not discriminate GDF11 from myostatin.**
- The **GDF11 antibody used by Loffredo et al. detects both.**
- With a GDF11-specific immunoassay, **combined GDF11/myostatin INCREASES with age** — the opposite of the original claim — with a trend toward increased GDF11 in aged rat and human sera.
- Functionally, Egerman et al. found GDF11 **inhibits** skeletal muscle regeneration.

Corroboration: "Lack of evidence for GDF11 as a rejuvenator of aged skeletal muscle satellite cells" ([PMC4854912](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4854912/)).

**Generalisable lesson.** A *Cell*-published rejuvenation factor, widely covered, was an artefact of two reagents that could not distinguish the protein of interest from its 89%-identical paralogue — one with the **opposite** biological activity. **No amount of statistical rigour protects against a non-specific reagent.** Every claim in this domain that rests on antibody or aptamer quantification of a protein with a close paralogue — and that includes much SASP quantification — carries this risk until orthogonally validated by mass spectrometry or genetic null controls.

### 8.3 Inflammaging — the strongest hard-endpoint human result in the whole domain

**CANTOS: Ridker et al., *NEJM* 2017.** **n = 10,061**, post-MI, hsCRP ≥ 2 mg/L, canakinumab (anti-IL-1β monoclonal) vs placebo.

| Outcome, 150 mg dose | Effect | Confidence |
|---|---|---|
| MACE (nonfatal MI, stroke, CV death) | **−15%** | `secondary` |
| Urgent revascularisation | **−17%** | `secondary` |
| LDL-C | **No effect** | `secondary` |
| Also reduced | Incident NSCLC, inflammatory anaemia, gout, large-joint OA events | `secondary` |
| Harm | Increased fatal infection (well documented; magnitude `null` here) | `uncertain` |

Post hoc: benefit magnitude tracked **achieved IL-6 reduction**; residual risk was proportional to on-treatment IL-6. A frailty post hoc analysis exists ([PMC10776110](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10776110/)).

MR triangulation: higher **IL6R** (blunted IL-6 signalling) appears protective against mortality and is associated with longevity by parental-age-at-death; higher **IL6** is harmful; **CRP and GDF-15 are neutral** ([*npj Genomic Medicine* 2019](https://www.nature.com/articles/s41525-019-0097-4)). `source_confidence: secondary`

**Interpretation with the right caution.** This is the only place in this report where a hallmark-targeting drug has moved hard clinical endpoints in a large RCT. But: it was a **cardiovascular** trial in a **high-CRP post-MI** population, not an aging trial; the endpoint was not an aging endpoint; and it increased fatal infections. The CRP-neutral MR result also matters — **CRP is a marker, not a mediator**, which invalidates a large class of "lower your CRP" longevity advice.

### 8.4 Dysbiosis — the newest and thinnest hallmark

Reported evidence base:
- Young-to-old FMT in mice: improved grip strength, frailty and body composition; reversed age-associated peripheral and brain immune differences and hippocampal metabolome/transcriptome changes ([*Nature Aging* 2021](https://www.nature.com/articles/s43587-021-00093-9); [mSystems 2025](https://journals.asm.org/doi/10.1128/msystems.01601-24)).
- Old-to-young FMT **decreased lifespan in fly and fish models**, impaired cognition in rats, reduced spatial learning/memory in mice.
- **Killifish**: young→middle-aged microbiome transfer **prolonged lifespan** and delayed behavioural decline.
- **Progeroid mice**: FMT from wild-type reduced disease phenotypes and **increased lifespan**.

`source_confidence: secondary` throughout; effect sizes `null`.

**Assessment: dysbiosis was admitted to the hallmarks on an evidence base consisting of a short-lived teleost, a progeria model, and mouse functional endpoints — with no wild-type mouse lifespan result and no human intervention data.** Compare the bar that "telomere attrition" had to clear in 2013. This is direct evidence for the §1.3(c) charge that the admission criteria carry no threshold.

---

## 9. Cross-cutting methodological failure modes

### 9.1 Short-lived controls — the field's largest systematic bias

**Pabis, Kaeberlein et al., "The impact of short-lived controls on the interpretation of lifespan experiments and progress in geroscience — Through the lens of the '900-day rule,'" *Ageing Research Reviews* 2024** ([PMID 39332712](https://pubmed.ncbi.nlm.nih.gov/39332712/); [bioRxiv preprint](https://www.biorxiv.org/content/10.1101/2023.10.08.561459v1.full); [PDF](https://gwern.net/doc/longevity/fasting/2024-pabis.pdf)).

Core findings:
- **Short lifespans in the control group exaggerate the apparent efficacy of putative longevity interventions** — via regression to the mean and other mechanisms.
- **Mouse cohorts with lifespan < 900 days benefit from caloric restriction; cohorts with lifespan > 900 days do not.** `source_confidence: secondary`
- Proposed rule: absent independent replication, a putative mouse longevity intervention should be credited only when **control median lifespan is near 900 days**, or the treated group's final lifespan is considerably above 900 days.
- Scale of the survey: **n = 428 studies across all strains; n = 129 restricted to C57BL/6** (these n's relate to the analysis of how experimental mouse lifespans changed over time). `source_confidence: uncertain`

Follow-up: "Beyond the 900-day rule: Reclaiming healthspan as geroscience's primary goal," *Ageing Res Rev* 2025 ([ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S156816372500203X)). See also "On standardization of controls in lifespan studies," *Aging* ([article 205604](https://www.aging-us.com/article/205604/text)).

**Why this is devastating rather than merely cautionary.** If control mice die early of husbandry problems, infection, or a strain-specific pathology, *any* intervention that mitigates that specific cause of death produces a large median-lifespan percentage. The percentage is then reported as "slowing aging." **The 900-day rule is a falsifiable, quantitative filter, and most of the published mouse geroprotector literature fails it.**

**Directly applicable to this report's domain:** Baker 2016's absolute control lifespans are `null` to me. Until they are checked against the 900-day criterion, the 24–27% median figures cannot be interpreted as slowed aging rather than rescued strain-specific pathology. **This is the single highest-value verification the lead researcher can perform on §2.3.**

### 9.2 Sex, strain, and the replication record

- **The ITP design** (Jackson Laboratory, University of Michigan, UT Health San Antonio) uses **UM-HET3**, a four-way cross (CB6F1 × C3D2F1), **both sexes**, identical protocols, **powered to detect a 10% change in mean lifespan at 80% power pooling as few as two sites** ([NIA](https://www.nia.nih.gov/research/dab/interventions-testing-program-itp); [design paper, PMC2585647](https://www.ncbi.nlm.nih.gov/sites/ppmc/articles/PMC2585647/)). `source_confidence: primary_abstract`
- **The ITP has failed to replicate published lifespan extension for metformin, resveratrol and nicotinamide riboside** — and for fisetin. `source_confidence: secondary`
- **Sex-specific effects are the norm, not the exception**: astaxanthin (+12% median) and meclizine (+8% median) in **males only**; acarbose is male-preferential.
- **~40% of geroprotector mouse studies used only male mice or did not specify sex.** `source_confidence: secondary`

**A single-sex lifespan study in this field has roughly a coin-flip chance of being uninformative about the other sex.** Given how many hallmark interventions were tested in one sex, the effective replication rate of the field is lower than the publication record suggests.

### 9.3 Statistical malpractice around "maximum lifespan"

- **Wang, Boca & Allison, "Statistical methods for testing effects on 'maximum lifespan,'" *Mech Ageing Dev* 2004** ([PMID 15491681](https://pubmed.ncbi.nlm.nih.gov/15491681/?dopt=Abstract)) — the **conditional t-test (CTT), which is sometimes used, is INVALID.** They offer a **quantile-regression**-based alternative that is "at worst conservative" while remaining powerful and valid.
- **Wang, Boca & Allison, *BMC Med Res Methodol* 2008;8:49** ([journal](https://bmcmedresmethodol.biomedcentral.com/articles/10.1186/1471-2288-8-49)) — testing distribution tails; **Boschloo's test** in combination with quantile regression.
- Broader: "Statistical Methods in Aging Research: Improving Current Practices and Embracing Emerging Approaches," *Annual Review of Statistics* ([link](https://www.annualreviews.org/content/journals/10.1146/annurev-statistics-042324-060005)).

**Observed maximum lifespan is not an estimable parameter** — it is the sample maximum, whose expectation grows with n. Comparing observed maxima between arms of unequal or even equal n is comparing an n-dependent order statistic. **Correct practice is quantile regression at the 90th percentile.**

### 9.4 Test-shopping — a live and under-recognised problem

**"The Gehan test identifies life-extending compounds overlooked by the log-rank test in the NIA Interventions Testing Program: Metformin, Enalapril, caffeic acid phenethyl ester, green tea extract, and 17-DMAG," *GeroScience* 2024** ([Springer](https://link.springer.com/article/10.1007/s11357-024-01161-9)).

Reported alongside: under the Gehan test, **acarbose in females at 400 ppm and 1000 ppm loses statistical significance** — i.e. the substitution does not uniformly favour positive findings.

**This paper is genuinely double-edged and should be read as both a legitimate contribution and a hazard.** Legitimate: the log-rank test is most powerful against proportional hazards, and Gehan (Wilcoxon-type) weights early deaths more, so it can be better specified for interventions acting early. Hazard: **post hoc substitution of the test statistic after the pre-specified test returned null is, without pre-specification and multiplicity correction, an inflation of type-I error.** Reporting five newly "positive" compounds from an alternative test on already-analysed data is a multiple-comparisons problem across both compounds and tests. **Any downstream use of "metformin extends mouse lifespan in the ITP" must be tagged with the fact that this required a change of statistical test.**

### 9.5 Cage effects, litter effects, pseudoreplication

- "Improving Statistical Rigor in Animal Aging Research by Addressing Clustering and Nesting Effects: Illustration with the NIA ITP Data," bioRxiv 2025 ([PDF](https://www.biorxiv.org/content/10.1101/2025.03.14.642436.full.pdf)).
- "Association between cagemate number and risk of death in mice: a time-varying covariate analysis using **Cox frailty models**," *GeroScience* 2025 ([Springer](https://link.springer.com/article/10.1007/s11357-025-02080-z)).
- "Quantifying the Impact of Co-Housing on Murine Aging Studies" ([PMC11326161](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11326161/)).

The statistical core: **treatment is very often randomised at the cage or litter level, not the animal level.** Analysing at the animal level uses degrees of freedom that do not exist. "Statistical analysis without modeling the correlated error due to the subsampling is a kind of pseudoreplication," and **"false positives (Type I error) can result from using degrees of freedom at the level of the individual animal rather than the number of cages."** `source_confidence: primary_abstract`

**Concretely: cagemate number is itself a time-varying predictor of death.** In any lifespan study, cages progressively empty. Surviving mice in depleted cages experience changed thermoregulation, social stress, and food access. **This is a systematic, direction-unknown confounder present in literally every mouse lifespan study, and almost none of them model it.**

### 9.6 Publication and discovery bias

There is "a strong **discovery bias**, where results of interventions which turn out not to be beneficial remain unpublished," despite negative results being more frequent and scientifically valuable. Funnel plots and Egger's test have detected significant publication bias in lifespan meta-analyses. In one systematic review, **22 of 64 compounds tested prolonged both lifespan and healthspan measures** — a ~34% "hit rate" that is implausibly high for an unbiased sample and is itself evidence of the bias. `source_confidence: secondary`

### 9.7 Mouse-to-human extrapolation

Reported: humans and mice differ substantially in developmental and aging pace, with a genuine lack of validated age alignments across the lifespan; "biological age isn't just the proportion of one's average lifespan that has been lived." Alignment is "most reliable at well-studied anchor points (puberty, sexual maturity, middle age) and less reliable at extremes." Most preclinical studies use **8–12-week-old mice, corresponding to human age ~18–22 — a window almost no human disease cohort represents.** `source_confidence: secondary`

**The specific error to police: "+X% mouse lifespan" is routinely mapped to "+X% human lifespan."** There is no allometric or demographic justification for this. Mice and humans have different baseline mortality-doubling times and different cause-of-death distributions; a mouse intervention acting largely by suppressing lymphoma (the dominant cause of death in many laboratory strains) has no human analogue at all.

---

## 10. Named Errors and Corrections

Fourteen specific, named problems. Each gives: the study, the concrete flaw, the published critique where one exists, and a **specific technical fix**.

---

### 10.1 ERROR — Baker et al. 2016 (*Nature* 530:184): maximum-lifespan claim rests on a sex-pooled analysis

**Flaw.** Maximum lifespan was significant only for **mixed-background AP-treated males and females combined (p = 0.0295)**, and **not** for either sex individually, and **not at all** in C57BL/6. Pooling sexes after the sex-stratified analyses fail is a multiplicity problem: with two backgrounds × (pooled, male, female) there are six comparisons, and one at p = 0.0295 does not survive any correction. Compounding this, "maximum lifespan" comparisons are subject to the Wang/Boca/Allison invalidity (§9.3) unless quantile regression was used — and whether it was is `null`.

**Published critique.** None specific to this analysis that I could locate. The general statistical critique is Wang/Boca/Allison ([PMID 15491681](https://pubmed.ncbi.nlm.nih.gov/15491681/?dopt=Abstract)).

**Correction.** Re-analyse the original survival data with **quantile regression at the 90th percentile**, sex as a pre-specified stratification factor (not a pooling convenience), genetic background as a fixed effect, and **cage as a random effect in a Cox frailty model**. Report a Holm-corrected family-wise error rate across the full six-comparison family. Prediction, stated to be falsifiable: **the maximum-lifespan effect will not survive.** The median-lifespan effect probably will.

---

### 10.2 ERROR — Baker et al. 2016: control lifespans not benchmarked against the 900-day criterion

**Flaw.** The interpretive weight of "+24–27% median lifespan" depends entirely on whether control median lifespan approached ~900 days. If controls were short-lived, the result is consistent with rescuing a strain-specific pathology rather than slowing aging. Control absolute lifespans: `null`.

**Published critique.** Pabis et al. 2024 ([PMID 39332712](https://pubmed.ncbi.nlm.nih.gov/39332712/)) — the general principle; not applied to this paper specifically in what I could surface.

**Correction.** Report control median lifespan in **days**, per sex and per background, alongside every percentage. Any percentage published without its absolute baseline should be treated as uninterpretable. Journals in this field should require it as a reporting standard, as they require CONSORT items in clinical trials.

---

### 10.3 ERROR — Hickson et al. 2019 (*EBioMedicine* 47:446): corrigendum after raw-data re-analysis changed conclusions

**Flaw.** The **first-in-human demonstration that senolytics reduce senescent cell burden** — n = 9, open-label, no control — required a corrigendum stating that **"a re-analysis of the raw data has been conducted [and] some conclusions presented in the paper have changed."** ([Corrigendum: *EBioMedicine* 2020;52:102595, [PMID 31982828](https://pubmed.ncbi.nlm.nih.gov/31982828/), [PMC6994619](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6994619/)]). **Which conclusions changed is `null` — I could not retrieve the corrigendum text.**

**Why it matters disproportionately.** This n = 9 uncontrolled study is the load-bearing citation for "senolytics clear senescent cells in humans." It is cited that way constantly, and the corrigendum is cited essentially never.

**Correction.** (a) Anyone citing Hickson 2019 must cite the corrigendum alongside it. (b) The definitive replacement experiment: a **randomised, double-blind, placebo-controlled** trial, **n ≥ 60 per arm**, with **pre-registered analysis plan and public raw data**, using **paired pre/post adipose biopsies read by blinded assessors**, and — critically — a **pre-specified marker panel meeting MICSE 2024 criteria** ([*Cell* 2024](https://www.cell.com/cell/fulltext/S0092-8674(24)00640-8)) rather than p16 alone, with **CD68/CD14 co-staining to exclude activated macrophages** (§2.2). Primary endpoint: change in a composite multi-marker senescence score, not a single marker.

---

### 10.4 ERROR — Xu et al. 2018 (*Nat Med* 24:1246): "36% increased survival" universally misreported as lifespan extension

**Flaw.** The result is **"increased post-treatment survival by 36%"** in mice treated from ~24–27 months — i.e. a 36% increase in *remaining* life in a survivorship-selected cohort. It is quoted throughout the popular and much of the scientific literature as a 36% lifespan extension. The corresponding total-lifespan effect is not reported.

**Correction.** Three-part reporting standard for any late-life intervention: **(1)** median total lifespan from birth, both arms, in days; **(2)** median post-treatment survival, both arms, in days; **(3)** the restricted mean survival time difference (RMST) with 95% CI over a pre-specified horizon. **RMST is the correct estimand here** — it is interpretable in units of time, does not assume proportional hazards, and cannot be inflated by a late start age the way a percentage-of-remaining-life can.

---

### 10.5 ERROR — the entire p16-based senescence literature: p16INK4a is not senescence-specific

**Flaw.** p16Ink4a and SA-β-gal are induced in **macrophages** as part of a **reversible physiological response to immune stimuli**, and can be induced in **p53-null mice**, unlike genuine senescence ([Aging (Albany NY), PMC5611982](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5611982/)). Every INK-ATTAC experiment therefore ablates an unknown mixture of senescent cells and activated macrophages, and every human trial reporting "reduced p16+ cells" reports a composite of the two.

**This may be the actual explanation for the Baker-versus-Grosse contradiction** (§2.3 vs §2.4) and for the SToMP-AD finding that CSF **IL-6 and GFAP rose** after senolytic treatment — consistent with removing a macrophage population that was restraining, not driving, inflammation.

**Correction.** Mandate, in every in vivo senescence experiment: **(a)** multi-marker scoring per MICSE 2024; **(b)** **simultaneous myeloid-lineage exclusion** (CD68, F4/80, LYZ2, CD14) at single-cell resolution; **(c)** an **inducible lineage-tracing** control in which p16-expressing myeloid cells are spared, to partition the phenotype. A falsifiable prediction: **in a myeloid-sparing INK-ATTAC variant, the Baker 2016 lifespan benefit will be preserved or increased, and the Grosse 2020 liver fibrosis phenotype will be attenuated** — because the LSEC and macrophage populations are being separated.

---

### 10.6 ERROR — Ocampo et al. 2016 (*Cell* 167:1719): a progeria result reported as an aging result

**Flaw.** The lifespan data (+33% median, +18% maximum) come exclusively from ***Lmna*^G609G^ homozygous progeroid mice** with a baseline median lifespan on the order of weeks. Wild-type mice in the same paper received injury-regeneration assays, **not lifespan measurement**. Rescuing a monogenic lamin defect is not evidence about the rate of normal aging, and short-baseline models inflate percentage effects (a specific instance of the §9.1 short-lived-control problem, in its most extreme form).

**Correction.** The falsifying experiment has essentially been done and was negative: **Browder et al. 2022** (*Nat Aging* 2:243) applied long-term partial reprogramming to physiologically aged wild-type mice and reported molecular and tissue rejuvenation **without demonstrated lifespan extension**. The field should cite Browder, not Ocampo, when making claims about normal aging. The definitive test remains: **cyclic OSKM in UM-HET3 mice, both sexes, ≥60 per arm per sex, ≥2 ITP sites, treatment from 12 months, pre-registered, with control median lifespan reported in days against the 900-day criterion.**

---

### 10.7 ERROR — Cano Macip et al. 2024: "+109% lifespan" is ~+4% of total lifespan

**Flaw.** Compound problem: **(a)** the metric is median *remaining* lifespan from **124 weeks**, where controls live to ~129 weeks — so ~109% of ~5 weeks ≈ **+5 weeks absolute**, of order **+4% of total lifespan**, a ~25× gap between the headline and the effect; **(b)** enrolment at 124 weeks is extreme survivorship selection; **(c)** all authors are Rejuvenate Bio-affiliated `¤`; **(d)** no independent replication `‡`; **(e)** N, sex breakdown and control absolute lifespans are `null`.

**Published critique.** None located.

**Correction.** Reporting rule: **percentage changes in "remaining" lifespan must never be stated without the absolute baseline in the same sentence.** Preferred estimand: **RMST difference in days with 95% CI**. The replication that would settle it: AAV9-OSK in UM-HET3, treatment from 18 months (not 124 weeks), ≥60/arm/sex, two ITP sites, independent laboratory, pre-registered, with AAV-empty-capsid controls to exclude vector or immune-mediated effects.

---

### 10.8 ERROR — Yang et al. 2023 (*Cell* 186:305), the ICE mouse: survivorship sampling bias from an uncited cytotoxic reagent

**Flaw, as charged by Timmons & Brenner** (*Cell* 2024, [S0092-8674(24)00050-3](https://www.cell.com/cell/fulltext/S0092-8674(24)00050-3)): I-PpoI is cytotoxic; **the corresponding author had published two uncited papers showing I-PpoI causes a p53 response and cell elimination within a month**; cells died well before the measurement timepoint, so profiling one month after tamoxifen withdrawal profiles **survivors**; and although I-PpoI was induced for **seven times as long as needed to produce a progeric effect**, **no mice were analysed during that window**. The authors' response asserts they detected no acute damage or cell death.

**Why the response is insufficient.** It sets the authors' own negative assay results against the same author's own prior positive publications, and does not add the missing time-course.

**Correction — a decisive, falsifiable experiment.** Repeat ICE induction with **dense time-course sampling during induction** (days 0, 2, 4, 7, 14, 21, 28), measuring at each point: **(1)** cleaved caspase-3 and TUNEL; **(2)** p53 target transcripts (Cdkn1a, Mdm2, Bax); **(3)** **absolute cell number per tissue by stereology or DNA content**, not proportions; **(4)** **single-cell RNA-seq with cell-type composition as the primary readout**, so that a composition shift is distinguishable from a within-cell-type epigenetic shift. Then re-derive the epigenetic clock **within a computationally deconvolved, cell-type-matched population.**

**The falsifiable prediction that separates the two hypotheses: if the ICE epigenetic-age acceleration is driven by cell loss, it will vanish after cell-type deconvolution; if the information theory is correct, it will persist within every individual cell type.** That single analysis, on data the authors already possess, would resolve the dispute. Its absence is conspicuous.

---

### 10.9 ERROR — ICE mouse: an aging theory tested without a survival curve

**Flaw.** The paper's claim is that loss of epigenetic information **causes aging**. **Whether ICE mice have shortened lifespan is `null` in everything I could surface** — the reported endpoints are physiological, cognitive and molecular at ~10 months post-induction, plus epigenetic-clock acceleration.

**Why this is a category error.** "Accelerated aging" measured *by an epigenetic clock* in an animal whose epigenome was deliberately perturbed is close to circular: the intervention acts on the same molecular layer as the readout. Independent, non-epigenetic evidence — above all a survival curve — is required.

**Correction.** Publish the **full survival curve** for ICE vs control, both sexes, with cage as a random effect. Add **non-epigenetic aging readouts** that cannot be circular: frailty index, cross-sectional cause-of-death necropsy distribution, and mortality-rate-doubling-time estimated from a Gompertz fit. **The critical test of "accelerated aging" versus "chronic sickness" is the Gompertz slope: true acceleration of aging increases the rate parameter; toxicity increases the intercept.** This distinction is available, cheap, and almost never reported.

---

### 10.10 ERROR — Loffredo/Sinha GDF11 work: refuted by reagent cross-reactivity

**Flaw.** The claim that circulating GDF11 declines with age and rejuvenates heart and muscle was built on a **SOMAmer that could not discriminate GDF11 from myostatin** and an **antibody that detects both** — proteins with **89% mature-protein identity** and opposite activities on muscle. With a specific assay, combined GDF11/myostatin **increases** with age.

**Published critique.** Egerman et al., *Cell Metab* 2015;22:164 ([journal](https://www.cell.com/cell-metabolism/fulltext/S1550-4131(15)00221-1)); "GDF11 and the Mythical Fountain of Youth"; [PMC4854912](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4854912/); coverage in [*Science*](https://www.science.org/content/article/doubts-cast-rejuvenating-protein).

**Correction, generalised into a rule.** For any circulating factor claimed to change with age: **(1)** quantify by **targeted mass spectrometry (PRM/MRM) with paralogue-distinguishing proteotypic peptides**, not immunoassay alone; **(2)** validate every antibody/aptamer against **recombinant paralogue panels** and against **genetic-null tissue**; **(3)** publish the cross-reactivity matrix. The cost of this is trivial next to the cost of the last decade of GDF11 work.

---

### 10.11 ERROR — mtDNA mutator mouse: a 300-fold disagreement about the independent variable

**Flaw.** Reported mtDNA mutation frequency in Polg^mut/mut^ vs wild-type ranges from **3–8-fold** (Trifunovic 2004; Kujoth 2005) to **~2,500-fold** (Vermulst et al.) — a ~300-fold discrepancy attributable to assay methodology (cloning/sequencing artefacts, PCR error, and whether deletions are counted). The model's dose–response cannot be stated. Early cohorts were additionally confounded by **maternally transmitted** mtDNA mutations, which newer mating schemes explicitly prevent.

**Correction.** Re-quantify mutation load by **duplex sequencing** (which suppresses PCR/sequencing error to ~10⁻⁷ and is the current standard for rare somatic variants), reporting point mutations and deletions **separately**, in **matched tissues at matched ages**, in mice bred under a scheme guaranteeing all mtDNA mutations are de novo. **Falsifiable prediction:** aging phenotype severity will correlate with **deletion** burden and clonal expansion, not with point-mutation load — as Vermulst et al. (*Nat Genet* 2008) argued.

---

### 10.12 ERROR — Singh et al. 2022 urolithin A: primary endpoint missed, secondaries promoted

**Flaw.** The pre-specified primary endpoint — **peak power output — was NOT met**. Reported and marketed outcomes are secondary: ~12% muscle strength, VO2peak, 6MWT. Sponsor sells the compound `¤`.

**Correction.** By CONSORT, a trial that misses its primary endpoint is a **negative trial**, and secondary findings are hypothesis-generating. The fix is procedural and specific: a **new, pre-registered, adequately powered RCT with muscle strength as the pre-specified primary endpoint** — powered on the observed ~12% effect — with a **pre-registered SAP, hierarchical testing to control family-wise error**, and an **independent (non-sponsor) coordinating centre.** Until that exists, urolithin A is Grade C.

---

### 10.13 ERROR — SToMP-AD and the D+Q pilot literature: n = 5, open-label, promoted as evidence of efficacy

**Flaw.** **Five completers, no control arm, no blinding.** Cognitive and neuroimaging endpoints did not change. Two CSF inflammatory markers, **IL-6 and GFAP, went UP.** The design cannot distinguish drug effect from regression to the mean, practice effects on cognitive testing, or natural history. It is a **pharmacokinetic and safety study** — and as that, it is a genuinely useful result: dasatinib crosses into CSF (0.281–0.536 ng/ml in 4/5), **quercetin does not** (undetectable in CSF).

**That last fact deserves more attention than it gets: in a two-drug combination given for a CNS indication, one of the two drugs does not reach the CNS.** The rationale for using D+Q rather than dasatinib alone in Alzheimer's is therefore unsupported.

**Correction.** Report and cite this trial as what it is — a **Phase 1 PK/safety study**. The efficacy trial that should follow: randomised, double-blind, placebo-controlled, **n ≥ 100 per arm**, ≥12 months, with a pre-specified primary of **CDR-SB** and pre-specified biomarker secondaries. Given that quercetin is undetectable in CSF, include a **dasatinib-monotherapy arm** — otherwise the combination is untestable.

---

### 10.14 ERROR — the *Cellular Reprogramming* 2023 OSK glaucoma paper cited as independent replication of Lu 2020

**Flaw.** Karg et al. 2023 shares **Sinclair and Ksander as senior authors with Lu et al. 2020**, and includes Life Biosciences-affiliated co-authors. It is a follow-up from the originating group and its commercial vehicle. Citing it as independent replication of a result now heading into first-in-human trials materially misrepresents the evidence base. `‡¤`

**Correction.** Genuine replication requires: **a laboratory with no financial interest in Life Biosciences, no shared senior authorship, independently sourced AAV2-OSK vector, blinded outcome assessment of RGC counts and axon regeneration by an assessor who does not know group assignment, and pre-registration.** Given that an IND has reportedly been cleared, this replication is now urgent rather than optional — and it should be a condition of, not a sequel to, first-in-human dosing.

---

## 11. Evidence Grading Table

### 11.1 Interventions in this domain, ranked by strength of HUMAN evidence

Scale defined in §0.3. `‡` = poor replication; `¤` = material COI.

| Rank | Intervention | Mechanism / hallmark | Best human evidence | Grade |
|---|---|---|---|---|
| 1 | **Canakinumab (anti-IL-1β)** | Chronic inflammation / inflammaging | CANTOS, n = 10,061 RCT: MACE −15%, urgent revascularisation −17%; reduced incident NSCLC, gout, large-joint OA. **Increased fatal infection.** Not an aging endpoint | **B** (A for CVD; B as a geroscience claim) |
| 2 | **Antioxidant supplementation** | Mitochondrial ROS / oxidative damage | Cochrane, 78 RCTs, n = 296,707: vitamin A **RR 1.16 (1.10–1.24)**, β-carotene **1.07 (1.02–1.11)**, vitamin E **1.04 (1.01–1.07)** — **increased mortality** | **F** |
| 3 | **UBX0101 (intra-articular senolytic)** | Cellular senescence | Phase 2, n = 183, randomised, double-blind, placebo-controlled: **no difference vs placebo** on WOMAC-A at 12 wk. Programme terminated | **F** |
| 4 | **UBX1325 / foselutoclax (BCL-xL inhibitor, intravitreal)** | Cellular senescence | ASPIRE Phase 2b, n = 52 vs aflibercept: **missed pre-specified NI primary**; BCVA +5.2 ETDRS letters at 24 wk; NI at 9/10 timepoints to 36 wk | **C** |
| 5 | **Urolithin A** | Mitophagy | 2 RCTs. Older adults (65–90): muscle endurance improved, CRP down. Middle-aged: **primary endpoint (peak power) missed**, strength +12% secondary | **C** `¤` |
| 6 | **TA-65 / cycloastragenol** | Telomere attrition | RCT n = 117: +530 ± 180 bp TL (p = 0.005) vs −290 ± 100 bp placebo (p = 0.01). RCT n = 500: CD8+CD28− T cells −28 cells/µl. **No clinical endpoints; non-monotonic dose response; mechanism carries MR-supported cancer risk** | **C** `¤` |
| 7 | **Dasatinib + quercetin (systemic senolytic)** | Cellular senescence | Best evidence = open-label, uncontrolled, n = 9–14 (IPF, DKD) and n = 5 (AD). **Zero controlled efficacy data.** Pivotal biomarker paper carries a conclusion-changing corrigendum | **D** |
| 8 | **Fisetin** | Cellular senescence | **No published RCT results** (AFFIRM-LITE unreported). In mice, **the ITP found no lifespan effect in either sex AND no reduction in p16Ink4a mRNA in liver, kidney or brain** — a target-engagement failure | **E**, trending **F** |
| 9 | **Navitoclax (ABT-263)** | Cellular senescence | No aging indication. Dose-limiting thrombocytopenia is **on-target** (BCL-xL in platelets); causes trabecular bone loss in aged mice | **E / not viable** |
| 10 | **Partial reprogramming (OSK / OSKM)** | Epigenetic alterations | **No human efficacy data.** IND reportedly cleared for ER-100 (ocular) — status `uncertain`. Mouse WT lifespan evidence is one company-authored, unreplicated paper reporting *remaining* lifespan | **E** `‡¤` |
| 11 | **Chemical reprogramming cocktails** | Epigenetic alterations | **In vitro only.** No in vivo lifespan/healthspan data | **E** `¤` |
| 12 | **AAV-TERT gene therapy** | Telomere attrition | **No human data.** Mouse: +24% (1 y), +13% (2 y), mean-vs-median ambiguous. **Human MR predicts increased cancer risk from longer telomeres** | **E**, with a **positive-harm signal from human genetics** |
| 13 | **Senescence-resistant FOXO3-edited MPCs** | Senescence / stem cell exhaustion | **No human data.** Cynomolgus monkeys, 44 wk; N `null`, likely single digits; no survival data | **E** |
| 14 | **Young plasma / heterochronic exchange** | Altered intercellular communication | Mouse: +6 wk median, +2 wk maximum. **Conboy work indicates the mechanism is dilution of old factors, not addition of young ones** — the commercially sold version targets the wrong mechanism | **E** |
| 15 | **HSF1 / chaperone augmentation** | Loss of proteostasis | **No mammalian lifespan data at all**, in either direction | **E** |
| 16 | **BECN1 F121A (autophagy de-repression)** | Disabled macroautophagy | Genetic, mouse only. **Lifespan extended in BOTH sexes** — rare and notable. Effect size `null`; an Author Correction exists and is unexamined | **E** (strongest E in the table) |

### 11.2 Hallmark-level causal assessment

**These 0–10 ratings are my subjective analyst judgements, not measured quantities.** They are reproduced in the JSON with the same warning.

| Hallmark | Causal evidence (0–10) | Reversibility (0–10) | Human druggability (0–10) | Basis / key limitation |
|---|---|---|---|---|
| Cellular senescence | **7** | 6 | 5 | Necessity (INK-ATTAC) + sufficiency (transplant) in mice. Undercut by Grosse 2020 and the ITP fisetin null. Marker non-specificity is unresolved |
| Genomic instability | **7** | 2 | 2 | Cagan 2022 ~3-fold conserved terminal burden across 30-fold lifespan range; CHIP → hard human endpoints. DNA damage is not reversible in situ |
| Chronic inflammation | **7** | 6 | **7** | CANTOS is the only hard-endpoint RCT success. MR: IL-6 causal, **CRP not** |
| Epigenetic alterations | **5** | **8** | 4 | Highest reversibility of any hallmark; weakest causal proof. ICE mouse contested; no WT lifespan result without COI |
| Deregulated nutrient sensing | — | — | — | **Out of scope — Agent 2's domain** |
| Mitochondrial dysfunction | **4** | 4 | 3 | mtDNA mutator works **without** ROS; Cochrane refutes antioxidants (Grade A, wrong direction); mutation-load measurement disputed 300-fold |
| Altered intercellular communication | **4** | 5 | 3 | Parabiosis effects small in absolute terms; GDF11 exemplar refuted on reagent specificity |
| Stem cell exhaustion | **4** | 5 | 3 | Largely inferred; primate MPC data promising but N `null`, no survival data |
| Telomere attrition | **3** | 7 | 3 | **Human MR points the wrong way** for cancer. Easy to reverse; reversal is plausibly net-harmful |
| Disabled macroautophagy | **3** | 5 | 3 | One strong both-sexes mouse genetic result (BECN1 F121A); no ITP replication; no human data |
| Loss of proteostasis | **2** | 4 | 2 | **No mammalian lifespan demonstration in either direction.** Fails hallmark criterion 3 |
| Dysbiosis | **2** | **8** | 5 | Killifish + progeroid mice + mouse function only. **No WT mouse lifespan result; no human intervention data.** Trivially modifiable, which is why it is attractive rather than because it is well-evidenced |

---

## 12. Falsifiable predictions arising from this review

Stated so they can be checked, and so I can be shown wrong:

1. **Baker 2016's maximum-lifespan effect will not survive** quantile regression at the 90th percentile with sex pre-specified and Holm correction across the six-comparison family (§10.1).
2. **The ICE mouse epigenetic-age acceleration will substantially attenuate after single-cell deconvolution to cell-type-matched populations** — because the signal is at least partly compositional (§10.8).
3. **A myeloid-sparing INK-ATTAC variant will preserve or increase the Baker 2016 survival benefit while attenuating the Grosse 2020 hepatic fibrosis phenotype**, because "p16High" is at least two populations (§10.5).
4. **Systemic telomerase activation in humans, if ever tested at scale and duration, will show increased cancer incidence** consistent with the JAMA Oncology MR direction (§3.3).
5. **AAV9-OSK tested in UM-HET3 at two ITP sites from 18 months will not reproduce a doubling of remaining lifespan**; any effect will be small and possibly sex-specific (§10.7).
6. **Fisetin will not show a senolytic target-engagement signal in a properly controlled human adipose-biopsy trial**, consistent with the ITP's failure to detect p16 reduction in three mouse organs (§2.6).
7. **In the ICE mouse, the Gompertz intercept will be raised and the slope unchanged** — the signature of toxicity, not of accelerated aging (§10.9).

---

## 13. Summary of the domain, stated conservatively

- **Nothing in this domain has been shown to extend human lifespan or healthspan on a hard endpoint.** The only large RCT successes are canakinumab (a cardiovascular trial, with an infection penalty) and, in the negative direction, the antioxidant Cochrane review.
- **The single properly-powered, blinded, placebo-controlled senolytic efficacy trial ever run (UBX0101, n = 183) failed.** Every positive human senolytic result is open-label, uncontrolled, and n ≤ 14.
- **Cellular senescence has the best causal case in mice and a contradicting experiment (Grosse 2020) that the field has not reconciled.** The core marker is not senescence-specific.
- **Partial reprogramming has the best reversibility case and no wild-type mouse lifespan result free of conflict of interest.** Its true dose-limiting toxicity is acute hepatic/intestinal failure, not teratoma.
- **Telomere biology is the clearest case of a hallmark where the human causal evidence points against the intuitive intervention.**
- **The field's methodology is the binding constraint, not its biology.** Short-lived controls, single-sex cohorts, single genetic backgrounds, unmodelled cage effects, invalid maximum-lifespan statistics, post hoc test substitution, and percentage-of-remaining-lifespan reporting together mean that the published effect sizes in this domain should be assumed to be **systematically upward-biased by an unknown but substantial factor.** The ITP's repeated non-replications (metformin, resveratrol, NR, fisetin) are the empirical measure of that bias.

---

## 14. Source list

All URLs surfaced via WebSearch. **None were fetched or read directly — see §0.1.**

**Hallmarks framework and critiques**
- López-Otín et al., *Cell* 2023;186:243–278 — https://www.cell.com/cell/fulltext/S0092-8674(22)01377-0 · https://pubmed.ncbi.nlm.nih.gov/36599349/
- Gems & de Magalhães, "The hoverfly and the wasp," *Ageing Res Rev* 2021 — https://pubmed.ncbi.nlm.nih.gov/34271186/ · https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7611451/
- "The Hallmarks of aging: Paradigms and scientific progress" — https://www.sciencedirect.com/science/article/pii/S156816372600173X
- "Hallmarks of aging: A user's guide for comparative biologists" — https://www.sciencedirect.com/science/article/pii/S1568163724004343
- Copenhagen 2022 ageing meeting summary — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9467401/

**Cellular senescence**
- Baker et al., *Nature* 2011;479:232 — https://pubmed.ncbi.nlm.nih.gov/22048312/
- Baker et al., *Nature* 2016;530:184 — https://www.nature.com/articles/nature16932 · https://pubmed.ncbi.nlm.nih.gov/26840489/ · https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4845101/
- Xu et al., *Nat Med* 2018;24:1246 — https://www.nature.com/articles/s41591-018-0092-9 · https://pmc.ncbi.nlm.nih.gov/articles/PMC6082705/
- Grosse et al., *Cell Metab* 2020;32:87 — https://pubmed.ncbi.nlm.nih.gov/32485135/ · https://www.cell.com/cell-metabolism/fulltext/S1550-4131(20)30241-2
- Coppé et al., *PLoS Biol* 2008;6:e301 — https://pubmed.ncbi.nlm.nih.gov/19053174/ · https://journals.plos.org/plosbiology/article?id=10.1371%2Fjournal.pbio.0060301
- SASP review, *Nat Rev Mol Cell Biol* 2024 — https://www.nature.com/articles/s41580-024-00727-x
- van Deursen, "The role of senescent cells in ageing," *Nature* 2014 — https://www.nature.com/articles/nature13193
- "The unbearable presence of senescent cells in ageing," *Nat Rev Genet* 2026 — https://www.nature.com/articles/s41576-026-00975-x
- Kirkland & Tchkonia, "Cellular senescence and senolytics: the path to the clinic," *Nat Med* 2022 — https://www.nature.com/articles/s41591-022-01923-y · https://pmc.ncbi.nlm.nih.gov/articles/PMC9599677/
- MICSE guidelines, *Cell* 2024 — https://www.cell.com/cell/fulltext/S0092-8674(24)00640-8
- SenePy, *Nat Commun* 2025 — https://www.nature.com/articles/s41467-025-57047-7
- "Senotypes define the diverse landscape of senescent cells," *Nat Aging* 2026 — https://www.nature.com/articles/s43587-026-01148-5
- p16/SA-β-gal in macrophages (reversible, p53-independent) — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5611982/
- p16INK4a in human skin, Ressler 2006 — https://pubmed.ncbi.nlm.nih.gov/16911562/
- p16INK4a in peripheral blood T cells — https://pmc.ncbi.nlm.nih.gov/articles/PMC2752333/
- p16INK4a promoter activation in vivo, *PNAS* 2019 — https://www.pnas.org/doi/10.1073/pnas.1818313116
- "Characterization of human senescent cell biomarkers for clinical trials" — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12073900/
- Navitoclax PK/PD thrombocytopenia — https://link.springer.com/article/10.1007/s00280-014-2530-9
- Navitoclax trabecular bone loss — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7252306/

**Senolytic human trials**
- Justice et al., IPF, *EBioMedicine* 2019 — https://pubmed.ncbi.nlm.nih.gov/30616998/ · https://www.thelancet.com/journals/ebiom/article/PIIS2352-3964(18)30629-7/fulltext
- Justice et al., IPF Phase I single-blind RCT, 2023 — https://pubmed.ncbi.nlm.nih.gov/36857968/
- Hickson et al., DKD, *EBioMedicine* 2019 — https://pubmed.ncbi.nlm.nih.gov/31542391 · https://www.thelancet.com/article/S2352-3964(19)30591-2/fulltext
- **Corrigendum** to Hickson et al. — https://pubmed.ncbi.nlm.nih.gov/31982828/ · https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6994619/
- SToMP-AD, *Nat Med* 2023 — https://www.nature.com/articles/s41591-023-02543-w · https://pubmed.ncbi.nlm.nih.gov/37162971/ · https://pubmed.ncbi.nlm.nih.gov/35098970/
- SToMP-AD exploratory fluid biomarkers 2025 — https://www.sciencedirect.com/science/article/pii/S1878747925000698
- D+Q pilot in older adults at AD risk — https://pmc.ncbi.nlm.nih.gov/articles/PMC11907475/
- AFFIRM-LITE NCT03675724 — https://clinicaltrials.gov/study/NCT03675724
- NCT04733534 (childhood cancer survivors) — https://clinicaltrials.gov/study/NCT04733534
- NCT05758246 STOP-Sepsis — https://clinicaltrials.gov/study/NCT05758246
- TROFFi fisetin, breast cancer survivors — https://pubmed.ncbi.nlm.nih.gov/41835341/
- UBX0101 Phase 2 topline — https://ir.unitybiotechnology.com/news-releases/news-release-details/unity-biotechnology-announces-12-week-data-ubx0101-phase-2 · https://www.clinicaltrialsarena.com/news/unity-ubx0101-osteoarthritis/
- UBX0101 post-mortem analyses — https://nintil.com/why-ubx0101-failed/ · https://lifespan.io/michael-rae/kneecapped-aging-why-unity-trial-failed/
- UBX1325 ASPIRE — https://www.ophthalmologytimes.com/view/unity-biotechnology-releases-topline-results-from-phase-2b-aspire-trial-of-ubx1325-in-patients-with-diabetic-macular-edema · https://iovs.arvojournals.org/article.aspx?articleid=2807400
- 2026 senolytic/reprogramming trial landscape — https://beyondtmrw.org/article/senolytics-and-partial-reprogramming-human-trial-status-in-2026

**Telomeres**
- Bernardes de Jesus et al., *EMBO Mol Med* 2012 — https://pubmed.ncbi.nlm.nih.gov/22585399/ · https://www.embopress.org/doi/full/10.1002/emmm.201200245
- Telomeres MR Collaboration, *JAMA Oncol* 2017 — https://pubmed.ncbi.nlm.nih.gov/28241208/?dopt=Abstract · https://jamanetwork.com/journals/jamaoncology/fullarticle/2604820
- Codd et al., *Nat Genet* 2021 — https://pubmed.ncbi.nlm.nih.gov/34611362/ · https://www.nature.com/articles/s41588-021-00944-6
- Kuo et al., *Aging Cell* 2019 (n≈261,000) — https://onlinelibrary.wiley.com/doi/10.1111/acel.13017
- UK Biobank LTL measurement, n=474,074 — https://pubmed.ncbi.nlm.nih.gov/37117760/
- Long LTL and soft tissue sarcoma — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7139681/
- Telomere length and CRC — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12729187/
- qPCR measurement error simulation, *PLoS ONE* 2019 — https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0216118
- Pre-analytic variables and qPCR TL reproducibility — https://pmc.ncbi.nlm.nih.gov/articles/PMC5590866/
- qPCR TL critical factors — https://pmc.ncbi.nlm.nih.gov/articles/PMC6363640/
- TA-65 telomere RCT — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5178008/
- TA-65 immunosenescence RCT — https://www.lidsen.com/journals/geriatrics/geriatrics-05-02-168

**Reprogramming**
- Ocampo et al., *Cell* 2016 — https://www.cell.com/fulltext/S0092-8674(16)31664-6 · https://pmc.ncbi.nlm.nih.gov/articles/PMC5679279/
- Browder et al., *Nat Aging* 2022 — https://www.nature.com/articles/s43587-022-00183-2
- Cano Macip et al., *Cell Reprogram* 2024 — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10909732/ · https://journals.sagepub.com/doi/10.1089/cell.2023.0072
- Lu et al., *Nature* 2020 — https://pubmed.ncbi.nlm.nih.gov/33268865/ · https://www.nature.com/articles/s41586-020-2975-4
- Karg et al., *Cell Reprogram* 2023 (same senior authors — NOT independent) — https://www.liebertpub.com/doi/10.1089/cell.2023.0074
- Parras et al., *Nat Aging* 2023 — https://pubmed.ncbi.nlm.nih.gov/38012287/ · https://www.nature.com/articles/s43587-023-00528-5
- Liver/intestine-sparing reprogrammable mouse — https://pubmed.ncbi.nlm.nih.gov/38012288/
- Yang et al., chemical reprogramming, *Aging* 2023 — https://pubmed.ncbi.nlm.nih.gov/37437248/ · https://www.aging-us.com/article/204896/text
- Partial chemical reprogramming multi-omics, *eLife* 2023 — https://elifesciences.org/articles/90579
- "The long and winding road of reprogramming-induced rejuvenation," *Nat Commun* 2024 — https://www.nature.com/articles/s41467-024-46020-5
- Paine et al., *Aging Cell* 2024 — https://onlinelibrary.wiley.com/doi/10.1111/acel.14039
- Targeted partial reprogramming, *Sci Transl Med* — https://www.science.org/doi/10.1126/scitranslmed.adg1777
- Primate SRC rejuvenation, *Life Medicine* 2025 — https://pmc.ncbi.nlm.nih.gov/articles/PMC12277565/ · https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12202244/
- Retro Biosciences — https://research.contrary.com/company/retro-biosciences
- NewLimit — https://blog.newlimit.com/p/january-february-2026-progress-update · https://longevity.technology/news/newlimit-close-to-clinic-ready-epigenetic-reprogramming-therapy/
- Life Biosciences NHP / ER-100 (**title-only, unverified**) — https://www.ophthalmologytimes.com/view/life-biosciences-reports-advances-in-nonhuman-primate-studies-on-partial-epigenetic-reprogramming-for-restoring-visual-function · https://ipscell.com/2026/02/fda-oks-risky-pioneering-osk-rejuvenation-trial-with-sinclairs-er-100/

**Genomic instability and the ICE controversy**
- Yang et al., *Cell* 2023;186:305 — https://pubmed.ncbi.nlm.nih.gov/36638792/ · https://www.cell.com/cell/fulltext/S0092-8674(22)01570-7
- **Erratum**, *Cell* 2024 — https://www.cell.com/cell/pdf/S0092-8674(24)00118-1.pdf
- **Timmons & Brenner**, "The information theory of aging has not been tested," *Cell* 2024 — https://www.cell.com/cell/fulltext/S0092-8674(24)00050-3 · https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4509193
- **Authors' response**, *Cell* 2024 — https://www.cell.com/cell/fulltext/S0092-8674(24)00051-5
- Cagan et al., *Nature* 2022;604:517 — https://www.nature.com/articles/s41586-022-04618-z
- Jaiswal et al., CHIP and ASCVD, *NEJM* 2017 — https://www.nejm.org/doi/full/10.1056/NEJMoa1701719
- CHIP as CV risk driver, review — https://pmc.ncbi.nlm.nih.gov/articles/PMC9329391/

**Proteostasis, autophagy, mitochondria**
- HSF1 and longevity — https://link.springer.com/chapter/10.1007/978-4-431-55852-1_5
- Chaperone-protein degradation network and rodent longevity — https://pmc.ncbi.nlm.nih.gov/articles/PMC4837185/
- Fernández et al., *Nature* 2018;558:136 — https://pubmed.ncbi.nlm.nih.gov/29849149/ · https://www.nature.com/articles/s41586-018-0162-7
- **Author Correction** to Fernández et al. — https://www.researchgate.net/publication/325856374_Author_Correction_Disruption_of_the_beclin_1-BCL2_autophagy_regulatory_complex_promotes_longevity_in_mice
- BECN1 F121A organ-dependent effects, *Autophagy* 2022 — https://pubmed.ncbi.nlm.nih.gov/35993269/
- mtDNA mutator mouse review — https://www.aging-us.com/article/100109/text
- Vermulst et al., *Nat Genet* 2008 — https://www.nature.com/articles/ng.95
- Mito respiratory dysfunction uncorrelated with genotype — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12266765/
- Bjelakovic et al., Cochrane 2012 CD007176.pub2 — https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD007176.pub2/abstract · https://www.cochrane.org/evidence/CD007176_antioxidant-supplements-prevention-mortality-healthy-participants-and-patients-various-diseases
- Urolithin A, older adults, *JAMA Netw Open* 2022 — https://pubmed.ncbi.nlm.nih.gov/35050355/
- Urolithin A, middle-aged, *Cell Rep Med* 2022 — https://pubmed.ncbi.nlm.nih.gov/35584623/ · https://www.sciencedirect.com/science/article/pii/S2666379122001586

**Intercellular communication, inflammaging, dysbiosis**
- Egerman et al., *Cell Metab* 2015 — https://www.cell.com/cell-metabolism/fulltext/S1550-4131(15)00221-1 · https://www.sciencedirect.com/science/article/pii/S1550413115002211
- "Doubts cast on 'rejuvenating' protein," *Science* — https://www.science.org/content/article/doubts-cast-rejuvenating-protein
- No evidence GDF11 rejuvenates satellite cells — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4854912/
- Heterochronic parabiosis lifespan — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8680621/ · https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10737889/
- Parabiosis review, *npj Aging* 2024 — https://www.nature.com/articles/s41514-024-00166-0
- IL-6 signalling MR, *npj Genomic Med* 2019 — https://www.nature.com/articles/s41525-019-0097-4
- Canakinumab frailty post hoc — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10776110/
- IL-6 in preventive cardiology, ACC 2026 — https://www.acc.org/Latest-in-Cardiology/Articles/2026/07/21/12/01/IL-6-as-a-Predictor-of-CV-Risk-Assessment
- Young microbiota counteracts behavioural deficits, *Nat Aging* 2021 — https://www.nature.com/articles/s43587-021-00093-9
- Young gut microbiota transplantation, *mSystems* 2025 — https://journals.asm.org/doi/10.1128/msystems.01601-24
- Gut microbiome and aging, narrative review — https://link.springer.com/article/10.1186/s12929-025-01179-x

**Methodology and statistics**
- Pabis et al., "900-day rule," *Ageing Res Rev* 2024 — https://pubmed.ncbi.nlm.nih.gov/39332712/ · https://www.biorxiv.org/content/10.1101/2023.10.08.561459v1.full · https://gwern.net/doc/longevity/fasting/2024-pabis.pdf
- "Beyond the 900-day rule," *Ageing Res Rev* 2025 — https://www.sciencedirect.com/science/article/abs/pii/S156816372500203X
- "On standardization of controls in lifespan studies," *Aging* — https://www.aging-us.com/article/205604/text
- NIA ITP programme page — https://www.nia.nih.gov/research/dab/interventions-testing-program-itp
- ITP design paper — https://www.ncbi.nlm.nih.gov/sites/ppmc/articles/PMC2585647/
- ITP overview, *EBioMedicine* — https://pmc.ncbi.nlm.nih.gov/articles/PMC5514387/
- ITP 2024 results (fisetin null; astaxanthin/meclizine male-only) — https://pmc.ncbi.nlm.nih.gov/articles/PMC10828146/ · https://mouseion.jax.org/cgi/viewcontent.cgi?article=1031&context=stfb2024
- ITP 2026, eleven further compounds negative — https://link.springer.com/article/10.1007/s11357-026-02201-2
- ITP data portal (MPD) — https://phenome.jax.org/projects/ITP1
- Gehan-test reanalysis, *GeroScience* 2024 — https://link.springer.com/article/10.1007/s11357-024-01161-9
- Wang, Boca & Allison, *Mech Ageing Dev* 2004 — https://pubmed.ncbi.nlm.nih.gov/15491681/?dopt=Abstract
- Wang, Boca & Allison, *BMC Med Res Methodol* 2008;8:49 — https://bmcmedresmethodol.biomedcentral.com/articles/10.1186/1471-2288-8-49
- Statistical methods in aging research, *Annu Rev Stat* — https://www.annualreviews.org/content/journals/10.1146/annurev-statistics-042324-060005
- Clustering/nesting in ITP data, bioRxiv 2025 — https://www.biorxiv.org/content/10.1101/2025.03.14.642436.full.pdf
- Cagemate number and death risk, Cox frailty, *GeroScience* 2025 — https://link.springer.com/article/10.1007/s11357-025-02080-z
- Co-housing impact on murine aging studies — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11326161/
- Candidate targets from mouse lifespan studies (sex reporting, discovery bias) — https://pubmed.ncbi.nlm.nih.gov/38656034/
- "Aging delay: of mice and men" — https://pmc.ncbi.nlm.nih.gov/articles/PMC7975961/
- Mouse–human lifespan alignment — https://pmc.ncbi.nlm.nih.gov/articles/PMC11925001/

**Epigenetic clocks**
- Higgins-Chen et al., PC-clocks / technical noise — https://pubmed.ncbi.nlm.nih.gov/36277076/ · https://pmc.ncbi.nlm.nih.gov/articles/PMC9586209/
- Stochastic-variation aging clocks, *Nat Aging* 2024 — https://www.nature.com/articles/s43587-024-00619-x
- Epigenetic clocks review 2025 — https://pmc.ncbi.nlm.nih.gov/articles/PMC12539533/
