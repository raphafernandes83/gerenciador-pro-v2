window.GP_FORM_CONFIG={endpoint:"https://script.google.com/macros/s/AKfycbyiGH-5FRXZteXMgog2bhaSEA1_UMOe78irya7DinWGfkmqDft6ELDJrcj12eHjMU2ZFQ/exec",requestTimeoutMs:15000};

(() => {
  const existing = document.querySelector('link[data-gp-cadastro-etapas]');
  if (existing) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'styles-cadastro-etapas.css?v=20260804-1';
  link.dataset.gpCadastroEtapas = 'true';
  document.head.appendChild(link);
})();
