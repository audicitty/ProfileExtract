# Parser bench matrix

Generated 2026-09-17T14:26:18.164Z by `node bench/run.mjs`. Field-extraction accuracy,
mean of that parser's probes. Parsers are comparable to themselves across fixtures,
not to each other.

| Fixture | Dimension | open-resume | pyresparser |
|---|---|---|---|
| 01-baseline | baseline | 100% | 81.3% |
| 02-two-column | column-layout | 100% | 81.3% |
| 03-scanned-image | text-encoding | 0% | 0% |
| 04-tables | structure | 100% | 81.3% |
| 05-creative-headings | headings | 45.5% | 56.3% |
| 06-hyphen-bullets | bullets | 100% | 81.3% |
| 07-contact-in-margin | contact-placement | 63.6% | 81.3% |
| 08-dates-month-year | date-format | 100% | 81.3% |
| 09-dates-mixed | date-format | 100% | 81.3% |
| 10-icon-contact | contact-style | 100% | 81.3% |
| 11-two-page | pagination | 90.9% | 81.3% |
| 12-right-aligned-dates | date-placement | 100% | 81.3% |
| 13-sidebar-skills | sidebar | 100% | 81.3% |

### open-resume — per-probe scores (%)

| Fixture | name | email | phone | location | url | skills | work_companies | work_titles | work_dates | education | bullets |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 01-baseline | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 02-two-column | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 03-scanned-image | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 04-tables | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 05-creative-headings | 100 | 100 | 100 | 100 | 100 | 0 | 0 | 0 | 0 | 0 | 0 |
| 06-hyphen-bullets | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 07-contact-in-margin | 100 | 0 | 0 | 0 | 0 | 100 | 100 | 100 | 100 | 100 | 100 |
| 08-dates-month-year | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 09-dates-mixed | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 10-icon-contact | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 11-two-page | 100 | 100 | 100 | 100 | 100 | 100 | 66.7 | 66.7 | 66.7 | 100 | 100 |
| 12-right-aligned-dates | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 13-sidebar-skills | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |

### pyresparser — per-probe scores (%)

| Fixture | name | email | phone | skills | sections | work_entities | education | bullets |
|---|---|---|---|---|---|---|---|---|
| 01-baseline | 100 | 100 | 100 | 50 | 100 | 100 | 0 | 100 |
| 02-two-column | 100 | 100 | 100 | 50 | 100 | 100 | 0 | 100 |
| 03-scanned-image | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 04-tables | 100 | 100 | 100 | 50 | 100 | 100 | 0 | 100 |
| 05-creative-headings | 100 | 100 | 100 | 50 | 0 | 0 | 0 | 100 |
| 06-hyphen-bullets | 100 | 100 | 100 | 50 | 100 | 100 | 0 | 100 |
| 07-contact-in-margin | 100 | 100 | 100 | 50 | 100 | 100 | 0 | 100 |
| 08-dates-month-year | 100 | 100 | 100 | 50 | 100 | 100 | 0 | 100 |
| 09-dates-mixed | 100 | 100 | 100 | 50 | 100 | 100 | 0 | 100 |
| 10-icon-contact | 100 | 100 | 100 | 50 | 100 | 100 | 0 | 100 |
| 11-two-page | 100 | 100 | 100 | 50 | 100 | 100 | 0 | 100 |
| 12-right-aligned-dates | 100 | 100 | 100 | 50 | 100 | 100 | 0 | 100 |
| 13-sidebar-skills | 100 | 100 | 100 | 50 | 100 | 100 | 0 | 100 |
