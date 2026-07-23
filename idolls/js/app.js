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
  var detailBackdrop = document.getElementById('detailBackdrop');
  var detailInfo = document.getElementById('detailInfo');
  var detailClose = document.getElementById('detailClose');
  var detailName = document.getElementById('detailName');
  var detailDesc = document.getElementById('detailDesc');
  var detailSpecs = document.getElementById('detailSpecs');
  var prevBtn = document.getElementById('prevBtn');
  var nextBtn = document.getElementById('nextBtn');
  var header = document.getElementById('header');
  var navArrows = document.getElementById('navArrows');
  var dotsEl = document.getElementById('dots');
  var particles = document.getElementById('particles');
  var preloader = document.getElementById('preloader');
  var rotateHint = document.getElementById('rotateHint');

  var drag = null;
  var scrub = null;
  var scrubJustMoved = false;
  var mq = window.matchMedia(MOBILE_QUERY);

  init();

  function init() {
    createParticles();
    load()
      .then(function () {
        enrichDolls();
        render();
        buildDots();
        bind();
        cur = 0;
        return warmPriorityImages();
      })
      .catch(function () {})
      .then(function () {
        paint(false);
        hidePreloader();
      });
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
    idxs = idxs.filter(function (v, i) { return idxs.indexOf(v) === i; });

    var waits = idxs.map(function (idx) {
      var card = findCard(idx);
      var img = card && card.querySelector('.card-img');
      if (!img) return Promise.resolve();
      return new Promise(function (resolve) {
        if (img.complete && img.naturalWidth) { resolve(); return; }
        var timer = setTimeout(finish, 8000);
        function finish() {
          img.removeEventListener('load', finish);
          img.removeEventListener('error', finish);
          clearTimeout(timer);
          resolve();
        }
        img.addEventListener('load', finish);
        img.addEventListener('error', finish);
      });
    });

    return Promise.all(waits);
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

  /* ── Render ─────────────────────────────────── */

  function render() {
    track.innerHTML = '';
    dolls.forEach(function (doll, idx) {
      var card = document.createElement('div');
      card.className = 'doll-card';
      card.dataset.realIndex = idx;

      var nameText = escapeHtml(doll.name);
      var rawLen = nameText.replace(/&[^;]+;/g, 'x').length;
      var fontSize = 14;
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
      var maxLineLen = 0;
      for (var l = 0; l < lines.length; l++) {
        var ll = lines[l].replace(/&[^;]+;/g, 'x').length;
        if (ll > maxLineLen) maxLineLen = ll;
      }
      var lineW = Math.max(maxLineLen * (fontSize * 0.65), 80);
      var lineH = fontSize + 2;
      var svgW = 300;
      var svgH = lines.length * lineH + 10;
      var midX = svgW / 2;
      var defs = '';
      var tspans = '';
      for (var l = 0; l < lines.length; l++) {
        var pid = 'arc-' + idx + '-' + l;
        var py = 8 + l * lineH;
        var curveY = py + lineH + 20;
        defs += '<path id="' + pid + '" d="M 4,' + py + ' Q ' + midX + ',' + curveY + ' ' + (svgW - 4) + ',' + py + '" fill="none"/>';
        tspans += '<text style="font-size:' + fontSize + 'px"><textPath href="#' + pid + '" startOffset="50%" text-anchor="middle">' + lines[l] + '</textPath></text>';
      }
      card.innerHTML =
        '<img class="card-img" src="' + framePath(doll, 1) + '" alt="" draggable="false" data-frame="0">' +
        '<div class="card-sheen"></div>' +
        '<div class="frame-scrub-bar"><div class="frame-scrub-fill"></div></div>' +
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
    var fill = card.querySelector('.frame-scrub-fill');

    card.addEventListener('pointerdown', function (e) {
      if (mode !== 'detail' || idx !== cur) return;
      e.preventDefault();
      scrub = {
        pointerId: e.pointerId,
        card: card,
        img: img,
        fill: fill,
        idx: idx,
        startX: e.clientX,
        startFrame: parseInt(img.dataset.frame, 10) || 0,
        moved: false
      };
      try { card.setPointerCapture(e.pointerId); } catch (err) {}
    });

    card.addEventListener('pointermove', function (e) {
      if (!scrub || scrub.pointerId !== e.pointerId) return;
      var dx = e.clientX - scrub.startX;
      if (!scrub.moved && Math.abs(dx) > 4) {
        scrub.moved = true;
        scrub.card.classList.add('scrubbing');
      }
      if (!scrub.moved) return;
      var rect = scrub.card.getBoundingClientRect();
      var frameDelta = Math.round(dx * DRAG_SENSITIVITY);
      var newFrame = ((scrub.startFrame + frameDelta) % TOTAL_FRAMES + TOTAL_FRAMES) % TOTAL_FRAMES;
      setFrame(scrub.img, newFrame, scrub.idx);
      updateScrubFill(scrub.fill, newFrame);
    });

    card.addEventListener('pointerup', function (e) {
      if (!scrub || scrub.pointerId !== e.pointerId) return;
      var moved = scrub.moved;
      scrub.card.classList.remove('scrubbing');
      scrub = null;
      if (moved) scrubJustMoved = true;
    });

    card.addEventListener('pointercancel', function (e) {
      if (!scrub || scrub.pointerId !== e.pointerId) return;
      scrub.card.classList.remove('scrubbing');
      scrub = null;
    });
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

  function updateScrubFill(fill, frame) {
    if (!fill) return;
    fill.style.width = (frame / (TOTAL_FRAMES - 1) * 100) + '%';
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
            var fill = card.querySelector('.frame-scrub-fill');
            updateScrubFill(fill, newFrame);
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
  }

  /* ── Events ─────────────────────────────────── */

  function bind() {
    prevBtn.addEventListener('click', function () { nav(-1); });
    nextBtn.addEventListener('click', function () { nav(1); });
    detailClose.addEventListener('click', closeDetail);
    detailBackdrop.addEventListener('click', closeDetail);

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

    var touchX = 0;
    sliderContainer.addEventListener('touchstart', function (e) {
      if (mode !== 'idle') return;
      touchX = e.touches[0].clientX;
    }, { passive: true });
    sliderContainer.addEventListener('touchend', function (e) {
      if (mode !== 'idle') return;
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
        } else if (mode === 'detail' && !isMobile()) {
          applyDetailTransform(findCard(cur));
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

    if (animate) {
      busy = true;
      setTimeout(function () { busy = false; }, NAV_MS);
    }
  }

  /* ── Detail: open ───────────────────────────── */

  function openDetail() {
    if (mode !== 'idle' || busy) return;
    mode = 'detail';

    var doll = dolls[cur];
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

    if (activeCard) {
      if (!mobile) {
        activeCard.classList.add('card-detail');
        activeCard.style.zIndex = '250';
        activeCard.style.transition = 'transform ' + DETAIL_MS + 'ms ' + EASE_OUT + ', box-shadow ' + DETAIL_MS + 'ms ' + EASE_OUT;
        applyDetailTransform(activeCard);
      } else {
        activeCard.style.zIndex = '250';
      }
    }

    populateDetail(doll);
    detailBackdrop.classList.add('visible');
    detailInfo.classList.add('visible');
    header.classList.add('hidden');
    dotsEl.classList.add('hidden');

    if (rotateHint) {
      rotateHint.classList.add('visible');
      setTimeout(function () {
        rotateHint.classList.remove('visible');
      }, 3000);
    }
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

    detailInfo.classList.remove('visible');

    if (oldCard) {
      oldCard.style.transition = (mobile ? '' : 'transform ' + DETAIL_MS + 'ms ' + EASE_OUT + ', ') + 'opacity 0.3s ' + EASE_OUT;
      oldCard.style.opacity = '0';
    }

    setTimeout(function () {
      if (oldCard) {
        oldCard.classList.remove('card-detail');
        oldCard.style.transition = '';
        oldCard.style.pointerEvents = 'none';
        oldCard.style.zIndex = '';
      }

      cur = newIdx;
      var doll = dolls[cur];
      var newCard = findCard(cur);

      if (newCard) {
        newCard.style.pointerEvents = 'none';
        newCard.style.opacity = '0';
        newCard.style.zIndex = '250';
        if (!mobile) {
          void newCard.offsetWidth;
          newCard.classList.add('card-detail');
          newCard.style.transition = 'transform ' + DETAIL_MS + 'ms ' + EASE_OUT + ', opacity 0.4s ' + EASE_OUT + ', box-shadow ' + DETAIL_MS + 'ms ' + EASE_OUT;
          applyDetailTransform(newCard);
        } else {
          newCard.style.transition = 'opacity 0.4s ' + EASE_OUT;
          newCard.style.transform = 'translate(-50%, -50%) translateX(0px) rotateY(0deg) scale(1)';
        }

        var newImg = newCard.querySelector('.card-img');
        if (newImg) {
          setFrame(newImg, 0, cur);
          var fill = newCard.querySelector('.frame-scrub-fill');
          updateScrubFill(fill, 0);
        }

        requestAnimationFrame(function () {
          newCard.style.opacity = '1';
        });

        setTimeout(function () {
          newCard.style.pointerEvents = '';
        }, DETAIL_MS);
      }

      setAccent(cur);
      populateDetail(doll);
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

    card.style.transform = 'translate(-50%, -45%) translateX(' + shiftX + 'px) rotateY(0deg) scale(' + scale + ')';
  }

  /* ── Detail: close ──────────────────────────── */

  function closeDetail() {
    if (mode !== 'detail') return;
    mode = 'idle';

    var cards = track.querySelectorAll('.doll-card');
    var activeCard = null;

    cleanDetailFields();
    detailBackdrop.classList.remove('visible');
    detailInfo.classList.remove('visible');
    header.classList.remove('hidden');
    navArrows.classList.remove('hidden');
    dotsEl.classList.remove('hidden');

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
  }

  function cleanDetailFields() {
    var n = detailInfo.querySelector('.detail-nation');
    var r = detailInfo.querySelector('.detail-author');
    if (n) n.remove();
    if (r) r.remove();
  }

})();
