(() => {
  "use strict";

  const form = document.getElementById("lead-form");
  const tabs = [...document.querySelectorAll(".interest-tab")];
  const interestInput = document.getElementById("tipo_interesse");
  const buyerFields = document.getElementById("buyer-fields");
  const resellerFields = document.getElementById("reseller-fields");
  const channelInput = document.getElementById("canal_divulgacao");
  const submitButton = document.getElementById("submit-button");
  const notice = document.getElementById("form-notice");
  const successState = document.getElementById("success-state");
  const observation = document.getElementById("observacao");
  const counter = document.getElementById("counter");
  const interestTabs = document.querySelector(".interest-tabs");
  const successMessage = document.getElementById("success-message");
  const newRegistrationButton = document.getElementById("new-registration");
  const params = new URLSearchParams(window.location.search);

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

  function setInterest(value) {
    interestInput.value = value;
    const isReseller = value === "revender";

    buyerFields.classList.toggle("hidden", isReseller);
    resellerFields.classList.toggle("hidden", !isReseller);
    resellerFields.setAttribute("aria-hidden", String(!isReseller));
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
    observation.dispatchEvent(new Event("input"));
    successState.hidden = true;
    interestTabs.hidden = false;
    form.hidden = false;
    submitButton.disabled = false;
    submitButton.classList.remove("loading");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function validateForm() {
    clearErrors();
    let valid = true;

    [...form.querySelectorAll("[required]")]
      .filter((element) => !element.closest(".hidden"))
      .forEach((element) => {
        let message = "";
        const value = element.type === "checkbox" ? element.checked : element.value.trim();

        if (!value) {
          message = "Este campo é obrigatório.";
        } else if (
          element.type === "email" &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(element.value)
        ) {
          message = "Informe um e-mail válido.";
        } else if (element.id === "nome" && element.value.trim().length < 3) {
          message = "Informe seu nome completo.";
        } else if (
          element.id === "whatsapp" &&
          element.value.replace(/\D/g, "").length < 10
        ) {
          message = "Informe um WhatsApp válido com DDD.";
        }

        if (!message) return;
        valid = false;

        if (element.type === "checkbox") {
          document.getElementById("consent-error").textContent = message;
          return;
        }

        const field = element.closest(".field");
        field?.classList.add("invalid");
        const error = field?.querySelector(".field-error");
        if (error) error.textContent = message;
      });

    if (form.elements.website.value) {
      valid = false;
      showNotice("Não foi possível enviar o cadastro.");
    }

    return valid;
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

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setInterest(tab.dataset.interest));
  });

  observation.addEventListener("input", () => {
    counter.textContent = observation.value.length;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateForm()) return;

    if (!isConfigured()) {
      showNotice("O armazenamento dos cadastros ainda não foi configurado.", "info");
      return;
    }

    const submittedInterest = interestInput.value;
    submitButton.disabled = true;
    submitButton.classList.add("loading");

    try {
      const result = await submitThroughConfirmedIframe();

      form.hidden = true;
      interestTabs.hidden = true;
      successState.hidden = false;

      if (result.duplicate) {
        successMessage.textContent =
          "Este contato já estava cadastrado. Seu interesse continua registrado em nossa lista.";
      } else if (submittedInterest === "revender") {
        successMessage.textContent =
          "Seu interesse como parceiro foi gravado. Entraremos em contato quando o programa de revendedores estiver disponível.";
      } else {
        successMessage.textContent =
          "Seu cadastro foi gravado e confirmado pela planilha. Avisaremos você quando houver novidades importantes.";
      }

      successState.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      showNotice(
        error?.message || "Não conseguimos concluir o cadastro. Tente novamente.",
        "error"
      );
    } finally {
      submitButton.disabled = false;
      submitButton.classList.remove("loading");
    }
  });

  newRegistrationButton.addEventListener("click", resetRegistrationForm);

  document.getElementById("whatsapp").addEventListener("input", (event) => {
    if (event.target.value.trim().startsWith("+")) return;

    const digits = event.target.value.replace(/\D/g, "").slice(0, 11);

    if (digits.length <= 2) {
      event.target.value = digits;
    } else if (digits.length <= 7) {
      event.target.value = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    } else {
      event.target.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
  });

  restoreHiddenValues();
  document.getElementById("current-year").textContent = new Date().getFullYear();
})();
