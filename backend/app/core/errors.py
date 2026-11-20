from fastapi import HTTPException


class AppError(HTTPException):
    """Erro de negócio com código estável para o frontend: {"detail": {"code", "message"}}."""

    def __init__(self, status_code: int, code: str, message: str, **extra):
        super().__init__(status_code=status_code, detail={"code": code, "message": message, **extra})


def not_found(entity: str = "Recurso") -> AppError:
    return AppError(404, "not_found", f"{entity} não encontrado.")


def forbidden(message: str = "Acesso não permitido.") -> AppError:
    return AppError(403, "forbidden", message)


def conflict(code: str, message: str, **extra) -> AppError:
    return AppError(409, code, message, **extra)
