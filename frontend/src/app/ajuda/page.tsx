import type { Metadata } from "next";
import Link from "next/link";
import { A11yControls } from "@/components/A11yControls";
import { AppDownload } from "@/components/AppDownload";

export const metadata: Metadata = {
  title: "Como usar o Virgílio",
  description: "Tutorial passo a passo: prova de vida, Meus Virgílios, Instruções, Protegidos e Conta, com imagens das telas.",
};

/** Prints gerados com dados fictícios por frontend/scripts/tutorial-shots.mjs. */
function Shot({ src, h, alt, caption }: { src: string; h: number; alt: string; caption: string }) {
  return (
    <figure className="shot">
      <a href={src} target="_blank" rel="noopener" title="Abrir a imagem em tamanho real">
        <img src={src} alt={alt} width={1840} height={h} loading="lazy" decoding="async" />
      </a>
      <figcaption>{caption} Toque na imagem para ampliar.</figcaption>
    </figure>
  );
}

function Step({
  id,
  title,
  where,
  shot,
  children,
}: {
  id: string;
  title: string;
  where: string;
  shot: { src: string; h: number; alt: string; caption: string };
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="tour-step">
      <header>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <span className="where">{where}</span>
      </header>
      <div className="tour-body">
        <Shot {...shot} />
        <div>{children}</div>
      </div>
    </section>
  );
}

const STEPS = [
  { id: "comecar", label: "Criar sua conta" },
  { id: "prova-de-vida", label: "Prova de vida" },
  { id: "virgilios", label: "Meus Virgílios" },
  { id: "instrucoes", label: "Instruções" },
  { id: "protegidos", label: "Protegidos" },
  { id: "alerta", label: "Quando há um alerta" },
  { id: "conta", label: "Conta e pausa" },
  { id: "leitura", label: "Letra maior" },
];

export default function Ajuda() {
  return (
    <div className="prose" style={{ maxWidth: "none" }}>
      <h1>Como usar o Virgílio</h1>
      <p className="lead muted" style={{ fontSize: "1.1rem", maxWidth: 720 }}>
        O Virgílio pergunta de tempos em tempos se você está bem. Se você não responder, as pessoas que você escolheu (seus <strong>Virgílios</strong>)
        são avisadas e recebem as instruções que você deixou. Este guia mostra cada parte do site, com imagens.
      </p>

      <div className="card mt" style={{ maxWidth: 720 }}>
        <h3>Está difícil de ler?</h3>
        <p className="muted small">Aumente a letra ou ligue o alto contraste. Isso vale para o site todo e pode ser mudado a qualquer momento pelo botão <strong>Aa</strong>, no alto da página.</p>
        <A11yControls />
      </div>

      <h2 className="mt">Neste guia</h2>
      <ol className="toc">
        {STEPS.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`}>{s.label}</a>
          </li>
        ))}
      </ol>

      <Step
        id="comecar"
        title="1. Criar sua conta"
        where="Botão “Criar conta”, no alto da página"
        shot={{
          src: "/tutorial/entrar.webp",
          h: 1520,
          alt: "Tela Criar conta, com campos de nome, e-mail e senha, a caixa de aceite dos termos e o botão Criar conta.",
          caption: "Tela de criação de conta.",
        }}
      >
        <ol className="callouts">
          <li>Escreva seu nome, seu e-mail e uma senha com 8 ou mais caracteres, misturando letras e números.</li>
          <li>
            Marque que leu e aceita os Termos de Uso e a Política de Privacidade e toque em <strong>Criar conta</strong>. Pronto: você já entra no
            site.
          </li>
        </ol>
        <p className="muted">
          Já tem conta? Use <strong>Entrar</strong>. Esqueceu a senha? Na mesma tela há o link <strong>Esqueci minha senha</strong>, que manda um
          e-mail para você criar outra.
        </p>
      </Step>

      <Step
        id="prova-de-vida"
        title="2. Prova de vida"
        where="Aba “Prova de vida”, a primeira tela depois de entrar"
        shot={{
          src: "/tutorial/prova-de-vida.webp",
          h: 1800,
          alt: "Tela inicial com um grande botão verde redondo escrito Estou bem, o prazo da próxima confirmação e o botão Pedir ajuda.",
          caption: "A tela inicial, com o botão “Estou bem”.",
        }}
      >
        <ol className="callouts">
          <li>
            O botão redondo <strong>Estou bem</strong> é a prova de vida. Um toque e pronto: o prazo recomeça.
          </li>
          <li>
            Marque <strong>Compartilhar minha localização atual</strong> antes de tocar no botão, se quiser. Ela fica guardada em segredo e só é
            mostrada aos seus Virgílios se houver um alerta.
          </li>
          <li>Aqui aparece até quando você precisa confirmar de novo. Antes de vencer, o Virgílio lembra você por e-mail e pelo app.</li>
          <li>
            <strong>Pedir ajuda (SOS)</strong> avisa seus Virgílios na hora, sem esperar o prazo.
          </li>
        </ol>
        <p className="muted">
          Se o prazo vencer, o botão fica amarelo e você ainda tem alguns dias extras. Só depois disso os Virgílios são avisados. Também dá para
          confirmar pelo link do e-mail de lembrete, sem precisar entrar no site.
        </p>
      </Step>

      <Step
        id="virgilios"
        title="3. Meus Virgílios"
        where="Aba “Meus Virgílios”"
        shot={{
          src: "/tutorial/virgilios.webp",
          h: 2400,
          alt: "Tela Meus Virgílios com o cartão Convidar por link e a lista de pessoas, cada uma com a situação do convite.",
          caption: "Quem cuida de você.",
        }}
      >
        <p>
          <strong>Virgílios são as pessoas que cuidam de você</strong>: um vizinho, uma amiga, um parente. São eles que recebem o aviso se você
          sumir. Escolha até 5 pessoas, de preferência alguém que more perto.
        </p>
        <ol className="callouts">
          <li>
            <strong>Gerar link de convite</strong> cria um link para mandar pelo WhatsApp. A pessoa abre, escreve o nome e aceita.
          </li>
          <li>Ou cadastre a pessoa com nome e e-mail: o convite chega por e-mail.</li>
          <li>
            Cada pessoa mostra a situação do convite: <strong>Convite pendente</strong> (ainda não respondeu) ou <strong>Aceitou</strong>. Só quem
            aceitou será avisado.
          </li>
        </ol>
        <p className="muted">Seus Virgílios não precisam instalar nada nem criar conta. Enquanto está tudo bem, eles não veem suas instruções nem sua localização.</p>
      </Step>

      <Step
        id="instrucoes"
        title="4. Instruções"
        where="Aba “Instruções”"
        shot={{
          src: "/tutorial/instrucoes.webp",
          h: 2580,
          alt: "Tela Minhas instruções com recados como alimentar o gato e onde está a chave reserva.",
          caption: "Recados para quem vier ajudar.",
        }}
      >
        <p>
          <strong>Instruções são recados para os seus Virgílios</strong>, lidos só se houver um alerta. Pense no que alguém precisaria saber para
          ajudar você ou cuidar da sua casa.
        </p>
        <ol className="callouts">
          <li>Escreva um título curto e, em “O que fazer”, o recado. Os botões de sugestão (“+ Meu pet”, “+ Quem avisar”...) ajudam a começar. Exemplos: “Alimente o gato Mingau”, “A chave reserva está com a vizinha do 12”.</li>
          <li>Toque em <strong>Adicionar</strong>. Você pode editar ou apagar depois.</li>
        </ol>
        <p className="muted">As instruções ficam guardadas de forma criptografada (embaralhada). Nem a administração do Virgílio consegue lê-las.</p>
      </Step>

      <Step
        id="protegidos"
        title="5. Protegidos"
        where="Aba “Protegidos”"
        shot={{
          src: "/tutorial/protegidos.webp",
          h: 800,
          alt: "Tela Protegidos com a lista de pessoas de quem você é Virgílio e a situação de cada uma.",
          caption: "As pessoas de quem você cuida.",
        }}
      >
        <p>
          É o contrário de “Meus Virgílios”: aqui ficam <strong>as pessoas que escolheram você como Virgílio</strong>. Ao lado de cada nome aparece
          se está tudo bem ou se há um alerta.
        </p>
        <ol className="callouts">
          <li>
            Toque no nome da pessoa para ver os detalhes. O selo ao lado mostra a situação: <strong>Tudo certo</strong> ou{" "}
            <strong>Virgílios avisados</strong>.
          </li>
          <li>
            Aceitou um convite sem estar logado? Abra o link do convite de novo, já logado, e toque em <strong>Vincular à minha conta</strong>. No app,
            cole o link em “Recebeu um convite por link?”.
          </li>
        </ol>
      </Step>

      <Step
        id="alerta"
        title="6. Quando há um alerta"
        where="Para o Virgílio: aviso por e-mail ou pelo app, ou em “Protegidos”"
        shot={{
          src: "/tutorial/alerta.webp",
          h: 2600,
          alt: "Página vermelha de alerta: a pessoa não dá sinal de vida, com o contato dela, o que fazer e as instruções.",
          caption: "O que um Virgílio vê durante um alerta.",
        }}
      >
        <p>
          Se a pessoa não confirmar a tempo ou pedir ajuda, seus Virgílios recebem o aviso. A página do alerta mostra, só enquanto o alerta durar:
        </p>
        <ol className="callouts">
          <li>
            Há quanto tempo a pessoa não dá sinal. Toque em <strong>Vou verificar</strong> para os outros Virgílios saberem que você está cuidando
            disso e, ao encontrar a pessoa bem, em <strong>Encontrei: está bem</strong>.
          </li>
          <li>Como falar com ela: telefone e endereço que ela cadastrou.</li>
          <li>As instruções e a última localização conhecida, se ela tiver compartilhado.</li>
        </ol>
        <p className="muted">
          Tente ligar ou ir até lá. Em caso de emergência, chame o SAMU (192) ou a polícia (190). Quando a pessoa tocar em “Estou bem”, o alerta
          termina e todos são avisados.
        </p>
      </Step>

      <Step
        id="conta"
        title="7. Conta, prazos e pausa"
        where="Aba com o seu nome, no alto da página"
        shot={{
          src: "/tutorial/conta.webp",
          h: 1520,
          alt: "Tela Conta com os campos Pedir prova de vida a cada e Tolerância antes de avisar, e a opção de pausar até uma data.",
          caption: "Ajuste o ritmo da prova de vida.",
        }}
      >
        <ol className="callouts">
          <li>
            <strong>Pedir prova de vida a cada</strong>: de quantos em quantos dias o Virgílio pergunta se você está bem.
          </li>
          <li>
            <strong>Tolerância antes de avisar</strong>: quantos dias extras esperar antes de avisar seus Virgílios. Depois, toque em{" "}
            <strong>Salvar ciclo</strong>.
          </li>
          <li>
            <strong>Pausar</strong>: vai viajar com a família ou ficar internado? Pause até uma data e nada será cobrado até lá.
          </li>
        </ol>
        <p className="muted">Nessa aba você também muda seu telefone e endereço (mostrados aos Virgílios só em alerta), troca a senha ou exclui a conta.</p>
      </Step>

      <Step
        id="leitura"
        title="8. Letra maior e alto contraste"
        where="Botão “Aa”, no alto de todas as páginas"
        shot={{
          src: "/tutorial/leitura.webp",
          h: 1280,
          alt: "Painel Facilitar a leitura aberto, com três tamanhos de letra e a opção Alto contraste.",
          caption: "O painel de leitura fácil.",
        }}
      >
        <ol className="callouts">
          <li>
            Toque em <strong>Aa</strong>, no alto da página.
          </li>
          <li>
            Escolha o tamanho da letra: <strong>Normal</strong>, <strong>Grande</strong> ou <strong>Muito grande</strong>.
          </li>
          <li>
            Ligue o <strong>Alto contraste</strong> para cores mais fortes e links sublinhados.
          </li>
        </ol>
        <p className="muted">A escolha fica guardada neste aparelho. No celular, você também pode ampliar com dois dedos.</p>
      </Step>

      <section className="tour-step" id="palavras">
        <h2>O que cada palavra quer dizer</h2>
        <dl className="glossary card">
          <dt>Virgílio</dt>
          <dd>Pessoa de confiança que você escolheu para ser avisada se você sumir. O nome vem do guia de Dante na Divina Comédia.</dd>
          <dt>Protegido</dt>
          <dd>Pessoa que escolheu você como Virgílio dela.</dd>
          <dt>Prova de vida</dt>
          <dd>O toque em “Estou bem”, que mostra que está tudo certo.</dd>
          <dt>Tolerância</dt>
          <dd>Dias extras depois do prazo, antes de avisar os Virgílios.</dd>
          <dt>Alerta</dt>
          <dd>Aviso enviado aos Virgílios quando a tolerância acaba sem resposta ou quando você pede ajuda.</dd>
          <dt>SOS</dt>
          <dd>Pedido de ajuda imediato, sem esperar o prazo.</dd>
          <dt>Instruções</dt>
          <dd>Recados para os Virgílios, revelados só durante um alerta.</dd>
        </dl>
      </section>

      <section className="tour-step" id="duvidas">
        <h2>Dúvidas comuns</h2>
        <details className="faq">
          <summary>Esqueci de confirmar. E agora?</summary>
          <p>Confirme assim que puder. Enquanto a tolerância não acabar, ninguém é avisado. Se o alerta já saiu, tocar em “Estou bem” encerra o alerta e tranquiliza seus Virgílios.</p>
        </details>
        <details className="faq">
          <summary>Meus Virgílios veem minhas instruções agora?</summary>
          <p>Não. Instruções, localização, telefone e endereço só aparecem para eles durante um alerta.</p>
        </details>
        <details className="faq">
          <summary>Preciso instalar o app?</summary>
          <p>Não. O site funciona sozinho. O app Android ajuda com lembretes no horário certo, mesmo sem internet.</p>
        </details>
        <details className="faq">
          <summary>Não recebi o lembrete por e-mail.</summary>
          <p>Veja a caixa de spam e marque o e-mail do Virgílio como confiável. Para não depender do e-mail, instale o app.</p>
        </details>
      </section>

      <div className="mt" style={{ maxWidth: 720 }}>
        <AppDownload />
      </div>
      <p className="mt">
        <Link href="/" className="btn">
          Voltar ao início
        </Link>
      </p>
    </div>
  );
}
