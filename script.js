(function(){
  'use strict';

  // Google Analytics (GA4) — the loader tag is in <head> of every page;
  // this is just the init call, kept out of an inline <script> so the
  // page's CSP can stay script-src 'self' + googletagmanager.com only,
  // with no 'unsafe-inline' needed.
  window.dataLayer = window.dataLayer || [];
  function gtag(){ window.dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', 'G-YE0TQJKPHE');

  // Content protection — deters casual right-click-save of photos and
  // copy-pasting marketing text. Doesn't stop dev tools, view-source, or
  // a screenshot; nothing client-side can. Real protection is the
  // copyright notice in the footer. Form fields are exempt so people can
  // still right-click to paste into the inquiry form.
  document.addEventListener('contextmenu', function(ev){
    var tag = ev.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    ev.preventDefault();
  });

  // Header scroll state
  var header = document.querySelector('.site-header');
  function onScroll(){
    if (!header) return;
    if (window.scrollY > 24) header.classList.add('is-scrolled');
    else header.classList.remove('is-scrolled');
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Mobile drawer
  var drawer = document.querySelector('.mobile-drawer');
  var toggleBtn = document.querySelector('.nav-toggle');
  var closeBtn = document.querySelector('.mobile-drawer .close-btn');
  var scrim = document.querySelector('.mobile-drawer .scrim');
  function openDrawer(){
    if (!drawer) return;
    drawer.classList.add('is-open');
    toggleBtn && toggleBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer(){
    if (!drawer) return;
    drawer.classList.remove('is-open');
    toggleBtn && toggleBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }
  toggleBtn && toggleBtn.addEventListener('click', openDrawer);
  closeBtn && closeBtn.addEventListener('click', closeDrawer);
  scrim && scrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function(ev){ if (ev.key === 'Escape') closeDrawer(); });
  document.querySelectorAll('.mobile-drawer nav a').forEach(function(a){ a.addEventListener('click', closeDrawer); });

  // Reveal on scroll — content is visible by default in CSS; this only
  // ever ADDS a hidden-then-fade-in state once JS proves it can deliver
  // it, so a slow/blocked/erroring script can never leave content stuck
  // invisible. A hard timeout is a second safety net on top of that.
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var revealEls = document.querySelectorAll('[data-reveal]');
  if (!reduceMotion && 'IntersectionObserver' in window && revealEls.length) {
    document.documentElement.classList.add('js-reveal');
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    // Stagger among siblings that share a parent, so a grid of cards cascades
    // but unrelated sections further down the page never inherit a delay.
    var seen = new Map();
    revealEls.forEach(function(el){
      var n = seen.get(el.parentNode) || 0;
      seen.set(el.parentNode, n + 1);
      el.style.transitionDelay = Math.min(n, 5) * 80 + 'ms';
      io.observe(el);
    });
    setTimeout(function(){
      revealEls.forEach(function(el){ el.classList.add('is-visible'); });
    }, 4000);
  }

  // Hero parallax — the photograph drifts slower than the page. rAF-throttled,
  // and capped at one viewport so it never detaches from the hero's bounds.
  var heroImg = document.querySelector('.hero-media img');
  if (heroImg && !reduceMotion) {
    var ticking = false;
    window.addEventListener('scroll', function(){
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function(){
        var y = Math.min(window.scrollY, window.innerHeight);
        heroImg.style.translate = '0 ' + (y * 0.18).toFixed(1) + 'px';
        ticking = false;
      });
    }, { passive: true });
  }

  // Before / after compare slider
  document.querySelectorAll('.compare').forEach(function(wrap){
    var afterWrap = wrap.querySelector('.after-wrap');
    var handle = wrap.querySelector('.compare-handle');
    var range = wrap.querySelector('input[type="range"]');
    if (!afterWrap || !range) return;
    function update(v){
      afterWrap.style.width = v + '%';
      if (handle) handle.style.left = v + '%';
    }
    update(range.value || 56);
    range.addEventListener('input', function(){ update(range.value); });
  });

  // Footer year
  document.querySelectorAll('[data-year]').forEach(function(el){ el.textContent = new Date().getFullYear(); });

  // Placeholder social links: styled and focusable, but deliberately go nowhere
  // until the studio supplies real profile URLs.
  document.querySelectorAll('a.is-placeholder').forEach(function(a){
    a.addEventListener('click', function(ev){ ev.preventDefault(); });
  });

  // Save contact — generates a .vcf client-side, no server involved
  var vcardBtn = document.getElementById('saveContactBtn');
  if (vcardBtn) {
    vcardBtn.addEventListener('click', function(){
      var lines = [
        'BEGIN:VCARD', 'VERSION:3.0',
        'N:;M&Z Design Chicago;;;',
        'FN:M&Z Design Chicago',
        'ORG:M&Z Design Chicago',
        'TEL;TYPE=WORK,VOICE:+17739681042',
        'EMAIL:mzdesign14@yahoo.com',
        'ADR;TYPE=WORK:;;;Chicago;IL;;US',
        'URL:https://test.mzdesignchicago.com/',
        'END:VCARD'
      ];
      var blob = new Blob([lines.join('\r\n')], { type: 'text/vcard' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'mz-design-chicago.vcf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Inquiry form — submits to /api/inquiry (Resend). If the request fails
  // for any reason (network down, endpoint misconfigured), we fall back to
  // a pre-filled mailto: so the inquiry is never simply lost.
  var inquiryForm = document.getElementById('inquiryForm');
  if (inquiryForm) {
    var tsField = document.getElementById('f-ts');
    if (tsField) tsField.value = Date.now();

    inquiryForm.addEventListener('submit', function(ev){
      ev.preventDefault();
      var f = inquiryForm.elements;
      var get = function(name){ return f[name] && f[name].value ? f[name].value.trim() : ''; };
      var name = get('name');
      var contact = get('contact');
      var projectType = get('projectType');
      var rooms = get('rooms');
      var budget = get('budget');
      var timeline = get('timeline');
      var message = get('message');
      var company = get('company'); // honeypot, always empty for real visitors

      var statusEl = document.getElementById('inquiryStatus');
      var submitBtn = inquiryForm.querySelector('button[type="submit"]');

      function mailtoFallback(){
        var subject = 'Design inquiry — ' + name + (projectType ? ' (' + projectType + ')' : '');
        var bodyLines = [
          'Name: ' + name,
          'Best way to reach you: ' + contact,
          projectType ? 'Project type: ' + projectType : '',
          rooms ? 'Rooms / areas: ' + rooms : '',
          budget ? 'Approximate budget: ' + budget : '',
          timeline ? 'Timeline: ' + timeline : '',
          '',
          'Project notes:',
          message
        ].filter(Boolean);
        return 'mailto:mzdesign14@yahoo.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(bodyLines.join('\n'));
      }

      if (submitBtn) submitBtn.disabled = true;
      if (statusEl){
        statusEl.textContent = 'Sending your inquiry…';
        statusEl.classList.add('is-visible');
      }

      fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, contact: contact, projectType: projectType, rooms: rooms, budget: budget, timeline: timeline, message: message, company: company, ts: tsField ? tsField.value : '' })
      }).then(function(resp){
        if (!resp.ok) throw new Error('send failed');
        return resp.json();
      }).then(function(data){
        if (!data || !data.ok) throw new Error('send failed');
        inquiryForm.reset();
        if (statusEl){
          statusEl.textContent = "Thank you — we've received your inquiry and will be in touch soon.";
        }
      }).catch(function(){
        if (statusEl){
          statusEl.innerHTML = 'Something went wrong sending that automatically. <a href="' + mailtoFallback() + '">Click here to send it as an email instead</a>.';
        }
      }).finally(function(){
        if (submitBtn) submitBtn.disabled = false;
      });
    });
  }

  /* ======================================================================
     MOTION LAYER
     Enabled only when JS is running and reduced motion is not requested.
     Nothing here is load-bearing: with it disabled the page is static and
     fully visible.
     ====================================================================== */
  var ANIM = !reduceMotion;
  if (ANIM) document.documentElement.classList.add('js-anim');

  var isCoarse = window.matchMedia('(pointer: coarse)').matches;
  var rafPending = false;
  var scrollHandlers = [];
  function onScrollFrame(fn){ scrollHandlers.push(fn); }
  function runScrollHandlers(){
    var y = window.scrollY;
    for (var i = 0; i < scrollHandlers.length; i++) scrollHandlers[i](y);
    rafPending = false;
  }
  window.addEventListener('scroll', function(){
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(runScrollHandlers);
  }, { passive: true });

  /* ---- Word-mask headline reveal ------------------------------------- */
  if (ANIM && 'IntersectionObserver' in window) {
    var heads = document.querySelectorAll(
      '.hero h1, .page-hero h1, .section-head h2, .cta-band h2, .split h2, .original-card h3, .flow-title, .designer h2'
    );

    function wrapWords(el){
      if (el.dataset.split === '1') return;
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function(node){
        if (!node.nodeValue.trim()) return;
        var frag = document.createDocumentFragment();
        node.nodeValue.split(/(\s+)/).forEach(function(part){
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          var outer = document.createElement('span'); outer.className = 'w';
          var inner = document.createElement('span'); inner.textContent = part;
          outer.appendChild(inner);
          frag.appendChild(outer);
        });
        node.parentNode.replaceChild(frag, node);
      });
      el.dataset.split = '1';
      var words = el.querySelectorAll('.w > span');
      for (var i = 0; i < words.length; i++){
        words[i].style.transitionDelay = Math.min(i, 16) * 48 + 'ms';
      }
    }

    var headObserver = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        headObserver.unobserve(entry.target);
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -40px 0px' });

    function initHeadings(){
      heads.forEach(function(el){
        wrapWords(el);
        // Anything already on screen reveals on the next frame rather than
        // waiting for the observer — the hero headline must never depend on
        // an IntersectionObserver callback to become visible.
        if (el.getBoundingClientRect().top < window.innerHeight) {
          requestAnimationFrame(function(){ el.classList.add('is-in'); });
        } else {
          headObserver.observe(el);
        }
      });
    }
    // Wait for the display face so words are measured at their real width.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(initHeadings);
    else initHeadings();

    // Safety net: if anything above stalls, show every headline anyway.
    setTimeout(function(){ heads.forEach(function(el){ el.classList.add('is-in'); }); }, 1500);
  }

  /* ---- Parallax inside framed media ---------------------------------- */
  if (ANIM && !isCoarse) {
    var pxEls = [];
    // Skip anything the WebGL layer takes over, and anything already hidden.
    document.querySelectorAll('.figure-wide img, .designer .frame img, .page-hero-media .frame img')
      .forEach(function(img){ img.setAttribute('data-parallax',''); pxEls.push(img); });

    if (pxEls.length) {
      onScrollFrame(function(){
        var vh = window.innerHeight;
        for (var i = 0; i < pxEls.length; i++){
          var el = pxEls[i];
          var r = el.getBoundingClientRect();
          if (r.bottom < -200 || r.top > vh + 200) continue;
          var progress = (r.top + r.height / 2 - vh / 2) / vh;   // -1 … 1
          el.style.translate = '0 ' + (progress * -18).toFixed(1) + 'px';
        }
      });
    }
  }

  /* ---- Scroll progress ----------------------------------------------- */
  if (ANIM) {
    var bar = document.createElement('div');
    bar.className = 'scroll-progress';
    document.body.appendChild(bar);
    onScrollFrame(function(y){
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(y / max, 1) : 0) + ')';
    });
  }

  /* ---- Magnetic controls --------------------------------------------- */
  if (ANIM && !isCoarse) {
    document.querySelectorAll('.btn-primary, .nav-toggle').forEach(function(btn){
      btn.setAttribute('data-magnetic','');
      btn.addEventListener('pointermove', function(ev){
        var r = btn.getBoundingClientRect();
        var dx = (ev.clientX - (r.left + r.width / 2)) * 0.22;
        var dy = (ev.clientY - (r.top + r.height / 2)) * 0.32;
        btn.style.translate = dx.toFixed(1) + 'px ' + dy.toFixed(1) + 'px';
      });
      btn.addEventListener('pointerleave', function(){ btn.style.translate = '0 0'; });
    });
  }

  /* ---- Page transitions ----------------------------------------------- */
  if (ANIM) {
    var veil = document.createElement('div');
    veil.className = 'page-fade';
    document.body.appendChild(veil);

    // Fade in from the veil on arrival.
    document.documentElement.classList.add('is-entering');
    function clearEntering(){ document.documentElement.classList.remove('is-entering'); }
    requestAnimationFrame(function(){ requestAnimationFrame(clearEntering); });
    // rAF never fires in a background/hidden tab, which would otherwise leave
    // the veil opaque over the whole page. Time-based fallback.
    setTimeout(clearEntering, 300);

    document.addEventListener('click', function(ev){
      if (ev.defaultPrevented || ev.button !== 0) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      var a = ev.target.closest ? ev.target.closest('a') : null;
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#') return;
      if (a.target === '_blank' || a.hasAttribute('download')) return;
      if (/^(mailto:|tel:)/.test(href)) return;
      var url;
      try { url = new URL(href, location.href); } catch (e) { return; }
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname) return;
      ev.preventDefault();
      document.documentElement.classList.add('is-leaving');
      setTimeout(function(){ location.href = url.href; }, 420);
    });

    // Restore on back/forward (bfcache serves the old DOM with the veil up).
    window.addEventListener('pageshow', function(){
      document.documentElement.classList.remove('is-leaving');
    });
  }


  /* ======================================================================
     SIGNATURE LAYER — cursor, intro, horizontal gallery
     ====================================================================== */

  /* ---- Custom cursor -------------------------------------------------- */
  function initCursor(){
    if (document.querySelector('.cursor')) return;
    if (isCoarse || window.innerWidth < 900) return;
    var cur = document.createElement('div');
    cur.className = 'cursor';
    cur.innerHTML = '<div class="cursor__ring"></div><div class="cursor__dot"></div><div class="cursor__label">View</div>';
    document.body.appendChild(cur);
    document.documentElement.classList.add('has-cursor');

    var cx = window.innerWidth / 2, cy = window.innerHeight / 2, rx = cx, ry = cy;
    var ring = cur.querySelector('.cursor__ring');
    var dot = cur.querySelector('.cursor__dot');
    var label = cur.querySelector('.cursor__label');

    document.addEventListener('pointermove', function(ev){ cx = ev.clientX; cy = ev.clientY; });
    (function cursorTick(){
      rx += (cx - rx) * 0.18; ry += (cy - ry) * 0.18;
      dot.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
      ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px)';
      label.style.transform = 'translate(' + rx + 'px,' + ry + 'px)';
      requestAnimationFrame(cursorTick);
    })();

    document.addEventListener('pointerover', function(ev){
      var t = ev.target;
      if (!t.closest) return;
      if (t.closest('.tile, .hscroll__item, .figure-wide, .compare')) {
        cur.classList.add('is-media'); cur.classList.remove('is-link');
        // Only .compare actually does something on interaction (drag to reveal);
        // the rest are plain photographs, so the label stays empty rather than
        // promising a click action ("View") that doesn't exist.
        label.textContent = t.closest('.compare') ? 'Drag' : '';
      } else if (t.closest('a, button, summary, input, textarea, select')) {
        cur.classList.add('is-link'); cur.classList.remove('is-media');
      } else {
        cur.classList.remove('is-media', 'is-link');
      }
    });
  }
  // Built on first mouse movement rather than at load: correct even when the
  // page starts in a background tab, and never shown to touch or keyboard users.
  if (ANIM) {
    window.addEventListener('pointermove', function onFirstMove(ev){
      if (ev.pointerType === 'touch') return;
      window.removeEventListener('pointermove', onFirstMove);
      initCursor();
    });
  }

  /* ---- Intro curtain ---------------------------------------------------
     Injected by JS, so a page without JS never sees it. Dismissed on load
     and, regardless of what happens, by a hard timeout. */
  if (ANIM && !sessionStorage.getItem('mz-intro-seen')) {
    var intro = document.createElement('div');
    intro.className = 'intro';
    intro.setAttribute('aria-hidden', 'true');
    intro.innerHTML =
      '<div class="intro__mark"><span>M&amp;Z</span></div>' +
      '<div class="intro__bar"><i></i></div>' +
      '<div class="intro__label">Chicago</div>';
    document.body.appendChild(intro);

    var fill = intro.querySelector('i');
    var pct = 0;
    var creep = setInterval(function(){
      pct = Math.min(pct + Math.random() * 18, 90);
      fill.style.transform = 'scaleX(' + (pct / 100) + ')';
    }, 130);

    function dismissIntro(){
      clearInterval(creep);
      fill.style.transform = 'scaleX(1)';
      sessionStorage.setItem('mz-intro-seen', '1');
      setTimeout(function(){ intro.classList.add('is-done'); }, 260);
      setTimeout(function(){ intro.remove(); }, 1200);
    }
    if (document.readyState === 'complete') setTimeout(dismissIntro, 450);
    else window.addEventListener('load', function(){ setTimeout(dismissIntro, 450); });
    setTimeout(dismissIntro, 3000);   // hard ceiling
  }

  /* ---- Horizontal scroll gallery -------------------------------------- */
  var hs = document.querySelector('.hscroll');
  if (hs && ANIM) {
    var track = hs.querySelector('.hscroll__track');
    var distance = 0;
    function sizeHScroll(){
      // Below 900px the CSS lays this out as a normal stacked list.
      if (window.innerWidth < 900 || window.innerWidth === 0) {
        hs.style.height = ''; distance = 0; return;
      }
      distance = Math.max(track.scrollWidth - window.innerWidth, 0);
      hs.style.height = (window.innerHeight + distance) + 'px';
    }
    sizeHScroll();
    window.addEventListener('resize', sizeHScroll);
    window.addEventListener('load', sizeHScroll);
    document.addEventListener('visibilitychange', sizeHScroll);
    if ('ResizeObserver' in window) new ResizeObserver(sizeHScroll).observe(track);
    onScrollFrame(function(){
      if (!distance) { track.style.translate = ''; return; }
      var span = hs.offsetHeight - window.innerHeight;
      if (span <= 0) return;
      var progress = Math.min(Math.max(-hs.getBoundingClientRect().top / span, 0), 1);
      track.style.translate = '-' + (progress * distance).toFixed(1) + 'px 0';
    });
  }

})();
