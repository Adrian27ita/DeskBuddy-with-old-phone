(function () {
  "use strict";

  // ---------- Riferimenti agli elementi della pagina ----------
  var wrap  = document.getElementById('buddy-wrap');
  var eyeLeft  = document.getElementById('eye-left');
  var eyeRight = document.getElementById('eye-right');
  var pupilLeft  = eyeLeft.querySelector('.pupil');
  var pupilRight = eyeRight.querySelector('.pupil');
  var clockEl = document.getElementById('clock');
  var heartsContainer = document.getElementById('hearts');
  var motionBtn = document.getElementById('enable-motion');

  // baseline = lo stato "di fondo" quando non sta succedendo nulla di speciale.
  // Puo' essere 'idle' (normale) oppure 'sleepy' (notte), deciso dall'orologio.
  var baseline = 'idle';

  // reacting = true mentre e' in corso una reazione TEMPORANEA (carezza o scossa),
  // serve per non far tornare subito il buddy allo stato normale mentre reagisce.
  var reacting = false;
  var reactTimer = null;

  // Cambia la classe CSS di #buddy-wrap (es. "state-happy"), che a sua volta
  // fa scattare gli stili corrispondenti definiti in style.css.
  function applyState(state) {
    wrap.className = 'state-' + state;
  }

  // Mostra uno stato per un tempo limitato, poi torna da solo allo stato di base.
  // Usata sia per la carezza (happy) sia per la scossa (dizzy).
  function reactTemporarily(state, durationMs) {
    reacting = true;
    applyState(state);
    if (reactTimer) { clearTimeout(reactTimer); }
    reactTimer = setTimeout(function () {
      reacting = false;
      applyState(baseline);
    }, durationMs);
  }


  // =========================================================
  // SGUARDO CHE VAGA DA SOLO
  // Ogni tot millisecondi sposta le pupille in una posizione
  // casuale dentro un raggio limitato, cosi' sembra che il
  // buddy stia guardandosi in giro.
  // =========================================================
  var RANGE_X = 16; // quanto possono spostarsi le pupille in orizzontale (px)
  var RANGE_Y = 22; // quanto possono spostarsi le pupille in verticale (px)

  function lookRandom() {
    var dx = (Math.random() * 2 - 1) * RANGE_X;
    var dy = (Math.random() * 2 - 1) * RANGE_Y;
    var t = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
    pupilLeft.style.webkitTransform = t;
    pupilLeft.style.transform = t;
    pupilRight.style.webkitTransform = t;
    pupilRight.style.transform = t;
  }

  function scheduleLook() {
    // durante la scossa lo sguardo si muove molto piu' in fretta (effetto "stordito")
    var delay = reacting && wrap.className === 'state-dizzy'
      ? 150 + Math.random() * 150    // scossa: 150-300ms, scattoso
      : 1600 + Math.random() * 1800; // normale: 1.6-3.4s, naturale
    setTimeout(function () {
      lookRandom();
      scheduleLook(); // si auto-richiama all'infinito
    }, delay);
  }
  scheduleLook();


  // =========================================================
  // BATTITO DI CIGLIA
  // Ogni tot secondi aggiunge la classe "blink" (occhio schiacciato,
  // vedi CSS) per 140ms, poi la toglie.
  // =========================================================
  function scheduleBlink() {
    var delay = 2500 + Math.random() * 3500; // ogni 2.5-6s circa
    setTimeout(function () {
      eyeLeft.classList.add('blink');
      eyeRight.classList.add('blink');
      setTimeout(function () {
        eyeLeft.classList.remove('blink');
        eyeRight.classList.remove('blink');
      }, 140);
      scheduleBlink();
    }, delay);
  }
  scheduleBlink();


  // =========================================================
  // OROLOGIO
  // Aggiorna l'ora ogni 15 secondi (non serve ogni secondo,
  // risparmia batteria) e decide se e' "notte" (23:00-07:00).
  // =========================================================
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function updateClock() {
    var now = new Date();
    var h = now.getHours();
    var m = now.getMinutes();
    clockEl.textContent = pad(h) + ':' + pad(m);

    // cambia qui gli orari se vuoi che la "modalita' notte" scatti prima/dopo
    var newBaseline = (h >= 23 || h < 7) ? 'sleepy' : 'idle';
    if (newBaseline !== baseline) {
      baseline = newBaseline;
      if (!reacting) { applyState(baseline); } // non interrompere una reazione in corso
    }
  }
  updateClock();
  setInterval(updateClock, 1000 * 15);


  // =========================================================
  // CAREZZA (tocco/trascinamento sullo schermo)
  // =========================================================
  function spawnHeart() {
    var heart = document.createElement('div');
    heart.className = 'heart';
    heart.textContent = '♡';
    heart.style.left = (38 + Math.random() * 24) + '%'; // posizione orizzontale un po' casuale
    heartsContainer.appendChild(heart);
    setTimeout(function () {
      if (heart.parentNode) { heart.parentNode.removeChild(heart); }
    }, 1600); // deve combaciare con la durata dell'animazione float-up nel CSS
  }

  var lastHeartTime = 0;
  function handlePet() {
    reactTemporarily('happy', 1500);
    var now = Date.now();
    if (now - lastHeartTime > 220) { // limite per non creare un cuoricino ad ogni singolo pixel di movimento
      lastHeartTime = now;
      spawnHeart();
    }
  }

  wrap.addEventListener('touchstart', handlePet, { passive: true });
  wrap.addEventListener('touchmove', function (e) {
    handlePet();
    e.preventDefault(); // evita che il trascinamento faccia scrollare la pagina
  }, { passive: false });
  wrap.addEventListener('mousedown', handlePet); // comodo per provarlo col mouse da computer


  // =========================================================
  // SCOSSA (accelerometro del telefono)
  // =========================================================
  var lastX = null, lastY = null, lastZ = null, lastShakeTime = 0;

  function handleMotion(e) {
    var acc = e.accelerationIncludingGravity || e.acceleration;
    if (!acc || acc.x === null) { return; }

    var x = acc.x || 0, y = acc.y || 0, z = acc.z || 0;

    if (lastX !== null) {
      // somma di quanto e' cambiata l'accelerazione sui 3 assi rispetto alla lettura precedente
      var delta = Math.abs(x - lastX) + Math.abs(y - lastY) + Math.abs(z - lastZ);
      var now = Date.now();

      // soglia oltre la quale consideriamo il movimento una "scossa" vera e propria
      // (25 = quanto deve essere brusco; piu' basso = piu' sensibile)
      if (delta > 25 && now - lastShakeTime > 1500) { // non scattare piu' di una volta ogni 1.5s
        lastShakeTime = now;
        reactTemporarily('dizzy', 1800);
      }
    }
    lastX = x; lastY = y; lastZ = z;
  }

  function setupMotion() {
    if (typeof DeviceMotionEvent === 'undefined') { return; } // il browser non supporta il sensore

    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      // iOS 13+: il permesso per l'accelerometro va chiesto con un tap esplicito dell'utente,
      // per questo mostriamo il pulsante solo in questo caso
      motionBtn.style.display = 'block';
      motionBtn.addEventListener('click', function () {
        DeviceMotionEvent.requestPermission().then(function (response) {
          if (response === 'granted') {
            window.addEventListener('devicemotion', handleMotion);
            motionBtn.style.display = 'none';
          }
        }).catch(function () {
          // permesso negato o sensore non disponibile: il buddy continua a funzionare,
          // semplicemente non reagira' alle scosse
        });
      });
    } else {
      // Android e iOS piu' vecchi: nessun permesso da chiedere, il sensore parte subito
      window.addEventListener('devicemotion', handleMotion);
    }
  }
  setupMotion();


  // stato iniziale all'avvio della pagina
  applyState(baseline);

})();
