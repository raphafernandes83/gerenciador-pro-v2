(() => {
  "use strict";

  const start = () => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const supportsObserver = "IntersectionObserver" in window;

    /* The former reveal layer touched almost every block. R3 keeps all
       content readable by default and animates only chapter landmarks. */
    document.querySelectorAll(".reveal").forEach(element => {
      element.classList.remove(
        "reveal",
        "reveal--heading",
        "reveal--left",
        "reveal--right",
        "reveal--up",
        "is-visible"
      );
      element.style.removeProperty("--reveal-delay");
    });

    const landmarks = [
      ...document.querySelectorAll([
        ".section-heading",
        ".statement-copy",
        ".flow-intro",
        ".operations-copy",
        ".separation-copy",
        ".boundaries-copy",
        ".form-intro",
        ".comparison-shell",
        ".simulation-session",
        ".prova-bloco",
        ".exclusive-grid",
        ".flow-board",
        ".operations-panel",
        ".intelligence-grid",
        ".global-panel",
        ".boundaries-grid",
        ".compat-grid",
        ".participation-grid",
        ".form-shell"
      ].join(","))
    ].filter((element, index, all) => all.indexOf(element) === index);

    if (!reduceMotion && supportsObserver) {
      document.documentElement.classList.add("motion-ready");
      landmarks.forEach((element, index) => {
        element.classList.add("motion-reveal");
        element.style.setProperty("--motion-delay", `${Math.min(index % 3, 2) * 55}ms`);
      });

      const motionObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-motion-visible");
          motionObserver.unobserve(entry.target);
        });
      }, { threshold: .09, rootMargin: "0px 0px -7% 0px" });

      landmarks.forEach(element => motionObserver.observe(element));

      const directTarget = location.hash && document.querySelector(location.hash);
      if (directTarget) {
        directTarget.querySelectorAll(".motion-reveal").forEach(element => {
          element.classList.add("is-motion-visible");
          motionObserver.unobserve(element);
        });
      }
    } else {
      landmarks.forEach(element => element.classList.add("is-motion-visible"));
    }

    const navLinks = [...document.querySelectorAll('.header-nav a[href^="#"]')]
      .filter(link => link.hash && document.querySelector(link.hash));

    if (supportsObserver && navLinks.length) {
      const sections = navLinks.map(link => document.querySelector(link.hash));
      const sectionLinks = new Map(navLinks.map(link => [link.hash.slice(1), link]));
      const activate = id => {
        navLinks.forEach(link => {
          const active = link === sectionLinks.get(id);
          link.classList.toggle("is-active", active);
          if (active) link.setAttribute("aria-current", "true");
          else link.removeAttribute("aria-current");
        });
      };

      const visible = new Map();
      const navigationObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => visible.set(entry.target.id, entry.intersectionRatio));
        const current = [...visible.entries()]
          .filter(([, ratio]) => ratio > 0)
          .sort((a, b) => b[1] - a[1])[0];
        if (current) activate(current[0]);
      }, { threshold: [0, .15, .35, .6], rootMargin: "-22% 0px -58% 0px" });

      sections.forEach(section => navigationObserver.observe(section));
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
