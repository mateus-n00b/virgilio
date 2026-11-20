"use client";

import { useAppConfig } from "@/lib/config";

export default function TermsPage() {
  const cfg = useAppConfig();
  return (
    <article className="prose">
      <h1>Termos de Uso</h1>
      <p className="muted">Versão inicial (MVP).</p>
      <h2>O que o Virgílio faz</h2>
      <p>
        O Virgílio pede provas de vida periódicas e, se você não responder no prazo que escolheu, envia avisos às pessoas que você indicou
        (Virgílios), com as instruções que você deixou e, se você tiver compartilhado, sua última localização conhecida.
      </p>
      <h2>O que o Virgílio não é</h2>
      <p>
        <strong>O Virgílio não é um serviço de emergência</strong> nem substitui SAMU (192), Bombeiros (193) ou Polícia (190). Os avisos dependem de
        e-mail, internet, notificações do celular e da disponibilidade dos seus Virgílios, e podem atrasar ou falhar. Não há garantia de que alguém
        agirá.
      </p>
      <h2>Suas responsabilidades</h2>
      <ul>
        <li>Indicar apenas pessoas que concordem em ser seus Virgílios e informar contatos corretos.</li>
        <li>Não incluir nas instruções dados que possam causar dano se lidos por eles (por exemplo, senhas bancárias).</li>
        <li>Manter seu ciclo de prova de vida adequado à sua rotina e usar a pausa quando necessário.</li>
      </ul>
      <h2>Virgílios</h2>
      <p>Quem aceita ser Virgílio pode deixar de sê-lo a qualquer momento pelo próprio link do convite. Não há obrigação de agir.</p>
      <h2>Contato</h2>
      <p>{cfg?.support_email ?? "anonimizae@proton.me"}</p>
    </article>
  );
}
