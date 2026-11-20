"use client";

import { useAppConfig } from "@/lib/config";

export default function PrivacyPage() {
  const cfg = useAppConfig();
  return (
    <article className="prose">
      <h1>Política de Privacidade</h1>
      <p className="muted">Em conformidade com a LGPD (Lei 13.709/2018). Versão inicial (MVP).</p>
      <h2>Dados que tratamos</h2>
      <ul>
        <li>Seus: nome, e-mail, senha (guardada apenas como hash), telefone e endereço (opcionais), datas das provas de vida.</li>
        <li>Instruções que você escreve, guardadas criptografadas.</li>
        <li>Localização, <strong>somente quando você escolhe compartilhá-la</strong> numa prova de vida ou pedido de ajuda. Ela fica criptografada e só a última é mantida.</li>
        <li>Dos seus Virgílios: nome, e-mail e telefone que você ou eles informaram.</li>
      </ul>
      <h2>Para que usamos</h2>
      <p>
        Exclusivamente para enviar lembretes a você e avisos aos seus Virgílios. Telefone, endereço, instruções e localização só são mostrados aos
        Virgílios <strong>enquanto houver um alerta aberto</strong> (prazo vencido sem resposta ou pedido de ajuda). Fora disso, eles veem apenas
        que você está bem e quando foi sua última prova de vida.
      </p>
      <h2>Compartilhamento</h2>
      <p>Não vendemos dados. Usamos provedores de infraestrutura (hospedagem, banco de dados, envio de e-mail e de notificações) apenas para operar o serviço.</p>
      <h2>Seus direitos</h2>
      <p>
        Você pode corrigir seus dados, apagar a última localização e excluir a conta a qualquer momento em “Conta”. A exclusão apaga definitivamente
        instruções, Virgílios e localização.
      </p>
      <h2>Contato</h2>
      <p>{cfg?.support_email ?? "anonimizae@proton.me"}</p>
    </article>
  );
}
