"""Utilitários de linha de comando.

    python -m app.cli sweep      # varredura do ciclo de prova de vida + envio dos avisos pendentes
    python -m app.cli dispatch   # só reenvia os avisos pendentes
    python -m app.cli vapid-keys # gera o par de chaves do Web Push (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)
"""
import json
import sys

import app.models  # noqa: F401
from app.core.db import SessionLocal
from app.notify import service as notify
from app.watch import service as watch


def main(argv: list[str]) -> None:
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd == "vapid-keys":
        from app.notify.webpush import generate_vapid_keys

        pub, priv = generate_vapid_keys()
        print(f"VAPID_PUBLIC_KEY={pub}\nVAPID_PRIVATE_KEY={priv}")
        return
    with SessionLocal() as db:
        if cmd == "sweep":
            from app.admin import service as admin

            out = {**watch.sweep(db), **notify.dispatch(db, limit=5000)}
            out["encrypted_legacy"] = admin.encrypt_legacy(db)
            out["purged"] = admin.purge_expired(db)
            out["snapshot"] = admin.snapshot_daily(db)
            print(json.dumps(out))
        elif cmd == "dispatch":
            print(json.dumps(notify.dispatch(db, limit=5000)))
        else:
            sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv)
