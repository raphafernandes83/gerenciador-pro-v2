/* Bandeiras em SVG inline, uma por idioma.

   Por que não emoji: o Windows não tem glifo para os indicadores regionais
   (🇧🇷 e companhia) e renderiza as duas letras no lugar — comprovado neste
   projeto no seletor de DDI. SVG funciona igual em todo sistema, escala sem
   borrar e não custa nenhuma requisição.

   Desenhos simplificados de propósito: aparecem a 20x14 px, onde detalhe
   vira sujeira. O que importa é a silhueta de cor ser reconhecível. */
window.GP_BANDEIRAS = {
  // Estados Unidos — faixas e cantão
  en: `<svg viewBox="0 0 20 14" aria-hidden="true"><rect width="20" height="14" fill="#fff"/>
    <g fill="#b22234"><rect width="20" height="2"/><rect y="4" width="20" height="2"/>
    <rect y="8" width="20" height="2"/><rect y="12" width="20" height="2"/></g>
    <rect width="9" height="8" fill="#3c3b6e"/></svg>`,

  // Brasil — campo verde, losango, círculo
  pt: `<svg viewBox="0 0 20 14" aria-hidden="true"><rect width="20" height="14" fill="#009b3a"/>
    <path d="M10 1.6 18.4 7 10 12.4 1.6 7Z" fill="#fedf00"/>
    <circle cx="10" cy="7" r="3" fill="#002776"/></svg>`,

  // Espanha — faixas com a central mais larga
  es: `<svg viewBox="0 0 20 14" aria-hidden="true"><rect width="20" height="14" fill="#c60b1e"/>
    <rect y="3.5" width="20" height="7" fill="#ffc400"/></svg>`,

  // França — tricolor vertical
  fr: `<svg viewBox="0 0 20 14" aria-hidden="true"><rect width="20" height="14" fill="#fff"/>
    <rect width="6.67" height="14" fill="#002395"/>
    <rect x="13.33" width="6.67" height="14" fill="#ed2939"/></svg>`,

  // Alemanha — tricolor horizontal
  de: `<svg viewBox="0 0 20 14" aria-hidden="true"><rect width="20" height="14" fill="#ffce00"/>
    <rect width="20" height="9.33" fill="#dd0000"/><rect width="20" height="4.67"/></svg>`,

  // Bangladesh — círculo levemente à esquerda do centro
  bn: `<svg viewBox="0 0 20 14" aria-hidden="true"><rect width="20" height="14" fill="#006a4e"/>
    <circle cx="9" cy="7" r="4" fill="#f42a41"/></svg>`,

  // China — estrela maior e as quatro menores reduzidas a pontos
  zh: `<svg viewBox="0 0 20 14" aria-hidden="true"><rect width="20" height="14" fill="#de2910"/>
    <path d="M4.6 2.2 5.35 4.4 7.6 4.4 5.8 5.75 6.5 7.95 4.6 6.6 2.7 7.95 3.4 5.75 1.6 4.4 3.85 4.4Z" fill="#ffde00"/>
    <g fill="#ffde00"><circle cx="9.2" cy="2.1" r=".7"/><circle cx="10.9" cy="3.9" r=".7"/>
    <circle cx="10.9" cy="6.3" r=".7"/><circle cx="9.2" cy="8" r=".7"/></g></svg>`,

  // Coreia do Sul — taegeuk simplificado, sem os trigramas
  ko: `<svg viewBox="0 0 20 14" aria-hidden="true"><rect width="20" height="14" fill="#fff"/>
    <path d="M10 3a4 4 0 0 1 0 8 2 2 0 0 0 0-4 2 2 0 0 1 0-4Z" fill="#cd2e3a"/>
    <path d="M10 3a4 4 0 0 0 0 8 2 2 0 0 1 0-4 2 2 0 0 0 0-4Z" fill="#0047a0"/></svg>`,
};
