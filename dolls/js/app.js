(function () {
  'use strict';

  var EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
  var NAV_MS = 620;      // must match --card-transition in CSS
  var DETAIL_MS = 750;   // must match --detail-transition in CSS
  var MOBILE_QUERY = '(max-width: 640px)';

  var dolls = [];
  var cur = 0;
  var mode = 'idle'; // 'idle' | 'detail'
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

  var drag = null;
  var scrub = null;
  var scrubJustMoved = false;
  var mq = window.matchMedia(MOBILE_QUERY);

  init();

  function init() {
    createParticles();
    load()
      .then(function () {
        render();
        buildDots();
        bind();
        cur = 0;
        paint(false);
      })
      .catch(function () {
        // even if data failed to load, don't leave the user staring
        // at a spinner forever
      })
      .then(hidePreloader);
  }

  function hidePreloader() {
    if (!preloader) return;
    // give the very first card a moment to actually paint before
    // we reveal it, so there's no flash of an unstyled layout
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

  // function fallbackDolls() {
  //   var n = ['Алиса', 'Мираж', 'Розалинда', 'Валькирия', 'Селеста', 'Кармен', 'Снежана', 'Лунария', 'Жаклин', 'Флоренс', 'Искра', 'Эбби'];
  //   var c = ['#c9a87c', '#7c8fc9', '#c97ca8', '#c9c57c', '#7cc9b8', '#c97c7c', '#aed4e6', '#b07cc9', '#d4af37', '#7cc97c', '#c99d7c', '#8a7c9e'];
  //   return n.map(function (name, i) {
  //     return { id: i + 1, name: name, nation: '', region: '', description: name, specs: '', color: c[i], video: 'videos/doll' + (i + 1) + '.webm' };
  //   });
  // }

  /* ── Render ─────────────────────────────────── */

  function render() {
    track.innerHTML = '';
    dolls.forEach(function (doll, idx) {
      var card = document.createElement('div');
      card.className = 'doll-card';
      card.dataset.realIndex = idx;

      card.innerHTML =
        '<video class="card-video" src="' + doll.video + '" loop muted playsinline preload="metadata"></video>' +
        '<div class="card-sheen"></div>' +
        '<div class="video-scrub-bar"><div class="video-scrub-fill"></div></div>' +
        '<div class="card-name">' + escapeHtml(doll.name) + '</div>';

      var video = card.querySelector('.card-video');
      video.addEventListener('error', function () { video.style.display = 'none'; });

      bindVideoScrub(card, video, idx);

      card.addEventListener('click', function () {
        if (drag && drag.moved) return;
        if (scrubJustMoved) { scrubJustMoved = false; return; }
        onCardClick(idx);
      });

      track.appendChild(card);
    });
  }

  /* ── Detail: manual video scrubbing (drag the open slide's video) ── */
  /* Only the card whose realIndex matches `cur` while mode === 'detail' */
  /* responds — works on both the desktop zoomed card and the mobile    */
  /* full-size card sitting behind the bottom sheet.                    */

  function bindVideoScrub(card, video, idx) {
    var fill = card.querySelector('.video-scrub-fill');

    card.addEventListener('pointerdown', function (e) {
      if (mode !== 'detail' || idx !== cur) return;
      if (!video.duration || !isFinite(video.duration)) return;
      scrub = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startTime: video.currentTime,
        moved: false
      };
      try { card.setPointerCapture(e.pointerId); } catch (err) {}
    });

    card.addEventListener('pointermove', function (e) {
      if (!scrub || scrub.pointerId !== e.pointerId) return;
      var dx = e.clientX - scrub.startX;
      if (!scrub.moved && Math.abs(dx) > 4) {
        scrub.moved = true;
        video.pause();
        card.classList.add('scrubbing');
      }
      if (!scrub.moved) return;
      var rect = card.getBoundingClientRect();
      var span = video.duration * 0.6; // dragging the full card width covers ~60% of the clip
      var t = scrub.startTime + (dx / rect.width) * span;
      t = Math.max(0, Math.min(video.duration, t));
      video.currentTime = t;
      updateScrubFill(fill, video);
    });

    function endScrub(e) {
      if (!scrub || scrub.pointerId !== e.pointerId) return;
      var moved = scrub.moved;
      scrub = null;
      card.classList.remove('scrubbing');
      if (moved) {
        scrubJustMoved = true;
        video.play().catch(function () {});
      }
    }

    card.addEventListener('pointerup', endScrub);
    card.addEventListener('pointercancel', endScrub);
    video.addEventListener('timeupdate', function () { updateScrubFill(fill, video); });
  }

  function updateScrubFill(fill, video) {
    if (!fill || !video.duration) return;
    fill.style.width = (video.currentTime / video.duration * 100) + '%';
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  }

  function onCardClick(idx) {
    if (mode === 'detail') {
      if (idx === cur) closeDetail();
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

  /* ── Paint (transform-driven carousel, true circular distance) ── */
  /* Every card's offset from the active one is the SHORTEST signed  */
  /* path around the loop, so going from slide 1 to the last slide   */
  /* always animates as a single step "backwards" — never a long way */
  /* around — and no element is ever detached, cloned, or reset.     */

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
      var v = card.querySelector('.card-video');

      card.classList.remove('card-active', 'card-side', 'card-hidden', 'card-detail');
      card.style.opacity = '';
      card.style.zIndex = '';

      if (raw === 0) {
        card.classList.add('card-active');
        card.style.transform = 'translate(-50%, -50%) translateX(0px) rotateY(0deg) scale(1)';
        card.style.opacity = '1';
        card.style.zIndex = '10';
        playVideo(v);
      } else if (abs === 1) {
        var sign = raw > 0 ? 1 : -1;
        card.classList.add('card-side');
        card.style.transform = 'translate(-50%, -50%) translateX(' + (sign * step) + 'px) rotateY(' + (-sign * deg) + 'deg) scale(0.82)';
        card.style.opacity = '0.55';
        card.style.zIndex = '5';
        stopVideo(v);
      } else {
        var s2 = raw > 0 ? 1 : -1;
        var farStep = step * (1 + Math.min(abs, 4) * 0.35);
        card.classList.add('card-hidden');
        card.style.transform = 'translate(-50%, -50%) translateX(' + (s2 * farStep) + 'px) rotateY(' + (-s2 * deg) + 'deg) scale(0.6)';
        card.style.opacity = '0';
        card.style.zIndex = '1';
        stopVideo(v);
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
      // other slides quietly fade away in place
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
        // mobile: active slide stays exactly where it is, undimmed —
        // only the sheet appears over the rest of the screen
        activeCard.style.zIndex = '250';
      }
    }

    populateDetail(doll);
    detailBackdrop.classList.add('visible');
    detailInfo.classList.add('visible');
    header.classList.add('hidden');
    dotsEl.classList.add('hidden');
  }

  /* ── Detail: switch to adjacent slide without leaving detail mode ── */

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

    if (oldCard) stopVideo(oldCard.querySelector('.card-video'));

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
        }
        var newVideo = newCard.querySelector('.card-video');
        if (newVideo) {
          try { newVideo.currentTime = 0; } catch (e) {}
          playVideo(newVideo);
        }
        requestAnimationFrame(function () {
          newCard.style.opacity = '1';
        });
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
    var scale = Math.min(targetH / cardH, targetW / cardW) * 1.8 ;
    scale = Math.max(scale, 1);

    var targetCenterX = vw * 0.28;
    var shiftX = targetCenterX - vw / 2;

    card.style.transform = 'translate(-50%, -30%) translateX(' + shiftX + 'px) rotateY(0deg) scale(' + scale + ')';
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

    if (activeCard) activeCard.style.zIndex = '10';

    // re-run the normal circular layout — every card (including the ones
    // that quietly faded out) eases back to its correct offset and opacity
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

  function playVideo(v) {
    if (v && v.getAttribute('src') && !v.error) v.play().catch(function () {});
  }

  function stopVideo(v) {
    if (!v) return;
    try { v.pause(); } catch (e) {}
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
        '<div class="detail-region">' + escapeHtml(doll.region || '') + '</div>');
    }
    detailName.textContent = doll.name;
    detailDesc.textContent = doll.description;
    detailSpecs.textContent = doll.specs;
  }

  function cleanDetailFields() {
    var n = detailInfo.querySelector('.detail-nation');
    var r = detailInfo.querySelector('.detail-region');
    if (n) n.remove();
    if (r) r.remove();
  }

})();
