"""Textos dos avisos (e-mail e push). Montados na hora do envio, com os dados atuais."""
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.config import get_settings
from app.core.security import create_purpose_token
from app.guardians.models import Guardian
from app.users.models import User
from app.watch.models import Alert, AlertReason, Watch

CHECKIN_LINK_TTL = timedelta(days=14)
ANDROID_CHANNEL = "virgilio"  # criado pelo app (mobile/src/lib/push.ts)


@dataclass
class Message:
    subject: str
    body: str  # e-mail (texto)
    push_title: str
    push_body: str
    push_url: str  # rota do app ao tocar no aviso


def fmt(dt: datetime) -> str:
    local = dt.astimezone(ZoneInfo(get_settings().local_timezone))
    return local.strftime("%d/%m/%Y às %H:%M")


def checkin_link(user: User, watch: Watch, now: datetime) -> str:
    """Link de confirmação em um clique, válido só para o ciclo atual (um e-mail antigo não serve)."""
    token = create_purpose_token("checkin", user.id, CHECKIN_LINK_TTL, base=int(watch.base_at(now).timestamp() * 1000))
    return f"{get_settings().web_url}/confirmar?t={token}"


def guardian_link(guardian: Guardian) -> str:
    return f"{get_settings().web_url}/v/{guardian.token}"


FOOTER = "\n\n—\nVirgílio · ninguém atravessa sozinho.\nVocê recebeu esta mensagem porque {why}."


def reminder(user: User, watch: Watch, guardians: list[Guardian], now: datetime) -> Message:
    names = ", ".join(g.name for g in guardians) or "seus Virgílios"
    link = checkin_link(user, watch, now)
    body = (
        f"Olá, {user.first_name}!\n\n"
        f"Seu prazo de prova de vida venceu em {fmt(watch.due_at(now))}. Está tudo bem?\n\n"
        f"Confirme com um clique:\n{link}\n\n"
        f"Se não houver confirmação até {fmt(watch.alert_at(now))}, avisaremos {names}."
        + FOOTER.format(why="usa o Virgílio para provas de vida periódicas")
    )
    return Message(
        subject=f"{user.first_name}, você está bem?",
        body=body,
        push_title="Você está bem?",
        push_body=f"Toque para confirmar. Sem resposta até {fmt(watch.alert_at(now))}, seus Virgílios serão avisados.",
        push_url="/",
    )


def alert(user: User, watch: Watch, guardian: Guardian, a: Alert, now: datetime) -> Message:
    link = guardian_link(guardian)
    if a.reason == AlertReason.SOS:
        subject = f"{user.name} pediu ajuda"
        lead = f"{user.name} acionou o pedido de ajuda no Virgílio em {fmt(a.created_at)}."
        push_body = f"{user.first_name} acionou o pedido de ajuda. Veja as instruções."
    else:
        subject = f"Alerta: {user.name} não dá sinal de vida"
        lead = (
            f"{user.name} não confirma que está bem desde {fmt(watch.last_check_in_at)} "
            f"(o combinado era a cada {watch.interval_days} dia{'s' if watch.interval_days > 1 else ''})."
        )
        push_body = f"{user.first_name} não confirma que está bem desde {fmt(watch.last_check_in_at)}."
    repeat = f"\n\n(Este é o aviso nº {a.notify_count}: ninguém confirmou que vai verificar ainda.)" if a.notify_count > 1 else ""
    body = (
        f"Olá, {guardian.name}.\n\n{lead}\n\n"
        f"Você é Virgílio de {user.first_name}. Veja as instruções que {user.first_name} deixou, o endereço, o contato"
        f"{' e a última localização conhecida' if watch.last_location_at else ''}:\n{link}\n\n"
        "Se você for verificar, avise pelo mesmo link: os outros Virgílios ficam sabendo. "
        "Em caso de emergência, ligue 192 (SAMU) ou 190 (Polícia)."
        + repeat
        + FOOTER.format(why=f"aceitou ser Virgílio de {user.name}")
    )
    return Message(subject=subject, body=body, push_title=subject, push_body=push_body, push_url=f"/protegidos/{guardian.token}")


def ack(user: User, guardian: Guardian, by: Guardian | None) -> Message:
    who = by.name if by else "Outro Virgílio"
    body = (
        f"Olá, {guardian.name}.\n\n{who} avisou que vai verificar {user.name}. "
        f"Acompanhe pelo link:\n{guardian_link(guardian)}"
        + FOOTER.format(why=f"é Virgílio de {user.name}")
    )
    return Message(
        subject=f"{who} vai verificar {user.first_name}",
        body=body,
        push_title=f"{who} vai verificar {user.first_name}",
        push_body="Toque para acompanhar.",
        push_url=f"/protegidos/{guardian.token}",
    )


def resolved(user: User, guardian: Guardian, a: Alert | None, by: Guardian | None) -> Message:
    how = f"{by.name} confirmou que {user.first_name} está bem." if by else f"{user.first_name} confirmou que está bem."
    body = f"Olá, {guardian.name}.\n\nBoa notícia: {how} O alerta foi encerrado." + FOOTER.format(why=f"é Virgílio de {user.name}")
    return Message(
        subject=f"{user.first_name} está bem",
        body=body,
        push_title=f"{user.first_name} está bem",
        push_body=how,
        push_url=f"/protegidos/{guardian.token}",
    )


def invite(user: User, guardian: Guardian) -> Message:
    body = (
        f"Olá, {guardian.name}!\n\n"
        f"{user.name} usa o Virgílio, um app de prova de vida para quem mora só ou longe da família, "
        "e escolheu você como Virgílio: uma pessoa de confiança que é avisada se passar alguns dias sem sinal de vida.\n\n"
        "Você não precisa instalar nada. Se aceitar, só receberá mensagens se algo parecer errado, "
        f"com as instruções que {user.first_name} deixou (por exemplo, quem chamar ou onde está a chave).\n\n"
        f"Aceite ou recuse aqui:\n{guardian_link(guardian)}"
        + FOOTER.format(why=f"{user.name} informou seu e-mail ao convidar você")
    )
    return Message(
        subject=f"{user.first_name} convidou você para ser Virgílio",
        body=body,
        push_title=f"{user.first_name} convidou você para ser Virgílio",
        push_body="Toque para responder.",
        push_url=f"/protegidos/{guardian.token}",
    )

