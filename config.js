(() => {
  const configuredSitekey = "__GP_TURNSTILE_SITEKEY__";

  window.GP_FORM_CONFIG = {
    endpoint: "/api/register",
    requestTimeoutMs: 15000,
    turnstileSitekey: configuredSitekey
  };

  if (!configuredSitekey) return;

  function mountTurnstile() {
    const form = document.getElementById("lead-form");
    const notice = document.getElementById("form-notice");
    if (!form || !notice || document.getElementById("turnstile-container")) return;

    const container = document.createElement("div");
    container.id = "turnstile-container";
    container.className = "cf-turnstile";
    container.setAttribute("aria-label", "Security verification");
    notice.parentNode.insertBefore(container, notice);

    const render = () => {
      if (!window.turnstile || container.dataset.rendered === "1") return;
      window.turnstile.render(container, {
        sitekey: configuredSitekey,
        theme: "auto",
        language: "auto",
        action: "lead_register"
      });
      container.dataset.rendered = "1";
    };

    if (window.turnstile) {
      render();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.head.appendChild(script);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountTurnstile, { once: true });
  } else {
    mountTurnstile();
  }
})();
