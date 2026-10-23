"""Bounded single-process investigation queue with temporary in-memory storage."""

from __future__ import annotations

import asyncio
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from backend.kage.browser_engine import investigate_profiles
from backend.kage.differential_engine import compare_captures
from backend.kage.security_policy import TargetPolicy, redact_url
from backend.kage.security_policy import LOCAL_FIXTURE_ORIGINS
from backend.models.yokai_schemas import (
    Investigation,
    InvestigationEvent,
    InvestigationRequest,
    InvestigationStatus,
)


@dataclass
class StoredJob:
    investigation: Investigation
    request: InvestigationRequest
    target_url: str
    screenshots: dict[str, bytes] = field(default_factory=dict)
    fingerprints: list[str] = field(default_factory=list)


class InvestigationManager:
    """Manage bounded work and expiring investigation artifacts."""

    def __init__(
        self,
        *,
        policy: TargetPolicy,
        max_concurrency: int,
        max_queue: int,
        ttl_seconds: int,
    ) -> None:
        self.policy = policy
        self.max_concurrency = max_concurrency
        self.max_queue = max_queue
        self.ttl = timedelta(seconds=ttl_seconds)
        self.jobs: OrderedDict[str, StoredJob] = OrderedDict()
        self.queue: asyncio.Queue[str | None] = asyncio.Queue(maxsize=max_queue)
        self.workers: list[asyncio.Task[None]] = []
        self.closed = False
        self.running: dict[str, asyncio.Task] = {}

    def _prune(self) -> None:
        now = datetime.now(timezone.utc)
        expired = [
            job_id
            for job_id, stored in self.jobs.items()
            if now - stored.investigation.updated_at > self.ttl
            and stored.investigation.status
            in {
                InvestigationStatus.COMPLETED,
                InvestigationStatus.FAILED,
                InvestigationStatus.CANCELLED,
                InvestigationStatus.UNSUPPORTED,
            }
        ]
        for job_id in expired:
            self.jobs.pop(job_id, None)

    def capabilities(self, allowed_origins: tuple[str, ...]):
        origins = list(allowed_origins)
        for origin in (sorted(LOCAL_FIXTURE_ORIGINS) if self.policy.allow_local_fixtures else []):
            if origin not in origins:
                origins.append(origin)
        return {
            "available": not self.closed,
            "profiles": ["desktop", "mobile", "returning"],
            "allowed_origins": origins,
            "authorization_policy": (
                'Public HTTP(S) websites are enabled for local testing. Confirm permission to investigate. Private networks and unsafe destinations remain blocked.'
                if self.policy.allow_public_targets else
                "Only explicitly configured YOKAI_ALLOWED_ORIGINS and the built-in "
                "development fixture path are permitted. Investigate only targets "
                "you own or are authorized to test. Browser checks do not replace "
                "network-level egress isolation."
            ),
            "cancellation": True,
            'public_targets': self.policy.allow_public_targets,
        }

    async def submit(
        self,
        request: InvestigationRequest,
        target_url: str,
        accepted_message: str = "Investigation accepted into the bounded queue.",
    ) -> Investigation:
        if self.closed:
            raise RuntimeError("The YOKAI worker is shutting down.")
        self._prune()
        max_records = self.max_queue + self.max_concurrency
        while len(self.jobs) >= max_records:
            terminal_id = next(
                (
                    job_id
                    for job_id, job in self.jobs.items()
                    if job.investigation.status
                    in {
                        InvestigationStatus.COMPLETED,
                        InvestigationStatus.FAILED,
                        InvestigationStatus.CANCELLED,
                        InvestigationStatus.UNSUPPORTED,
                    }
                ),
                None,
            )
            if terminal_id is None:
                break
            self.jobs.pop(terminal_id, None)
        if self.queue.full() or len(self.jobs) >= max_records:
            raise OverflowError("YOKAI investigation queue is full. Retry shortly.")
        self._start_workers()
        now = datetime.now(timezone.utc)
        investigation_id = f"inv_{uuid.uuid4().hex}"
        investigation = Investigation(
            id=investigation_id,
            demo=False,
            target_url=redact_url(target_url),
            profiles=request.profiles,
            status=InvestigationStatus.QUEUED,
            created_at=now,
            updated_at=now,
            events=[
                InvestigationEvent(
                    status=InvestigationStatus.QUEUED,
                    at=now,
                    message=accepted_message,
                )
            ],
        )
        self.jobs[investigation_id] = StoredJob(
            investigation=investigation,
            request=request,
            target_url=target_url,
        )
        try:
            self.queue.put_nowait(investigation_id)
        except asyncio.QueueFull as exc:
            self.jobs.pop(investigation_id, None)
            raise OverflowError("YOKAI investigation queue is full. Retry shortly.") from exc
        return investigation

    def get(self, investigation_id: str) -> Investigation | None:
        self._prune()
        stored = self.jobs.get(investigation_id)
        return stored.investigation if stored else None

    async def cancel(self, investigation_id: str) -> Investigation:
        investigation = self.get(investigation_id)
        if investigation is None:
            raise KeyError('Investigation not found or expired.')
        if investigation.status in {InvestigationStatus.COMPLETED, InvestigationStatus.FAILED,
                                     InvestigationStatus.UNSUPPORTED, InvestigationStatus.CANCELLED}:
            return investigation
        self._update(investigation_id, status=InvestigationStatus.CANCELLED,
                     message='Investigation cancelled by request.')
        task = self.running.get(investigation_id)
        if task:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        return self.jobs[investigation_id].investigation

    def get_screenshots(self, investigation_id: str) -> dict[str, bytes] | None:
        self._prune()
        stored = self.jobs.get(investigation_id)
        return stored.screenshots if stored else None

    async def submit_counterfactual(
        self,
        investigation_id: str,
        changed_variable: str,
    ) -> Investigation:
        self._prune()
        stored = self.jobs.get(investigation_id)
        if stored is None:
            raise KeyError("Investigation not found or expired.")
        if stored.investigation.status != InvestigationStatus.COMPLETED:
            raise ValueError("Counterfactuals require a completed baseline investigation.")
        if not any(
            capture.profile_id.value == "desktop"
            for capture in (stored.investigation.result.captures if stored.investigation.result else [])
        ):
            raise ValueError("Counterfactual reruns require a desktop baseline capture.")
        changed_profile = {
            "mobile_profile": "mobile",
            "returning_visitor_cookie": "returning",
        }.get(changed_variable)
        if changed_profile is None:
            raise ValueError("Unsupported controlled counterfactual variable.")
        experiment = InvestigationRequest(
            target_url=stored.target_url,
            profiles=["desktop", changed_profile],
            authorization_confirmed=True,
            settings=stored.request.settings,
        )
        return await self.submit(
            experiment,
            stored.target_url,
            accepted_message=(
                f"Counterfactual rerun queued. Intervention: {changed_variable}; "
                "the desktop baseline is repeated in a fresh context."
            ),
        )

    def _start_workers(self) -> None:
        if not self.workers:
            self.workers = [
                asyncio.create_task(self._worker(), name=f"yokai-worker-{index}")
                for index in range(self.max_concurrency)
            ]

    async def _worker(self) -> None:
        while True:
            try:
                investigation_id = await asyncio.wait_for(
                    self.queue.get(),
                    timeout=30,
                )
            except TimeoutError:
                self._prune()
                continue
            if investigation_id is None:
                self.queue.task_done()
                return
            try:
                job = self.jobs.get(investigation_id)
                if job is None or job.investigation.status == InvestigationStatus.CANCELLED:
                    continue
                task = asyncio.create_task(self._run_job(investigation_id))
                self.running[investigation_id] = task
                try:
                    await task
                except asyncio.CancelledError:
                    if self.closed:
                        raise
            finally:
                self.running.pop(investigation_id, None)
                self.queue.task_done()

    async def _run_job(self, investigation_id: str) -> None:
        stored = self.jobs.get(investigation_id)
        if stored is None:
            return
        request = stored.request

        async def emit(status: str, message: str) -> None:
            await self._event(
                investigation_id,
                InvestigationStatus(status),
                message,
            )

        try:
            await self._event(
                investigation_id,
                InvestigationStatus.INITIALIZING,
                "Starting isolated Chromium browser contexts.",
            )
            await self._event(
                investigation_id,
                InvestigationStatus.COLLECTING,
                "Collecting structural page, form, navigation, and request evidence.",
            )
            captures, screenshots, fingerprints = await investigate_profiles(
                investigation_id=investigation_id,
                request=request,
                target_url=stored.target_url,
                policy=self.policy,
                emit=emit,
            )
            await self._event(
                investigation_id,
                InvestigationStatus.COMPARING,
                "Comparing observations across selected profiles.",
            )
            result = compare_captures(
                captures,
                fingerprints,
                stored.target_url,
            )
            stored.screenshots = screenshots
            stored.fingerprints = fingerprints
            if not any(capture.availability == 'complete' for capture in captures):
                result.limitations.append('No complete browser capture was obtained. Differences may reflect missing evidence.')
            if all(capture.availability == 'unavailable' for capture in captures):
                self._update(investigation_id, status=InvestigationStatus.FAILED,
                             message='All browser captures were unavailable.', result=result,
                             error='No target page could be captured.')
                return
            self._update(
                investigation_id,
                status=InvestigationStatus.COMPLETED,
                message="Investigation completed with evidence-linked results.",
                result=result,
            )
        except asyncio.CancelledError:
            self._update(
                investigation_id,
                status=InvestigationStatus.CANCELLED,
                message="Investigation stopped; browser contexts are being cleaned up.",
            )
            raise
        except Exception as exc:
            self._update(
                investigation_id,
                status=InvestigationStatus.FAILED,
                message="Investigation failed. See the structured error field.",
                error=f"Browser investigation failed ({type(exc).__name__}).",
            )

    async def _event(
        self,
        investigation_id: str,
        status: InvestigationStatus,
        message: str,
    ) -> None:
        self._update(investigation_id, status=status, message=message)

    def _update(
        self,
        investigation_id: str,
        *,
        status: InvestigationStatus,
        message: str,
        result=None,
        error: str | None = None,
    ) -> None:
        stored = self.jobs.get(investigation_id)
        if stored is None:
            return
        now = datetime.now(timezone.utc)
        current = stored.investigation
        events = [
            *current.events,
            InvestigationEvent(status=status, at=now, message=message),
        ]
        stored.investigation = current.model_copy(
            update={
                "status": status,
                "updated_at": now,
                "events": events[-200:],
                "result": result if result is not None else current.result,
                "error": error,
            }
        )

    async def close(self) -> None:
        self.closed = True
        for worker in self.workers:
            worker.cancel()
        if self.workers:
            await asyncio.gather(*self.workers, return_exceptions=True)
        self.workers.clear()
        while not self.queue.empty():
            try:
                self.queue.get_nowait()
                self.queue.task_done()
            except asyncio.QueueEmpty:
                break
