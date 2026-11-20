"""Envio de e-mail por SMTP (qualquer provedor: Gmail com senha de app, Brevo, Resend, Proton Bridge...).

Sem SMTP_HOST, nada é enviado (send_email devolve False) e quem chama decide o que fazer.
A Vercel bloqueia só a porta 25: use 587 (STARTTLS) ou 465 (SSL).
"""
import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import get_settings

log = logging.getLogger("virgilio.mailer")


def mail_configured() -> bool:
    s = get_settings()
    return bool(s.smtp_host and s.smtp_from)


def send_email(to: str, subject: str, body: str, reply_to: str | None = None) -> bool:
    """True se o servidor aceitou a mensagem. Nunca levanta exceção (falha só é registrada no log)."""
    s = get_settings()
    if not mail_configured():
        return False
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = s.smtp_from, to, subject
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content(body)
    try:
        context = ssl.create_default_context()
        if s.smtp_port == 465:
            server = smtplib.SMTP_SSL(s.smtp_host, s.smtp_port, timeout=10, context=context)
        else:
            server = smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=10)
            server.starttls(context=context)
        with server:
            if s.smtp_user:
                server.login(s.smtp_user, s.smtp_password)
            server.send_message(msg)
        return True
    except (smtplib.SMTPException, OSError) as e:
        log.error("Falha ao enviar e-mail (%s)", type(e).__name__)  # sem detalhes: podem conter credenciais
        return False
