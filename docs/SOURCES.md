# Where every number comes from

**Rule for this project: no number enters the code without a line in this file.**

If a value is not supported by a source, it is marked **UNSOURCED** and it must
appear on the dashboard as a field your uncle fills in, never as a hidden
constant.

## Status marks

| Mark | Meaning |
|---|---|
| **SOURCED** | Primary source read, cited, dated. Safe to use as a starting value. |
| **WEAK** | Only secondary or trade sources found. Use as a starting value, but mark it on screen. |
| **UNSOURCED** | No source found. Must be a user input. Never a default. |
| **HIS DATA** | Only your uncle can supply it. It comes off a statement, a price list, or his accountant. |

---

## 1. Contract and cost

| Input | Starting value | Status | Basis |
|---|---|---|---|
| Contract price | $9,170 | **WEAK** | NFDA 2023 General Price List Study: median funeral with viewing and burial, **$8,300**, excluding a vault. A secondary source reports the BLS funeral index rose 10.46% from 2023 to 2026, giving about $9,170. NFDA has published no newer median. **Replace with his own general price list.** |
| Funeral inflation rate | 4.6% per year | **WEAK** | Secondary sources citing BLS CPI funeral services report about **4.6% per year over the last five years**, and **3.65% per year from 1986 to 2026**. I have not yet read the BLS series directly. **To do: confirm the series identifier and pull the primary data from BLS.** |

**Note on the old notebook.** It used a $12,000 contract price and 3.5% funeral
inflation. Neither had a source, and 3.5% is below every published figure for
the recent period. Both are discarded.

---

## 2. The trust option

| Input | Starting value | Status | Basis |
|---|---|---|---|
| Trust net rate of return, after fees and after tax | 4.3% | **WEAK** | One field. See the note below. Replace it with a measurement from the trustee. |

**Note on the single field.** The trust used to take three numbers: a gross
return, a fee and a tax rate. A tax rate needs a base, and the two obvious bases
disagree. Tax divided by income earned and tax divided by total return give the
same answer for a bond account and differ by about three times for an equity
account, because most of an equity return is appreciation that was never sold
and never taxed. The three fields shipped at 5.5%, 0.75% and 15%, which taxed
the whole return and put the year-30 balance at $29,105 against a $35,344 bill.

The account balance has no such ambiguity, and 239 CMR 4.09(2) makes it the
number that matters: "The entire account balance shall be payable to the
Licensed Funeral Establishment". Fees, tax and realisation timing are all
already inside it. So the model asks for the balance growth and nothing else.

**How to measure it.** Ask the trustee for ten years of year-end balances on one
fully-funded account that had no deposits and no withdrawals, then compute
`(last balance / first balance) ^ (1 / years) - 1`. This works whether or not
the trustee makes the qualified funeral trust election: if the trustee pays the
tax from the account it is already out of the balance, and if it is a grantor
trust the customer paid it personally and the balance was never touched. Either
way the balance is what the funeral establishment receives.

**Limits.** The measurement is backward-looking, and the last ten years hold
both a strong equity run and the 2022 fall in bonds. It needs a real account
with a real history, so a new trustee cannot supply one. And if the trustee
changed its investment policy inside that period, the history describes a
portfolio that no longer exists.

**Basis for the 4.3% starting value.** It is the old three-field default carried
across: a 5.5% gross return, less a 0.75% fee, less a 0.42% tax drag. The 0.42%
assumes a 60/40 account where 2.5% of the return is interest and dividends, 3.0%
is appreciation, 10% of that appreciation is realised each year, and the 2.8%
that is taxed meets a 15% marginal rate. The 15% comes from IRC §685(c): a
qualified funeral trust taxes each beneficiary's interest as its own small
trust, and $9,170 earning 5.5% produces about $504 of income, which sits at the
bottom of the schedule. None of that arithmetic is in the code any more. It only
explains where 4.3% came from, and it is **not** a source. Replace it.

**Note on the old notebook.** It used a 5.5% gross return, a 0.75% fee, and a
whole federal and Massachusetts bracket engine driven by an assumed portfolio
mix. The return and fee had no source. The bracket engine was accurate on the
2026 rates but rested on an unsourced portfolio mix, and it taxed unrealised
capital gains every year, which overstated tax on equity-heavy portfolios. The
engine is removed. One measured rate replaces it.

---

## 3. His business

| Input | Starting value | Status | Basis |
|---|---|---|---|
| Business income tax rate | none | **HIS DATA** | His accountant. The correct rate depends on how the business is organised. Do not guess it from published Massachusetts rates. |

**Note on the old notebook.** It used 30% with no source.

---

## 4. The insurance option

| Input | Starting value | Status | Basis |
|---|---|---|---|
| Number of premium payments | 1 | n/a | A choice: 1, 3, 5 or 10. |
| Annual premium | = contract price | **HIS DATA** | Carrier illustration. On a multi-pay plan the premiums total **more** than the face amount. He must read the real figure, not divide the price. |
| Policy growth rate | none | **UNSOURCED** | Carrier product sheet. The old notebook used 1% to 3% with no source. |
| Growth starts only at paid-up | unticked | **UNSOURCED** | Carrier product sheet. Ask directly: *"Does the face amount grow during the pay period, or only after the policy is paid up?"* On a 10-pay plan this removes ten years of compounding. |
| First-year commission rate | none | **WEAK** | Trade sources report advertised rates near 12%, often about 7% net to the director, with single-pay and 1-year plans in a 3.86% to 14.72% range. Sources are an insurance forum thread and a vendor blog. **Replace with his carrier commission schedule.** |
| Renewal commission rate | none | **WEAK** | Same trade sources report **20% to 25% for 3, 5 and 10-year plans**. Set the first-year rate equal to the renewal rate for an as-earned schedule; set the first-year rate high and the renewal rate low for a heaped schedule. |

### Death benefit before the policy matures

One choice with four modes. See `LAW.md` section 4 for why this matters.

| Mode | Applies during | Pays | Status |
|---|---|---|---|
| Full face | — | Face, grown | n/a. This is the level-benefit product. |
| Percent of face | the waiting period | Face × the schedule | **UNSOURCED**. A common shape is 40% in year 1 and 70% in year 2, but this is folklore until a carrier document confirms it. |
| Return of premium + interest | the waiting period | Premiums paid × (1 + interest) | **UNSOURCED**. Typical guaranteed-issue design. Interest is often 5% to 10%. Confirm with the carrier. |
| Face less unpaid premiums | the pay period | Face, grown, less the remaining scheduled premiums | **UNSOURCED, AND DOUBTFUL.** Deducting the unpaid part of the *current year's* premium is standard life-insurance practice and is small. Deducting the *whole remaining balance* of a multi-pay schedule would defeat the purpose of multi-pay pre-need, and I found no source for it. **Do not use this mode until a carrier confirms it in writing.** |

The four modes are mutually exclusive by design. A carrier that grades the
benefit does not normally also deduct remaining premiums. Allowing both at once
would penalise early death twice and would make years 1 to 3 of the curve too
pessimistic — which is exactly where the number must be right.

---

## 5. What this model does not do

Every item below is a deliberate exclusion. None of them is a bug.

| Excluded | Effect on the answer |
|---|---|
| **Mortality** | The model shows the margin for every year of death as a curve. It does not weight those years by how likely each one is, and it produces no single expected value. |
| **Cash advance items** | Cash advance items are billed to the family at the time of service, so they never enter his contracts. 239 CMR 4.08(6)(c) and (d) are therefore out of scope. If he ever writes a vault into a contract, this model does not cover it. |
| **Non-cost-protected contracts** | The family covers any shortfall, so there is no funeral-home economics to model. 239 CMR 4.08(6)(e) to (h) are out of scope. |
| **Instalment trusts** | Excluded by decision. A part-funded trust is not cost-protected under 239 CMR 4.01, and guaranteeing a price against one means underwriting a life with no reserve. |
| **Lapse and commission chargeback** | If a customer stops paying on a multi-pay plan, the policy can lapse and the carrier can reclaim the commission. That risk stays with your uncle and stays out of the model. |
| **Accidental death benefit** | Most policies pay full face for accidental death even inside the waiting period. Ignoring it makes the graded and guaranteed-issue curves slightly pessimistic in years 1 and 2. |
| **Sequence of returns** | Returns are a fixed rate, not a random path. A market fall that lands in the same year as a claim is not modelled. |
| **Working capital** | 239 CMR 4.08(5) requires a certified death certificate and a certification of performance before payment, so he carries the cost of each case for some weeks. Not modelled. |
| **Contract cancellation** | 239 CMR 4.07 governs cancellation and refunds. Not yet read. Not modelled. |

---

## 6. Corrections to `preneed_funding_model.ipynb`

These are the reasons the earlier notebook could not be trusted. All are fixed
by removal.

| What it did | Why it was wrong |
|---|---|
| Compared "composite filing" against "one Form 1041 for the whole book", and printed the annual cost of "filing it wrong" | That choice does not exist. IRC §685(c) computes the tax per beneficiary interest either way. |
| Hard-coded the 4% Massachusetts surtax threshold at $1,000,000 | The threshold is indexed. Reported as $1,107,750 for 2026. |
| Offered a switch `apply_surtax_per_beneficiary` | The tax function never read it. Flipping it changed nothing. |
| Offered `lapse_rate` and `chargeback_years` | The code contained `if ...: pass`. Neither did anything. |
| Held the mortality curve in a default argument | The "younger buyer, age 62" scenario silently used the age-72 curve. That row was wrong. |
| Deducted the trustee fee before federal tax but not before Massachusetts tax | Undocumented and unexplained. |
| Read `yrs`, `pmf`, `cv` and `HORIZON` from the notebook namespace inside functions | Running the cells out of order changed the answers, with no error. |
| Split the whole gross return into tax buckets every year | Taxed unrealised capital gains, so it overstated the tax on equity portfolios. |
| Said `buyer_age` "drives mortality AND commission grid" | There was no commission grid. |
| Computed `benefit − (face − premiums_paid)` for unpaid premiums | Treats total premiums as equal to the face amount. On a multi-pay plan they are not. |

---

*All sources read 2026-08-19. Re-check the tax year figures every January.*
