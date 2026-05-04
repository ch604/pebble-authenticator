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

    // Clay saves hidden_data persistently thanks to autoHandleEvents: true in index.js
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

    function updateUI() {
      var currentAccounts = getAccounts();
      var dropdownItem = clayConfig.getItemById('account_dropdown');

      if (dropdownItem && dropdownItem.$element) {
        var selectEl = dropdownItem.$element[0].querySelector('select');

        if (selectEl) {
          selectEl.innerHTML = '';

          if (currentAccounts.length === 0) {
            selectEl.options.add(new Option("No accounts available", "-1"));
          } else {
            currentAccounts.forEach(function(acc, idx) {
              selectEl.options.add(new Option((idx + 1) + ". " + acc.ACCOUNT_NAME, idx));
            });
          }

          dropdownItem.set(selectEl.options[0].value);
        }
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
      var n = nameField.get().trim();
      var s = secField.get().trim();

      if (n && s) {
        var accs = getAccounts();
        accs.push({ 'ACCOUNT_NAME': n, 'ACCOUNT_SECRET': s.replace(/\s+/g, '').toUpperCase() });
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