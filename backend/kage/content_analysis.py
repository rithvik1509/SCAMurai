"""Evidence-based content warnings, independent of profile differences."""
import re
from urllib.parse import urlsplit

from backend.models.yokai_schemas import BrowserCapture, Finding

FINANCIAL = re.compile(r'\b(?:deposit|beneficiary|payment|matching credit|matching demo credit|liquidity onboarding)\b', re.I)
SECRET = re.compile(r'\b(?:seed[ _-]*phrase|recovery[ _-]*phrase|private[ _-]*key)\b', re.I)
DISCLOSURE = re.compile(r'fictional|security test(?:ing)? fixture|no real payments|nonfunctional demo', re.I)


def blocks(capture: BrowserCapture) -> list[str]:
    if not capture.structure:
        return []
    return list(dict.fromkeys(capture.structure.headings + capture.structure.text_blocks + capture.structure.action_labels))


def disclosure(capture: BrowserCapture) -> str:
    matches = [text for text in blocks(capture) if DISCLOSURE.search(text)]
    return (' The page also discloses: ' + ' | '.join(matches[:2])[:700] +
            '. This disclosure is recorded context, not independent verification of safety.') if matches else ''


def content_warnings(captures: list[BrowserCapture]) -> list[Finding]:
    grouped: dict[str, Finding] = {}

    def add(key, title, detail, capture, severity='high'):
        if key in grouped:
            if capture.id not in grouped[key].evidence_ids:
                grouped[key].evidence_ids.append(capture.id)
            return
        grouped[key] = Finding(id=key, title=title, explanation=detail + disclosure(capture),
            tone='sensitive', severity=severity,
            confidence='Observed visible content or input structure; intent and successful data transmission are not established.',
            evidence_ids=[capture.id])

    for capture in captures:
        if capture.availability == 'unavailable':
            continue
        for form in capture.forms:
            labels = ' | '.join(form.fields)
            if SECRET.search(labels):
                add('secret-request', 'Wallet recovery secrets requested',
                    f'{capture.label}: visible input labels: {labels[:900]}. Do not enter a seed phrase or private key into a website. Inputs were not filled or submitted.', capture)
            credentials = bool(re.search(r'password|cvv|card.?number|verification.?code|\botp\b', labels, re.I))
            if credentials and form.action and (urlsplit(form.action).scheme == 'http' or form.method.upper() == 'GET'):
                add('unsafe-sensitive-form', 'Sensitive form uses an exposed submission route',
                    f'{capture.label}: {form.method} {form.action}; fields: {labels[:900]}. HTTP lacks transport encryption; GET can place values in URLs. No submission was performed.', capture)
        claim = next((text for text in blocks(capture)
            if re.search(r'\bguaranteed\b.{0,60}\b(?:returns?|profits?|income)\b', text, re.I)
            and not re.search(r'\b(?:no|not|never|avoid|beware|warning)\b.{0,45}\bguaranteed\b', text, re.I)), None)
        if claim:
            add('guaranteed-returns', 'Guaranteed investment returns claimed',
                f'Visible claim: “{claim[:500]}”. Verify the operator independently before sending money; this claim alone does not establish fraud.', capture, 'medium')
    return list(grouped.values())


def describe_content_difference(baseline: BrowserCapture, capture: BrowserCapture):
    base = blocks(baseline)
    current = blocks(capture)
    only_current = [text for text in current if text not in set(base)]
    only_base = [text for text in base if text not in set(current)]
    financial = [text for text in only_current + only_base if FINANCIAL.search(text)]
    def excerpt(label, values):
        # Show security-relevant excerpts first, with bounded literal quotes.
        ordered = sorted(values, key=lambda value: not bool(FINANCIAL.search(value)))
        return f'{label} only: ' + (' | '.join(f'“{text[:400]}”' for text in ordered[:5]) or 'No unique visible text recorded.')
    explanation = excerpt(capture.label, only_current) + ' ' + excerpt(baseline.label, only_base)
    if financial:
        explanation += (' Financial or deposit-related content is conditional on the selected profile. Confirm this offer independently before sharing information or sending money. No payment was attempted; this does not establish fraud.' + disclosure(capture) + disclosure(baseline))
    else:
        explanation += ' Responsive layout and personalization can explain this; no malicious intent is established.'
    return bool(financial), explanation
