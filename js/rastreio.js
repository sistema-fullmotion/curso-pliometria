/* Rastreio de origem dos cursos Fullmotion.
 *
 * O problema que isto resolve: o anuncio manda a pessoa para /guia/ com UTM na
 * URL, ela navega para a pagina de vendas e clica para a Kiwify. Sem isto, a
 * UTM morre na primeira navegacao e a venda chega na Kiwify sem origem.
 *
 * O que faz, em ordem:
 *   1. na primeira pagina, guarda UTM e fbclid na sessao
 *   2. reescreve os links internos e os da Kiwify para carregarem os parametros
 *   3. dispara InitiateCheckout no clique que sai para a Kiwify
 */
(function () {
  'use strict';

  var CHAVE = 'fm_origem';
  var CAMPOS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
                'utm_term', 'fbclid', 'gclid'];

  function guardado() {
    try { return JSON.parse(sessionStorage.getItem(CHAVE) || '{}'); }
    catch (e) { return {}; }
  }

  // a primeira visita manda. assim o criativo que trouxe a pessoa nao e
  // sobrescrito se ela voltar depois por outro caminho.
  function capturar() {
    var atual = guardado();
    if (Object.keys(atual).length) return atual;

    var p = new URLSearchParams(location.search);
    var novo = {};
    CAMPOS.forEach(function (c) {
      var v = p.get(c);
      if (v) novo[c] = v;
    });
    if (!Object.keys(novo).length) return {};

    novo.fm_entrada = location.pathname;
    try { sessionStorage.setItem(CHAVE, JSON.stringify(novo)); } catch (e) {}
    return novo;
  }

  // fm_entrada fica so na sessao, para saber por qual pagina a pessoa chegou.
  // nao vai na URL, senao suja todo link do site.
  function anexar(url, origem) {
    try {
      var u = new URL(url, location.href);
      CAMPOS.forEach(function (c) {
        if (origem[c] && !u.searchParams.has(c)) u.searchParams.set(c, origem[c]);
      });
      return u.toString();
    } catch (e) { return url; }
  }

  // arquivo para baixar nao precisa de UTM, so ficaria feio no link
  function ehArquivo(href) {
    return /\.(pdf|zip|jpe?g|png|webp|svg|mp4|mov|docx?|xlsx?)($|\?)/i.test(href);
  }

  function ehKiwify(href) {
    return /(^|\.)kiwify\.com\.br/.test(href);
  }

  function propagar(origem) {
    document.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(mailto|tel|javascript):/i.test(href)) return;

      var externo;
      try { externo = new URL(href, location.href).host !== location.host; }
      catch (e) { return; }

      var kiwify = ehKiwify(href);
      if (externo && !kiwify) return;   // nao mexe em link de terceiro
      if (ehArquivo(href)) return;

      if (Object.keys(origem).length) a.setAttribute('href', anexar(href, origem));

      if (kiwify && !a.dataset.fmCheckout) {
        a.dataset.fmCheckout = '1';
        a.addEventListener('click', function () {
          if (typeof fbq === 'function') {
            // a pagina declara window.FM_PRODUTO com preco e id do produto.
            // Sem valor, a Meta conta a intencao mas nao sabe quanto ela vale,
            // e e o valor que faz ela procurar comprador em vez de curioso.
            var dados = {
              content_name: document.title,
              source: origem.utm_campaign || 'direto'
            };
            var p = window.FM_PRODUTO;
            if (p) {
              for (var k in p) { if (p.hasOwnProperty(k)) dados[k] = p[k]; }
            }
            fbq('track', 'InitiateCheckout', dados);
          }
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push({
            event: 'checkout_kiwify',
            destino: a.getAttribute('href'),
            campanha: origem.utm_campaign || 'direto'
          });
        });
      }
    });
  }

  function iniciar() {
    var origem = capturar();
    propagar(origem);
    // paginas longas montam secao depois do load; reaplica uma vez
    setTimeout(function () { propagar(origem); }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
