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

  // riferimenti nuovi per la sveglia
  var audioEl      = document.getElementById('alarm-audio');
  var stopAlarmBtn = document.getElementById('stop-alarm');
  var settingsBtn   = document.getElementById('settings-btn');
  var settingsPanel = document.getElementById('settings-panel');
  var settingsClose = document.getElementById('settings-close');
  var alarmsListEl  = document.getElementById('alarms-list');
  var addAlarmBtn   = document.getElementById('add-alarm');

  // -----------------------------------------------------------------
  // ELENCO TRACCE: metti qui i nomi dei file mp3 (devono stare nella
  // STESSA cartella di questo file, esattamente come style.css/script.js).
  // Puoi aggiungerne o toglierne quante ne vuoi, basta rispettare la
  // stessa forma: 'nomefile.mp3',
  // -----------------------------------------------------------------
  var TRACKS = [
    'traccia1.mp3',
    'traccia2.mp3',
    'traccia3.mp3'
  ];

  // baseline = lo stato "di fondo" quando non sta succedendo nulla di speciale.
  // Puo' essere 'idle' (normale) oppure 'sleepy' (notte), deciso dall'orologio.
  var baseline = 'idle';

  // reacting = true mentre e' in corso una reazione TEMPORANEA (carezza o scossa),
  // serve per non far tornare subito il buddy allo stato normale mentre reagisce.
  var reacting = false;
  var reactTimer = null;

  // alarmRinging = true mentre la sveglia sta suonando. A differenza di "reacting",
  // questo stato NON si toglie da solo dopo un timer: resta finche' non si tocca "Ferma".
  var alarmRinging = false;

  // -----------------------------------------------------------------
  // Elenco sveglie: va inizializzato QUI, PRIMA che updateClock() venga
  // chiamato per la prima volta piu' sotto (updateClock parte subito e
  // controlla le sveglie: se "alarms" non esiste ancora, va in errore
  // e blocca l'esecuzione di TUTTO il resto dello script, compresi
  // i listener della carezza e dell'ingranaggio).
  // -----------------------------------------------------------------
  var STORAGE_KEY = 'deskbuddy_alarms';

  function loadAlarms() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return []; // se localStorage non e' disponibile o i dati sono corrotti, si riparte da zero
    }
  }

  function saveAlarms() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(alarms));
    } catch (e) { /* se il salvataggio fallisce, le sveglie restano comunque attive per questa sessione */ }
  }

  function newAlarmId() {
    return 'a' + Date.now() + Math.floor(Math.random() * 1000);
  }

  var alarms = loadAlarms();

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
  // risparmia batteria), decide se e' "notte" (23:00-07:00),
  // e controlla se e' scattata una sveglia.
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
      if (!reacting && !alarmRinging) { applyState(baseline); } // non interrompere una reazione o la sveglia in corso
    }

    checkAlarms(now, h, m);
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
    if (alarmRinging) { return; } // mentre suona la sveglia, il tocco non deve cambiare l'espressione
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
    if (alarmRinging) { return; } // mentre suona la sveglia, ignoriamo le scosse
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
        }).catch(function () { /* sensore non concesso, il buddy funziona lo stesso */ });
      });
    } else {
      // Android e iOS piu' vecchi: nessun permesso da chiedere, il sensore parte subito
      window.addEventListener('devicemotion', handleMotion);
    }
  }
  setupMotion();


  // =========================================================
  // SVEGLIA — pannello impostazioni
  // Ogni sveglia e' un oggetto:
  //   { id: "123", time: "07:30", days: "feriali" | "weekend" | "tutti", enabled: true }
  // (l'array "alarms" e le funzioni di salvataggio sono definite piu' in
  // alto nel file, vedi commento li')
  // =========================================================

  // ---------- Disegna il pannello impostazioni ----------
  // Ricostruisce da zero la lista delle sveglie ogni volta che qualcosa cambia:
  // e' un po' piu' "spreco" che aggiornare solo il necessario, ma il codice
  // resta molto piu' semplice da leggere e modificare.
  function renderAlarms() {
    alarmsListEl.innerHTML = ''; // svuota la lista prima di ridisegnarla

    alarms.forEach(function (alarm) {
      var row = document.createElement('div');
      row.className = 'alarm-row';

      // --- selettore orario ---
      var timeInput = document.createElement('input');
      timeInput.type = 'time';
      timeInput.value = alarm.time;
      timeInput.addEventListener('change', function () {
        alarm.time = timeInput.value;
        saveAlarms();
      });

      // --- selettore giorni ---
      var daysSelect = document.createElement('select');
      var options = [
        { value: 'feriali', label: 'Lun-Ven' },
        { value: 'weekend', label: 'Sab-Dom' },
        { value: 'tutti',   label: 'Tutti i giorni' }
      ];
      options.forEach(function (opt) {
        var optionEl = document.createElement('option');
        optionEl.value = opt.value;
        optionEl.textContent = opt.label;
        if (opt.value === alarm.days) { optionEl.selected = true; }
        daysSelect.appendChild(optionEl);
      });
      daysSelect.addEventListener('change', function () {
        alarm.days = daysSelect.value;
        saveAlarms();
      });

      // --- interruttore on/off ---
      var enabledCheckbox = document.createElement('input');
      enabledCheckbox.type = 'checkbox';
      enabledCheckbox.checked = alarm.enabled;
      enabledCheckbox.addEventListener('change', function () {
        alarm.enabled = enabledCheckbox.checked;
        saveAlarms();
      });

      // --- pulsante elimina ---
      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'alarm-delete';
      deleteBtn.textContent = '✕';
      deleteBtn.addEventListener('click', function () {
        alarms = alarms.filter(function (a) { return a.id !== alarm.id; });
        saveAlarms();
        renderAlarms();
      });

      row.appendChild(timeInput);
      row.appendChild(daysSelect);
      row.appendChild(enabledCheckbox);
      row.appendChild(deleteBtn);
      alarmsListEl.appendChild(row);
    });
  }

  addAlarmBtn.addEventListener('click', function () {
    alarms.push({ id: newAlarmId(), time: '07:00', days: 'feriali', enabled: true });
    saveAlarms();
    renderAlarms();
  });

  // apri/chiudi il pannello impostazioni
  settingsBtn.addEventListener('click', function () {
    renderAlarms(); // ridisegna sempre all'apertura, cosi' e' certamente aggiornato
    settingsPanel.classList.add('open');
  });
  settingsClose.addEventListener('click', function () {
    settingsPanel.classList.remove('open');
  });


  // =========================================================
  // SVEGLIA — controllo ogni minuto e riproduzione audio
  // =========================================================

  // memorizza l'ultimo minuto gia' controllato (es. "07:30"), per non far
  // scattare due volte la stessa sveglia durante lo stesso minuto
  var lastCheckedMinute = '';

  // Lun-Ven = feriali, Sab/Dom = weekend. getDay() restituisce 0=Domenica...6=Sabato.
  function dayMatches(alarmDays, dayOfWeek) {
    if (alarmDays === 'tutti') { return true; }
    if (alarmDays === 'feriali') { return dayOfWeek >= 1 && dayOfWeek <= 5; }
    if (alarmDays === 'weekend') { return dayOfWeek === 0 || dayOfWeek === 6; }
    return false;
  }

  function checkAlarms(now, h, m) {
    var currentTime = pad(h) + ':' + pad(m);
    if (currentTime === lastCheckedMinute) { return; } // questo minuto e' gia' stato controllato
    lastCheckedMinute = currentTime;

    if (alarmRinging) { return; } // ne sta gia' suonando una, non scatenarne un'altra sopra

    var dayOfWeek = now.getDay();
    var triggered = alarms.some(function (alarm) {
      return alarm.enabled && alarm.time === currentTime && dayMatches(alarm.days, dayOfWeek);
    });

    if (triggered) { triggerAlarm(); }
  }

  function triggerAlarm() {
    if (TRACKS.length === 0) { return; } // nessuna traccia configurata, niente da suonare

    var track = TRACKS[Math.floor(Math.random() * TRACKS.length)]; // scelta casuale ad ogni sveglia
    audioEl.src = track;
    audioEl.loop = true; // continua a ripetersi finche' non si tocca "Ferma"
    audioEl.play().catch(function () {
      // il browser ha bloccato la riproduzione automatica (nessuna interazione recente):
      // il buddy mostra comunque lo stato "sveglia", bastera' un tocco per sbloccare l'audio
    });

    alarmRinging = true;
    applyState('alarm');
    stopAlarmBtn.style.display = 'block';
  }

  function stopAlarm() {
    audioEl.pause();
    audioEl.currentTime = 0;
    alarmRinging = false;
    stopAlarmBtn.style.display = 'none';
    applyState(baseline);
  }

  stopAlarmBtn.addEventListener('click', stopAlarm);


  // stato iniziale all'avvio della pagina
  applyState(baseline);

})();
