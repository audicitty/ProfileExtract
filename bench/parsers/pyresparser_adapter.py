"""Bench oracle B: pdfminer.six text extraction + pyresparser's field extractors.

Usage: pyresparser_adapter.py <fixture.pdf>
Prints the parser's output as JSON on stdout.

WHY THIS IS NOT STOCK pyresparser
---------------------------------
pyresparser 1.0.6 (GPL-3.0) cannot run as published on this stack. Two shims, both
compatibility-only - no extraction logic is altered:

1. `ResumeParser.__init__` calls `spacy.load(<package dir>)` to load a custom NER model
   bundled in spaCy v2 format. spaCy 3.8 rejects it outright:
       OSError [E053] Could not read config file from ...\\pyresparser\\config.cfg
   Pinning spaCy 2.x is not an option - no wheels exist for Python >= 3.9. So this adapter
   calls pyresparser's `utils` functions directly and skips the dead model. The fields
   that model supplied (designation, company_names, degree via NER) are therefore
   unavailable from oracle B; they are measured by oracle A alone and every check that
   rests on them is marked single-parser / low confidence in checks/registry.yaml.

2. `utils.extract_name` calls `matcher.add(name, None, *patterns)`, the spaCy v2 signature,
   which raises on spaCy 3. The same PROPN PROPN pattern is registered here with the v3
   signature instead.

Everything else - the email and phone regexes, the skills list (pyresparser's own
skills.csv), section detection, education extraction, experience extraction - is
pyresparser's code, unmodified.
"""

import json
import sys
import warnings

warnings.filterwarnings("ignore")

import spacy
from spacy.matcher import Matcher

import pyresparser.utils as utils

_NLP = None


def nlp():
    global _NLP
    if _NLP is None:
        _NLP = spacy.load("en_core_web_sm")
    return _NLP


def extract_name(doc):
    """pyresparser's PROPN PROPN name pattern, registered with the spaCy v3 API (shim 2)."""
    matcher = Matcher(nlp().vocab)
    matcher.add("NAME", [[{"POS": "PROPN"}, {"POS": "PROPN"}]])
    for _, start, end in matcher(doc):
        return doc[start:end].text
    return None


def safe(fn, default=None):
    try:
        return fn()
    except Exception as exc:  # a parser failing on a fixture is a result, not a crash
        return {"__error__": f"{type(exc).__name__}: {exc}"} if default is None else default


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: pyresparser_adapter.py <fixture.pdf>", file=sys.stderr)
        return 2

    pdf_path = sys.argv[1]
    raw_text = utils.extract_text(pdf_path, ".pdf")
    doc = nlp()(" ".join(raw_text.split()))

    sections = safe(lambda: utils.extract_entity_sections_grad(raw_text), {})
    if isinstance(sections, dict) and "__error__" in sections:
        sections = {}

    out = {
        "name": safe(lambda: extract_name(doc)),
        "email": safe(lambda: utils.extract_email(raw_text)),
        "phone": safe(lambda: utils.extract_mobile_number(raw_text)),
        "skills": safe(lambda: utils.extract_skills(doc, doc.noun_chunks), []),
        "education": safe(lambda: utils.extract_education(doc), []),
        "experience_lines": safe(lambda: utils.extract_experience(raw_text), []),
        "sections": {k: v for k, v in (sections or {}).items()},
        "pages": safe(lambda: utils.get_number_of_pages(pdf_path)),
        "text_length": len(raw_text.strip()),
        "text": raw_text,
    }
    sys.stdout.write(json.dumps(out, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
