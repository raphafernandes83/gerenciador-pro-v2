/* Motor de internacionalizacao.
   O HTML carrega em ingles (padrao). Cada no traduzivel tem data-i18n
   com a chave; atributos usam data-i18n-attr="atributo:chave".
   Os dicionarios ficam em i18n/<codigo>.json e sao buscados sob demanda. */
(() => {
  "use strict";

  const PADRAO = "en";
  /* pronto=false enquanto o dicionário não existe: a opção aparece no
     seletor, marcada como indisponível, em vez de trocar para um idioma
     que cairia de volta no inglês sem explicação. */
  const IDIOMAS = [
    { codigo: "en", nome: "English", dir: "ltr", pronto: true },
    { codigo: "pt", nome: "Português", dir: "ltr", pronto: true },
    { codigo: "es", nome: "Español", dir: "ltr", pronto: true },
    { codigo: "fr", nome: "Français", dir: "ltr", pronto: true },
    { codigo: "de", nome: "Deutsch", dir: "ltr", pronto: true },
    { codigo: "bn", nome: "বাংলা", dir: "ltr", pronto: true, fonte: "Noto+Sans+Bengali" },
    { codigo: "zh", nome: "中文", dir: "ltr", pronto: true, fonte: "Noto+Sans+SC" },
    { codigo: "ko", nome: "한국어", dir: "ltr", pronto: true, fonte: "Noto+Sans+KR" },
  ];
  const CHAVE_ARMAZENAMENTO = "gp-idioma";
  const cache = new Map();
  let dicionarioAtual = null;   // null = inglês, que já está no HTML

  const EM_BREVE = {
    en: "soon", pt: "em breve", es: "pronto",
    fr: "bientôt", de: "bald", bn: "শীঘ্রই", zh: "即将推出", ko: "곧",
  };

  const bandeira = codigo =>
    (window.GP_BANDEIRAS && window.GP_BANDEIRAS[codigo]) || "";

  const suportado = c => IDIOMAS.some(i => i.codigo === c && i.pronto);

  /* Bengali, chinês e coreano não existem em Inter nem Manrope. A fonte
     entra só quando o idioma é escolhido, para não pesar nos demais. */
  function garantirFonte(info) {
    if (!info.fonte || document.getElementById(`fonte-${info.codigo}`)) return;
    const link = document.createElement("link");
    link.id = `fonte-${info.codigo}`;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${info.fonte}:wght@400;700;800&display=swap`;
    document.head.appendChild(link);
    document.documentElement.style.setProperty(
      "--fonte-idioma",
      `"${info.fonte.replace(/\+/g, " ")}"`
    );
  }

  function idiomaInicial() {
    try {
      const salvo = localStorage.getItem(CHAVE_ARMAZENAMENTO);
      if (salvo && suportado(salvo)) return salvo;
    } catch (_) { /* localStorage bloqueado */ }
    for (const pref of navigator.languages || [navigator.language || ""]) {
      const base = String(pref).toLowerCase().split("-")[0];
      if (suportado(base)) return base;
    }
    return PADRAO;
  }

  async function carregar(codigo) {
    if (codigo === PADRAO) return null;          // o padrao ja esta no HTML
    if (cache.has(codigo)) return cache.get(codigo);
    try {
      const resp = await fetch(`i18n/${codigo}.json`, { cache: "no-cache" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const dic = await resp.json();
      cache.set(codigo, dic);
      return dic;
    } catch (erro) {
      console.warn(`[i18n] nao foi possivel carregar "${codigo}":`, erro.message);
      return null;
    }
  }

  // Guarda o texto original em ingles para poder voltar ao padrao.
  const originais = new WeakMap();
  function original(el, campo, valorAtual) {
    let mapa = originais.get(el);
    if (!mapa) { mapa = {}; originais.set(el, mapa); }
    if (!(campo in mapa)) mapa[campo] = valorAtual;
    return mapa[campo];
  }

  function aplicar(dic) {
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const chave = el.dataset.i18n;
      const base = original(el, "texto", el.innerHTML);
      el.innerHTML = dic && dic[chave] != null ? dic[chave] : base;
    });

    document.querySelectorAll("[data-i18n-attr]").forEach(el => {
      el.dataset.i18nAttr.split(";").forEach(par => {
        const [attr, chave] = par.split(":").map(s => s && s.trim());
        if (!attr || !chave) return;
        const base = original(el, `attr:${attr}`, el.getAttribute(attr) || "");
        el.setAttribute(attr, dic && dic[chave] != null ? dic[chave] : base);
      });
    });
  }

  async function definir(codigo, { guardar = true } = {}) {
    if (!suportado(codigo)) codigo = PADRAO;
    const dic = await carregar(codigo);
    if (codigo !== PADRAO && !dic) codigo = PADRAO;   // falhou: fica no padrao

    aplicar(dic);
    dicionarioAtual = dic;

    const info = IDIOMAS.find(i => i.codigo === codigo);
    garantirFonte(info);   // aqui e nao no clique: cobre tambem o idioma ja salvo
    document.documentElement.lang = codigo;
    document.documentElement.dir = info.dir;

    document.querySelectorAll("[data-idioma]").forEach(botao => {
      const ativo = botao.dataset.idioma === codigo;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-current", ativo ? "true" : "false");
    });

    const rotulo = document.querySelector(".lang-current");
    if (rotulo) rotulo.textContent = codigo.toUpperCase();
    const marcaNoBotao = document.querySelector(".lang-toggle .lang-flag");
    if (marcaNoBotao) marcaNoBotao.innerHTML = bandeira(codigo);

    const legenda = EM_BREVE[codigo] || EM_BREVE.en;
    document.querySelectorAll(".lang-option.pendente small").forEach(el => {
      el.textContent = legenda;
    });

    if (guardar) {
      try { localStorage.setItem(CHAVE_ARMAZENAMENTO, codigo); } catch (_) { /* ignora */ }
    }
    document.dispatchEvent(new CustomEvent("gp:idioma", { detail: { codigo } }));
  }

  function montarSeletor() {
    const alvo = document.querySelector("[data-seletor-idioma]");
    const gatilho = document.querySelector(".lang-toggle");
    if (!alvo || !gatilho) return;

    const fechar = ({ devolverFoco = false } = {}) => {
      alvo.hidden = true;
      gatilho.setAttribute("aria-expanded", "false");
      gatilho.classList.remove("aberto");
      if (devolverFoco) gatilho.focus();
    };
    const abrir = () => {
      alvo.hidden = false;
      gatilho.setAttribute("aria-expanded", "true");
      gatilho.classList.add("aberto");
      alvo.querySelector(".lang-option")?.focus();
    };

    alvo.innerHTML = "";
    IDIOMAS.forEach(info => {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "lang-option";
      botao.dataset.idioma = info.codigo;
      botao.lang = info.codigo;
      botao.setAttribute("role", "menuitemradio");
      botao.innerHTML =
        `<span class="lang-flag">${bandeira(info.codigo)}</span>` +
        `<span class="lang-name">${info.nome}</span>` +
        `<span class="lang-check" aria-hidden="true">✓</span>`;

      if (!info.pronto) {
        botao.disabled = true;
        botao.classList.add("pendente");
        const aviso = document.createElement("small");
        aviso.textContent = "em breve";
        botao.appendChild(aviso);
      } else {
        botao.addEventListener("click", () => {
          definir(info.codigo);
          fechar({ devolverFoco: true });
        });
      }
      alvo.appendChild(botao);
    });

    gatilho.addEventListener("click", () => (alvo.hidden ? abrir() : fechar()));
    document.addEventListener("click", e => {
      if (!alvo.hidden && !e.target.closest(".lang-switch")) fechar();
    });
    document.addEventListener("keydown", e => {
      if (alvo.hidden) return;
      if (e.key === "Escape") { fechar({ devolverFoco: true }); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const itens = [...alvo.querySelectorAll(".lang-option:not([disabled])")];
      const atual = itens.indexOf(document.activeElement);
      const passo = e.key === "ArrowDown" ? 1 : -1;
      itens[(atual + passo + itens.length) % itens.length]?.focus();
    });
  }

  /* Textos que só existem em JavaScript (mensagens de erro, avisos de
     envio). O segundo argumento é o texto em inglês, que serve de padrão
     e mantém a mensagem legível mesmo se a chave faltar no dicionário. */
  function t(chave, padraoIngles) {
    const traduzido = dicionarioAtual && dicionarioAtual[chave];
    return traduzido != null ? traduzido : padraoIngles;
  }

  function idiomaAtual() {
    return document.documentElement.lang || PADRAO;
  }

  window.GP_I18N = { definir, t, idiomaAtual, IDIOMAS, PADRAO };

  document.addEventListener("DOMContentLoaded", () => {
    montarSeletor();
    definir(idiomaInicial(), { guardar: false });
  });
})();
