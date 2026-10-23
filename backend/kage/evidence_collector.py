"""Capture structural browser evidence without reading submitted form values."""

from __future__ import annotations

import hashlib
import re

from playwright.async_api import Page

from backend.kage.security_policy import redact_url
from backend.kage.personas import Persona
from backend.models.yokai_schemas import (
    BrowserCapture,
    FormObservation,
    NetworkObservation,
    PageStructure,
    RedirectObservation,
    Viewport,
)

SENSITIVE_FIELD_TYPES = {"password", "email", "tel"}
SENSITIVE_NAME_HINTS = (
    "password",
    "passwd",
    "email",
    "phone",
    "card",
    "payment",
    "account",
    "otp",
    "code",
    "security",
    "cvv",
)


async def collect_capture(
    *,
    page: Page,
    profile: Persona,
    capture_id: str,
    initial_url: str,
    redirects: list[RedirectObservation],
    network: list[NetworkObservation],
    notes: list[str],
    availability: str,
) -> tuple[BrowserCapture, str]:
    title = ""
    user_agent = ""
    headings: list[str] = []
    link_count = 0
    language = ""
    forms: list[FormObservation] = []
    fingerprint = ""
    text_blocks: list[str] = []
    action_labels: list[str] = []
    try:
        title = (await page.title())[:500]
        user_agent = await page.evaluate("navigator.userAgent")
        evidence = await page.evaluate(
            """() => {
              const visible = (element) => {
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden' &&
                  Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
              };
              const cleanText = (value, limit = 500) => value.replace(/\\s+/g, ' ').trim().slice(0, limit);
              const forms = [...document.forms].slice(0, 200).map((form, index) => {
                const controls = [...form.querySelectorAll('input, select, textarea, button')].filter(visible).slice(0, 100);
                const fields = controls.map((field) => {
                  const type = (field.getAttribute('type') || field.tagName).toLowerCase();
                  const name = field.getAttribute('name') || field.id || '';
                  const label = field.labels?.[0]?.innerText || field.getAttribute('aria-label') || field.getAttribute('placeholder') || name || type;
                  return { type, name, label: cleanText(label) };
                });
                const sensitive = fields.some((field) =>
                  ['password', 'email', 'tel'].includes(field.type) ||
                  /password|passwd|email|phone|card|payment|otp|verification.?code|security.?code|cvv|seed.?phrase|recovery.?phrase|private.?key/i.test(field.name + ' ' + field.label)
                );
                return {
                  id: `form-${index + 1}`,
                  label: cleanText(form.querySelector('legend,h1,h2,h3,[aria-label]')?.innerText || `Form ${index + 1}`),
                  action: form.action || location.href,
                  method: (form.getAttribute('method') || 'GET').toUpperCase(),
                  fields: fields.map((field) => `${field.type}: ${field.label}`).slice(0, 100),
                  sensitive
                };
              }).filter((form, index) => visible(document.forms[index]));
              const orphanControls = [...document.querySelectorAll('input,select,textarea')].filter(el => !el.form && visible(el)).slice(0,100);
              if (orphanControls.length) {
                const fields = orphanControls.map(el => `${el.type || el.tagName.toLowerCase()}: ${cleanText(el.labels?.[0]?.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || el.id || 'Unlabelled field')}`);
                forms.push({id:'unassociated-controls',label:'Inputs outside an HTML form (submission destination unknown)',action:'',method:'UNKNOWN',fields,
                  sensitive:fields.some(value => /password|email|phone|card|payment|otp|cvv|seed.?phrase|recovery.?phrase|private.?key/i.test(value))});
              }
              // innerText excludes hidden DOM. Values from inputs are never read.
              const text = cleanText(document.body?.innerText || '', 80000);
              const textBlocks = [...new Set((document.body?.innerText || '').split(/\\n+/).map(line => cleanText(line)).filter(Boolean))].slice(0,200);
              const normalized = text
                .replace(/\\b\\d{1,4}[-/:]\\d{1,2}[-/:]\\d{1,4}(?:[ T]\\d{1,2}:\\d{2}(?::\\d{2})?)?\\b/g, '[time]')
                .replace(/\\b[0-9a-f]{8}-[0-9a-f-]{27,}\\b/gi, '[id]');
              return {
                headings: [...document.querySelectorAll('h1,h2,h3')].filter(visible).map((node) => cleanText(node.innerText)).filter(Boolean).slice(0, 50),
                linkCount: [...document.links].filter(visible).length,
                language: document.documentElement.lang || '',
                forms,
                textBlocks,
                actionLabels: [...new Set([...document.querySelectorAll('button,a,[role="button"]')].filter(visible).map(el => cleanText(el.innerText || el.getAttribute('aria-label') || '')).filter(Boolean))].slice(0,100),
                fingerprint: normalized
              };
            }"""
        )
        headings = evidence["headings"]
        link_count = evidence["linkCount"]
        language = evidence["language"][:35]
        text_blocks = evidence["textBlocks"]
        action_labels = evidence["actionLabels"]
        if not text_blocks and not evidence['forms']:
            availability = 'partial'
            notes.append('No readable page content or visible inputs were captured; an empty client-rendered shell cannot establish normal behavior.')
        fingerprint = hashlib.sha256(
            re.sub(r"\s+", " ", evidence["fingerprint"]).strip().encode("utf-8")
        ).hexdigest()
        for form in evidence["forms"]:
            forms.append(
                FormObservation(
                    id=form["id"],
                    label=form["label"] or form["id"],
                    action=redact_url(form["action"]),
                    method=form["method"][:12],
                    fields=form["fields"],
                    sensitive=form["sensitive"],
                )
            )
    except Exception:
        notes.append("DOM evidence collection was incomplete.")
        availability = "partial" if availability != 'unavailable' else 'unavailable'

    try:
        final_url = redact_url(page.url or initial_url)
    except Exception:
        final_url = redact_url(initial_url)
    return (
        BrowserCapture(
            id=capture_id,
            profile_id=profile.id,
            label=profile.label,
            final_url=final_url,
            title=title,
            viewport=Viewport(width=profile.width, height=profile.height),
            user_agent=user_agent[:500] or "Unavailable",
            cookie_state="Returning test cookie set"
            if profile.returning
            else "Fresh isolated context",
            availability=availability,
            notes=notes,
            screenshot=None,
            redirects=redirects,
            structure=PageStructure(
                headings=headings,
                link_count=link_count,
                language=language,
                text_blocks=text_blocks,
                action_labels=action_labels,
            )
            if fingerprint
            else None,
            forms=forms,
            network=network,
        ),
        fingerprint,
    )
