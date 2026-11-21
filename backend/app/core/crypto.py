"""Criptografia de dados pessoais em repouso (Fernet: AES-128-CBC + HMAC-SHA256).

Cifrados: instruções, última localização, telefone e endereço da pessoa e todos os dados dos
Virgílios (nome, e-mail, telefone, relação). Só o e-mail da conta fica em claro, porque é a
chave de busca do login.

As instruções costumam conter dados sensíveis ("a chave está debaixo do tapete", endereço, senhas
do portão). Um vazamento do banco sozinho não as revela: a chave fica fora dele (INSTRUCTIONS_KEY,
ou derivada do JWT_SECRET).
"""
import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator

from app.core.config import get_settings


@lru_cache
def _fernet() -> Fernet:
    s = get_settings()
    if s.instructions_key:
        return Fernet(s.instructions_key.encode())
    derived = hashlib.sha256(("virgilio-instructions:" + s.jwt_secret).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(derived))


def encrypt(text: str) -> str:
    return _fernet().encrypt(text.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        # Chave trocada depois do cadastro: melhor avisar do que quebrar a página do alerta
        return "[dado ilegível: a chave de criptografia do servidor foi alterada]"


FERNET_PREFIX = "gAAAAA"  # todo token Fernet começa assim (versão 0x80 + timestamp em base64)


class EncryptedText(TypeDecorator):
    """Coluna cifrada de forma transparente: o código lê e grava texto; o banco guarda o token Fernet.

    Valores antigos ainda em texto puro (gravados antes desta coluna ser cifrada) são lidos como
    estão e passam a ser cifrados na próxima gravação, sem migração de dados.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return encrypt(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if not value.startswith(FERNET_PREFIX):
            return value  # legado em texto puro
        return decrypt(value)
