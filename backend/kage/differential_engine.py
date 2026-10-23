"""Deterministic, evidence-linked comparisons of browser profile captures."""

from __future__ import annotations

import re
from backend.kage.content_analysis import content_warnings, describe_content_difference
from urllib.parse import urlsplit

from backend.models.yokai_schemas import (
    BrowserCapture,
    Counterfactual,
    EvidenceEdge,
    EvidenceGraph,
    EvidenceNode,
    EvidenceTone,
    Finding,
    InvestigationResult,
    ProfileId,
)

PAYMENT_HINTS = re.compile(r"payment|card number|security code|cvv|billing", re.I)
CREDENTIAL_HINTS = re.compile(r"password|email|phone|otp|verification code", re.I)


def compare_captures(
    captures: list[BrowserCapture],
    fingerprints: list[str],
    target_url: str,
) -> InvestigationResult:
    findings: list[Finding] = content_warnings(captures)
    limitations = [
        "Browser automation is not a hardened malware sandbox. Production deployments require container or VM isolation and network-level egress controls.",
        "A behavioral difference is evidence for review, not proof of malicious intent. Personalization, experiments, and responsive design can be legitimate.",
        "Requests were restricted by the configured target policy. Public-testing mode permits public cross-origin assets and redirects; private/unsafe destinations remain blocked. DNS rebinding requires network-level egress controls.",
        "Forms were inspected structurally only. YOKAI did not enter data or submit forms.",
        "Investigation results are held temporarily in bounded in-memory storage and are lost on process restart.",
    ]
    recommendations = [
        "Review the referenced profile captures and confirm each destination through an independent trusted channel.",
        "Do not enter passwords, one-time codes, payment details, or personal information during an investigation.",
    ]
    risk_indicators: list[str] = []
    risk_indicators.extend(finding.title for finding in findings)
    limitations.append('Visible text and actions are bounded samples. No reputation feed, malware execution verdict, authenticated workflow, or interaction-only content is included. Site disclosures are unverified page claims.')

    # Missing/partial observations cannot establish a behavioral difference.
    available = [capture for capture in captures if capture.availability == "complete"]
    baseline = next(
        (capture for capture in available if capture.profile_id == ProfileId.DESKTOP),
        available[0] if available else None,
    )
    if baseline is not None:
        for capture in available:
            if capture.id == baseline.id:
                continue
            evidence_ids = [baseline.id, capture.id]
            base_requests = {(item.url, item.kind) for item in baseline.network}
            changed_requests = {(item.url, item.kind) for item in capture.network}
            if base_requests != changed_requests:
                findings.append(Finding(
                    id=f'network-{capture.profile_id.value}',
                    title='Observed request destinations differ by profile',
                    explanation=(f'{len(changed_requests - base_requests)} request destinations/types appeared only in the compared profile; '
                                 f'{len(base_requests - changed_requests)} appeared only in the baseline. '
                                 'Inspect the capture request lists. Responsive assets and blocked requests can explain this difference; it does not prove data was transmitted or fraud occurred.'),
                    tone=EvidenceTone.DIFFERENCE, severity='informational',
                    confidence='Limited to observed or blocked requests during the capture window.',
                    evidence_ids=evidence_ids,
                ))
            if urlsplit(baseline.final_url).hostname != urlsplit(capture.final_url).hostname:
                findings.append(
                    Finding(
                        id=f"redirect-host-{capture.profile_id.value}",
                        title="The profiles ended on different destination hosts",
                        explanation=(
                            "The final host differs between recorded profiles. Confirm the redirect and destination are expected; host differences can also result from legitimate localization or routing."
                            f' {baseline.label}: {baseline.final_url}; {capture.label}: {capture.final_url}.'
                        ),
                        tone=EvidenceTone.DIFFERENCE,
                        severity="medium",
                        confidence="High confidence that the observed final hosts differ; intent is unknown.",
                        evidence_ids=evidence_ids,
                    )
                )
                risk_indicators.append("Profile-dependent final destination host")
            elif baseline.final_url != capture.final_url:
                findings.append(
                    Finding(
                        id=f"navigation-{capture.profile_id.value}",
                        title="The profiles followed different navigation paths",
                        explanation=(
                            "Recorded final URLs differ between profiles. This may reflect legitimate routing or personalization and is not proof of malicious behavior."
                            f' {baseline.label}: {baseline.final_url}; {capture.label}: {capture.final_url}.'
                        ),
                        tone=EvidenceTone.DIFFERENCE,
                        severity="low",
                        confidence="High confidence that the recorded final URLs differ; the cause is unknown.",
                        evidence_ids=evidence_ids,
                    )
                )
            baseline_redirects = [(item.target, item.status) for item in baseline.redirects]
            current_redirects = [(item.target, item.status) for item in capture.redirects]
            if baseline_redirects != current_redirects:
                if not any(item.id == f"redirect-host-{capture.profile_id.value}" for item in findings):
                    findings.append(
                        Finding(
                            id=f"redirect-chain-{capture.profile_id.value}",
                            title="The recorded redirect chain differs by profile",
                            explanation=(
                                "The captures contain different HTTP redirect responses. Review the exact redirect evidence and destination before trusting the page."
                            ),
                            tone=EvidenceTone.DIFFERENCE,
                            severity="medium",
                            confidence="High confidence that observed redirect responses differ; expected routing cannot be inferred.",
                            evidence_ids=evidence_ids,
                        )
                    )
                risk_indicators.append("Profile-dependent redirect chain")

            base_forms = {_form_signature(form) for form in baseline.forms}
            changed_forms = {_form_signature(form) for form in capture.forms}
            if base_forms != changed_forms:
                changed_only = changed_forms - base_forms
                baseline_only = base_forms - changed_forms
                sensitive = any(signature[-1] for signature in changed_only | baseline_only)
                findings.append(
                    Finding(
                        id=f"forms-{capture.profile_id.value}",
                        title=(
                            "Sensitive form structure differs by profile"
                            if sensitive
                            else "Form structure differs by profile"
                        ),
                        explanation=(
                            "A form with credential or payment-related fields appears in one capture but not the other, or has a different destination. YOKAI did not fill or submit it. This is security-sensitive evidence to review, not a finding of fraud."
                            if sensitive
                            else "Form structure or action differs between captures. Confirm whether this is expected personalization."
                        ) + ' ' + _describe_unique_forms(capture, changed_only) + ' ' + _describe_unique_forms(baseline, baseline_only),
                        tone=EvidenceTone.SENSITIVE if sensitive else EvidenceTone.DIFFERENCE,
                        severity="high" if sensitive else "medium",
                        confidence="High confidence in the observed form structure difference; legitimacy is not established."
                        if sensitive
                        else "High confidence in the observed form structure difference; security impact is uncertain.",
                        evidence_ids=evidence_ids,
                    )
                )
                if sensitive:
                    risk_indicators.append("Conditional credential or payment form")

        if baseline.structure is not None:
            for capture in available:
                if capture.id == baseline.id or capture.structure is None:
                    continue
                if (
                    baseline.structure.headings != capture.structure.headings
                    or baseline.structure.link_count != capture.structure.link_count
                    or _fingerprint_for(capture, captures, fingerprints)
                    != _fingerprint_for(baseline, captures, fingerprints)
                ) and not any(
                    finding.id == f"forms-{capture.profile_id.value}"
                    for finding in findings
                ):
                    financial, detail = describe_content_difference(baseline, capture)
                    findings.append(
                        Finding(
                            id=f"content-{capture.profile_id.value}",
                            title="Financial or deposit content differs by profile" if financial else "Page content or structure differs by profile",
                            explanation=detail,
                            tone=EvidenceTone.SENSITIVE if financial else EvidenceTone.DIFFERENCE,
                            severity="medium" if financial else "informational",
                            confidence="High confidence that the recorded visible content or structure differs; intent and legitimacy are unknown.",
                            evidence_ids=[baseline.id, capture.id],
                        )
                    )
                    if financial:
                        risk_indicators.append('Profile-dependent financial or deposit content')

    graph = _build_graph(captures, target_url)
    counterfactuals = _build_counterfactuals(captures)
    if len(available) < 2:
        findings.append(Finding(
            id='insufficient-captures', title='Insufficient complete browser evidence',
            explanation='At least two complete captures are needed to compare profiles. Missing or partial observations do not establish a behavioral difference.',
            tone=EvidenceTone.UNAVAILABLE, severity='informational', confidence='Inconclusive.',
            evidence_ids=[capture.id for capture in captures],
        ))
    if not findings:
        findings.append(
            Finding(
                id="no-material-difference",
                title="No material security-sensitive difference observed",
                explanation=(
                    "The available captures did not show a conditional sensitive form or a profile-dependent navigation destination. This is limited to the observed profiles and session conditions, not proof that the site is safe."
                ),
                tone=EvidenceTone.NORMAL,
                severity="informational",
                confidence="Limited to the selected profiles, target response, and observation window.",
                evidence_ids=[capture.id for capture in available],
            )
        )

    return InvestigationResult(
        captures=captures,
        findings=findings,
        risk_indicators=risk_indicators,
        limitations=limitations,
        recommendations=recommendations,
        graph=graph,
        counterfactuals=counterfactuals,
    )


def _form_signature(form) -> tuple:
    return (
        form.action,
        form.method.upper(),
        tuple(sorted(form.fields)),
        form.sensitive,
    )


def _describe_unique_forms(capture, signatures: set[tuple]) -> str:
    if not signatures:
        return f'{capture.label}: no unique form structure.'
    descriptions = [f'{method} {action}; visible fields: {", ".join(fields[:10]) or "none"}'
                    for action, method, fields, sensitive in sorted(signatures)[:3]]
    suffix = f' ({len(signatures) - 3} more not listed.)' if len(signatures) > 3 else ''
    return (f'{capture.label} only: ' + ' | '.join(descriptions))[:3500] + suffix


def _fingerprint_for(capture, captures, fingerprints) -> str:
    try:
        return fingerprints[captures.index(capture)]
    except (ValueError, IndexError):
        return ""


def _build_graph(captures: list[BrowserCapture], target_url: str) -> EvidenceGraph:
    nodes: list[EvidenceNode] = []
    edges: list[EvidenceEdge] = []
    root_url = urlsplit(target_url)
    for index, capture in enumerate(captures):
        evidence_ids = [capture.id]
        profile_node = f"{capture.id}-profile"
        target_node = f"{capture.id}-target"
        y_position = index * 280.0
        nodes.extend(
            [
                EvidenceNode(
                    id=profile_node,
                    kind="profile",
                    label=capture.label,
                    description=(
                        f"{capture.viewport.width} × {capture.viewport.height}; {capture.cookie_state}"
                    ),
                    tone=EvidenceTone.NORMAL,
                    evidence_ids=evidence_ids,
                    profile_id=capture.profile_id,
                    position={"x": 0.0, "y": y_position},
                ),
                EvidenceNode(
                    id=target_node,
                    kind="url",
                    label=root_url.path or "/",
                    description=root_url.hostname or "authorized target",
                    tone=EvidenceTone.NORMAL,
                    evidence_ids=evidence_ids,
                    profile_id=capture.profile_id,
                    position={"x": 280.0, "y": y_position},
                ),
            ]
        )
        edges.append(
            EvidenceEdge(
                id=f"{capture.id}-loads-target",
                source=profile_node,
                target=target_node,
                label="Loaded authorized target",
                tone=EvidenceTone.NORMAL,
                evidence_ids=evidence_ids,
            )
        )
        current_node = target_node
        for redirect_index, redirect in enumerate(capture.redirects):
            node_id = f"{capture.id}-redirect-{redirect_index}"
            nodes.append(
                EvidenceNode(
                    id=node_id,
                    kind="url",
                    label=urlsplit(redirect.target).path or redirect.target,
                    description=f"HTTP {redirect.status} to {redirect.target}",
                    tone=EvidenceTone.DIFFERENCE,
                    evidence_ids=evidence_ids,
                    profile_id=capture.profile_id,
                    position={"x": 560.0 + redirect_index * 240, "y": y_position},
                )
            )
            edges.append(
                EvidenceEdge(
                    id=f"{node_id}-edge",
                    source=current_node,
                    target=node_id,
                    label=f"HTTP {redirect.status} redirect",
                    tone=EvidenceTone.DIFFERENCE,
                    evidence_ids=evidence_ids,
                )
            )
            current_node = node_id
        for form_index, form in enumerate(capture.forms):
            node_id = f"{capture.id}-{form.id}"
            nodes.append(
                EvidenceNode(
                    id=node_id,
                    kind="form",
                    label=form.label,
                    description=f"{form.method} {form.action}; {', '.join(form.fields)}",
                    tone=EvidenceTone.SENSITIVE if form.sensitive else EvidenceTone.NORMAL,
                    evidence_ids=evidence_ids,
                    profile_id=capture.profile_id,
                    position={"x": 560.0, "y": y_position + 100.0 * (form_index + 1)},
                )
            )
            edges.append(
                EvidenceEdge(
                    id=f"{node_id}-edge",
                    source=current_node,
                    target=node_id,
                    label="Observed form structure",
                    tone=EvidenceTone.SENSITIVE if form.sensitive else EvidenceTone.NORMAL,
                    evidence_ids=evidence_ids,
                )
            )
        for network_index, item in enumerate(capture.network):
            node_id = f"{capture.id}-{item.id}"
            host = urlsplit(item.url).hostname or "blocked destination"
            nodes.append(
                EvidenceNode(
                    id=node_id,
                    kind="network",
                    label=host,
                    description=f"{item.method} {item.kind}",
                    tone=EvidenceTone.DIFFERENCE
                    if item.kind.startswith("Blocked")
                    else EvidenceTone.NORMAL,
                    evidence_ids=evidence_ids,
                    profile_id=capture.profile_id,
                    position={"x": 560.0, "y": y_position + 160.0 + 60.0 * network_index},
                )
            )
            edges.append(
                EvidenceEdge(
                    id=f"{node_id}-edge",
                    source=current_node,
                    target=node_id,
                    label="Observed or blocked request",
                    tone=EvidenceTone.DIFFERENCE
                    if item.kind.startswith("Blocked")
                    else EvidenceTone.NORMAL,
                    evidence_ids=evidence_ids,
                )
            )
    return EvidenceGraph(nodes=nodes[:2000], edges=edges[:5000])


def _build_counterfactuals(
    captures: list[BrowserCapture],
) -> list[Counterfactual]:
    by_profile = {capture.profile_id: capture for capture in captures}
    evidence_ids = [capture.id for capture in captures]
    result: list[Counterfactual] = []
    if any(capture.availability != 'complete' for capture in captures):
        return [Counterfactual(
            id='incomplete-experiment', title='Controlled comparison is inconclusive',
            baseline='One or more selected captures were incomplete.',
            changed_variable='The requested browser profile condition.',
            observed_result='The captures cannot establish a reliable comparison.',
            finding='Repeat the experiment after resolving capture failures.',
            conclusion='inconclusive', evidence_ids=evidence_ids,
        )]
    desktop = by_profile.get(ProfileId.DESKTOP)
    returning = by_profile.get(ProfileId.RETURNING)
    mobile = by_profile.get(ProfileId.MOBILE)
    if desktop and returning:
        result.append(
            Counterfactual(
                id="returning-session",
                title="Effect of the controlled returning-visitor cookie",
                baseline="Fresh isolated desktop context without the test cookie.",
                changed_variable="A single controlled YOKAI returning-visitor cookie was added.",
                observed_result=(
                    "Recorded output differs between the fresh and returning context."
                    if _capture_signature(desktop) != _capture_signature(returning)
                    else "No recorded output difference between the fresh and returning context."
                ),
                finding="This comparison changes only the controlled test cookie; it does not establish why page code changed its behavior.",
                conclusion="controlled",
                evidence_ids=[desktop.id, returning.id],
            )
        )
    elif desktop and mobile:
        result.append(
            Counterfactual(
                id="device-profile",
                title="Effect of changing the complete device profile",
                baseline="Desktop viewport, desktop user agent, no touch emulation, fresh context.",
                changed_variable="Mobile profile changes viewport, user agent, touch support, and device emulation together.",
                observed_result=(
                    "Recorded output differs between desktop and mobile captures."
                    if _capture_signature(desktop) != _capture_signature(mobile)
                    else "No recorded output difference between desktop and mobile captures."
                ),
                finding="The grouped mobile profile is an observed correlate; this comparison does not isolate viewport as the cause.",
                conclusion="correlation",
                evidence_ids=[desktop.id, mobile.id],
            )
        )
    elif len(captures) > 1:
        result.append(
            Counterfactual(
                id="inconclusive-profile-pair",
                title="The selected profiles do not isolate one condition",
                baseline="No desktop baseline was included.",
                changed_variable="Selected profiles may change more than one browser property.",
                observed_result="The available captures cannot identify a single changed condition.",
                finding="Repeat with a desktop baseline and one controlled profile change.",
                conclusion="inconclusive",
                evidence_ids=evidence_ids,
            )
        )
    return result


def _capture_signature(capture: BrowserCapture) -> tuple:
    return (
        capture.final_url,
        capture.title,
        capture.structure.headings if capture.structure else (),
        tuple(_form_signature(form) for form in capture.forms),
    )
