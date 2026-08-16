(() => {
  "use strict";

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) return;

  const targets = document.querySelectorAll(
    ".section-heading, .flow-intro, .operations-copy, .control-showcase, .separation-copy, " +
    ".session-cards > article, .boundaries-copy, .boundaries-grid > article, .participation-grid > article, " +
    ".form-intro, .exclusive-card, .intel-card, .cta-strip, .statement-copy, .global-panel > *, " +
    // As duas seções mais novas só tinham o cabeçalho revelado; o corpo,
    // os números e o bloco de condições entravam secos.
    ".sim-lead, .sim-nota, .sim-duo > article, .sim-conditions, .sim-cta, .compat-grid > article, " +
    // Nove blocos ficavam de fora e entravam secos: o mock do produto, a
    // tabela comparativa, o quadro de fluxo, o formulário e o aviso final.
    ".command-center, .comparison-shell, .comparison-note, .flow-board, " +
    ".form-shell, .final-disclaimer > div, .statement-label, .sim-passos > article"
  );

  // If the page loaded on a URL fragment (e.g. someone shared a #cadastro or
  // #diferenciais link), the browser performs its own scroll to that section
  // — animated, since `html` uses scroll-behavior: smooth site-wide, over a
  // duration this script has no reliable way to detect. Rather than race that
  // animation, anything inside the jump target is just never hidden: it's
  // exactly the content the visitor came for, it must never flash blank or
  // render mid-fade regardless of how long the browser's scroll takes.
  const jumpTarget = window.location.hash ? document.querySelector(window.location.hash) : null;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  // Positive bottom margin: elements start being tracked before they reach
  // the viewport, not right at its edge. That's a deliberate safety margin
  // against fast/flick scrolling — IntersectionObserver callbacks are async,
  // and without lead time a quick scroll could carry an element past the
  // trigger point between callback batches, leaving it stuck invisible.
  }, { threshold: 0.01, rootMargin: "0px 0px 200px 0px" });

  targets.forEach((el, index) => {
    if (jumpTarget && jumpTarget.contains(el)) {
      el.classList.add("reveal", "is-visible");
      return;
    }

    // Read layout BEFORE touching any class, so elements already in (or near)
    // the viewport at load time can get "reveal" and "is-visible" in the same
    // classList call — the very first style calculation already has
    // opacity:1, so no transition fires and there's no flash of blank content.
    const rect = el.getBoundingClientRect();
    const alreadyVisible = rect.top < window.innerHeight && rect.bottom > 0;

    if (alreadyVisible) {
      el.classList.add("reveal", "is-visible");
      return;
    }

    el.classList.add("reveal");
    el.style.transitionDelay = `${Math.min((index % 6) * 60, 240)}ms`;
    observer.observe(el);
  });

  /* Os dois números da simulação são o argumento da página, e eram os
     únicos que não se mexiam — enquanto os números menores do hero já
     faziam contagem. A largura final das barras fica no CSS, então sem
     JavaScript, ou com movimento reduzido (este arquivo nem chega aqui),
     elas já nascem corretas e nada anima. */
  const duo = document.querySelector(".sim-duo");
  if (duo) {
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

  // Fade hint on the comparison table only while there is more to scroll.
  const comparisonShell = document.querySelector(".comparison-shell");
  if (comparisonShell) {
    const updateScrollHint = () => {
      const scrollable = comparisonShell.scrollWidth > comparisonShell.clientWidth + 4;
      const atEnd = comparisonShell.scrollLeft + comparisonShell.clientWidth >= comparisonShell.scrollWidth - 4;
      comparisonShell.classList.toggle("has-more-scroll", scrollable && !atEnd);
    };
    updateScrollHint();
    comparisonShell.addEventListener("scroll", updateScrollHint, { passive: true });
    window.addEventListener("resize", updateScrollHint);
  }
})();
