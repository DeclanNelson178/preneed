# Plan

A static dashboard that compares **trust funding** against **insurance funding**
for a Massachusetts cost-protected pre-need funeral contract.

The user is a funeral director. He enters numbers he can pull from a statement,
a price list, or a carrier illustration. He sees what each option is worth to
him in every year of death.

**Status:** built. The model, the tests, the input layer and the dashboard are
written and running. Step 1 (source verification) and step 5 (publish) are open.
Every starting value in the dashboard is a placeholder, marked on screen.

---

## 1. Decisions

### Language and hosting

| Decision | Reason |
|---|---|
| **JavaScript only.** No Python. | GitHub Pages serves static files. The model is about 120 lines of arithmetic. A Python version plus a port means two copies and a parity harness, which is more code than the model. |
| **Plain ES modules. No build step.** | `<script type="module">` in the browser. The same file imports into Node for the tests. No bundler, no npm install to deploy. |
| **Tests use the Node built-in runner.** | `node --test`. Zero dependencies. |
| Charts drawn by hand in SVG, or with one small library from a CDN | Decide at step 4. |

`requirements.txt` stays. The archived notebooks need it to open.

### Scope — what is in

- Cost-protected contracts only
- Funeral establishment charges only
- Trust funding, **paid in full only**
- Insurance funding, **paid in full or over 3, 5 or 10 years**
- All four early-death benefit shapes, in one setting
- Commission, taxed as business income, then compounded

### Scope — what is out

| Excluded | Reason |
|---|---|
| Non-cost-protected contracts | The family pays the difference. No funeral-home economics to model. |
| Instalment trusts | A part-funded trust is not cost-protected under 239 CMR 4.01. Guaranteeing a price against one means underwriting a life with no reserve. |
| Cash advance items | Billed separately to the family at the time of service. Never in his contracts. |
| Mortality | He cannot pull a mortality table. Results show every year of death as a curve instead. |
| The tax engine | He enters one measured effective rate. See `docs/LAW.md` section 7. |
| Lapse and commission chargeback | Real risk. Stays with him. Out of the model. |
| Accidental death benefit | Makes years 1 and 2 slightly pessimistic on graded products. |
| Sequence of returns, working capital, cancellation | See `docs/SOURCES.md` section 5. |

---

## 2. The model

Review this section before I write any code. It is easier to catch an error
here than in JavaScript.

### Symbols

| Symbol | Meaning |
|---|---|
| `P` | Contract price, which is also the face amount at issue |
| `i` | Funeral inflation rate |
| `r` | Trust gross rate of return |
| `f` | Trust fees |
| `Tt` | Trust effective tax rate |
| `Tb` | Business income tax rate |
| `n` | Number of premium payments: 1, 3, 5 or 10 |
| `Q` | Annual premium |
| `g` | Policy growth rate |
| `w` | Waiting period, in years |
| `c1` | First-year commission rate |
| `c2` | Renewal commission rate |
| `t` | Year of death |

### 2.1 Cost of the funeral at year t

    cost(t) = P × (1 + i)^t × deliveryPercent

`deliveryPercent` defaults to **100%**, which gives the **funding gap** view:
*does the money cover the bill?*

Set it below 100% to get the **profit** view: *what does he keep?* For example
60% means his true cost to deliver is 60% of the price he charges. One input
gives both views, with no branch in the code.

### 2.2 Trust option, paid in full

Day 0 the trust holds `P`. 239 CMR 4.08 requires the whole amount to reach the
bank within five business days. He keeps nothing at the sale.

Each year:

    earnings = balance × r
    fee      = balance × f
    tax      = earnings × Tt
    balance  = balance + earnings − fee − tax

The three rates are constant, so this reduces to one net rate:

    net     = r − f − (r × Tt)
    funds(t) = P × (1 + net)^t

**Commission on a trust sale is zero.** This is the regulation, not an
assumption.

### 2.3 Insurance option

**Premiums.**

    premiumsPaid(t) = Q × min(t, n)
    unpaid(t)       = Q × max(0, n − t)

On a multi-pay plan the premiums total more than the face amount. He reads `Q`
off the carrier illustration. He does not divide the price.

**Growth.**

    growthYears(t) = (growthStartsAtPaidUp) ? max(0, t − n) : t
    grownFace(t)   = P × (1 + g)^growthYears(t)

**Death benefit.** One setting, four modes. They are mutually exclusive, so
early death can never be penalised twice.

| Mode | Formula |
|---|---|
| 1. Full face | `benefit(t) = grownFace(t)` |
| 2. Percent of face | `t ≤ w` → `P × schedule[t]`, else `grownFace(t)` |
| 3. Return of premium + interest | `t ≤ w` → `premiumsPaid(t) × (1 + ropInterest)`, else `grownFace(t)` |
| 4. Face less unpaid premiums | `grownFace(t) − unpaid(t)` |

Mode 4 needs no branch, because `unpaid(t)` is already zero once the policy is
paid up.

**Commission.** Paid on each premium as it arrives. Taxed the year he receives
it. Then it grows at the same net rate as the trust, per your instruction.

    payment(1)   = c1 × Q × (1 − Tb)
    payment(k>1) = c2 × Q × (1 − Tb)      for k = 2 .. n
    payment(k>n) = 0

    commissionFund(t) = Σ over k = 1 .. min(t, n) of
                        payment(k) × (1 + net)^(t − k)

Set `c1 = c2` for an **as-earned** schedule. Set `c1` high and `c2` low for a
**heaped** schedule. No special case in the code.

### 2.4 Result, for each year t from 1 to 30

| Column | Trust | Insurance |
|---|---|---|
| Funds at death | `P × (1 + net)^t` | `benefit(t)` |
| Commission fund | `0` | `commissionFund(t)` |
| **Total to him** | funds | funds + commission |
| Cost of the funeral | `cost(t)` | `cost(t)` |
| **Margin** | total − cost | total − cost |
| Effective annual rate | `(total / P)^(1/t) − 1` | `(total / P)^(1/t) − 1` |

**The margin is the answer.** 239 CMR 4.08(6)(a) lets him keep it when it is
positive. 4.08(6)(b) makes him absorb it when it is negative, and forbids him
from billing the estate.

The effective annual rate is the honest comparison against funeral inflation.
Both use `P` as the base, because `P` is what he guaranteed.

---

## 3. Inputs

Three panels, so he never sees all of them at once.

### Panel 1 — The contract

| Field | Status | Where he gets it |
|---|---|---|
| Contract price | WEAK starting value | His general price list |
| Funeral inflation rate | WEAK starting value | His own price history, or the BLS index |
| Cost to deliver, as a percent of price | optional, default 100% | His accountant |

### Panel 2 — The trust option

| Field | Status | Where he gets it |
|---|---|---|
| Trust gross rate of return | HIS DATA | Trustee statement |
| Trust fees | HIS DATA | Trustee statement |
| Trust effective tax rate | HIS DATA | Trustee. **Zero if it is a grantor trust.** |

### Panel 3 — The insurance option

| Field | Status | Where he gets it |
|---|---|---|
| Business income tax rate | HIS DATA | His accountant |
| Number of premium payments — 1, 3, 5, 10 | choice | The contract |
| Annual premium | HIS DATA | Carrier illustration |
| Policy growth rate | UNSOURCED | Carrier product sheet |
| Growth starts only at paid-up | UNSOURCED | Carrier product sheet |
| Death benefit mode — the four in 2.3 | UNSOURCED | Carrier product sheet |
| Waiting period, in years | UNSOURCED | Carrier product sheet |
| Benefit during the waiting period | UNSOURCED | Carrier product sheet |
| First-year commission rate | WEAK | Carrier commission schedule |
| Renewal commission rate | WEAK | Carrier commission schedule |

**Section 9 supersedes the panel 3 layout.** The fields are the same. How he
answers them is not.

Every value and its status is recorded in `docs/SOURCES.md`.

---

## 4. Files

```
preneed/
├── index.html            # the dashboard. GitHub Pages serves this.
├── package.json          # "type": "module" only. No dependencies.
├── src/
│   ├── model.js          # the whole model. Section 2 of this plan.
│   ├── inputs.js         # field list, labels, starting values, status marks
│   ├── chart.js          # drawing
│   └── app.js            # the dashboard wiring: state, panels, tables
├── test/
│   ├── model.test.js     # arithmetic
│   ├── law.test.js       # one test per rule in docs/LAW.md
│   └── golden.test.js    # pinned outputs
├── docs/
│   ├── LAW.md            # written
│   └── SOURCES.md        # written
├── archive/              # the two old notebooks
├── requirements.txt      # kept, so the archived notebooks still open
└── plan.md               # this file
```

Two files were added to this list while building.

- `package.json` — Node needs `"type": "module"` to import the ES modules in
  `test/`. It has no dependencies and no build step.
- `src/app.js` — the dashboard wiring. Holding it in `index.html` would have put
  about 400 lines of script in the page. `index.html` keeps the markup, the copy
  and the styles.

`node --test` needs Node 18 or later for the built-in runner.

---

## 5. Tests

| File | What it proves | How |
|---|---|---|
| `model.test.js` | The trust loop is right | Compare the year-by-year loop against the closed form `P(1+net)^t`. |
| `model.test.js` | Edge cases hold | Zero return and zero fee holds the balance flat. Zero tax gives `net = r − f`. |
| `model.test.js` | Each benefit mode is right | Hand-calculated values for years 1, 2, 5, 20 in all four modes. |
| `model.test.js` | Growth timing is right | With growth-at-paid-up ticked, a 10-pay policy shows no growth before year 10. |
| `model.test.js` | Commission is right | Single-pay pays once. Heaped and as-earned give the stated totals. The fund compounds at the net trust rate. |
| `law.test.js` | 239 CMR 4.08(6)(a) | A positive margin is retained in full. |
| `law.test.js` | 239 CMR 4.08(6)(b) | A negative margin is borne in full. **No code path exists that bills the estate.** |
| `law.test.js` | 239 CMR 4.08 | The trust option pays zero commission, always. |
| `model.test.js` | Nothing breaks | Benefits are never negative. Margin falls as inflation rises. Margin rises as the trust return rises. |
| `golden.test.js` | Nothing changes by accident | A pinned table for a fixed input set. If a number moves, the test fails and the change must be approved. |

Run with `node --test`.

---

## 6. Steps

### Step 0 — Documentation ✅ done

- [x] `docs/LAW.md` — 239 CMR 4.01, 4.02(5)(d), 4.08, 4.08(6), 4.09, 4.10, M.G.L. c. 203C, IRC §685, M.G.L. c. 62 §10(e)
- [x] `docs/SOURCES.md` — every value, with a status mark, plus the exclusions and the notebook defect list
- [x] Archive both notebooks
- [x] `plan.md`

### Step 1 — Close the verification gaps

- [ ] Pull the BLS funeral services index directly. Confirm the series identifier and the actual annual rates. Replace the WEAK 4.6% figure.
- [ ] Read the official Mass.gov copy of 239 CMR 4.00. Confirm every quote in `LAW.md`. Two Mass.gov pages refused my request.
- [ ] Confirm the 2026 Massachusetts 4% surtax threshold from the Department of Revenue, not from a secondary source. *Background only. It does not enter the code.*
- [ ] Read 239 CMR 4.07 on cancellation and refunds. Add it to `LAW.md`.

### Step 2 — The model ✅ done

- [x] `src/model.js`, following section 2 of this plan exactly
- [x] `test/model.test.js` and `test/law.test.js`
- [x] `test/golden.test.js`
- [x] All tests pass under `node --test` — 44 tests

One modelling decision was added that section 2 does not state: a death benefit
is held at or above zero. A policy does not pay a negative amount. Without it,
mode 4 on a 10-pay plan pays a negative benefit in year 1.

### Step 3 — The input layer ✅ done

- [x] `src/inputs.js` — field definitions, labels, starting values, status marks
- [x] Every UNSOURCED and WEAK field is marked on screen, not just in the documents

Section 3 of this plan gives no starting value to a HIS DATA field. The
dashboard needs one to open with a complete picture, so each has a placeholder,
marked **YOUR DATA** on screen. `test/golden.test.js` pins the whole set, so no
starting value can move without approval.

### Step 4 — The dashboard ✅ done

- [ ] Screen layout for your review, before I build it — *skipped. The dashboard
      itself is the layout to review.*
- [x] `index.html` — three input panels and the results
- [x] `src/chart.js` — margin by year of death, with the loss region in red
- [x] A table under every chart, so the numbers are readable without the chart
- [x] The exclusions from section 1 shown on screen, not buried in a document
- [x] A year-of-death control. Every figure on screen follows it.

### Step 5 — Publish

- [ ] Enable GitHub Pages on the repository
- [ ] Check it on a phone. He will open it on a phone.

---

## 7. What only your uncle can answer

The model cannot start from real numbers until these come back. Steps 2 to 4 do
not depend on them, so they can run in parallel.

### Ask the trustee

1. Do you make the qualified funeral trust election and file Form 1041-QFT, or do you send grantor trust tax statements?
2. Send me the last filed return and the matching Massachusetts Form 2.
3. What was the tax paid, divided by the income earned, last year?
4. Send me the written investment policy and the last ten years of actual return.
5. What are the all-in fees?

### Ask each carrier, in writing

6. Does the face amount grow during the pay period, or only after the policy is paid up?
7. What does the policy pay on death in years 1, 2 and 3? Full face, a percent of face, or return of premium plus interest?
8. Do you deduct unpaid premiums from the death benefit? The whole remaining balance, or only the current year?
9. Send me the commission schedule for single-pay, 3-pay, 5-pay and 10-pay.
10. Send me the annual premium for each pay plan, at the face amounts he sells.

### Ask counsel

11. Does his contract form make cost protection conditional on the policy clearing its waiting period? This decides whether a 60% loss on a year-one graded death is real exposure.

### Ask his accountant

12. What income tax rate applies to commission income, given how the business is organised?
13. What does it actually cost him to deliver, as a percent of the price he charges?

---

## 8. Known risks in this plan

| Risk | Effect | What we do |
|---|---|---|
| Nearly every input is UNSOURCED or HIS DATA | The dashboard is only as good as what he types in | Mark the status of every field on screen. Never hide a number in the code. |
| Mode 4, face less unpaid premiums, may not be a real product feature | If used without confirming, the insurance curve is too pessimistic | Marked DOUBTFUL in `SOURCES.md`. Do not enable until a carrier confirms it in writing. |
| Deterministic returns | A market fall in a claim year is invisible | Stated as an exclusion. Revisit only if he asks. |
| One repository, one language, one copy of the maths | A defect in `model.js` is a defect everywhere | The golden test catches change. Only the law tests and hand-calculated values catch error. |

---

## 9. The insurance panel, rebuilt

Panel 3 asked eleven questions in one flat list. Two of them held the same
fact, one of them could disagree with the contract price, and the labels used
the words of the model, not the words of a carrier illustration.

The model in section 2 did not change. Not one line. Every number in
`golden.test.js` is the same number.

### 9.1 The premium is derived when he pays in full

The contract price is the whole bill and the face amount at issue. When he
pays in full, it is also the premium. One number cannot disagree with itself,
so the field is gone. The page shows the premium as a line he reads:

    Single premium $9,170, the price you charge. It goes to the carrier once.

On a 3, 5 or 10-year plan the premium is not a function of the price. Only the
carrier illustration gives it. So the field stays, and:

- it moves with the price, at the ratio he last typed, and the page says so;
- a line under it checks the total: *"3 payments of $3,515 come to $10,545.
  That is 1.15 times the price."*

### 9.2 Two questions, then only what that policy needs

The two real decisions are now two rows of buttons at the top of the panel.

| Question | Answers |
|---|---|
| How does he pay? | In full · 3 years · 5 years · 10 years |
| If he dies in the first years, the policy pays | The full amount · A part of it · The money back, with interest |

The fourth benefit shape, *face less unpaid premiums*, is behind **Other
shapes**, with its DOUBTFUL note. It is not a first answer until a carrier
confirms it.

A contract paid in full, with a level benefit, now needs **four controls**, not
eleven. The panel is in two groups: **The policy**, and **What you keep**.

### 9.3 The waiting period is no longer a field

A graded policy lists one percent for each early year. The count of those years
*is* the waiting period, so he gives it once:

    Year 1  [ 40 ] %
    Year 2  [ 70 ] %
    ADD YEAR 3    REMOVE YEAR 2
    The full amount is paid from year 3.

The money-back shape has no schedule, so it keeps one field for the length of
the period.

Two settings are now held off when he pays in full, because they cannot apply:
the renewal commission rate, and *growth starts only at paid-up*. See section
10.

### 9.4 The arithmetic is on the screen

A new block, **How we made these numbers**, shows every step for the selected
year, in his own numbers, in three columns: the bill, the trust, insurance. A
click on any rate opens the field that holds it.

It also shows the two things the panels could not: that the commission fund
grows at the **net trust rate**, and that a trust sale pays **no commission**,
by 239 CMR 4.08.

### 9.5 What changed in the files

| File | Change |
|---|---|
| `src/model.js` | none |
| `src/chart.js` | none |
| `src/inputs.js` | new labels, two groups, three new field kinds, `deriveValues()` |
| `src/app.js` | the new controls, the premium ratio, the explanation block |
| `index.html` | the explanation block, and styles |
| `test/inputs.test.js` | new. Seven tests for the derived values |

51 tests pass.

---

## 10. Two decisions to confirm

1. **Does the carrier grow a single-pay policy from issue?** The page now holds
   *growth starts only at paid-up* off when he pays in full, and hides it. If a
   carrier starts the growth in year 2 on a single-pay policy, this hides a
   real feature. Question 6 in section 7 answers it.
2. **Is the face amount at issue equal to the price on a single-pay policy?**
   The model has always made them equal. The premium is now derived from that
   equality, so the assumption is on the screen instead of in the code.
   Question 10 in section 7 answers it.
