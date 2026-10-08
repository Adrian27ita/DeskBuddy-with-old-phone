(function () {
  "use strict";

  // ---------- Riferimenti agli elementi della pagina ----------
  var wrap  = document.getElementById('buddy-wrap');
  var canvas = document.getElementById('face');
  var ctx = canvas.getContext('2d');
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
  var tracksInput   = document.getElementById('tracks-input');
  var addTracksBtn  = document.getElementById('add-tracks');
  var tracksListEl  = document.getElementById('tracks-list');

  // -----------------------------------------------------------------
  // ELENCO TRACCE DI RISERVA (usate solo se non ne hai scelte dal telefono):
  // nomi dei file mp3 (devono stare nella
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
  var currentState = 'idle'; // stato mostrato adesso: idle / happy / dizzy / sleepy / alarm
  function applyState(state) {
    currentState = state;
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
  // GRAFICA PIXEL ART
  // Il viso e' una piccola griglia di "pixel" (W x H) disegnata su
  // un <canvas>: ogni pixel logico viene ingrandito SCALE volte.
  // Ogni stato (idle/happy/dizzy/sleepy/alarm) ha il suo disegno.
  // Per cambiare dimensione: modifica SCALE. Per i colori: cerca i codici #xxxxxx.
  // =========================================================
  var W = 40, H = 30, SCALE = 7;   // griglia logica 40x30, ogni pixel = 7px reali
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;

  var lookX = 0, lookY = 0;  // dove guardano le pupille, in pixel logici (-1, 0, 1)
  var blinking = false;      // true per un attimo quando sbatte le palpebre
  var tick = 0;              // contatore dei frame, serve per le animazioni cicliche

  // disegna un singolo pixel logico / un rettangolo di pixel
  function px(x, y, c) { ctx.fillStyle = c; ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE); }
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x * SCALE, y * SCALE, w * SCALE, h * SCALE); }
  function pts(list, c) { for (var i = 0; i < list.length; i++) { px(list[i][0], list[i][1], c); } }

  // ellisse a pixel: riempie ogni pixel il cui centro cade dentro la forma
  function ellipse(cx, cy, rx, ry, c) {
    for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (var x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) { px(x, y, c); }
      }
    }
  }

  // occhio aperto "anime": base scura, iride chiara, pupilla mobile e due riflessi bianchi
  function openEye(cx, cy, rx, ry, iris, dark) {
    ellipse(cx, cy, rx, ry, dark);
    ellipse(cx, cy - 0.8, rx - 0.3, ry - 1.2, iris);
    ellipse(cx + lookX, cy + lookY + 0.5, 2.2, 2.6, '#1A1030');
    rect(Math.round(cx - rx + 1.5), Math.round(cy - ry + 1.5), 2, 2, '#FFFFFF'); // riflesso grande
    px(Math.round(cx + rx - 2.5), Math.round(cy + ry - 2.5), '#FFFFFF');         // riflesso piccolo
  }

  // occhio chiuso (battito di ciglia / sonno): una linea
  function lineEye(cx, cy, c) { rect(cx - 4, cy, 8, 1, c); }

  // occhio felice "^": un piccolo arco spesso 2 pixel
  function archEye(cx, cy, c) {
    var dy = [1, 0, -1, -1, -1, -1, 0, 1];
    for (var i = 0; i < 8; i++) { px(cx - 4 + i, cy + dy[i], c); px(cx - 4 + i, cy + dy[i] + 1, c); }
  }

  // occhio stordito: alterna "X" e "+" per dare l'idea che giri
  function dizzyEye(cx, cy, c) {
    for (var i = 0; i < 7; i++) {
      if (tick % 4 < 2) { px(cx - 3 + i, cy - 3 + i, c); px(cx + 3 - i, cy - 3 + i, c); }
      else { px(cx - 3 + i, cy, c); px(cx, cy - 3 + i, c); }
    }
  }

  function sparkle(x, y, c) { pts([[x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]], c); }

  function drawEye(s, cx, cy) {
    if (s === 'happy')  { archEye(cx, cy, '#FF9EC4'); }
    else if (s === 'dizzy')  { dizzyEye(cx, cy, '#C9B6FF'); }
    else if (s === 'sleepy') { lineEye(cx, cy + 1, '#8B8B99'); }
    else if (s === 'alarm')  { openEye(cx, cy, 5, 6.6, '#FFD84D', '#E0A800'); }
    else if (blinking)       { lineEye(cx, cy + 1, '#7FDCFF'); }
    else                     { openEye(cx, cy, 4.5, 6, '#7FDCFF', '#3C8DD8'); }
  }

  function drawMouth(s) {
    if (s === 'happy') {
      rect(17, 22, 6, 1, '#FF6FA0'); rect(18, 23, 4, 1, '#FF6FA0'); rect(19, 23, 2, 1, '#FFB3C7');
    } else if (s === 'dizzy') {
      pts([[17, 23], [18, 22], [19, 23], [20, 22], [21, 23], [22, 22]], '#C9B6FF');
    } else if (s === 'sleepy') {
      rect(19, 22, 2, 2, '#8B8B99');
    } else if (s === 'alarm') {
      rect(18, 22, 4, 1, '#FF6FA0'); rect(18, 24, 4, 1, '#FF6FA0'); px(18, 23, '#FF6FA0'); px(21, 23, '#FF6FA0');
    } else {
      pts([[17, 22], [18, 23], [19, 22], [20, 22], [21, 23], [22, 22]], '#FFB3C7'); // boccuccia "w"
    }
  }

  function drawFace(s) {
    drawEye(s, 10, 11);
    drawEye(s, 30, 11);

    // guanciotte rosa (piu' vivaci quando e' felice, assenti se stordito o in allarme)
    var blush = s === 'happy' ? '#FF6FA0' : (s === 'idle' ? '#6E2A4A' : (s === 'sleepy' ? '#4D2A45' : null));
    if (blush) { ellipse(8, 19.5, 2.4, 1.2, blush); ellipse(32, 19.5, 2.4, 1.2, blush); }

    drawMouth(s);

    if (s === 'happy') { // scintillii che si alternano
      if (tick % 8 < 4) { sparkle(3, 5, '#FFFFFF'); } else { sparkle(36, 7, '#FFFFFF'); }
    }
    if (s === 'sleepy') { // una piccola "z" che fluttua
      var zy = (tick % 24 < 12) ? 4 : 3;
      pts([[32, zy], [33, zy], [34, zy], [33, zy + 1], [32, zy + 2], [33, zy + 2], [34, zy + 2]], '#8B8B99');
    }
  }

  // ridisegna tutto 10 volte al secondo (stile "pochi frame" tipico della pixel art)
  function draw() {
    tick++;
    var s = currentState, ox = 0, oy = 0;
    if (s === 'idle')   { oy = (tick % 20 < 10) ? 0 : 1; }  // respiro lento
    if (s === 'sleepy') { oy = (tick % 30 < 15) ? 0 : 1; }  // respiro ancora piu' lento
    if (s === 'dizzy')  { ox = (tick % 2) ? -1 : 1; }       // trema
    if (s === 'alarm')  { oy = (tick % 2) ? 0 : 1; }        // salta
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(ox * SCALE, oy * SCALE);
    drawFace(s);
    ctx.restore();
  }
  setInterval(draw, 100);


  // =========================================================
  // SGUARDO CHE VAGA DA SOLO
  // Ogni tot secondi sposta le pupille di un pixel in una direzione casuale.
  // =========================================================
  function lookRandom() {
    lookX = Math.round((Math.random() * 2 - 1) * 1.4);
    lookY = Math.round((Math.random() * 2 - 1) * 1.4);
  }

  function scheduleLook() {
    var delay = 1600 + Math.random() * 1800; // ogni 1.6-3.4s
    setTimeout(function () {
      lookRandom();
      scheduleLook(); // si auto-richiama all'infinito
    }, delay);
  }
  scheduleLook();


  // =========================================================
  // BATTITO DI CIGLIA
  // Ogni 2.5-6s circa gli occhi si chiudono per un attimo.
  // =========================================================
  function scheduleBlink() {
    var delay = 2500 + Math.random() * 3500;
    setTimeout(function () {
      blinking = true;
      setTimeout(function () { blinking = false; }, 160);
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
  // Sensibilita': piu' BASSO = reagisce anche a scosse leggere (prima era 25).
  // Se scatta da solo mentre cammina/appoggi il telefono, alzalo un po'.
  var SHAKE_THRESHOLD = 12;
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

      // oltre la soglia consideriamo il movimento una "scossa" (vedi SHAKE_THRESHOLD)
      if (delta > SHAKE_THRESHOLD && now - lastShakeTime > 1000) { // non piu' di una volta al secondo
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
  // TRACCE DAL TELEFONO
  // Si scelgono dal pannello (selettore file del telefono) e vengono
  // salvate in IndexedDB, il database interno del browser: cosi' restano
  // anche dopo la chiusura della pagina o un riavvio. Se IndexedDB non e'
  // disponibile, le tracce valgono solo finche' la pagina resta aperta.
  // =========================================================
  var userTracks = [];   // elementi { id, name, blob }
  var db = null;
  var currentObjectUrl = null;

  function openDb(done) {
    if (!window.indexedDB) { done(); return; }
    try {
      var req = indexedDB.open('deskbuddy', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('tracks', { keyPath: 'id' }); };
      req.onsuccess = function () { db = req.result; done(); };
      req.onerror = function () { done(); };
    } catch (e) { done(); }
  }

  function dbStore(mode) { return db.transaction('tracks', mode).objectStore('tracks'); }

  function loadTracks(done) {
    if (!db) { done(); return; }
    var out = [];
    var cur = dbStore('readonly').openCursor();
    cur.onsuccess = function () {
      var c = cur.result;
      if (c) { out.push(c.value); c.continue(); } else { userTracks = out; done(); }
    };
    cur.onerror = function () { done(); };
  }

  function renderTracks() {
    tracksListEl.innerHTML = '';
    userTracks.forEach(function (t) {
      var row = document.createElement('div');
      row.className = 'alarm-row';
      var name = document.createElement('span');
      name.className = 'track-name';
      name.textContent = t.name;
      var del = document.createElement('button');
      del.className = 'alarm-delete';
      del.textContent = '✕';
      del.addEventListener('click', function () {
        userTracks = userTracks.filter(function (x) { return x.id !== t.id; });
        if (db) { try { dbStore('readwrite').delete(t.id); } catch (e) {} }
        renderTracks();
      });
      row.appendChild(name);
      row.appendChild(del);
      tracksListEl.appendChild(row);
    });
  }

  addTracksBtn.addEventListener('click', function () { tracksInput.click(); });
  tracksInput.addEventListener('change', function () {
    var files = tracksInput.files;
    for (var i = 0; i < files.length; i++) {
      var t = { id: 't' + Date.now() + '_' + i, name: files[i].name, blob: files[i] };
      userTracks.push(t);
      if (db) { try { dbStore('readwrite').put(t); } catch (e) {} }
    }
    tracksInput.value = ''; // permette di riselezionare lo stesso file in futuro
    renderTracks();
  });

  // Restituisce l'indirizzo audio da suonare: una traccia a caso tra quelle scelte
  // dal telefono; se non ce ne sono, una a caso dall'elenco di riserva TRACKS.
  function pickTrackSource() {
    if (userTracks.length > 0) {
      var t = userTracks[Math.floor(Math.random() * userTracks.length)];
      if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); }
      currentObjectUrl = URL.createObjectURL(t.blob);
      return currentObjectUrl;
    }
    if (TRACKS.length > 0) { return TRACKS[Math.floor(Math.random() * TRACKS.length)]; }
    return null;
  }

  openDb(function () { loadTracks(renderTracks); });


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
    var src = pickTrackSource(); // scelta casuale ad ogni sveglia
    if (src) {
      audioEl.src = src;
      audioEl.loop = true; // continua a ripetersi finche' non si tocca "Ferma"
      var p = audioEl.play();
      // sui browser vecchi play() non restituisce nulla, per questo il controllo "p && p.catch"
      if (p && p.catch) {
        p.catch(function () {
          // riproduzione automatica bloccata dal browser: il buddy mostra comunque
          // lo stato "sveglia", bastera' un tocco per sbloccare l'audio
        });
      }
    }

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
