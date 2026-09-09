(function () {
  "use strict";

  var wrap  = document.getElementById('buddy-wrap');
  var face  = document.getElementById('face');
  var clockEl = document.getElementById('clock');
  var heartsContainer = document.getElementById('hearts');
  var motionBtn = document.getElementById('enable-motion');

  var FACES = {
    idle:   '•‿•',
    happy:  '♡‿♡',
    dizzy:  '@‿@',
    sleepy: '-‿-'
  };

  var baseline = 'idle';   // stato di fondo: 'idle' oppure 'sleepy' (deciso dall'orologio)
  var reacting = false;    // true mentre e' attiva una reazione temporanea (carezza/scossa)
  var reactTimer = null;

  function applyState(state) {
    wrap.className = 'state-' + state;
    face.textContent = FACES[state] || FACES.idle;
  }

  function reactTemporarily(state, durationMs) {
    reacting = true;
    applyState(state);
    if (reactTimer) { clearTimeout(reactTimer); }
    reactTimer = setTimeout(function () {
      reacting = false;
      applyState(baseline);
    }, durationMs);
  }

  // ---------- Orologio ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function updateClock() {
    var now = new Date();
    var h = now.getHours();
    var m = now.getMinutes();
    clockEl.textContent = pad(h) + ':' + pad(m);

    var newBaseline = (h >= 23 || h < 7) ? 'sleepy' : 'idle';
    if (newBaseline !== baseline) {
      baseline = newBaseline;
      if (!reacting) { applyState(baseline); }
    }
  }
  updateClock();
  setInterval(updateClock, 1000 * 15); // basta ogni 15s, risparmia batteria

  // ---------- Carezza (tocco) ----------
  function spawnHeart() {
    var heart = document.createElement('div');
    heart.className = 'heart';
    heart.textContent = '♡';
    heart.style.left = (38 + Math.random() * 24) + '%';
    heartsContainer.appendChild(heart);
    setTimeout(function () {
      if (heart.parentNode) { heart.parentNode.removeChild(heart); }
    }, 1600);
  }

  var lastHeartTime = 0;
  function handlePet() {
    reactTemporarily('happy', 1500);
    var now = Date.now();
    if (now - lastHeartTime > 220) { // non spammare cuoricini ad ogni pixel di movimento
      lastHeartTime = now;
      spawnHeart();
    }
  }

  wrap.addEventListener('touchstart', handlePet, { passive: true });
  wrap.addEventListener('touchmove', function (e) {
    handlePet();
    e.preventDefault();
  }, { passive: false });
  wrap.addEventListener('mousedown', handlePet); // comodo per provarlo da desktop

  // ---------- Scossa (accelerometro) ----------
  var lastX = null, lastY = null, lastZ = null, lastShakeTime = 0;

  function handleMotion(e) {
    var acc = e.accelerationIncludingGravity || e.acceleration;
    if (!acc || acc.x === null) { return; }

    var x = acc.x || 0, y = acc.y || 0, z = acc.z || 0;

    if (lastX !== null) {
      var delta = Math.abs(x - lastX) + Math.abs(y - lastY) + Math.abs(z - lastZ);
      var now = Date.now();
      if (delta > 25 && now - lastShakeTime > 1500) {
        lastShakeTime = now;
        reactTemporarily('dizzy', 1800);
      }
    }
    lastX = x; lastY = y; lastZ = z;
  }

  function setupMotion() {
    if (typeof DeviceMotionEvent === 'undefined') { return; } // sensore non disponibile

    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      // iOS 13+: il permesso va chiesto con un tap esplicito dell'utente
      motionBtn.style.display = 'block';
      motionBtn.addEventListener('click', function () {
        DeviceMotionEvent.requestPermission().then(function (response) {
          if (response === 'granted') {
            window.addEventListener('devicemotion', handleMotion);
            motionBtn.style.display = 'none';
          }
        }).catch(function () { /* sensore non concesso, il buddy funziona lo stesso */ });
      });
    } else {
      // Android e iOS piu' vecchi: nessun permesso da chiedere
      window.addEventListener('devicemotion', handleMotion);
    }
  }
  setupMotion();

  // stato iniziale
  applyState(baseline);

})();
