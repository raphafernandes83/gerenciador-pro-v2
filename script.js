(() => {
  "use strict";

  const form = document.getElementById("lead-form");
  const tabs = [...document.querySelectorAll(".interest-tab")];
  const interestInput = document.getElementById("tipo_interesse");
  const buyerFields = document.getElementById("buyer-fields");
  const resellerFields = document.getElementById("reseller-fields");
  const channelInput = document.getElementById("canal_divulgacao");
  const submitButton = document.getElementById("submit-button");
  const submitButtonLabel = submitButton.querySelector(".button-label");
  const submitButtonIdleText = submitButtonLabel.textContent;
  const notice = document.getElementById("form-notice");
  const successState = document.getElementById("success-state");
  const observation = document.getElementById("observacao");
  const counter = document.getElementById("counter");
  const interestTabs = document.querySelector(".interest-tabs");
  const successTitle = document.getElementById("success-title");
  const successMessage = document.getElementById("success-message");
  const newRegistrationButton = document.getElementById("new-registration");
  const params = new URLSearchParams(window.location.search);

  // --- Navegação em etapas (novo) --------------------------------------
  // Paginação usa o atributo nativo `hidden`, nunca a classe `.hidden`.
  // A classe `.hidden` continua reservada exclusivamente para a exibição
  // condicional por perfil (comprador/revendedor), exatamente como antes.
  // Isso garante que collectInvalidFields()/validateForm() — que ignoram
  // apenas o que estiver dentro de `.hidden` — nunca deixem de validar um
  // campo obrigatório só porque a etapa dele está fechada no momento.
  const steps = [...document.querySelectorAll(".form-step")];
  const stepDots = [...document.querySelectorAll(".step-dot")];
  const stepStatus = document.getElementById("step-status");
  const stepIndicator = document.getElementById("step-indicator");
  const stepLabels = { 1: "Perfil", 2: "Essenciais", 3: "Complementares" };
  let currentStep = 1;

  function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function scrollBehavior() {
    return prefersReducedMotion() ? "auto" : "smooth";
  }

  function goToStep(stepNumber, options = {}) {
    const { focusStatus = true, scroll = true } = options;
    currentStep = stepNumber;

    steps.forEach((stepEl) => {
      stepEl.hidden = Number(stepEl.dataset.step) !== stepNumber;
    });

    stepDots.forEach((dot) => {
      const dotStep = Number(dot.dataset.stepDot);
      dot.classList.toggle("active", dotStep === stepNumber);
      dot.classList.toggle("done", dotStep < stepNumber);
    });

    if (stepStatus) {
      stepStatus.textContent = `Etapa ${stepNumber} de 3 — ${stepLabels[stepNumber]}`;
      if (focusStatus) stepStatus.focus({ preventScroll: true });
    }

    if (scroll) {
      const shell = document.querySelector(".form-shell");
      shell?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    }
  }

  // --- Valores ocultos (UTM, origem, submission context) ----------------
  const hiddenValues = {
    origem: params.get("origem") || params.get("source") || "acesso-direto",
    utm_source: params.get("utm_source") || "",
    utm_medium: params.get("utm_medium") || "",
    utm_campaign: params.get("utm_campaign") || "",
    pagina_url: window.location.href,
    user_agent: navigator.userAgent
  };

  function restoreHiddenValues() {
    Object.entries(hiddenValues).forEach(([key, value]) => {
      const element = document.getElementById(key);
      if (element) element.value = value;
    });
  }

  function showNotice(message, type = "error") {
    notice.hidden = false;
    notice.className = `form-notice ${type}`;
    notice.textContent = message;
  }

  function clearErrors() {
    notice.hidden = true;
    notice.textContent = "";

    form.querySelectorAll(".field.invalid").forEach((element) => {
      element.classList.remove("invalid");
    });

    form.querySelectorAll(".field-error").forEach((element) => {
      element.textContent = "";
    });

    document.getElementById("consent-error").textContent = "";
  }

  function clearStepErrors(scopeEl) {
    scopeEl.querySelectorAll(".field.invalid").forEach((element) => {
      element.classList.remove("invalid");
    });
    scopeEl.querySelectorAll(".field-error").forEach((element) => {
      element.textContent = "";
    });
    const consentError = scopeEl.querySelector("#consent-error");
    if (consentError) consentError.textContent = "";
  }

  function setInterest(value) {
    interestInput.value = value;
    const isReseller = value === "revender";

    document.querySelectorAll(".profile-buyer-only").forEach((element) => {
      element.classList.toggle("hidden", isReseller);
      if (element.hasAttribute("aria-hidden") || element.classList.contains("conditional-fields")) {
        element.setAttribute("aria-hidden", String(isReseller));
      }
    });

    document.querySelectorAll(".profile-reseller-only").forEach((element) => {
      element.classList.toggle("hidden", !isReseller);
      if (element.hasAttribute("aria-hidden") || element.classList.contains("conditional-fields")) {
        element.setAttribute("aria-hidden", String(!isReseller));
      }
    });

    channelInput.required = isReseller;

    tabs.forEach((tab) => {
      const active = tab.dataset.interest === value;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-checked", String(active));
    });

    clearErrors();
  }

  function resetRegistrationForm() {
    form.reset();
    restoreHiddenValues();
    setInterest("comprar");
    goToStep(1, { focusStatus: false, scroll: false });
    observation.dispatchEvent(new Event("input"));
    successState.hidden = true;
    interestTabs.hidden = false;
    if (stepIndicator) stepIndicator.hidden = false;
    if (stepStatus) stepStatus.hidden = false;
    form.hidden = false;
    submitButton.disabled = false;
    submitButton.classList.remove("loading");
    document.querySelector(".form-shell")?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }

  // --- Validação --------------------------------------------------------
  // As regras de obrigatoriedade e formato são as mesmas de antes; o que
  // muda é que agora podem ser aplicadas tanto ao formulário inteiro
  // (submit final) quanto a uma única etapa (botão "Continuar").
  function validateRequiredField(element) {
    const value = element.type === "checkbox" ? element.checked : element.value.trim();

    if (!value) return "Este campo é obrigatório.";
    if (element.id === "nome" && element.value.trim().length < 3) {
      return "Informe seu nome completo.";
    }
    if (element.id === "whatsapp" && element.value.replace(/\D/g, "").length < 10) {
      return "Informe um WhatsApp válido com DDD.";
    }
    return "";
  }

  // E-mail agora é opcional: só é validado (formato) quando preenchido.
  function validateOptionalEmail(element) {
    const value = element.value.trim();
    if (!value) return "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return "Informe um e-mail válido ou deixe o campo em branco.";
    }
    return "";
  }

  // Link do canal também é opcional. Aceita qualquer rede (Instagram, YouTube,
  // TikTok, Facebook, Telegram, WhatsApp, site) sem exigir que o usuário
  // digite "https://" — o prefixo é completado automaticamente.
  function normalizeLinkValue(value) {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  function validateOptionalLink(element) {
    const value = element.value.trim();
    if (!value) return "";
    const normalized = normalizeLinkValue(value);
    if (!/^https?:\/\/[^\s]+\.[^\s]{2,}$/i.test(normalized)) {
      return "Cole o link completo do perfil, grupo ou canal (ex.: instagram.com/seu-canal).";
    }
    return "";
  }

  function applyFieldError(element, message) {
    if (!message) return false;

    if (element.type === "checkbox") {
      const consentError = document.getElementById("consent-error");
      if (consentError) consentError.textContent = message;
      return true;
    }

    const field = element.closest(".field");
    field?.classList.add("invalid");
    const error = field?.querySelector(".field-error");
    if (error) error.textContent = message;
    return true;
  }

  // Percorre [required] dentro do escopo informado (uma etapa ou o form
  // inteiro), pulando o que estiver dentro de `.hidden` (campo não
  // aplicável ao perfil escolhido) — igual à lógica original. Como a
  // paginação usa `hidden` (atributo) e não `.hidden` (classe), uma etapa
  // fechada nunca faz um campo obrigatório ser ignorado aqui.
  function collectInvalidFields(scopeEl) {
    const invalid = [];

    [...scopeEl.querySelectorAll("[required]")]
      .filter((element) => !element.closest(".hidden"))
      .forEach((element) => {
        const message = validateRequiredField(element);
        if (applyFieldError(element, message)) invalid.push(element);
      });

    const emailElement = scopeEl.querySelector("#email");
    if (emailElement && !emailElement.closest(".hidden")) {
      const message = validateOptionalEmail(emailElement);
      if (applyFieldError(emailElement, message)) invalid.push(emailElement);
    }

    const linkElement = scopeEl.querySelector("#link_canal");
    if (linkElement && !linkElement.closest(".hidden")) {
      const message = validateOptionalLink(linkElement);
      if (applyFieldError(linkElement, message)) invalid.push(linkElement);
    }

    return invalid;
  }

  function focusFirstInvalid(invalidFields) {
    const target = invalidFields[0];
    if (!target) return;
    target.focus();
  }

  // Validação final: examina TODOS os campos aplicáveis ao perfil,
  // independentemente de qual etapa está visível no momento. Se houver
  // erro, abre a primeira etapa inválida e move o foco para o campo.
  function validateFormAndReveal() {
    clearErrors();
    const invalidFields = collectInvalidFields(form);

    if (invalidFields.length > 0) {
      const firstInvalid = invalidFields[0];
      const stepEl = firstInvalid.closest(".form-step");
      const stepNumber = stepEl ? Number(stepEl.dataset.step) : 2;
      goToStep(stepNumber, { focusStatus: false });
      focusFirstInvalid(invalidFields);
      return false;
    }

    return true;
  }

  // Confirmação sonora discreta, só no sucesso real do cadastro — nunca em
  // cliques ou navegação de etapa. Falha em silêncio se o navegador bloquear
  // ou não suportar Web Audio; som é um detalhe, nunca deve travar o fluxo.
  function playSuccessChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      [660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + i * 0.11;

        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.07, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);

        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.34);
      });

      window.setTimeout(() => ctx.close(), 700);
    } catch (error) {
      // som é só um detalhe de acabamento — segue o fluxo normalmente
    }
  }

  function isConfigured() {
    const endpoint = window.GP_FORM_CONFIG?.endpoint || "";
    return endpoint.startsWith("https://script.google.com/") && endpoint.endsWith("/exec");
  }

  function createSubmissionId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `gp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  /**
   * Envia o formulário para o Apps Script em um iframe oculto.
   * A página só considera sucesso quando recebe o postMessage real do backend.
   * O simples carregamento do iframe nunca mais é tratado como confirmação.
   *
   * NÃO MODIFICADA em relação à versão original: preserva nomes de campos,
   * UTM, origem, pagina_url, user_agent, submission_id, honeypot e a
   * confirmação real vinda do backend via postMessage.
   */
  function submitThroughConfirmedIframe() {
    return new Promise((resolve, reject) => {
      const endpoint = window.GP_FORM_CONFIG.endpoint;
      const submissionId = createSubmissionId();
      const frameName = `gp-lead-frame-${submissionId}`;
      const timeoutMs = Math.max(
        45000,
        Number(window.GP_FORM_CONFIG.requestTimeoutMs || 15000) + 30000
      );

      const iframe = document.createElement("iframe");
      iframe.name = frameName;
      iframe.title = "Confirmação de cadastro";
      iframe.hidden = true;
      iframe.srcdoc = "<!doctype html><html><body></body></html>";

      const relayForm = document.createElement("form");
      relayForm.method = "POST";
      relayForm.action = `${endpoint}?v=${Date.now()}`;
      relayForm.target = frameName;
      relayForm.hidden = true;

      const data = new FormData(form);
      data.append("enviado_em_local", new Date().toISOString());
      data.append("submission_id", submissionId);
      data.append("response_mode", "iframe");

      for (const [name, value] of data.entries()) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = String(value);
        relayForm.appendChild(input);
      }

      let completed = false;
      let submitted = false;

      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        iframe.removeEventListener("load", onFrameLoad);
        window.clearTimeout(timeoutTimer);
        relayForm.remove();
        window.setTimeout(() => iframe.remove(), 250);
      };

      const finish = (callback) => {
        if (completed) return;
        completed = true;
        cleanup();
        callback();
      };

      const onMessage = (event) => {
        const result = event.data;
        if (!result || result.type !== "gp-lead-result") return;
        if (result.submissionId !== submissionId) return;

        if (result.ok) {
          finish(() => resolve(result));
          return;
        }

        finish(() => reject(new Error(result.error || "O cadastro não foi gravado.")));
      };

      const onFrameLoad = () => {
        if (submitted) return;
        submitted = true;
        document.body.appendChild(relayForm);
        relayForm.submit();
      };

      const timeoutTimer = window.setTimeout(() => {
        finish(() =>
          reject(
            new Error(
              "A planilha não confirmou a gravação. Aguarde alguns segundos e tente novamente."
            )
          )
        );
      }, timeoutMs);

      window.addEventListener("message", onMessage);
      iframe.addEventListener("load", onFrameLoad);
      document.body.appendChild(iframe);
    });
  }

  // --- Listeners ----------------------------------------------------------

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setInterest(tab.dataset.interest));
  });

  observation.addEventListener("input", () => {
    counter.textContent = observation.value.length;
  });

  // Navegação entre etapas. Ao avançar, valida somente a etapa atual
  // (não o formulário inteiro) para não bloquear o avanço por causa de
  // um campo de uma etapa futura (ex.: consentimento, que só existe na
  // etapa 3, não pode impedir o avanço da etapa 1 para a 2).
  document.querySelectorAll("[data-goto]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = Number(button.dataset.goto);

      if (target > currentStep) {
        const currentStepEl = steps.find((stepEl) => Number(stepEl.dataset.step) === currentStep);
        if (currentStepEl) {
          clearStepErrors(currentStepEl);
          const invalidFields = collectInvalidFields(currentStepEl);
          if (invalidFields.length > 0) {
            focusFirstInvalid(invalidFields);
            return;
          }
        }
      }

      goToStep(target);
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Implicit submit (Enter) before the final step must behave like
    // the current step's "Continuar" button, not jump directly to consent.
    if (currentStep < 3) {
      const currentStepEl = steps.find(
        (stepEl) => Number(stepEl.dataset.step) === currentStep
      );

      if (currentStepEl) {
        clearStepErrors(currentStepEl);
        const invalidFields = collectInvalidFields(currentStepEl);
        if (invalidFields.length > 0) {
          focusFirstInvalid(invalidFields);
          return;
        }
      }

      goToStep(currentStep + 1);
      return;
    }

    if (!validateFormAndReveal()) return;

    if (form.elements.website.value) {
      // Honeypot preenchido: tratado como envio malicioso, sem detalhar o motivo.
      showNotice("Não foi possível enviar o cadastro.");
      return;
    }

    if (!isConfigured()) {
      showNotice("O armazenamento dos cadastros ainda não foi configurado.", "info");
      return;
    }

    const submittedInterest = interestInput.value;
    submitButton.disabled = true;
    submitButton.classList.add("loading");
    submitButton.setAttribute("aria-busy", "true");
    submitButtonLabel.textContent = "Enviando cadastro…";

    try {
      const result = await submitThroughConfirmedIframe();

      form.hidden = true;
      interestTabs.hidden = true;
      if (stepIndicator) stepIndicator.hidden = true;
      if (stepStatus) stepStatus.hidden = true;
      successState.hidden = false;
      playSuccessChime();

      if (result.duplicate) {
        if (successTitle) successTitle.textContent = "Você já estava na lista";
        successMessage.textContent =
          "Este contato já estava cadastrado. Seu interesse continua registrado em nossa lista.";
      } else if (submittedInterest === "revender") {
        if (successTitle) successTitle.textContent = "Você entrou como parceiro";
        successMessage.textContent =
          "Seu interesse como parceiro foi gravado. Entraremos em contato quando o programa de revendedores estiver disponível.";
      } else {
        if (successTitle) successTitle.textContent = "Você entrou como futuro usuário";
        successMessage.textContent =
          "Seu cadastro foi gravado e confirmado pela planilha. Avisaremos você quando houver novidades importantes.";
      }

      successState.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    } catch (error) {
      showNotice(
        error?.message || "Não conseguimos concluir o cadastro. Tente novamente.",
        "error"
      );
    } finally {
      submitButton.disabled = false;
      submitButton.classList.remove("loading");
      submitButton.removeAttribute("aria-busy");
      submitButtonLabel.textContent = submitButtonIdleText;
    }
  });

  newRegistrationButton.addEventListener("click", resetRegistrationForm);

  // DDDs brasileiros válidos (ANATEL). Só aplicamos a máscara "(XX) XXXXX-XXXX"
  // quando os dois primeiros dígitos batem com um DDD real — assim um número
  // estrangeiro digitado sem "+" não é forçado num formato brasileiro errado.
  const VALID_BR_DDD = new Set([
    11, 12, 13, 14, 15, 16, 17, 18, 19,
    21, 22, 24, 27, 28,
    31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49,
    51, 53, 54, 55,
    61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79,
    81, 82, 83, 84, 85, 86, 87, 88, 89,
    91, 92, 93, 94, 95, 96, 97, 98, 99
  ]);

  document.getElementById("whatsapp").addEventListener("input", (event) => {
    if (event.target.value.trim().startsWith("+")) return;

    const digits = event.target.value.replace(/\D/g, "").slice(0, 11);

    if (digits.length < 2 || !VALID_BR_DDD.has(Number(digits.slice(0, 2)))) {
      event.target.value = digits;
    } else if (digits.length <= 7) {
      event.target.value = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    } else {
      event.target.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
  });

  document.getElementById("link_canal").addEventListener("blur", (event) => {
    if (!event.target.value.trim()) return;
    event.target.value = normalizeLinkValue(event.target.value);
  });

  restoreHiddenValues();
  goToStep(1, { focusStatus: false, scroll: false });
  document.getElementById("current-year").textContent = new Date().getFullYear();

  // === Navegação, CTA flutuante e acessibilidade =====================

  const hamburgerBtn = document.querySelector(".hamburger-btn");
  const mobileMenu = document.getElementById("mobile-menu");

  if (hamburgerBtn && mobileMenu) {
    const closeMenu = ({ refocus = false } = {}) => {
      mobileMenu.classList.remove("open");
      hamburgerBtn.classList.remove("active");
      hamburgerBtn.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
      if (refocus) hamburgerBtn.focus();
    };

    hamburgerBtn.addEventListener("click", () => {
      if (mobileMenu.classList.contains("open")) {
        closeMenu();
        return;
      }
      mobileMenu.hidden = false;
      requestAnimationFrame(() => {
        mobileMenu.classList.add("open");
        hamburgerBtn.classList.add("active");
        hamburgerBtn.setAttribute("aria-expanded", "true");
        document.body.style.overflow = "hidden";
        mobileMenu.querySelector("a")?.focus();
      });
    });

    mobileMenu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => closeMenu());
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && mobileMenu.classList.contains("open")) closeMenu({ refocus: true });
    });
  }

  const siteHeader = document.querySelector(".site-header");
  const launchBar = document.querySelector(".launch-bar");
  if (siteHeader && launchBar) {
    new IntersectionObserver(
      ([entry]) => siteHeader.classList.toggle("scrolled", !entry.isIntersecting),
      { threshold: 0 }
    ).observe(launchBar);
  }

  const scrollTopBtn = document.getElementById("scroll-top");
  if (scrollTopBtn) {
    scrollTopBtn.hidden = false;
    window.addEventListener(
      "scroll",
      () => scrollTopBtn.classList.toggle("visible", window.scrollY > 600),
      { passive: true }
    );
    scrollTopBtn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
    });
  }

  const floatingCta = document.getElementById("floating-cta");
  const heroSection = document.getElementById("inicio");
  const cadastroSection = document.getElementById("cadastro");

  if (floatingCta && heroSection && cadastroSection) {
    floatingCta.hidden = false;
    let heroVisible = true;
    let cadastroVisible = false;
    const update = () => floatingCta.classList.toggle("visible", !heroVisible && !cadastroVisible);

    new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; update(); }, { threshold: 0.15 })
      .observe(heroSection);
    new IntersectionObserver(([e]) => { cadastroVisible = e.isIntersecting; update(); }, { threshold: 0.1 })
      .observe(cadastroSection);
  }

  if (!prefersReducedMotion()) {
    const proofNumbers = document.querySelectorAll(".hero-proof b");
    const proofContainer = document.querySelector(".hero-proof");
    if (proofNumbers.length && proofContainer) {
      const countUp = (el) => {
        const target = parseInt(el.textContent, 10);
        if (!Number.isFinite(target) || target <= 0) return;
        const duration = 1400;
        const start = performance.now();
        el.textContent = "0";
        const step = (now) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.round(target * eased);
          if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      };

      const proofObserver = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          proofNumbers.forEach(countUp);
          proofObserver.disconnect();
        },
        { threshold: 0.5 }
      );
      proofObserver.observe(proofContainer);
    }
  }

  // Card inteiro leva ao cadastro. role="link" exige foco e ativação por
  // teclado — sem isso o card fica anunciado como link e inalcançável.
  document.querySelectorAll(".participation-grid article").forEach((card) => {
    const goToCadastro = () =>
      cadastroSection?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    card.setAttribute("role", "link");
    card.setAttribute("tabindex", "0");
    card.addEventListener("click", goToCadastro);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        goToCadastro();
      }
    });
  });
})();
