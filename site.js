(() => {
  "use strict";

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) return;

  const targets = document.querySelectorAll(
    ".section-heading, .flow-intro, .operations-copy, .control-showcase, .separation-copy, " +
    ".session-cards > article, .boundaries-copy, .boundaries-grid > article, .participation-grid > article, " +
    ".form-intro, .exclusive-card, .intel-card, .cta-strip, .statement-copy, .global-panel > *"
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
