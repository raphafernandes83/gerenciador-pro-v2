/* Lista de países do formulário.
   Guardamos só os códigos ISO 3166-1 alfa-2 e deixamos o navegador
   traduzir os nomes via Intl.DisplayNames — assim 195 países não
   precisam entrar nos dicionários de cada idioma.
   O valor enviado é sempre o nome em inglês, para a planilha manter
   uma grafia estável independente do idioma de quem preencheu. */
(() => {
  "use strict";

  const CODIGOS = (
    "AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI " +
    "CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE " +
    "SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT " +
    "JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX " +
    "FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH " +
    "PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK " +
    "SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN " +
    "YE ZM ZW"
  ).split(" ");

  const nomeadorIngles = (() => {
    try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch (_) { return null; }
  })();

  function nomeador(idioma) {
    try { return new Intl.DisplayNames([idioma], { type: "region" }); } catch (_) { return nomeadorIngles; }
  }

  function preencher(select, idioma) {
    if (!select || !nomeadorIngles) return;   // navegador antigo: mantém o HTML original

    const escolhido = select.value;
    const traduz = nomeador(idioma);
    const coletor = new Intl.Collator(idioma);

    const lista = CODIGOS
      .map(codigo => ({
        valor: nomeadorIngles.of(codigo) || codigo,
        rotulo: traduz.of(codigo) || codigo,
      }))
      .sort((a, b) => coletor.compare(a.rotulo, b.rotulo));

    const placeholder = select.querySelector('option[value=""]');
    select.innerHTML = "";
    if (placeholder) select.appendChild(placeholder);

    for (const { valor, rotulo } of lista) {
      const opcao = document.createElement("option");
      opcao.value = valor;
      opcao.textContent = rotulo;
      select.appendChild(opcao);
    }

    const outro = document.createElement("option");
    outro.value = "Other";
    outro.textContent = rotuloOutro(idioma);
    select.appendChild(outro);

    if (escolhido) select.value = escolhido;
  }

  function rotuloOutro(idioma) {
    const mapa = {
      en: "Other", pt: "Outro", es: "Otro", fr: "Autre", de: "Andere",
      bn: "অন্যান্য", zh: "其他", ko: "기타",
    };
    return mapa[idioma] || mapa.en;
  }

  function aplicar(idioma) {
    preencher(document.getElementById("pais"), idioma || document.documentElement.lang || "en");
  }

  document.addEventListener("DOMContentLoaded", () => aplicar(document.documentElement.lang));
  document.addEventListener("gp:idioma", e => aplicar(e.detail.codigo));
})();
