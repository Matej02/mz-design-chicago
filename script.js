(function(){
  'use strict';

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

  // Reveal on scroll
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var revealEls = document.querySelectorAll('[data-reveal]');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach(function(el){ el.classList.add('is-visible'); });
  } else {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach(function(el, i){
      el.style.transitionDelay = (Math.min(i % 4, 3) * 90) + 'ms';
      io.observe(el);
    });
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
        'EMAIL:m&zdesign@yahoo.com',
        'ADR;TYPE=WORK:;;;Chicago;IL;;US',
        'URL:https://mz-design-chicago.vercel.app/',
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

  // Inquiry form — composes a pre-filled email, no backend required
  var inquiryForm = document.getElementById('inquiryForm');
  if (inquiryForm) {
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

      var mailto = 'mailto:m&zdesign@yahoo.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(bodyLines.join('\n'));
      var statusEl = document.getElementById('inquiryStatus');
      if (statusEl){
        statusEl.textContent = 'Opening your email app with these details filled in — just hit send.';
        statusEl.classList.add('is-visible');
      }
      window.location.href = mailto;
    });
  }
})();
