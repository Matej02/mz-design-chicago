/* ==========================================================================
   M&Z Design Chicago — WebGL media layer
   --------------------------------------------------------------------------
   Upgrades framed photographs into WebGL planes that ripple toward the
   cursor and warp with scroll velocity.

   Written against raw WebGL rather than a library: the whole effect is one
   textured quad with a displaced UV lookup, which does not justify shipping
   100kB+ of three.js to a client site.

   Fail-safe by construction:
   · the original <img> stays in the DOM for SEO, alt text and printing;
   · it is only hidden once a context, a compiled program AND a texture all
     succeed, so any failure at any step leaves the plain photograph;
   · nothing runs for reduced motion, coarse pointers or narrow screens;
   · planes only render while on screen.
   ========================================================================== */
(function () {
  'use strict';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.matchMedia('(pointer: coarse)').matches) return;
  if (window.innerWidth < 900) return;

  var VERT = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = aPos * 0.5 + 0.5;',
    '  vUv.y = 1.0 - vUv.y;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision mediump float;',
    'uniform sampler2D uTex;',
    'uniform vec2  uCover;',   // cover-fit scale
    'uniform vec2  uMouse;',
    'uniform float uHover;',
    'uniform float uTime;',
    'uniform float uVel;',
    'varying vec2 vUv;',
    'void main(){',
    // cover-fit the texture inside the plane
    '  vec2 uv = (vUv - 0.5) / uCover + 0.5;',
    // ripple radiating from the cursor, fading with distance
    '  vec2 d = uv - uMouse;',
    '  float dist = length(d);',
    '  float falloff = smoothstep(0.6, 0.0, dist);',
    '  float ripple = sin(dist * 22.0 - uTime * 3.2) * 0.018 * uHover * falloff;',
    '  uv += normalize(d + 1e-5) * ripple;',
    // scroll velocity bends the plane horizontally
    '  uv.y += sin(uv.x * 5.0 + uTime * 0.4) * uVel * 0.06;',
    // a touch of chromatic separation while hovering, for depth
    '  float ca = 0.0035 * uHover * falloff;',
    '  float r = texture2D(uTex, uv + vec2(ca, 0.0)).r;',
    '  vec4  g = texture2D(uTex, uv);',
    '  float b = texture2D(uTex, uv - vec2(ca, 0.0)).b;',
    '  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.92,0.88,0.80,1.0); return; }',
    '  gl_FragColor = vec4(r, g.g, b, 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
    return sh;
  }

  function createPlane(frame) {
    var img = frame.querySelector('img');
    if (!img) return null;

    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';

    var gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false })
          || canvas.getContext('experimental-webgl');
    if (!gl) return null;

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    } catch (e) {
      return null;                       // tainted or undecoded — keep the <img>
    }

    var U = {
      cover: gl.getUniformLocation(prog, 'uCover'),
      mouse: gl.getUniformLocation(prog, 'uMouse'),
      hover: gl.getUniformLocation(prog, 'uHover'),
      time:  gl.getUniformLocation(prog, 'uTime'),
      vel:   gl.getUniformLocation(prog, 'uVel')
    };

    // Only now is it safe to swap the photograph for the canvas.
    frame.appendChild(canvas);
    img.style.visibility = 'hidden';

    // A lost context would otherwise leave an empty frame with the photograph
    // still hidden behind it. Put the photograph back instead.
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      state.visible = false;
      img.style.visibility = '';
      canvas.style.display = 'none';
    });
    canvas.addEventListener('webglcontextrestored', function () {
      img.style.visibility = 'hidden';
      canvas.style.display = '';
      state.visible = true;
      resize();
    });

    var state = {
      frame: frame, gl: gl, canvas: canvas,
      mx: 0.5, my: 0.5, hover: 0, hoverTarget: 0, visible: false
    };

    function resize() {
      var r = frame.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = Math.round(r.width  * dpr);
      canvas.height = Math.round(r.height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);

      // cover-fit: scale the shorter axis so the photo fills without stretching
      var planeAspect = r.width / r.height;
      var imgAspect = (img.naturalWidth || 1) / (img.naturalHeight || 1);
      if (imgAspect > planeAspect) gl.uniform2f(U.cover, planeAspect / imgAspect, 1);
      else                         gl.uniform2f(U.cover, 1, imgAspect / planeAspect);
    }
    state.resize = resize;
    resize();

    frame.addEventListener('pointerenter', function () { state.hoverTarget = 1; });
    frame.addEventListener('pointerleave', function () { state.hoverTarget = 0; });
    frame.addEventListener('pointermove', function (ev) {
      var r = frame.getBoundingClientRect();
      state.mx = (ev.clientX - r.left) / r.width;
      state.my = 1 - (ev.clientY - r.top) / r.height;
    });

    state.draw = function (t, vel) {
      state.hover += (state.hoverTarget - state.hover) * 0.08;
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform2f(U.mouse, state.mx, state.my);
      gl.uniform1f(U.hover, state.hover);
      gl.uniform1f(U.time, t);
      gl.uniform1f(U.vel, vel);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    return state;
  }

  function boot() {
    var frames = document.querySelectorAll('.hscroll__item .frame, .mosaic .tile .frame, .page-hero-media .frame');
    if (!frames.length) return;

    var ro = ('ResizeObserver' in window)
      ? new ResizeObserver(function (entries) {
          entries.forEach(function (e) {
            for (var i = 0; i < planes.length; i++) {
              if (planes[i].frame === e.target) planes[i].resize();
            }
          });
        })
      : null;

    var planes = [];

    // Render only what is on screen. Created up front so planes built later
    // — every lazily-loaded photograph — are observed the moment they exist.
    var io = ('IntersectionObserver' in window)
      ? new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            for (var i = 0; i < planes.length; i++) {
              if (planes[i].frame === e.target) planes[i].visible = e.isIntersecting;
            }
          });
        }, { rootMargin: '150px' })
      : null;

    function register(frame) {
      var p = createPlane(frame);
      if (!p) return;                       // failed: the <img> simply stays
      planes.push(p);
      if (ro) ro.observe(p.frame);
      if (io) io.observe(p.frame);
      else p.visible = true;
      document.documentElement.classList.add('has-webgl');
    }

    frames.forEach(function (frame) {
      var img = frame.querySelector('img');
      if (!img) return;
      // Most photographs are loading="lazy", so they are not decoded at boot.
      if (img.complete && img.naturalWidth) register(frame);
      else img.addEventListener('load', function () { register(frame); }, { once: true });
    });

    var lastY = window.scrollY, vel = 0;
    window.addEventListener('scroll', function () {
      vel = Math.max(-1, Math.min(1, (window.scrollY - lastY) / 60));
      lastY = window.scrollY;
    }, { passive: true });

    window.addEventListener('resize', function () { planes.forEach(function (p) { p.resize(); }); });

    (function loop(ts) {
      var t = (ts || 0) / 1000;
      vel *= 0.92;
      for (var i = 0; i < planes.length; i++) {
        if (planes[i].visible) planes[i].draw(t, vel);
      }
      requestAnimationFrame(loop);
    })(0);

  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
