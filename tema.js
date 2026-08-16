/* Alternância entre tema escuro e claro.

   O escuro continua sendo o padrão: é a identidade da marca e o que o
   visitante vê na imagem de compartilhamento. O claro entra por escolha,
   ou automaticamente para quem já pede tema claro no sistema.

   A escolha manual sempre vence a do sistema, e é lembrada. */
(() => {
  "use strict";

  const CHAVE = "gp-tema";
  const raiz = document.documentElement;

  const preferenciaDoSistema = () =>
    window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
      ? "claro" : "escuro";

  function lido() {
    try {
      const salvo = localStorage.getItem(CHAVE);
      if (salvo === "claro" || salvo === "escuro") return salvo;
    } catch (_) { /* localStorage bloqueado */ }
    return preferenciaDoSistema();
  }

  function aplicar(tema, { guardar = true } = {}) {
    if (tema === "claro") raiz.setAttribute("data-tema", "claro");
    else raiz.removeAttribute("data-tema");

    // A barra do navegador no celular acompanha o fundo da página.
    const cor = tema === "claro" ? "#f5f7fa" : "#07090e";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", cor);

    document.querySelectorAll("[data-alternar-tema]").forEach(botao => {
      botao.setAttribute("aria-pressed", String(tema === "claro"));
      const rotulo = tema === "claro" ? "escuro" : "claro";
      botao.setAttribute(
        "aria-label",
        (window.GP_I18N ? window.GP_I18N.t("attr.18", "Switch theme") : "Switch theme") + " — " + rotulo
      );
    });

    if (guardar) {
      try { localStorage.setItem(CHAVE, tema); } catch (_) { /* ignora */ }
    }
    document.dispatchEvent(new CustomEvent("gp:tema", { detail: { tema } }));
  }

  const atual = () => (raiz.getAttribute("data-tema") === "claro" ? "claro" : "escuro");

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-alternar-tema]").forEach(botao => {
      botao.addEventListener("click", () => {
        aplicar(atual() === "claro" ? "escuro" : "claro");
      });
    });
    // Sem guardar: enquanto a pessoa não escolher, o sistema continua mandando.
    aplicar(lido(), { guardar: false });
  });

  // Se o sistema mudar e a pessoa nunca tiver escolhido, acompanha.
  window.matchMedia?.("(prefers-color-scheme: light)")?.addEventListener?.("change", e => {
    let escolheu = false;
    try { escolheu = Boolean(localStorage.getItem(CHAVE)); } catch (_) { /* ignora */ }
    if (!escolheu) aplicar(e.matches ? "claro" : "escuro", { guardar: false });
  });

  document.addEventListener("gp:idioma", () => aplicar(atual(), { guardar: false }));

  window.GP_TEMA = { aplicar, atual };
})();
