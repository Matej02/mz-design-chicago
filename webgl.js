/* ==========================================================================
   M&Z Design Chicago — WebGL gallery
   --------------------------------------------------------------------------
   ONE WebGL context renders every plane in the gallery.

   The previous version created a context per photograph (seven of them) and
   the scroll layer wrote `transform: skewY()` onto each containing element
   every frame, which forced the compositor to re-rasterise seven canvases
   sixty times a second. That is what made the page stutter.

   Here the only per-frame work is: read each plane's rect, upload a handful
   of uniforms, draw. No DOM writes at all — every bit of motion (hover
   ripple, scroll warp, entrance) happens inside the shader, where it is
   effectively free.

   Fail-safe: the <img> stays in the DOM and is only hidden once a context,
   a linked program and its texture have all succeeded. Any failure, a lost
   context, reduced motion, a coarse pointer or a narrow screen all leave the
   plain photographs exactly as they were.
   ========================================================================== */
(function () {
  'use strict';

  // Guards are evaluated against a REAL viewport. A page opened in a
  // background tab reports innerWidth 0, and checking eagerly would disable
  // the gallery for the entire visit — the same trap that bit the scroll
  // layer twice. Wait for a genuine measurement instead.
  function eligible() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (window.matchMedia('(pointer: coarse)').matches) return false;
    return window.innerWidth >= 900;
  }

  var started = false;
  function attempt() {
    if (started) return;
    if (!window.innerWidth) return;          // no viewport yet — try again later
    if (!eligible()) return;
    started = true;
    cleanupWaiters();
    boot();
  }
  function cleanupWaiters() {
    window.removeEventListener('resize', attempt);
    window.removeEventListener('load', attempt);
    document.removeEventListener('visibilitychange', attempt);
  }
  window.addEventListener('resize', attempt);
  window.addEventListener('load', attempt);
  document.addEventListener('visibilitychange', attempt);

  var VERT = [
    // Must match the fragment shader's precision: uVel is declared in both,
    // and GLSL refuses to link a uniform that differs in precision. Vertex
    // shaders default to highp, fragment shaders to nothing, so state it.
    'precision mediump float;',
    'attribute vec2 aPos;',
    'uniform vec4 uRect;',     // x, y, w, h in clip space
    'uniform float uVel;',
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = vec2(aPos.x, 1.0 - aPos.y);',
    '  vec2 p = uRect.xy + aPos * uRect.zw;',
    // the plane itself bows with scroll velocity — cheaper and smoother than
    // skewing DOM nodes, and it cannot touch layout
    '  p.y += sin(aPos.x * 3.1415926) * uVel * 0.05;',
    '  gl_Position = vec4(p, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision mediump float;',
    'uniform sampler2D uTex;',
    'uniform vec2  uCover;',
    'uniform vec2  uMouse;',
    'uniform float uHover;',
    'uniform float uTime;',
    'uniform float uVel;',
    'uniform float uIn;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec2 uv = (vUv - 0.5) / uCover + 0.5;',
    '  vec2 d = uv - uMouse;',
    '  float dist = length(d);',
    '  float falloff = smoothstep(0.65, 0.0, dist);',
    '  float ripple = sin(dist * 20.0 - uTime * 3.0) * 0.022 * uHover * falloff;',
    '  uv += normalize(d + 1e-5) * ripple;',
    '  uv.y += sin(uv.x * 4.0 + uTime * 0.3) * uVel * 0.03;',
    // entrance: the photograph slides up behind its own frame as it reveals
    '  uv.y += (1.0 - uIn) * 0.22;',
    '  float ca = 0.004 * uHover * falloff;',
    '  float r = texture2D(uTex, uv + vec2(ca, 0.0)).r;',
    '  vec4  g = texture2D(uTex, uv);',
    '  float b = texture2D(uTex, uv - vec2(ca, 0.0)).b;',
    '  vec3 col = vec3(r, g.g, b);',
    // warm lift under the cursor, so hovering reads as lit rather than filtered
    '  col += vec3(0.16, 0.12, 0.06) * uHover * falloff;',
    '  float edge = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);',
    '  gl_FragColor = vec4(col, uIn * edge);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
    return sh;
  }

  function boot() {
    var pin = document.querySelector('.hscroll__pin');
    var frames = pin ? pin.querySelectorAll('.hscroll__item .frame') : [];
    if (!pin || !frames.length) return;

    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';

    var gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false })
          || canvas.getContext('experimental-webgl');
    if (!gl) return;

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0, 1,0, 0,1, 1,1]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    var U = {};
    ['uRect','uCover','uMouse','uHover','uTime','uVel','uIn'].forEach(function (n) {
      U[n] = gl.getUniformLocation(prog, n);
    });

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    var planes = [];

    function addPlane(frame) {
      var img = frame.querySelector('img');
      if (!img || !img.naturalWidth) return;
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      } catch (e) { return; }

      var p = {
        frame: frame, img: img, tex: tex,
        aspect: img.naturalWidth / img.naturalHeight,
        mx: 0.5, my: 0.5, hover: 0, target: 0, reveal: 0, rect: null
      };
      frame.addEventListener('pointerenter', function () { p.target = 1; });
      frame.addEventListener('pointerleave', function () { p.target = 0; });
      frame.addEventListener('pointermove', function (ev) {
        var r = p.rect; if (!r) return;
        p.mx = (ev.clientX - r.left) / r.width;
        p.my = 1 - (ev.clientY - r.top) / r.height;
      });
      planes.push(p);
      document.documentElement.classList.add('has-webgl');
    }

    Array.prototype.forEach.call(frames, function (frame) {
      var img = frame.querySelector('img');
      if (!img) return;
      if (img.complete && img.naturalWidth) addPlane(frame);
      else img.addEventListener('load', function () { addPlane(frame); }, { once: true });
    });

    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      planes.forEach(function (p) { p.img.style.visibility = ''; });
      canvas.style.display = 'none';
      document.documentElement.classList.remove('has-webgl');
    });

    pin.appendChild(canvas);

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = 0, ch = 0;
    function resize() {
      var r = pin.getBoundingClientRect();
      if (!r.width || !r.height) return;
      cw = r.width; ch = r.height;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('load', resize);

    var lastY = window.scrollY, vel = 0, running = true;

    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
      lastY = window.scrollY;
      if (running) requestAnimationFrame(loop);
    });

    function loop(ts) {
      if (!running) return;
      requestAnimationFrame(loop);
      if (!planes.length) return;
      if (!cw || !ch) { resize(); if (!cw || !ch) return; }

      var y = window.scrollY;
      vel += ((y - lastY) / 50 - vel) * 0.25;
      vel = Math.max(-1.2, Math.min(1.2, vel));
      lastY = y;

      var pinRect = pin.getBoundingClientRect();
      if (pinRect.bottom < -100 || pinRect.top > window.innerHeight + 100) return;
      if (Math.abs(pinRect.width - cw) > 1 || Math.abs(pinRect.height - ch) > 1) resize();

      gl.clear(gl.COLOR_BUFFER_BIT);
      var t = (ts || 0) / 1000;

      for (var i = 0; i < planes.length; i++) {
        var p = planes[i];
        var r = p.frame.getBoundingClientRect();
        p.rect = r;
        if (r.right < pinRect.left - 240 || r.left > pinRect.right + 240) continue;

        // DOM rect -> clip space, relative to the canvas
        var x = (r.left - pinRect.left) / cw * 2 - 1;
        var yTop = 1 - (r.top - pinRect.top) / ch * 2;
        var w = r.width / cw * 2;
        var h = r.height / ch * 2;

        p.hover += (p.target - p.hover) * 0.09;
        p.reveal += ((r.left < window.innerWidth ? 1 : 0) - p.reveal) * 0.08;

        var planeAspect = r.width / r.height;
        if (p.aspect > planeAspect) gl.uniform2f(U.uCover, planeAspect / p.aspect, 1);
        else                        gl.uniform2f(U.uCover, 1, p.aspect / planeAspect);

        gl.uniform4f(U.uRect, x, yTop - h, w, h);
        gl.uniform2f(U.uMouse, p.mx, p.my);
        gl.uniform1f(U.uHover, p.hover);
        gl.uniform1f(U.uTime, t);
        gl.uniform1f(U.uVel, vel);
        gl.uniform1f(U.uIn, Math.min(p.reveal, 1));
        gl.bindTexture(gl.TEXTURE_2D, p.tex);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        if (!p.painted) { p.painted = true; p.img.style.visibility = 'hidden'; }
      }
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt);
  else attempt();
})();
