(() => {
  "use strict";

  /* Este arquivo tem dois grupos com regras diferentes.

     Sempre ativos: a barra de progresso e a dica de rolagem da tabela.
     Nenhum dos dois esconde ou anima conteúdo — são informação. Antes o
     arquivo inteiro terminava num `return` logo na primeira linha quando
     o sistema pedia menos movimento, e a dica da tabela morria junto:
     em 390px a tabela comparativa rola de lado e o leitor não recebia
     nenhum sinal disso.

     Decorativos: revelações, contagem de números e crescimento de barras.
     Esses só rodam com `prefers-reduced-motion: no-preference` e com
     IntersectionObserver disponível. Fora disso o conteúdo nasce visível,
     porque `.reveal` só é adicionada aqui — sem JavaScript, nada some. */

  const menosMovimento = () =>
    !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const podeAnimar = !menosMovimento() && ("IntersectionObserver" in window);

  barraDeLeitura();
  dicaDaTabela();
  controleDivisao();
  controlePainelOperacional();
  controleSeletoresDemonstrativos();

  if (!podeAnimar) return;

  revelacoes();
  sequenciasDaProva();
  numerosDaSimulacao();
  numerosDaProva();

  /* ---------------------------------------------------------------- */

  function barraDeLeitura() {
    const traco = document.querySelector(".reading-progress > span");
    if (!traco) return;

    let agendado = false;
    const pintar = () => {
      agendado = false;
      // Páginas curtas, ou o momento antes das imagens carregarem, podem
      // não ter área rolável nenhuma — aí a divisão seria por zero.
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const parte = total > 0 ? Math.min(Math.max(window.scrollY / total, 0), 1) : 0;
      traco.style.transform = `scaleX(${parte})`;
    };
    const agendar = () => {
      if (agendado) return;
      agendado = true;
      requestAnimationFrame(pintar);
    };

    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar);
    pintar();
  }

  function dicaDaTabela() {
    const caixa = document.querySelector(".comparison-shell");
    if (!caixa) return;

    const atualizar = () => {
      const rola = caixa.scrollWidth > caixa.clientWidth + 4;
      const noFim = caixa.scrollLeft + caixa.clientWidth >= caixa.scrollWidth - 4;
      caixa.classList.toggle("has-more-scroll", rola && !noFim);
    };
    atualizar();
    caixa.addEventListener("scroll", atualizar, { passive: true });
    window.addEventListener("resize", atualizar);
  }

  function controleDivisao() {
    /* O divisor da Recuperação Dividida é controle, não enfeite: fica
       antes da interrupção das animações e continua funcionando com
       movimento reduzido e sem IntersectionObserver. O elemento é um
       `input[type=range]` nativo — mouse, toque, setas, Home e End vêm
       do navegador, nada é reimplementado aqui. */
    const trilho = document.querySelector(".split-track");
    const campo = document.getElementById("split-range");
    if (!trilho || !campo) return;

    const saida1 = document.getElementById("split-saida-1");
    const saida2 = document.getElementById("split-saida-2");

    const aplicar = () => {
      // As duas metades saem do mesmo número, então a soma é 100 por
      // construção — não há como as duas porcentagens se desencontrarem.
      const primeira = Math.round(Number(campo.value));
      const segunda = 100 - primeira;

      if (saida1) saida1.textContent = primeira + "%";
      if (saida2) saida2.textContent = segunda + "%";

      campo.setAttribute("aria-valuenow", String(primeira));
      campo.setAttribute("aria-valuetext", primeira + "% / " + segunda + "%");
      trilho.style.setProperty("--split-n", String(primeira / 100));
    };

    campo.addEventListener("input", aplicar);
    aplicar();
  }

  function controlePainelOperacional() {
    /* A prévia dos controles do aplicativo. Também é funcional, não
       decorativa: entra antes da interrupção das animações e funciona
       com movimento reduzido e sem IntersectionObserver. Nenhum cálculo
       financeiro acontece aqui — nada de progressão, banca ou próximo
       aporte. Isto demonstra os controles, não o motor. */
    const painel = document.querySelector(".control-showcase");
    if (!painel) return;

    const grupo = painel.querySelector(".showcase-buttons");
    const copiar = painel.querySelector(".showcase-copy");
    const vitoria = painel.querySelector(".showcase-buttons button.w");
    const derrota = painel.querySelector(".showcase-buttons button.l");
    const status = painel.querySelector(".showcase-status");
    const opcao3d = painel.querySelector(".style-switch .style-3d");
    const opcaoPlana = painel.querySelector(".style-switch .style-flat");

    /* --- COPY: leva só o valor, nunca a frase inteira --------------- */
    if (copiar) {
      /* O rótulo muda com o idioma, o símbolo às vezes vem depois do
         número (francês) e os dígitos nem sempre são latinos (bengali).
         O que todos têm em comum: o valor começa no primeiro símbolo de
         moeda ou dígito e vai até o fim. Os escapes de propriedade
         Unicode são montados em runtime para que um navegador antigo que
         não os entenda caia no plano B em vez de derrubar o arquivo. */
      let recorte = null;
      try { recorte = new RegExp("[\\p{Sc}\\p{Nd}][\\s\\S]*$", "u"); }
      catch (e) { recorte = /[$\d][\s\S]*$/; }

      const valor = () => {
        const b = status && status.querySelector("b");
        const texto = b ? b.textContent.trim() : "";
        const achado = texto.match(recorte);
        return achado ? achado[0].trim() : texto;
      };

      let relogio = 0;
      const confirmar = () => {
        copiar.classList.add("is-copied");
        window.clearTimeout(relogio);
        // Único temporizador do componente, e só para tirar o realce.
        // Nenhum estado permanente depende de tempo.
        relogio = window.setTimeout(() => copiar.classList.remove("is-copied"), 1100);
      };

      const copiaAntiga = texto => {
        // Roda dentro do clique, então continua sendo gesto do usuário.
        try {
          const caixa = document.createElement("textarea");
          caixa.value = texto;
          caixa.setAttribute("readonly", "");
          caixa.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0";
          document.body.appendChild(caixa);
          caixa.select();
          const foi = document.execCommand("copy");
          caixa.remove();
          return foi;
        } catch (e) {
          return false;
        }
      };

      copiar.addEventListener("click", () => {
        const texto = valor();
        if (!texto) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          // A promessa é rejeitada em contexto inseguro ou sem permissão;
          // o segundo argumento evita que isso vire erro no console.
          navigator.clipboard.writeText(texto).then(confirmar, () => {
            if (copiaAntiga(texto)) confirmar();
          });
        } else if (copiaAntiga(texto)) {
          confirmar();
        }
      });
    }

    /* --- WIN / LOSS: seleção exclusiva ------------------------------ */
    if (vitoria && derrota) {
      const escolher = alvo => {
        vitoria.setAttribute("aria-pressed", String(alvo === vitoria));
        derrota.setAttribute("aria-pressed", String(alvo === derrota));
        // O status acompanha só a moldura e o ponto; texto e número dele
        // permanecem exatamente iguais.
        if (status) status.classList.toggle("is-loss", alvo === derrota);
      };
      vitoria.addEventListener("click", () => escolher(vitoria));
      derrota.addEventListener("click", () => escolher(derrota));
    }

    /* --- 3D PREMIUM / REFINED FLAT ---------------------------------- */
    if (opcao3d && opcaoPlana && grupo) {
      const acabamento = plano => {
        grupo.classList.toggle("flat", plano);
        grupo.classList.toggle("three-d", !plano);
        opcao3d.setAttribute("aria-pressed", String(!plano));
        opcaoPlana.setAttribute("aria-pressed", String(plano));
      };
      opcao3d.addEventListener("click", () => acabamento(false));
      opcaoPlana.addEventListener("click", () => acabamento(true));
    }
  }

  function controleSeletoresDemonstrativos() {
    /* Os dois últimos grupos que pareciam botões sem ser: o período do
       painel e a duração do bloqueio. São demonstrações do que o
       aplicativo oferece — aqui não se filtra dado, não se calcula
       bloqueio e nada é gravado em servidor, cookie ou localStorage.
       O que muda é a seleção e a resposta visual.

       Cada grupo é tratado sozinho, então escolher "30 dias" não encosta
       em "8h". A verdade do estado é o aria-pressed: nada de classe
       paralela, nada de :first-child. */
    document.querySelectorAll(".filter-pills, .lock-options").forEach(grupo => {
      const opcoes = [...grupo.querySelectorAll("button")];
      if (opcoes.length < 2) return;

      grupo.addEventListener("click", evento => {
        const alvo = evento.target.closest("button");
        // Ignora cliques no espaço entre as opções e, por causa do
        // `includes`, qualquer botão que não pertença a este grupo.
        if (!alvo || !opcoes.includes(alvo)) return;
        // Clicar de novo na opção já ativa a mantém ativa: o grupo nunca
        // fica sem escolha.
        opcoes.forEach(op => op.setAttribute("aria-pressed", String(op === alvo)));
      });
    });
  }

  /* ---------------------------------------------------------------- */

  function revelacoes() {
    /* A direção da entrada vem do papel do bloco no layout, não de sorteio
       nem de posição na página: o mesmo bloco entra sempre igual. */
    const MAPA = [
      // Abertura de capítulo.
      ["reveal--heading",
        ".section-heading, .statement-label, .prova-titulo, .sim-lead, .flow-intro"],
      // Coluna de texto do par esquerda/direita.
      ["reveal--left",
        ".operations-copy, .separation-copy, .boundaries-copy, .form-intro"],
      // O objeto visual que acompanha essa coluna.
      ["reveal--right",
        ".flow-board, .control-showcase, .session-cards, .form-shell"],
      // Corpo de leitura e blocos avulsos.
      ["reveal--up",
        ".statement-copy, .comparison-shell, .comparison-note, .sim-nota, " +
        ".sim-significa, .sim-conditions, .sim-cta, .prova-abertura, .prova-bloco, " +
        ".prova-motor, .prova-nota, .prova-tabela-caixa, .prova-fecho, " +
        ".prova-destaque, .cta-strip, .final-disclaimer > div"]
    ];

    /* Grupos de cards: o atraso é contado dentro do grupo, da esquerda
       para a direita, e nunca passa de 220ms — mesmo num grupo de nove.
       No celular a grade vira uma coluna e a ordem do DOM é a mesma, então
       a sequência continua sendo de cima para baixo, sem sorteio. */
    const GRUPOS =
      ".sim-passos, .sim-duo, .seq-grid, .exclusive-grid, .intelligence-grid, " +
      ".compat-grid, .participation-grid, .boundaries-grid, .global-panel";
    const PASSO = 55;
    const TETO = 220;

    const alvos = new Map();
    const atrasos = new Map();
    const marcar = (el, variante) => { if (!alvos.has(el)) alvos.set(el, variante); };

    document.querySelectorAll(GRUPOS).forEach(grupo => {
      [...grupo.children]
        // O divisor entre as duas sessões é enfeite, não card: entrar na
        // conta empurraria o card seguinte para um degrau que não existe.
        .filter(filho => !filho.classList.contains("session-divider"))
        .forEach((filho, i) => {
          marcar(filho, "reveal--up");
          atrasos.set(filho, Math.min(i * PASSO, TETO));
        });
    });

    MAPA.forEach(([variante, seletor]) => {
      document.querySelectorAll(seletor).forEach(el => marcar(el, variante));
    });

    /* Revelação dentro de revelação deixa o filho invisível esperando um
       pai invisível, soma dois atrasos e mistura duas direções. Onde isso
       acontecer, o pai manda e o filho sai da lista. */
    for (const el of [...alvos.keys()]) {
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (alvos.has(p)) { alvos.delete(el); atrasos.delete(el); break; }
      }
    }

    /* Se a página abriu num fragmento (#cadastro, #prova, …) o navegador
       faz a própria rolagem até lá, animada, sem avisar quando termina.
       Em vez de disputar com ela, o conteúdo do destino simplesmente nunca
       é escondido: é exatamente o que a pessoa veio ver. */
    const destino = window.location.hash ? document.querySelector(window.location.hash) : null;

    const observador = new IntersectionObserver(entradas => {
      entradas.forEach(entrada => {
        if (!entrada.isIntersecting) return;
        entrada.target.classList.add("is-visible");
        // Uma vez só. Quem já apareceu não volta a sumir ao sair da tela,
        // e ninguém precisa esperar a animação de novo ao rolar para cima.
        observador.unobserve(entrada.target);
      });
    // Margem inferior positiva: o elemento entra na conta antes de chegar
    // à tela. O callback é assíncrono, e numa rolagem rápida um bloco
    // poderia passar do ponto de disparo entre dois lotes e ficar preso.
    }, { threshold: 0.01, rootMargin: "0px 0px 200px 0px" });

    alvos.forEach((variante, el) => {
      if (destino && destino.contains(el)) {
        el.classList.add("reveal", variante, "is-visible");
        return;
      }

      // Lê o layout ANTES de mexer em classe: o que já está na tela ganha
      // "reveal" e "is-visible" no mesmo classList, então o primeiro
      // cálculo de estilo já sai com opacity 1 e nenhuma transição dispara.
      const caixa = el.getBoundingClientRect();
      if (caixa.top < window.innerHeight && caixa.bottom > 0) {
        el.classList.add("reveal", variante, "is-visible");
        return;
      }

      const atraso = atrasos.get(el);
      if (atraso) el.style.setProperty("--reveal-delay", `${atraso}ms`);
      el.classList.add("reveal", variante);
      observador.observe(el);
    });
  }

  function sequenciasDaProva() {
    /* As três sequências W/L da seção matemática. Decorativa: só roda
       depois do portão de movimento, então sem JavaScript, com movimento
       reduzido ou sem IntersectionObserver as trinta fichas nascem
       visíveis — o estado escondido só passa a existir quando esta
       função marca o contêiner.

       Os cards `.seq-card` continuam entrando pelo sistema de revelação
       geral; aqui não se toca neles, nem se aplica `.reveal` às fichas.
       São dois mecanismos separados, sem aninhamento. */
    const sequencias = [...document.querySelectorAll("#prova .seq-fichas")];
    if (!sequencias.length) return;

    sequencias.forEach(sequencia => {
      // O índice é contado dentro do próprio contêiner: cada card conta
      // do zero e nenhum depende da posição na página. É a única escrita
      // por ficha — nada de listener em cada uma.
      [...sequencia.children].forEach((ficha, i) => {
        ficha.style.setProperty("--ficha-i", String(i));
      });
      sequencia.classList.add("em-sequencia");
    });

    const observador = new IntersectionObserver(entradas => {
      entradas.forEach(entrada => {
        if (!entrada.isIntersecting) return;
        // Uma vez só: dispara, sai da observação e fica. Rolar para cima
        // e voltar não repete, e nada roda durante a rolagem.
        entrada.target.classList.add("tocando");
        observador.unobserve(entrada.target);
      });
    // Um quarto da sequência visível já basta, com uma folga curta abaixo
    // para a rolagem rápida não passar por cima do ponto de disparo.
    }, { threshold: 0.25, rootMargin: "0px 0px 80px 0px" });

    sequencias.forEach(sequencia => observador.observe(sequencia));
  }

  function numerosDaProva() {
    /* Os dois resultados que sustentam o argumento da seção matemática —
       o percentual em destaque e o numerador da fração — sobem do zero
       quando entram na tela. Só esses dois: nenhum outro número da página
       é tocado, e o denominador fica parado.

       Decorativa: roda depois do portão de movimento. Sem JavaScript, com
       movimento reduzido ou sem IntersectionObserver nada é escrito, e os
       valores finais que já estão no HTML permanecem intactos. Nenhum
       atributo de acessibilidade é criado — sem aria-live, para o leitor
       de tela não receber dezenas de anúncios durante a contagem. */
    const DURACAO = 1300;

    /* O valor não é fixado no código: sai do próprio DOM. Se o texto não
       casar com um formato reconhecido, o elemento é deixado como está —
       melhor não animar do que reescrever com um palpite. */
    const lerDecimal = (el) => {
      const texto = el.textContent.trim();
      const partes = texto.match(/^(\d+)([.,])(\d+)(\D*)$/);
      if (!partes) return null;
      const [, inteiro, separador, decimais, sufixo] = partes;
      const alvo = parseFloat(inteiro + "." + decimais);
      if (!Number.isFinite(alvo)) return null;
      return {
        el, texto, alvo,
        // A vírgula, as duas casas e o "%" vêm do texto original, nunca
        // de uma suposição de idioma.
        formatar: (v) => Math.min(v, alvo).toFixed(decimais.length).replace(".", separador) + sufixo
      };
    };

    const lerInteiro = (el) => {
      const texto = el.textContent.trim();
      if (!/^\d+$/.test(texto)) return null;
      const alvo = parseInt(texto, 10);
      if (!Number.isFinite(alvo)) return null;
      return { el, texto, alvo, formatar: (v) => String(Math.min(Math.round(v), alvo)) };
    };

    const animar = ({ el, texto, alvo, formatar }) => {
      /* Ao cair para "0" o número perde dígitos e, como ele ocupa uma
         coluna `auto` da grade, o texto ao lado andaria junto. A largura
         final é reservada antes de começar e devolvida no fim — medida
         local, em estilo embutido, sem tocar no CSS. */
      const largura = el.getBoundingClientRect().width;
      if (largura > 0) el.style.minWidth = largura + "px";

      const inicio = performance.now();
      const passo = (agora) => {
        const t = Math.min((agora - inicio) / DURACAO, 1);
        if (t < 1) {
          // Mesma curva de numerosDaSimulacao: sobe rápido e desacelera,
          // sempre crescendo e sem nunca passar do alvo.
          el.textContent = formatar(alvo * (1 - Math.pow(1 - t, 3)));
          requestAnimationFrame(passo);
          return;
        }
        // Fecha escrevendo de volta a string original, caractere a caractere.
        el.textContent = texto;
        el.style.minWidth = "";
      };
      el.textContent = formatar(0);
      requestAnimationFrame(passo);
    };

    const percentual = document.querySelector("#prova .prova-destaque > b");
    // `querySelector` devolve o primeiro <b>: o numerador. O segundo, com
    // o denominador, não é consultado nem escrito em momento algum.
    const numerador = document.querySelector("#prova .prova-fracao > b");

    const alvos = [
      [percentual && percentual.closest(".prova-destaque"), percentual && lerDecimal(percentual)],
      [numerador && numerador.closest(".prova-fracao"), numerador && lerInteiro(numerador)]
    ].filter(([caixa, dado]) => caixa && dado);
    if (!alvos.length) return;

    // Um observador para os dois. Cada um dispara por conta própria,
    // quando o seu componente já está bem dentro da tela — assim a
    // contagem não acontece com o card ainda quase invisível.
    const observador = new IntersectionObserver(entradas => {
      entradas.forEach(entrada => {
        if (!entrada.isIntersecting) return;
        observador.unobserve(entrada.target);
        const par = alvos.find(([caixa]) => caixa === entrada.target);
        // Uma vez só: sai da observação antes de animar, então rolar para
        // cima e voltar não reinicia a contagem.
        if (par) animar(par[1]);
      });
    }, { threshold: 0.5 });

    alvos.forEach(([caixa]) => observador.observe(caixa));
  }

  function numerosDaSimulacao() {
    /* Os dois números da simulação são o argumento da página e eram os
       únicos parados, enquanto os menores do hero já contavam. A largura
       final das barras fica no CSS: sem JavaScript, ou com movimento
       reduzido, elas nascem certas e nada anima. */
    const duo = document.querySelector(".sim-duo");
    if (!duo) return;

    const barras = [...duo.querySelectorAll(".sim-track i")];
    const larguras = barras.map(el => getComputedStyle(el).width);
    barras.forEach(el => { el.style.width = "0px"; });

    const contar = (el, alvo) => {
      const inicio = performance.now();
      const passo = agora => {
        const t = Math.min((agora - inicio) / 1300, 1);
        el.textContent = Math.round(alvo * (1 - Math.pow(1 - t, 3))) + "%";
        if (t < 1) requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    };

    const obsDuo = new IntersectionObserver(([entrada]) => {
      if (!entrada.isIntersecting) return;
      obsDuo.disconnect();
      duo.querySelectorAll(".sim-stat b").forEach(el => {
        const alvo = parseInt(el.textContent, 10);
        if (Number.isFinite(alvo)) { el.textContent = "0%"; contar(el, alvo); }
      });
      barras.forEach((el, i) => { el.style.width = larguras[i]; });
    }, { threshold: 0.45 });
    obsDuo.observe(duo);
  }
})();
