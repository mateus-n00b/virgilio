"""Utilitários de linha de comando.

    python -m app.cli sweep      # varredura do ciclo de prova de vida + envio dos avisos pendentes
    python -m app.cli dispatch   # só reenvia os avisos pendentes
"""
import json
import sys

import app.models  # noqa: F401
from app.core.db import SessionLocal
from app.notify import service as notify
from app.watch import service as watch


def main(argv: list[str]) -> None:
    cmd = argv[1] if len(argv) > 1 else ""
    with SessionLocal() as db:
        if cmd == "sweep":
            print(json.dumps({**watch.sweep(db), **notify.dispatch(db, limit=5000)}))
        elif cmd == "dispatch":
            print(json.dumps(notify.dispatch(db, limit=5000)))
        else:
            sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv)
