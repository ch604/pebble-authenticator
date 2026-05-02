module.exports = function() {
  var clayConfig = this;

  // Hilfsfunktion: URL Parameter auslesen
  function getQueryParam(variable) {
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
      var pair = vars[i].split('=');
      if (pair[0] == variable) { return decodeURIComponent(pair[1]); }
    }
    return false;
  }

  function safeDecode(str) {
    try { return decodeURIComponent(str); } catch (e) { return str; }
  }

  function parseOtpAuthStrings(text) {
    var parsed = [];
    var parts = text.split('otpauth://totp/');
    parts.forEach(function(part) {
      if (!part.trim()) return;
      var s = part.match(/[?&]secret=([^&\s]+)/);
      var i = part.match(/[?&]issuer=([^&\n\r]+)/);
      var path = part.split('?')[0];
      var name = safeDecode(path).trim();
      var issuer = i ? safeDecode(i[1]).trim() : name;
      if (s) {
        parsed.push({ 'ACCOUNT_NAME': issuer, 'ACCOUNT_SECRET': s[1].trim().toUpperCase() });
      }
    });
    return parsed;
  }

  clayConfig.on(clayConfig.EVENTS.AFTER_BUILD, function() {
    var hiddenData = clayConfig.getItemById('hidden_data');
    var statusBar = clayConfig.getItemById('status_bar');

    function showStatus(msg) {
      if (statusBar) statusBar.set(msg);
    }

    // --- SICHERER SPEICHER: Liest die unverwüstlichen Daten ---
    function getAccounts() {
      try {
        var val = window.localStorage.getItem('pebble_totp_accounts');
        if (val) return JSON.parse(val);
        var hiddenVal = hiddenData.get();
        if (hiddenVal) return JSON.parse(hiddenVal);
      } catch(e) {}
      return [];
    }

    // Sichert die Daten doppelt (Lokal + für die Uhr)
    function saveAccounts(accs) {
      window.localStorage.setItem('pebble_totp_accounts', JSON.stringify(accs));
      hiddenData.set(JSON.stringify(accs));
    }

    // --- NEU: DIE REPARIERTE DROPDOWN-FUNKTION ---
    function updateUI() {
      var currentAccounts = getAccounts();
      
      // Wir holen uns das Dropdown GANZ OFFIZIELL über Clay
      var dropdownItem = clayConfig.getItemById('account_dropdown');
      
      if (dropdownItem && dropdownItem.$element) {
        // Wir suchen das echte HTML <select> Element innerhalb der Clay-Komponente
        var selectEl = dropdownItem.$element[0].querySelector('select');
        
        if (selectEl) {
          selectEl.innerHTML = ''; // Alte Auswahlmöglichkeiten löschen
          
          if (currentAccounts.length === 0) {
            selectEl.options.add(new Option("Keine Accounts vorhanden", "-1"));
          } else {
            // Neue Optionen schreiben
            currentAccounts.forEach(function(acc, idx) {
              selectEl.options.add(new Option((idx + 1) + ". " + acc.ACCOUNT_NAME, idx));
            });
          }
          
          // ZWINGT Clay dazu, das eigene UI zu aktualisieren, damit du die Einträge auch siehst!
          dropdownItem.set(selectEl.options[0].value);
        }
      }
    }

    // Start: Einmal abgleichen und Dropdown befüllen
    saveAccounts(getAccounts());
    setTimeout(updateUI, 100);

    // --- BUTTON: IMPORTIEREN ---
    clayConfig.getItemById('btn_import').on('click', function() {
      var inputField = clayConfig.getItemById('import_text');
      var text = inputField.get();
      if (text) {
        var accs = getAccounts();
        var newAccs = parseOtpAuthStrings(text);
        if (newAccs.length > 0) {
          accs = accs.concat(newAccs);
          saveAccounts(accs);
          updateUI(); // Baut das Dropdown mit den neuen Accounts frisch auf
          inputField.set('');
          showStatus(newAccs.length + " Accounts importiert!");
        } else {
          showStatus("Fehler: Keine gültigen Links.");
        }
      } else {
        showStatus("Fehler: Import-Feld ist leer.");
      }
    });

    // --- BUTTON: MANUELL HINZUFÜGEN ---
    clayConfig.getItemById('btn_add').on('click', function() {
      var nameField = clayConfig.getItemById('manual_name');
      var secField = clayConfig.getItemById('manual_secret');
      var n = nameField.get().trim();
      var s = secField.get().trim();

      if (n && s) {
        var accs = getAccounts();
        accs.push({ 'ACCOUNT_NAME': n, 'ACCOUNT_SECRET': s.replace(/\s+/g, '').toUpperCase() });
        saveAccounts(accs);
        updateUI(); // Baut das Dropdown frisch auf
        nameField.set('');
        secField.set('');
        showStatus("Account manuell hinzugefügt!");
      } else {
        showStatus("Fehler: Bitte Name und Secret eingeben.");
      }
    });

    // --- BUTTON: EINZELN LÖSCHEN (REPARIERT) ---
    clayConfig.getItemById('btn_delete_single').on('click', function() {
      // Wir fragen direkt Clay, was der Nutzer im Dropdown gewählt hat!
      var dropdownItem = clayConfig.getItemById('account_dropdown');
      var selectedValue = dropdownItem.get(); 

      // Wenn ein gültiger Wert (nicht leer und nicht "-1") gewählt wurde
      if (selectedValue !== null && selectedValue !== "-1" && selectedValue !== "") {
        var idx = parseInt(selectedValue, 10);
        var accs = getAccounts();
        
        // Sicherheits-Check, ob die Zahl im Array existiert
        if (!isNaN(idx) && idx >= 0 && idx < accs.length) {
          accs.splice(idx, 1); // Exakt diesen Eintrag entfernen
          saveAccounts(accs);
          updateUI(); // Dropdown aktualisieren (der gelöschte verschwindet)
          showStatus("Account erfolgreich gelöscht!");
        } else {
          showStatus("Fehler: Ungültiger Index.");
        }
      } else {
        showStatus("Fehler: Kein Account ausgewählt.");
      }
    });

    // --- BUTTON: ALLES LÖSCHEN ---
    var clearClicks = 0;
    clayConfig.getItemById('btn_clear_all').on('click', function() {
      if (clearClicks === 0) {
        showStatus("Wirklich ALLE löschen? Klicke erneut!");
        clearClicks++;
        setTimeout(function() { clearClicks = 0; }, 4000);
      } else {
        saveAccounts([]);
        updateUI();
        showStatus("ALLE Accounts wurden gelöscht!");
        clearClicks = 0;
      }
    });
  });
};