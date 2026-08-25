(function () {
  'use strict';

  var EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
  var NAV_MS = 620;
  var DETAIL_MS = 750;
  var MOBILE_QUERY = '(max-width: 640px)';
  var TOTAL_FRAMES = 72;
  var FRAMES_PER_CLICK = 6;
  var DRAG_SENSITIVITY = 0.15;

  var dolls = [];
  var cur = 0;
  var mode = 'idle';
  var busy = false;

  var track = document.getElementById('track');
  var sliderContainer = document.getElementById('sliderContainer');
  var spotlight = document.getElementById('spotlight');
  var hitPrev = document.getElementById('hitPrev');
  var hitNext = document.getElementById('hitNext');
  var detailBackdrop = document.getElementById('detailBackdrop');
  var detailInfo = document.getElementById('detailInfo');
  var detailScroll = document.getElementById('detailScroll');
  var detailClose = document.getElementById('detailClose');
  var detailShare = document.getElementById('detailShare');
  var detailName = document.getElementById('detailName');
  var detailDesc = document.getElementById('detailDesc');
  var detailSpecs = document.getElementById('detailSpecs');
  var prevBtn = document.getElementById('prevBtn');
  var nextBtn = document.getElementById('nextBtn');
  var header = document.getElementById('header');
  var navArrows = document.getElementById('navArrows');
  var dotsEl = document.getElementById('dots');
  var slideCounter = document.getElementById('slideCounter');
  var rotateHint = document.getElementById('rotateHint');
  var particles = document.getElementById('particles');
  var preloader = document.getElementById('preloader');
  var preloaderFill = document.getElementById('preloaderFill');
  var preloaderPercent = document.getElementById('preloaderPercent');

  var drag = null;
  var scrub = null;
  var scrubJustMoved = false;
  var mq = window.matchMedia(MOBILE_QUERY);

  var panY = 0;
  var PAN_WHEEL_SENSITIVITY = 0.6;
  // How far (as a fraction of the card's height) the view can be scrolled
  // down toward the doll's feet, or up past the default crop, in either
  // direction from the default top-anchored framing.
  var PAN_DOWN_FRACTION = 0.3;
  var PAN_UP_FRACTION = 0.15;

  var loadTotal = 1; // dolls.json fetch
  var loadDone = 0;

  init();

  function init() {
    createParticles();
    var hashIdx = -1;
    load()
      .then(function () {
        bumpProgress();
        enrichDolls();
        render();
        buildDots();
        bind();
        hashIdx = getDollIndexFromHash();
        cur = hashIdx >= 0 ? hashIdx : 0;
        return warmPriorityImages();
      })
      .catch(function () {})
      .then(function () {
        paint(false);
        preloadAdjacent();
        // Mobile can rotate the active doll before opening its detail view,
        // so its frames need to be ready ahead of that drag too.
        if (isMobile() && dolls[cur]) preloadFrames(dolls[cur]);
        hidePreloader();
        if (hashIdx >= 0) {
          // A #doll=<id> link should land straight on that doll's detail view
          setTimeout(openDetail, 700);
        } else if (isMobile()) {
          // On mobile, rotating happens right on the idle carousel — hint at
          // it early since desktop only discovers it once detail is open
          setTimeout(maybeShowRotateHint, 700);
        }
      });
  }

  function bumpProgress() {
    loadDone++;
    updateProgress();
  }

  function updateProgress() {
    var pct = loadTotal ? Math.min(100, Math.round(loadDone / loadTotal * 100)) : 0;
    if (preloaderFill) preloaderFill.style.width = pct + '%';
    if (preloaderPercent) preloaderPercent.textContent = pct + '%';
  }

  /* ── Rotate hint ────────────────────────────── */

  var ROTATE_HINT_KEY = 'idolls-rotate-hint-seen';
  var rotateHintTimer = null;

  function maybeShowRotateHint() {
    if (!rotateHint) return;
    try { if (localStorage.getItem(ROTATE_HINT_KEY)) return; } catch (e) {}
    rotateHint.classList.add('visible');
    clearTimeout(rotateHintTimer);
    rotateHintTimer = setTimeout(dismissRotateHint, 4500);
  }

  function dismissRotateHint() {
    if (!rotateHint) return;
    clearTimeout(rotateHintTimer);
    rotateHint.classList.remove('visible');
    try { localStorage.setItem(ROTATE_HINT_KEY, '1'); } catch (e) {}
  }

  function enrichDolls() {
    dolls.forEach(function (doll) {
      doll._imgFolder = 'img/doll' + doll.id + '/';
      doll._ext = '.webp';
      doll._totalFrames = TOTAL_FRAMES;
    });
  }

  function framePath(doll, num) {
    var pad = String(num).padStart(3, '0');
    return doll._imgFolder + 'doll' + doll.id + '_' + pad + doll._ext;
  }

  function warmPriorityImages() {
    var n = dolls.length;
    if (!n) return Promise.resolve();

    var idxs = [0];
    if (n > 1) idxs.push(1);
    if (n > 2) idxs.push(n - 1);
    if (cur !== 0) idxs.push(cur);
    idxs = idxs.filter(function (v, i) { return idxs.indexOf(v) === i; });

    loadTotal += idxs.length;
    updateProgress();

    var waits = idxs.map(function (idx) {
      var card = findCard(idx);
      var img = card && card.querySelector('.card-img');
      if (!img) { bumpProgress(); return Promise.resolve(); }
      return new Promise(function (resolve) {
        if (img.complete && img.naturalWidth) { bumpProgress(); resolve(); return; }
        var timer = setTimeout(finish, 8000);
        function finish() {
          img.removeEventListener('load', finish);
          img.removeEventListener('error', finish);
          clearTimeout(timer);
          bumpProgress();
          resolve();
        }
        img.addEventListener('load', finish);
        img.addEventListener('error', finish);
      });
    });

    return Promise.all(waits);
  }

  function preloadAdjacent() {
    var n = dolls.length;
    if (n < 2) return;
    var offsets = [-2, -1, 1, 2];
    offsets.forEach(function (off) {
      var idx = ((cur + off) % n + n) % n;
      var card = findCard(idx);
      var img = card && card.querySelector('.card-img');
      if (img && (!img.complete || !img.naturalWidth)) {
        var d = dolls[idx];
        var preImg = new Image();
        preImg.src = framePath(d, 1);
      }
    });
  }

  var FAN_RADIUS = 10;
  var BACKGROUND_BATCH = 8;
  var _framePreloadCache = {};

  // Loads the frames nearest to aroundFrame right away (enough for smooth
  // scrubbing immediately), then trickles the rest in small idle-time
  // batches instead of firing all TOTAL_FRAMES requests at once.
  function preloadFrames(doll, aroundFrame) {
    var id = doll.id;
    if (_framePreloadCache[id]) return;
    _framePreloadCache[id] = true;

    var order = frameLoadOrder(aroundFrame || 0);
    var priorityCount = Math.min(order.length, FAN_RADIUS * 2 + 1);
    var i;
    for (i = 0; i < priorityCount; i++) loadFrameImage(doll, order[i]);
    loadFramesInBackground(doll, order.slice(priorityCount));
  }

  function loadFrameImage(doll, frameNum) {
    var p = new Image();
    p.src = framePath(doll, frameNum);
  }

  function loadFramesInBackground(doll, frames) {
    var i = 0;
    function step() {
      var end = Math.min(i + BACKGROUND_BATCH, frames.length);
      for (; i < end; i++) loadFrameImage(doll, frames[i]);
      if (i < frames.length) {
        if (window.requestIdleCallback) {
          requestIdleCallback(step, { timeout: 500 });
        } else {
          setTimeout(step, 120);
        }
      }
    }
    if (frames.length) step();
  }

  // 1-indexed frame numbers ordered by circular distance from aroundFrame
  // (a 0-indexed frame index), nearest first.
  function frameLoadOrder(aroundFrame) {
    var order = [];
    var seen = {};
    function add(raw) {
      var zeroIdx = ((raw % TOTAL_FRAMES) + TOTAL_FRAMES) % TOTAL_FRAMES;
      var f = zeroIdx + 1;
      if (!seen[f]) { seen[f] = true; order.push(f); }
    }
    var maxDist = Math.ceil(TOTAL_FRAMES / 2);
    for (var d = 0; d <= maxDist; d++) {
      add(aroundFrame + d);
      if (d > 0) add(aroundFrame - d);
    }
    return order;
  }

  function hidePreloader() {
    if (!preloader) return;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        preloader.classList.add('hidden');
        setTimeout(function () {
          if (preloader && preloader.parentNode) preloader.parentNode.removeChild(preloader);
        }, 650);
      });
    });
  }

  function isMobile() {
    return mq.matches;
  }

  function createParticles() {
    for (var i = 0; i < 48; i++) {
      var p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDuration = 8 + Math.random() * 12 + 's';
      p.style.animationDelay = Math.random() * 10 + 's';
      p.style.width = p.style.height = (1.5 + Math.random() * 2.5) + 'px';
      particles.appendChild(p);
    }
  }

  function load() {
    return fetch('data/dolls.json')
      .then(function (r) { return r.json(); })
      .then(function (d) { dolls = d; })
  }

  /* ── Shareable link (#doll=<id>) ────────────── */

  function getDollIndexFromHash() {
    var m = /doll=(\d+)/.exec(location.hash);
    if (!m) return -1;
    var id = parseInt(m[1], 10);
    for (var i = 0; i < dolls.length; i++) {
      if (dolls[i].id === id) return i;
    }
    return -1;
  }

  function updateUrlHash(doll) {
    if (!doll) return;
    var newHash = '#doll=' + doll.id;
    if (location.hash !== newHash) history.replaceState(null, '', newHash);
  }

  function clearUrlHash() {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }

  function onShareClick(e) {
    e.stopPropagation();
    var doll = dolls[cur];
    if (!doll) return;
    var url = location.origin + location.pathname + location.search + '#doll=' + doll.id;
    copyToClipboard(url, function () {
      if (!detailShare) return;
      detailShare.classList.remove('copied');
      void detailShare.offsetWidth; // restart the CSS animation on repeat clicks
      detailShare.classList.add('copied');
      clearTimeout(detailShare._copiedTimer);
      detailShare._copiedTimer = setTimeout(function () {
        detailShare.classList.remove('copied');
      }, 1800);
    });
  }

  function copyToClipboard(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, done);
      return;
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    done();
  }

  /* ── Render ─────────────────────────────────── */

  var CARD_NAME_FONT_SIZE = 14;
  var CARD_NAME_LINE_H = CARD_NAME_FONT_SIZE + 2;
  var CARD_NAME_SVG_W = 300;
  var CARD_NAME_CURVE_OFFSET = 70; // arc depth for the textPath control point

  function wrapNameLines(nameText) {
    var rawLen = nameText.replace(/&[^;]+;/g, 'x').length;
    var lines = [];
    if (rawLen > 20) {
      var words = nameText.split(' ');
      var line = '';
      for (var w = 0; w < words.length; w++) {
        var test = line ? line + ' ' + words[w] : words[w];
        if (test.replace(/&[^;]+;/g, 'x').length > 18 && line) {
          lines.push(line);
          line = words[w];
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
    } else {
      lines.push(nameText);
    }
    return lines;
  }

  function render() {
    track.innerHTML = '';

    var nameLines = dolls.map(function (doll) {
      return wrapNameLines(escapeHtml(doll.name));
    });
    // Same viewBox height for every card, regardless of how many lines its
    // name wraps to, so the name label sits at a consistent size/position
    var maxLines = nameLines.reduce(function (m, lines) { return Math.max(m, lines.length); }, 1);
    var svgW = CARD_NAME_SVG_W;
    var svgH = maxLines * CARD_NAME_LINE_H + 30;
    var midX = svgW / 2;

    dolls.forEach(function (doll, idx) {
      var card = document.createElement('div');
      card.className = 'doll-card';
      card.dataset.realIndex = idx;

      var lines = nameLines[idx];
      var lineOffset = (maxLines - lines.length) / 2; // vertically centers shorter names
      var defs = '';
      var tspans = '';
      for (var l = 0; l < lines.length; l++) {
        var pid = 'arc-' + idx + '-' + l;
        var py = 8 + (lineOffset + l) * CARD_NAME_LINE_H;
        var curveY = py + CARD_NAME_CURVE_OFFSET;
        defs += '<path id="' + pid + '" d="M 4,' + py + ' Q ' + midX + ',' + curveY + ' ' + (svgW - 4) + ',' + py + '" fill="none"/>';
        tspans += '<text style="font-size:' + CARD_NAME_FONT_SIZE + 'px"><textPath href="#' + pid + '" startOffset="50%" text-anchor="middle">' + lines[l] + '</textPath></text>';
      }
      card.innerHTML =
        '<img class="card-img" src="' + framePath(doll, 1) + '" alt="" draggable="false" data-frame="0">' +
        '<div class="card-sheen"></div>' +
        '<svg class="card-name" viewBox="0 0 ' + svgW + ' ' + svgH + '" preserveAspectRatio="xMidYMid meet">' +
          '<defs>' + defs + '</defs>' + tspans +
        '</svg>';

      var img = card.querySelector('.card-img');
      img.addEventListener('error', function () {
        img.style.display = 'none';
      });

      bindFrameScrub(card, img, idx);

      card.addEventListener('click', function (e) {
        if (drag && drag.moved) return;
        if (scrubJustMoved) { scrubJustMoved = false; return; }
        onCardClick(idx, e);
      });

      track.appendChild(card);
    });
  }

  /* ── Frame scrubbing via drag ──────────────── */

  function bindFrameScrub(card, img, idx) {
    card.addEventListener('pointerdown', function (e) {
      if (idx !== cur) return;
      // On mobile, rotating the active doll works before opening detail too;
      // switching between dolls there happens only via the arrow buttons.
      if (mode !== 'detail' && !(mode === 'idle' && isMobile())) return;
      e.preventDefault();
      // A drag on a different card (e.g. rotating, then paging via the arrow
      // buttons) can leave this set from a gesture that never reached a
      // click here to consume it — clear it so a fresh tap isn't swallowed.
      scrubJustMoved = false;
      scrub = {
        pointerId: e.pointerId,
        card: card,
        img: img,
        idx: idx,
        startX: e.clientX,
        startY: e.clientY,
        startFrame: parseInt(img.dataset.frame, 10) || 0,
        startPan: panY,
        axis: null,
        moved: false
      };
      try { card.setPointerCapture(e.pointerId); } catch (err) {}
    });

    card.addEventListener('pointermove', function (e) {
      if (!scrub || scrub.pointerId !== e.pointerId) return;
      var dx = e.clientX - scrub.startX;
      var dy = e.clientY - scrub.startY;
      // In detail mode a drag can either rotate the doll (horizontal) or
      // pan the crop (vertical) — lock to whichever the gesture committed
      // to first so it doesn't wobble between the two. Outside detail mode
      // (mobile idle) only horizontal ever counted, and still does — a
      // vertical wobble there shouldn't swallow what was meant as a tap.
      if (!scrub.axis && mode === 'detail' && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        scrub.axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
        scrub.moved = true;
        dismissRotateHint();
      } else if (!scrub.axis && mode !== 'detail' && Math.abs(dx) > 4) {
        scrub.axis = 'x';
        scrub.moved = true;
        dismissRotateHint();
      }
      if (!scrub.moved) return;
      if (scrub.axis === 'y') {
        setPan(scrub.card, scrub.startPan + dy);
        return;
      }
      var frameDelta = Math.round(dx * DRAG_SENSITIVITY);
      var newFrame = ((scrub.startFrame + frameDelta) % TOTAL_FRAMES + TOTAL_FRAMES) % TOTAL_FRAMES;
      setFrame(scrub.img, newFrame, scrub.idx);
    });

    card.addEventListener('pointerup', function (e) {
      if (!scrub || scrub.pointerId !== e.pointerId) return;
      var moved = scrub.moved;
      scrub = null;
      if (moved) scrubJustMoved = true;
    });

    card.addEventListener('pointercancel', function (e) {
      if (!scrub || scrub.pointerId !== e.pointerId) return;
      scrub = null;
    });
  }

  /* ── Detail: vertical pan ─────────────────────
     Lets a viewer scroll/drag the zoomed detail image up to see more of
     the doll below the default top-anchored crop, instead of us having to
     guess a single framing that works for every doll's own photo. */

  function setPan(card, value) {
    if (!card) return;
    var h = card.offsetHeight;
    panY = Math.max(-h * PAN_DOWN_FRACTION, Math.min(h * PAN_UP_FRACTION, value));
    card.style.setProperty('--pan-y', panY + 'px');
  }

  function panDetail(deltaY) {
    var card = findCard(cur);
    if (!card) return;
    setPan(card, panY - deltaY * PAN_WHEEL_SENSITIVITY);
  }

  function resetPan(card) {
    panY = 0;
    if (card) card.style.setProperty('--pan-y', '0px');
  }

  function animateToFrame(img, targetFrame, dollIdx) {
    var curFrame = parseInt(img.dataset.frame, 10) || 0;
    var diff = targetFrame - curFrame;
    if (diff === 0) return;

    var steps = Math.abs(diff);
    if (steps > 12) steps = 12;
    var stepSize = diff / steps;
    var i = 0;

    function step() {
      i++;
      if (i >= steps) {
        setFrame(img, targetFrame, dollIdx);
        return;
      }
      var f = Math.round(curFrame + stepSize * i);
      f = ((f % TOTAL_FRAMES) + TOTAL_FRAMES) % TOTAL_FRAMES;
      setFrame(img, f, dollIdx);
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function setFrame(img, frame, dollIdx) {
    var doll = dolls[dollIdx];
    img.dataset.frame = frame;
    img.src = framePath(doll, frame + 1);
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  }

  function onCardClick(idx, e) {
    if (mode === 'detail') {
      if (idx === cur) {
        if (e) {
          var card = findCard(idx);
          var img = card && card.querySelector('.card-img');
          if (img) {
            var rect = card.getBoundingClientRect();
            var clickX = e.clientX - rect.left;
            var half = rect.width / 2;
            var delta = clickX < half ? -FRAMES_PER_CLICK : FRAMES_PER_CLICK;
            var curFrame = parseInt(img.dataset.frame, 10) || 0;
            var newFrame = ((curFrame + delta) % TOTAL_FRAMES + TOTAL_FRAMES) % TOTAL_FRAMES;
            animateToFrame(img, newFrame, idx);
          }
        }
      }
      return;
    }
    if (idx === cur) {
      openDetail();
    } else {
      goTo(idx);
    }
  }

  /* ── Dots ───────────────────────────────────── */

  function buildDots() {
    dotsEl.innerHTML = '';
    dolls.forEach(function (doll, idx) {
      var b = document.createElement('button');
      b.className = 'dot';
      b.setAttribute('aria-label', doll.name || ('Слайд ' + (idx + 1)));
      b.addEventListener('click', function () {
        if (mode !== 'idle') return;
        goTo(idx);
      });
      dotsEl.appendChild(b);
    });
  }

  function updateDots() {
    var d = dotsEl.querySelectorAll('.dot');
    d.forEach(function (el, idx) { el.classList.toggle('active', idx === cur); });
    if (slideCounter && dolls.length) slideCounter.textContent = (cur + 1) + ' / ' + dolls.length;
  }

  /* ── Events ─────────────────────────────────── */

  function bind() {
    prevBtn.addEventListener('click', function () { nav(-1); });
    nextBtn.addEventListener('click', function () { nav(1); });
    hitPrev.addEventListener('click', function () { nav(-1); });
    hitNext.addEventListener('click', function () { nav(1); });
    detailClose.addEventListener('click', closeDetail);
    detailBackdrop.addEventListener('click', closeDetail);
    if (detailShare) detailShare.addEventListener('click', onShareClick);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mode === 'detail') { closeDetail(); return; }
      if (e.key === 'ArrowLeft') { nav(-1); return; }
      if (e.key === 'ArrowRight') { nav(1); return; }
      if (mode !== 'idle') return;
      if (e.key === 'Enter' || e.key === ' ') openDetail();
    });

    var scrollBuf = 0;
    var scrollTimer;
    sliderContainer.addEventListener('wheel', function (e) {
      if (mode === 'detail') {
        e.preventDefault();
        panDetail(e.deltaY);
        return;
      }
      if (mode !== 'idle') return;
      e.preventDefault();
      scrollBuf += e.deltaY;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () { scrollBuf = 0; }, 200);
      if (Math.abs(scrollBuf) > 50) {
        nav(scrollBuf > 0 ? 1 : -1);
        scrollBuf = 0;
      }
    }, { passive: false });

    // On mobile, swiping the active doll rotates it (bindFrameScrub) instead
    // of switching slides — that's what the arrow buttons are for there.
    var touchX = 0;
    sliderContainer.addEventListener('touchstart', function (e) {
      if (mode !== 'idle' || isMobile()) return;
      touchX = e.touches[0].clientX;
    }, { passive: true });
    sliderContainer.addEventListener('touchend', function (e) {
      if (mode !== 'idle' || isMobile()) return;
      var dx = touchX - e.changedTouches[0].clientX;
      if (Math.abs(dx) > 50) nav(dx > 0 ? 1 : -1);
    }, { passive: true });

    sliderContainer.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('mouseup', dragEnd);

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (mode === 'idle') {
          paint(false);
        } else if (mode === 'detail') {
          if (isMobile()) applyMobileDetailLayout(findCard(cur));
          else applyDetailTransform(findCard(cur));
        }
      }, 120);
    });
  }

  function dragStart(e) {
    if (mode !== 'idle' || e.button !== 0) return;
    drag = { x: e.clientX, t: Date.now(), moved: false };
    sliderContainer.classList.add('dragging');
  }

  function dragMove(e) {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x) > 5) drag.moved = true;
  }

  function dragEnd(e) {
    if (!drag) return;
    sliderContainer.classList.remove('dragging');
    var dx = e.clientX - drag.x;
    var dt = Date.now() - drag.t;
    var moved = drag.moved;
    drag = null;
    if (!moved) return;
    if (Math.abs(dx) > 40 || (Math.abs(dx) > 15 && dt < 300)) {
      nav(dx < 0 ? 1 : -1);
    }
  }

  /* ── Navigation ─────────────────────────────── */

  function nav(dir) {
    if (mode === 'detail') { navDetail(dir); return; }
    goTo(cur + dir);
  }

  function goTo(idx) {
    if (busy || mode !== 'idle' || !dolls.length) return;
    var n = dolls.length;
    idx = ((idx % n) + n) % n;
    if (idx === cur) return;
    cur = idx;
    busy = true;
    paint(true);
    preloadAdjacent();
    if (isMobile()) preloadFrames(dolls[cur]);
    setTimeout(function () { busy = false; }, NAV_MS);
  }

  /* ── Paint ──────────────────────────────────── */

  function paint(animate) {
    var n = dolls.length;
    if (!n) return;

    var cards = track.querySelectorAll('.doll-card');
    var refCard = cards[0];
    var cardW = refCard ? refCard.offsetWidth : 320;
    var gapPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 60;
    var deg = getDeg();
    var step = cardW + gapPx;
    var half = n / 2;

    cards.forEach(function (card) {
      var dri = parseInt(card.dataset.realIndex, 10);
      var raw = dri - cur;
      raw = ((raw % n) + n) % n;
      if (raw > half) raw -= n;
      var abs = Math.abs(raw);

      card.classList.remove('card-active', 'card-side', 'card-hidden', 'card-detail');
      card.style.opacity = '';
      card.style.zIndex = '';

      if (raw === 0) {
        card.classList.add('card-active');
        card.style.transform = 'translate(-50%, -50%) translateX(0px) rotateY(0deg) scale(1)';
        card.style.opacity = '1';
        card.style.zIndex = '10';
      } else if (abs === 1) {
        var sign = raw > 0 ? 1 : -1;
        card.classList.add('card-side');
        card.style.transform = 'translate(-50%, -50%) translateX(' + (sign * step) + 'px) rotateY(' + (-sign * deg) + 'deg) scale(0.82)';
        card.style.opacity = '0.55';
        card.style.zIndex = '5';
      } else {
        var s2 = raw > 0 ? 1 : -1;
        var farStep = step * (1 + Math.min(abs, 4) * 0.35);
        card.classList.add('card-hidden');
        card.style.transform = 'translate(-50%, -50%) translateX(' + (s2 * farStep) + 'px) rotateY(' + (-s2 * deg) + 'deg) scale(0.6)';
        card.style.opacity = '0';
        card.style.zIndex = '1';
      }
    });

    setAccent(cur);
    updateDots();
    positionSideHitZones(step, n);

    if (animate) {
      busy = true;
      setTimeout(function () { busy = false; }, NAV_MS);
    }
  }

  // The visible side cards are 3D-tilted (rotateY), which — combined with
  // perspective — makes their real (clickable) shape a trapezoid narrower
  // than how the doll actually looks. These flat, untilted twins sit over
  // the same slot so the whole doll is clickable, not just its outer half.
  function positionSideHitZones(step, n) {
    if (n < 2) {
      hitPrev.style.pointerEvents = 'none';
      hitNext.style.pointerEvents = 'none';
      return;
    }
    hitPrev.style.transform = 'translate(-50%, -50%) translateX(' + (-step) + 'px)';
    hitNext.style.transform = 'translate(-50%, -50%) translateX(' + step + 'px)';
    hitPrev.style.pointerEvents = 'auto';
    hitNext.style.pointerEvents = 'auto';
  }

  /* ── Detail: open ───────────────────────────── */

  function openDetail() {
    if (mode !== 'idle' || busy) return;
    mode = 'detail';

    var doll = dolls[cur];
    updateUrlHash(doll);
    preloadFrames(doll);
    var mobile = isMobile();
    var cards = track.querySelectorAll('.doll-card');
    var activeCard = null;

    cards.forEach(function (card) {
      var dri = parseInt(card.dataset.realIndex, 10);
      if (dri === cur) {
        activeCard = card;
        return;
      }
      card.style.opacity = '0';
      card.style.pointerEvents = 'none';
    });
    hitPrev.style.pointerEvents = 'none';
    hitNext.style.pointerEvents = 'none';

    // Populate before measuring so the mobile layout sees the sheet's real height
    populateDetail(doll);

    resetPan(activeCard);

    if (activeCard) {
      if (!mobile) {
        activeCard.classList.add('card-detail');
        activeCard.style.zIndex = '250';
        activeCard.style.transition = 'transform ' + DETAIL_MS + 'ms ' + EASE_OUT + ', box-shadow ' + DETAIL_MS + 'ms ' + EASE_OUT;
        applyDetailTransform(activeCard);
      } else {
        activeCard.style.zIndex = '250';
        activeCard.style.transition = 'transform ' + DETAIL_MS + 'ms ' + EASE_OUT;
        applyMobileDetailLayout(activeCard);
      }
    }

    detailBackdrop.classList.add('visible');
    detailInfo.classList.add('visible');
    header.classList.add('hidden');
    dotsEl.classList.add('hidden');
    if (slideCounter) slideCounter.classList.add('hidden');
    // Desktop only allows rotating a doll once its detail view is open,
    // so that's the right moment to point it out there (mobile sees this
    // hint earlier, right on the idle carousel)
    maybeShowRotateHint();
  }

  /* ── Detail: switch to adjacent slide ── */

  function navDetail(dir) {
    if (busy || !dolls.length) return;
    var n = dolls.length;
    var newIdx = ((cur + dir) % n + n) % n;
    if (newIdx === cur) return;

    busy = true;
    var mobile = isMobile();
    var oldCard = findCard(cur);

    preloadFrames(dolls[newIdx]);

    detailInfo.classList.remove('visible');

    if (oldCard) {
      oldCard.style.transition = (mobile ? '' : 'transform ' + DETAIL_MS + 'ms ' + EASE_OUT + ', ') + 'opacity 0.3s ' + EASE_OUT;
      oldCard.style.opacity = '0';
    }

    setTimeout(function () {
      if (oldCard) {
        oldCard.classList.remove('card-detail', 'card-active');
        oldCard.style.transition = '';
        oldCard.style.pointerEvents = 'none';
        oldCard.style.zIndex = '';
      }

      cur = newIdx;
      var doll = dolls[cur];
      updateUrlHash(doll);
      var newCard = findCard(cur);

      // Populate before measuring so the mobile layout sees the sheet's real height
      populateDetail(doll);

      if (newCard) {
        resetPan(newCard);
        newCard.style.pointerEvents = 'none';
        newCard.style.opacity = '0';
        newCard.style.zIndex = '250';
        if (!mobile) {
          void newCard.offsetWidth;
          newCard.classList.add('card-detail');
          newCard.style.transition = 'transform ' + DETAIL_MS + 'ms ' + EASE_OUT + ', opacity 0.4s ' + EASE_OUT + ', box-shadow ' + DETAIL_MS + 'ms ' + EASE_OUT;
          applyDetailTransform(newCard);
        } else {
          // These cards keep whatever position class (card-hidden/card-side) they had
          // from the last idle-mode paint(); card-hidden forces pointer-events: none,
          // which otherwise permanently blocks rotation drag on this card. card-active
          // is what makes the on-card name visible, matching how the initially-opened
          // doll looks, so switching via arrows shouldn't lose it either.
          newCard.classList.remove('card-hidden', 'card-side');
          newCard.classList.add('card-active');
          newCard.style.transition = 'opacity 0.4s ' + EASE_OUT;
          applyMobileDetailLayout(newCard);
        }

        var newImg = newCard.querySelector('.card-img');
        if (newImg) {
          setFrame(newImg, 0, cur);
        }

        requestAnimationFrame(function () {
          newCard.style.opacity = '1';
        });

        setTimeout(function () {
          newCard.style.pointerEvents = '';
        }, DETAIL_MS);
      }

      setAccent(cur);
      detailInfo.classList.add('visible');

      setTimeout(function () { busy = false; }, DETAIL_MS);
    }, 260);
  }

  function applyDetailTransform(card) {
    if (!card) return;
    var cardW = card.offsetWidth;
    var cardH = card.offsetHeight;
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    var targetH = vh * 0.92;
    var targetW = vw * (isMobile() ? 0.94 : 0.6);
    var scale = Math.min(targetH / cardH, targetW / cardW) * 1.8;
    scale = Math.max(scale, 1);

    var targetCenterX = vw * 0.28;
    var shiftX = targetCenterX - vw / 2;

    card.style.transform = 'translate(-50%, -30%) translateX(' + shiftX + 'px) rotateY(0deg) scale(' + scale + ')';
  }

  /* Mobile: shift/shrink the active card so it never overlaps the bottom
     sheet — otherwise the sheet (which sits above the card in stacking
     order) swallows the pointer events used to swipe/rotate the doll. */
  function applyMobileDetailLayout(card) {
    if (!card) return;
    var vh = window.innerHeight;
    var sheetH = detailInfo.getBoundingClientRect().height || (vh * 0.48);
    var gap = 16;
    var availableH = Math.max(vh - sheetH - gap, 140);
    var cardH = card.offsetHeight;
    var scale = Math.min(1, availableH / cardH);
    var centerY = availableH / 2 + 6;
    var shiftY = centerY - vh / 2;

    card.style.transform = 'translate(-50%, -50%) translate(0px, ' + shiftY + 'px) rotateY(0deg) scale(' + scale + ')';
    // Keep the arrows level with the doll's own center instead of the
    // viewport's, so they sit beside it rather than over the sheet below
    navArrows.style.top = centerY + 'px';
  }

  /* ── Detail: close ──────────────────────────── */

  function closeDetail() {
    if (mode !== 'detail') return;
    mode = 'idle';
    clearUrlHash();

    var cards = track.querySelectorAll('.doll-card');
    var activeCard = null;

    cleanDetailFields();
    detailBackdrop.classList.remove('visible');
    detailInfo.classList.remove('visible');
    header.classList.remove('hidden');
    navArrows.classList.remove('hidden');
    navArrows.style.top = '';
    dotsEl.classList.remove('hidden');
    if (slideCounter) slideCounter.classList.remove('hidden');

    cards.forEach(function (card) {
      var dri = parseInt(card.dataset.realIndex, 10);
      card.style.pointerEvents = '';
      card.style.transition = '';
      if (dri === cur) activeCard = card;
    });

    if (activeCard) {
      activeCard.classList.remove('card-detail');
      activeCard.style.zIndex = '10';
    }

    paint(true);

    busy = true;
    setTimeout(function () { busy = false; }, Math.max(NAV_MS, DETAIL_MS));
  }

  /* ── Helpers ────────────────────────────────── */

  function findCard(dollIndex) {
    var cards = track.querySelectorAll('.doll-card');
    for (var i = 0; i < cards.length; i++) {
      if (parseInt(cards[i].dataset.realIndex, 10) === dollIndex) return cards[i];
    }
    return null;
  }

  function getDeg() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rotate-side')) || 32;
  }

  function setAccent(idx) {
    var doll = dolls[idx];
    if (doll && doll.color) {
      document.documentElement.style.setProperty('--accent', doll.color);
      document.documentElement.style.setProperty('--accent-glow', doll.color + '50');
    }
  }

  function populateDetail(doll) {
    cleanDetailFields();
    if (doll.nation) {
      detailName.insertAdjacentHTML('beforebegin',
        '<div class="detail-nation">' + escapeHtml(doll.nation) + '</div>' +
        '<div class="detail-author">Автор: ' + escapeHtml(doll.author || '') + '</div>');
    }
    detailName.textContent = doll.name;
    detailDesc.textContent = doll.description;
    detailSpecs.textContent = doll.specs;
    // Otherwise switching to a shorter doll while scrolled down leaves the
    // new name/description scrolled out of view above the sheet's viewport
    if (detailScroll) detailScroll.scrollTop = 0;
  }

  function cleanDetailFields() {
    var n = detailInfo.querySelector('.detail-nation');
    var r = detailInfo.querySelector('.detail-author');
    if (n) n.remove();
    if (r) r.remove();
  }

})();
