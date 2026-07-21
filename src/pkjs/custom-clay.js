module.exports = function() {
  var clayConfig = this;

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
      var p = part.match(/[?&]period=(\d+)/);
      var d = part.match(/[?&]digits=(\d+)/);
      var path = part.split('?')[0];
      var name = safeDecode(path).trim();
      var issuer = i ? safeDecode(i[1]).trim() : name;
      var period = p ? parseInt(p[1], 10) : 30;
      if (isNaN(period) || period <= 0) period = 30;
      var digits = d ? parseInt(d[1], 10) : 6;
      if (digits !== 6 && digits !== 8) digits = 6;
      if (s) {
        parsed.push({
          'ACCOUNT_NAME': issuer,
          'ACCOUNT_SECRET': s[1].trim().toUpperCase(),
          'ACCOUNT_PERIOD': period,
          'ACCOUNT_DIGITS': digits
        });
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

    function getAccounts() {
      try {
        var val = hiddenData.get();
        if (val) return JSON.parse(val);
      } catch(e) {}
      return [];
    }

    function saveAccounts(accs) {
      hiddenData.set(JSON.stringify(accs));
    }

    // Distance (px) a touch may drift before it's treated as a scroll instead of a tap.
    var TAP_MOVE_THRESHOLD = 10;

    // Adds tap-to-select support to a scrollable container without breaking
    // native touch scrolling: a touchend only fires the callback if the
    // finger didn't move more than TAP_MOVE_THRESHOLD px since touchstart.
    function attachTapSelection(container, onSelect) {
      var startX = 0, startY = 0, moved = false;

      container.addEventListener('touchstart', function(e) {
        if (!e.touches || !e.touches.length) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        moved = false;
      }, { passive: true });

      container.addEventListener('touchmove', function(e) {
        if (!e.touches || !e.touches.length) return;
        var dx = e.touches[0].clientX - startX;
        var dy = e.touches[0].clientY - startY;
        if (Math.abs(dx) > TAP_MOVE_THRESHOLD || Math.abs(dy) > TAP_MOVE_THRESHOLD) {
          moved = true;
        }
      }, { passive: true });

      container.addEventListener('touchend', function(e) {
        if (moved) return; // was a scroll gesture, let it scroll
        var row = e.target.closest ? e.target.closest('[data-idx]') : null;
        if (!row) return;
        e.preventDefault();
        onSelect(row);
      });

      // Non-touch fallback (desktop testing / phone webviews that fire click).
      container.addEventListener('click', function(e) {
        var row = e.target.closest ? e.target.closest('[data-idx]') : null;
        if (!row) return;
        onSelect(row);
      });
    }

    function updateUI() {
      var currentAccounts = getAccounts();
      var dropdownItem = clayConfig.getItemById('account_dropdown');

      if (!dropdownItem || !dropdownItem.$element) return;

      var wrapperEl = dropdownItem.$element[0];
      var selectEl = wrapperEl.querySelector('select');
      if (!selectEl) return;

      // Keep the real <select> in sync — it's still what dropdownItem.get()/set()
      // read from, and what persists the choice, we just stop showing it.
      selectEl.innerHTML = '';
      if (currentAccounts.length === 0) {
        selectEl.options.add(new Option("No accounts available", "-1"));
      } else {
        currentAccounts.forEach(function(acc, idx) {
          var badges = [];
          if (acc.ACCOUNT_PERIOD && acc.ACCOUNT_PERIOD !== 30) badges.push(acc.ACCOUNT_PERIOD + "s");
          if (acc.ACCOUNT_DIGITS && acc.ACCOUNT_DIGITS !== 6) badges.push(acc.ACCOUNT_DIGITS + "-digit");
          var label = (idx + 1) + ". " + acc.ACCOUNT_NAME + (badges.length ? " (" + badges.join(", ") + ")" : "");
          selectEl.options.add(new Option(label, idx));
        });
      }
      dropdownItem.set(selectEl.options[0].value);
      selectEl.style.display = 'none';

      // Build (or reuse) a touch-friendly list mirroring the select's options.
      var listEl = wrapperEl.querySelector('.account-touch-list');
      if (!listEl) {
        listEl = document.createElement('div');
        listEl.className = 'account-touch-list';
        listEl.style.cssText =
          'max-height:200px;overflow-y:auto;-webkit-overflow-scrolling:touch;' +
          'border:1px solid #ccc;border-radius:4px;margin-top:6px;background:#fff;';
        wrapperEl.appendChild(listEl);

        attachTapSelection(listEl, function(row) {
          dropdownItem.set(row.getAttribute('data-idx'));
          var rows = listEl.querySelectorAll('[data-idx]');
          for (var r = 0; r < rows.length; r++) {
            rows[r].style.background = '';
            rows[r].style.color = '';
          }
          row.style.background = '#4a90d9';
          row.style.color = '#fff';
        });
      }

      listEl.innerHTML = '';
      for (var idx = 0; idx < selectEl.options.length; idx++) {
        var opt = selectEl.options[idx];
        var row = document.createElement('div');
        row.textContent = opt.text;
        row.setAttribute('data-idx', opt.value);
        row.style.cssText =
          'padding:10px 8px;border-bottom:1px solid #eee;font-size:14px;' +
          (idx === selectEl.options.length - 1 ? 'border-bottom:none;' : '');
        if (idx === 0) {
          row.style.background = '#4a90d9';
          row.style.color = '#fff';
        }
        listEl.appendChild(row);
      }
    }

    function onImport() {
      var inputField = clayConfig.getItemById('import_text');
      var text = inputField.get();
      if (text) {
        var accs = getAccounts();
        var newAccs = parseOtpAuthStrings(text);
        if (newAccs.length > 0) {
          accs = accs.concat(newAccs);
          saveAccounts(accs);
          updateUI();
          inputField.set('');
          showStatus(newAccs.length + " accounts imported!");
        } else {
          showStatus("Error: No valid links.");
        }
      } else {
        showStatus("Error: Import field is empty.");
      }
    }

    function onAdd() {
      var nameField = clayConfig.getItemById('manual_name');
      var secField = clayConfig.getItemById('manual_secret');
      var periodField = clayConfig.getItemById('manual_period');
      var digitsField = clayConfig.getItemById('manual_digits');
      var n = nameField.get().trim();
      var s = secField.get().trim();
      var period = periodField ? parseInt(periodField.get(), 10) : 30;
      if (isNaN(period) || period <= 0) period = 30;
      var digits = digitsField ? parseInt(digitsField.get(), 10) : 6;
      if (digits !== 6 && digits !== 8) digits = 6;

      if (n && s) {
        var accs = getAccounts();
        accs.push({
          'ACCOUNT_NAME': n,
          'ACCOUNT_SECRET': s.replace(/\s+/g, '').toUpperCase(),
          'ACCOUNT_PERIOD': period,
          'ACCOUNT_DIGITS': digits
        });
        saveAccounts(accs);
        updateUI();
        nameField.set('');
        secField.set('');
        showStatus("Account added manually!");
      } else {
        showStatus("Error: Please enter Name and Secret.");
      }
    }

    var clearClicks = 0;
    function onDeleteSingle() {
      var dropdownItem = clayConfig.getItemById('account_dropdown');
      var selectedValue = dropdownItem.get();

      if (selectedValue !== null && selectedValue !== "-1" && selectedValue !== "") {
        var idx = parseInt(selectedValue, 10);
        var accs = getAccounts();

        if (!isNaN(idx) && idx >= 0 && idx < accs.length) {
          accs.splice(idx, 1);
          saveAccounts(accs);
          updateUI();
          showStatus("Account successfully deleted!");
        } else {
          showStatus("Error: Invalid index.");
        }
      } else {
        showStatus("Error: No account selected.");
      }
    }

    function onClearAll() {
      if (clearClicks === 0) {
        showStatus("Really delete ALL? Click again!");
        clearClicks++;
        setTimeout(function() { clearClicks = 0; }, 4000);
      } else {
        saveAccounts([]);
        updateUI();
        showStatus("ALL accounts have been deleted!");
        clearClicks = 0;
      }
    }

    function bindButtonByLabel(label, callback) {
      var allButtons = document.querySelectorAll('button');
      for (var i = 0; i < allButtons.length; i++) {
        if (allButtons[i].innerText.trim().toUpperCase() === label.toUpperCase()) {
          allButtons[i].addEventListener('touchend', function(e) {
            e.preventDefault();
            e.stopPropagation();
            callback();
          });
          allButtons[i].addEventListener('click', function(e) {
            e.preventDefault();
            callback();
          });
          return;
        }
      }
    }

    updateUI();

    bindButtonByLabel('Import',                  onImport);
    bindButtonByLabel('Add',                     onAdd);
    bindButtonByLabel('Delete Selected Account', onDeleteSingle);
    bindButtonByLabel('Delete ALL Accounts',     onClearAll);

    showStatus("Ready.");
  });
};
