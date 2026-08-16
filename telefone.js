/* Campo de WhatsApp internacional.
   Separa o código do país (select) do número nacional (input), formata
   conforme o país escolhido e grava o número completo em E.164 num campo
   oculto chamado "whatsapp" — que é o nome que a planilha já espera.

   Por que E.164: é o único formato que a API do WhatsApp e qualquer
   discador aceitam sem ambiguidade. "+5521999999999" funciona de qualquer
   lugar do mundo; "(21) 99999-9999" só funciona dentro do Brasil. */
(() => {
  "use strict";

  const DDI = Object.fromEntries(
    ("AF:93 AL:355 DZ:213 AD:376 AO:244 AG:1268 AR:54 AM:374 AU:61 AT:43 AZ:994 " +
     "BS:1242 BH:973 BD:880 BB:1246 BY:375 BE:32 BZ:501 BJ:229 BT:975 BO:591 BA:387 " +
     "BW:267 BR:55 BN:673 BG:359 BF:226 BI:257 CV:238 KH:855 CM:237 CA:1 CF:236 TD:235 " +
     "CL:56 CN:86 CO:57 KM:269 CG:242 CD:243 CR:506 CI:225 HR:385 CU:53 CY:357 CZ:420 " +
     "DK:45 DJ:253 DM:1767 DO:1809 EC:593 EG:20 SV:503 GQ:240 ER:291 EE:372 SZ:268 " +
     "ET:251 FJ:679 FI:358 FR:33 GA:241 GM:220 GE:995 DE:49 GH:233 GR:30 GD:1473 GT:502 " +
     "GN:224 GW:245 GY:592 HT:509 HN:504 HK:852 HU:36 IS:354 IN:91 ID:62 IR:98 IQ:964 " +
     "IE:353 IL:972 IT:39 JM:1876 JP:81 JO:962 KZ:7 KE:254 KI:686 KW:965 KG:996 LA:856 " +
     "LV:371 LB:961 LS:266 LR:231 LY:218 LI:423 LT:370 LU:352 MO:853 MG:261 MW:265 " +
     "MY:60 MV:960 ML:223 MT:356 MH:692 MR:222 MU:230 MX:52 FM:691 MD:373 MC:377 MN:976 " +
     "ME:382 MA:212 MZ:258 MM:95 NA:264 NR:674 NP:977 NL:31 NZ:64 NI:505 NE:227 NG:234 " +
     "KP:850 MK:389 NO:47 OM:968 PK:92 PW:680 PS:970 PA:507 PG:675 PY:595 PE:51 PH:63 " +
     "PL:48 PT:351 PR:1787 QA:974 RO:40 RU:7 RW:250 KN:1869 LC:1758 VC:1784 WS:685 " +
     "SM:378 ST:239 SA:966 SN:221 RS:381 SC:248 SL:232 SG:65 SK:421 SI:386 SB:677 " +
     "SO:252 ZA:27 KR:82 SS:211 ES:34 LK:94 SD:249 SR:597 SE:46 CH:41 SY:963 TW:886 " +
     "TJ:992 TZ:255 TH:66 TL:670 TG:228 TO:676 TT:1868 TN:216 TR:90 TM:993 TV:688 " +
     "UG:256 UA:380 AE:971 GB:44 US:1 UY:598 UZ:998 VU:678 VA:39 VE:58 VN:84 YE:967 " +
     "ZM:260 ZW:263").split(" ").map(par => par.split(":"))
  );

  /* Formato nacional por país. "#" é um dígito; o resto é literal.
     Vários comprimentos por país porque muitos têm fixo e móvel com
     tamanhos diferentes (no Brasil, 10 e 11). Quem não está aqui usa
     agrupamento genérico de 3 em 3. */
  const FORMATOS = {
    BR: { min: 10, max: 11, modelos: { 11: "(##) #####-####", 10: "(##) ####-####" } },
    US: { min: 10, max: 10, modelos: { 10: "(###) ###-####" } },
    CA: { min: 10, max: 10, modelos: { 10: "(###) ###-####" } },
    PT: { min: 9, max: 9, modelos: { 9: "### ### ###" } },
    AO: { min: 9, max: 9, modelos: { 9: "### ### ###" } },
    MZ: { min: 9, max: 9, modelos: { 9: "## ### ####" } },
    CV: { min: 7, max: 7, modelos: { 7: "### ####" } },
    IN: { min: 10, max: 10, modelos: { 10: "##### #####" } },
    BD: { min: 10, max: 10, modelos: { 10: "#### ######" } },
    PK: { min: 10, max: 10, modelos: { 10: "### #######" } },
    NG: { min: 10, max: 10, modelos: { 10: "### ### ####" } },
    PH: { min: 10, max: 10, modelos: { 10: "### ### ####" } },
    CN: { min: 11, max: 11, modelos: { 11: "### #### ####" } },
    KR: { min: 9, max: 10, modelos: { 10: "## #### ####", 9: "## ### ####" } },
    PE: { min: 9, max: 9, modelos: { 9: "### ### ###" } },
    BO: { min: 8, max: 8, modelos: { 8: "#### ####" } },
    AR: { min: 10, max: 10, modelos: { 10: "## #### ####" } },
    MX: { min: 10, max: 10, modelos: { 10: "## #### ####" } },
    CO: { min: 10, max: 10, modelos: { 10: "### ### ####" } },
    ES: { min: 9, max: 9, modelos: { 9: "### ## ## ##" } },
    FR: { min: 9, max: 9, modelos: { 9: "# ## ## ## ##" } },
    DE: { min: 10, max: 11, modelos: { 11: "### ########", 10: "### #######" } },
    GB: { min: 10, max: 10, modelos: { 10: "#### ######" } },
    IT: { min: 9, max: 10, modelos: { 10: "### ### ####", 9: "### ### ###" } },
  };

  const GENERICO = { min: 6, max: 14, modelos: {} };
  const formatoDe = iso => FORMATOS[iso] || GENERICO;

  /* Sem emoji de bandeira: o Windows não renderiza indicadores regionais
     e mostra as duas letras minúsculas, o que fica pior do que a sigla.
     "BR +55" funciona igual em todo sistema. */

  function aplicarModelo(digitos, modelo) {
    let saida = "";
    let i = 0;
    for (const c of modelo) {
      if (i >= digitos.length) break;
      if (c === "#") { saida += digitos[i]; i++; } else { saida += c; }
    }
    return saida + digitos.slice(i);
  }

  function formatar(digitos, iso) {
    const f = formatoDe(iso);
    const cortado = digitos.slice(0, f.max);
    const modelo = f.modelos[cortado.length]
      || f.modelos[f.max]
      || Object.values(f.modelos)[0];
    if (!modelo) return cortado.replace(/(\d{3})(?=\d)/g, "$1 ");
    return aplicarModelo(cortado, modelo);
  }

  // Zeros deixam claro que é um molde de formato, não um número real.
  function exemploDe(iso) {
    const modelo = formatoDe(iso).modelos[formatoDe(iso).max];
    return modelo ? modelo.replace(/#/g, "0") : "";
  }

  // País padrão do seletor conforme o idioma da página, até a pessoa
  // escolher o país dela no formulário.
  const PADRAO_POR_IDIOMA = {
    en: "US", pt: "BR", es: "ES", fr: "FR", de: "DE", bn: "BD", zh: "CN", ko: "KR",
  };

  const select = document.getElementById("ddi");
  const entrada = document.getElementById("whatsapp");
  const oculto = document.getElementById("whatsapp_e164");
  const pais = document.getElementById("pais");
  if (!select || !entrada || !oculto) return;

  let escolhaManual = false;

  function preencherSelect(idioma) {
    const nomes = (() => {
      try { return new Intl.DisplayNames([idioma], { type: "region" }); } catch (_) { return null; }
    })();
    const coletor = new Intl.Collator(idioma);
    const atual = select.value;

    const itens = Object.keys(DDI)
      .map(iso => ({ iso, nome: (nomes && nomes.of(iso)) || iso, ddi: DDI[iso] }))
      .sort((a, b) => coletor.compare(a.nome, b.nome));

    select.innerHTML = "";
    for (const { iso, nome, ddi } of itens) {
      const opcao = document.createElement("option");
      opcao.value = iso;
      opcao.textContent = `${iso} +${ddi}`;
      opcao.title = `${nome} +${ddi}`;
      select.appendChild(opcao);
    }
    // Quem já escolheu o código a mão mantém a escolha ao trocar de idioma.
    select.value = (escolhaManual && atual) ? atual : (PADRAO_POR_IDIOMA[idioma] || atual || "US");
  }

  function isoDoPaisEscolhido() {
    if (!pais || !pais.value) return null;
    try {
      const nomes = new Intl.DisplayNames(["en"], { type: "region" });
      return Object.keys(DDI).find(iso => nomes.of(iso) === pais.value) || null;
    } catch (_) { return null; }
  }

  function sincronizar() {
    const digitos = entrada.value.replace(/\D/g, "");
    const iso = select.value;
    entrada.value = formatar(digitos, iso);
    const limpos = entrada.value.replace(/\D/g, "");
    oculto.value = limpos ? `+${DDI[iso]}${limpos}` : "";

    const exemplo = exemploDe(iso);
    if (exemplo) entrada.placeholder = exemplo;
  }

  select.addEventListener("change", () => { escolhaManual = true; sincronizar(); });
  entrada.addEventListener("input", sincronizar);

  // Escolher o país no formulário ajusta o DDI, a menos que a pessoa já
  // tenha mexido no seletor de código — nesse caso a escolha dela manda.
  if (pais) {
    pais.addEventListener("change", () => {
      if (escolhaManual) return;
      const iso = isoDoPaisEscolhido();
      if (iso && DDI[iso]) { select.value = iso; sincronizar(); }
    });
  }

  document.addEventListener("gp:idioma", e => {
    preencherSelect(e.detail.codigo);
    sincronizar();
  });

  // Usado pela validação em script.js
  window.GP_TELEFONE = {
    valido() {
      const digitos = entrada.value.replace(/\D/g, "");
      const f = formatoDe(select.value);
      return digitos.length >= f.min && digitos.length <= f.max;
    },
    e164: () => oculto.value,
  };

  preencherSelect(document.documentElement.lang || "en");
  sincronizar();
})();
