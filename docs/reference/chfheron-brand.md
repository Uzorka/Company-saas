# CHF Heron — brand reference

Supplied by the client on 2026-09-14 as a structured extract of
`https://chfheron.com/` (homepage, About, Contact, brands, shop, FAQ, returns,
terms, privacy). The build environment cannot reach that site — the egress
proxy blocks every host outside a short allowlist — so this document is the
provenance for every CHF Heron fact in `src/content/company.ts`.

It replaces the directory-sourced guesses that were there before. One of those
was wrong: see "Corrections" below.

## Verified from the company's own site

| Fact | Value |
|---|---|
| Name as displayed | CHF Heron Nigeria Ltd |
| Alternate written form | C.H.F. Heron Nig. Ltd. |
| Founded | December 1989 |
| Homepage headline | "Bringing quality to every Nigerian home" |
| Business | Distributor and online seller of international household, beauty, personal-care and food brands |
| Coverage | All 36 Nigerian states *(company claim)* |
| Office | Plot 1C Akin Ogunlewe Street, Victoria Island, Lagos |
| Phone | +234 704 410 2187 |
| Email | social@chfheron.com (contact page), sales@chfheron.com (footer) |
| Brand partners | 18 in the directory, incl. Badia, Brabantia, Sebamed, Vileda, Kikkoman, Creme of Nature, Nadir |
| Categories | 10, incl. Kitchen & Dining, Food & Grocery, Beauty & Personal Care, Home Cleaning |

Stated values: transparent dealings, dependability, sincerity, fair business
conduct, product and service quality, adapting to customer needs, continual
improvement.

## Corrections this made to what we had published

**The Apapa address was wrong.** `39 Warehouse Road, off Creek Road, Apapa` came
from a third-party business directory and does not appear on the company's own
site. Removed. Victoria Island is the only office the company publishes.

**Founded 1989 is now usable.** It was previously unpublished because only
aggregators claimed it; it is on their own About page.

**The four services were invented.** They described a generic FMCG distributor
and have been replaced with what the site actually describes.

## Not published, deliberately

- **Leadership.** The extract records `leadership: null` — no names on the site.
  Names are findable elsewhere; publishing identifiable people on an
  unaffiliated demo remains out of scope (D56).
- **Partner logos.** Logos belong to the brand owners; their presence on CHF
  Heron's site is not a licence for ours. Brand *names* as plain text are fine —
  the company lists them publicly itself.
- **"Exclusive distributor".** The extract explicitly did not find verified
  exclusive distribution rights. We say "brands we distribute", never
  "exclusive".
- **Product counts.** The homepage says 1,000+; the shop says 606; brand
  directory and filter totals disagree with each other. No total is published.
- **Return windows, support hours, payment providers.** The extract flags
  contradictions in all three on the company's own site. None are reproduced.
- **"35 years".** An anniversary claim that goes stale. The founding date is
  stable, so we use that.

## Design note

Their primary blue is `#1B4F8C` — the same value as this product's `brand-600`,
arrived at independently from the design pack. Their accent orange is `#E87722`.
The product keeps its own design system; adopting their exact typography
(Manrope / Plus Jakarta Sans) is a per-tenant theming question, not a change to
make here.
