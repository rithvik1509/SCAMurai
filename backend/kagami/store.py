"""SQLite snapshots with bounded retention; browser artifacts remain ephemeral."""
from __future__ import annotations

import sqlite3
import time
from pathlib import Path

from backend.models.kagami import WalletAnalysis


class SnapshotStore:
    def __init__(self, path: str, ttl: int, max_records: int):
        self.path, self.ttl, self.max_records = path, ttl, max_records
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS wallets (id TEXT PRIMARY KEY, created REAL NOT NULL, payload TEXT NOT NULL)')

    def connect(self):
        return sqlite3.connect(self.path, timeout=3)

    def prune(self, db):
        db.execute('DELETE FROM wallets WHERE created < ?', (time.time() - self.ttl,))

    def put(self, snapshot: WalletAnalysis):
        with self.connect() as db:
            self.prune(db)
            db.execute('INSERT OR REPLACE INTO wallets VALUES (?, ?, ?)', (
                snapshot.id, time.time(), snapshot.model_dump_json(by_alias=True)))
            db.execute('DELETE FROM wallets WHERE id IN (SELECT id FROM wallets ORDER BY created DESC LIMIT -1 OFFSET ?)', (self.max_records,))

    def get(self, identifier: str) -> WalletAnalysis | None:
        with self.connect() as db:
            self.prune(db)
            row = db.execute('SELECT payload FROM wallets WHERE id = ?', (identifier,)).fetchone()
        return WalletAnalysis.model_validate_json(row[0]) if row else None
