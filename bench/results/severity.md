# Measured severity

Generated 2026-09-17T14:26:18.166Z by `node bench/run.mjs`.

drop_points = baseline fixture accuracy minus this fixture's accuracy, in accuracy points, per parser. A dimension is "flagged" by a parser when its drop is at least
5 accuracy points. Baseline accuracy: open-resume 100%, pyresparser 81.3%.

| Fixture | Dimension | open-resume drop | pyresparser drop | Mean drop | Confidence |
|---|---|---|---|---|---|
| 03-scanned-image | text-encoding | 100 | 81.3 | 90.7 | both-parsers |
| 05-creative-headings | headings | 54.5 | 25 | 39.8 | both-parsers |
| 07-contact-in-margin | contact-placement | 36.4 | 0 | 18.2 | single-parser |
| 11-two-page | pagination | 9.1 | 0 | 4.6 | single-parser |
| 02-two-column | column-layout | 0 | 0 | 0 | no-measured-drop |
| 04-tables | structure | 0 | 0 | 0 | no-measured-drop |
| 06-hyphen-bullets | bullets | 0 | 0 | 0 | no-measured-drop |
| 08-dates-month-year | date-format | 0 | 0 | 0 | no-measured-drop |
| 09-dates-mixed | date-format | 0 | 0 | 0 | no-measured-drop |
| 10-icon-contact | contact-style | 0 | 0 | 0 | no-measured-drop |
| 12-right-aligned-dates | date-placement | 0 | 0 | 0 | no-measured-drop |
| 13-sidebar-skills | sidebar | 0 | 0 | 0 | no-measured-drop |
