# Prints do tutorial (/ajuda)

Gera as imagens de `public/tutorial/` com pessoas fictícias, num banco SQLite descartável.

```bash
cd frontend/scripts/tutorial
npm i --no-save playwright-core@1.48.2          # usa o Chrome instalado (/usr/bin/google-chrome)
. ./demo_env.sh && rm -f demo.db
(cd ../../../backend && .venv/bin/python -c "import app.models; from app.core.db import Base, engine; Base.metadata.create_all(engine)")
(cd ../../../backend && .venv/bin/uvicorn app.main:app --port 8123) &        # API de demonstração
(cd ../.. && API_INTERNAL_URL=http://127.0.0.1:8123 npx next build && npx next start -p 3123) &
../../../backend/.venv/bin/python seed.py > seed.json
mkdir -p out && node shots.mjs "$PWD/out"                 # ou: node shots.mjs "$PWD/out" conta,alerta
for f in out/*.png; do convert "$f" -strip -quality 82 -define webp:method=6 "../../public/tutorial/$(basename "${f%.png}").webp"; done
```

Se a altura de uma imagem mudar, atualize o `h` correspondente em `src/app/ajuda/page.tsx`.
