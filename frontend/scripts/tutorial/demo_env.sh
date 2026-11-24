# Ambiente da API de demonstração (SQLite local, dados fictícios). Nunca use em produção.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export VIRGILIO_ENV_FILE="" ENV=dev DATABASE_URL="sqlite:///$HERE/demo.db" RATE_LIMIT_ENABLED=false
export JWT_SECRET=demo-tutorial-secret-nao-usar-em-producao-1234567890 CRON_SECRET=demo-cron
export FRONTEND_URL=http://localhost:3123 CORS_ORIGINS=http://localhost:3123 DEFAULT_INTERVAL_DAYS=3 DEFAULT_GRACE_DAYS=1
# SMTP falso: só para o site não mostrar o aviso de "e-mail não configurado" nos prints
export SMTP_HOST=127.0.0.1 SMTP_PORT=2599 SMTP_FROM=demo@exemplo.com
