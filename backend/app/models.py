"""Importa todos os modelos para registrar as tabelas no metadata (Alembic e testes)."""
from app.guardians.models import Guardian  # noqa: F401
from app.instructions.models import Instruction  # noqa: F401
from app.notify.models import Delivery, PushToken  # noqa: F401
from app.users.models import User  # noqa: F401
from app.watch.models import Alert, Watch  # noqa: F401
