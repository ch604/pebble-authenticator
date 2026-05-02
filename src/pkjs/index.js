var Clay = require('@rebble/clay');
var clayConfig = require('./clay-config.json');
var customClay = require('./custom-clay.js'); // <-- NEU: Unser Custom Script einbinden

// <-- NEU: customClay an Clay übergeben
var clay = new Clay(clayConfig, customClay, { autoHandleEvents: false }); 

Pebble.addEventListener('showConfiguration', function(e) {
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (e && !e.response) { return; }

  var settings = JSON.parse(decodeURIComponent(e.response));
  
  // --- NEU: Prüfen, ob der Löschen-Button gedrückt wurde ---
  if (settings.ACTION_CLEAR_ALL) {
    console.log("Benutzer hat das Löschen aller Accounts angefordert.");
    Pebble.sendAppMessage({ 'CLEAR_ACCOUNTS': 1 }, function() {
      // Bestätigungs-Vibration und Text auf der Uhr
      Pebble.showSimpleNotificationOnPebble("Authenticator", "Alle Accounts wurden gelöscht!");
    }, function(error) {
      console.log("Fehler beim Löschen: " + JSON.stringify(error));
    });
    
    return; // Hier abbrechen, damit wir nicht noch versuchen, leere Daten zu parsen
  }
  // ---------------------------------------------------------

  var rawData = settings.TOTP_EXPORT_DATA; 

  if (typeof rawData === 'object' && rawData !== null) {
    rawData = rawData.value;
  }

  if (rawData) {
    var accounts = parseOtpAuthStrings(rawData);
    if (accounts.length > 0) {
      sendAccountsToWatch(accounts);
    }
  }
});

function safeDecode(str) {
  try {
    return decodeURIComponent(str);
  } catch (e) {
    // Wenn das Dekodieren fehlschlägt (wegen kaputter % Zeichen),
    // geben wir einfach den rohen String zurück, statt abzustürzen!
    return str; 
  }
}

function safeDecode(str) {
  try {
    return decodeURIComponent(str);
  } catch (e) {
    return str; 
  }
}

function parseOtpAuthStrings(text) {
  var accounts = [];
  
  // Der Trick: Wir zerschneiden den riesigen String direkt am "otpauth://totp/"
  // Dadurch ist es egal, ob alles in einer langen Zeile steht!
  var parts = text.split('otpauth://totp/');
  
  parts.forEach(function(part) {
    // Leere Schnipsel (z.B. vor dem allerersten Link) ignorieren wir
    if (part.trim().length === 0) return;
    
    // Nach dem Split sieht "part" jetzt so aus: "Cloud%20...&issuer=AWS"
    // Wir suchen das Secret (stoppen bei & oder Leerzeichen)
    var secretMatch = part.match(/[?&]secret=([^&\s]+)/);
    // Wir suchen den Issuer (stoppen bei & oder unsichtbaren Umbrüchen)
    var issuerMatch = part.match(/[?&]issuer=([^&\n\r]+)/);
    
    // Der Pfad-Name ist alles vor dem ersten "?"
    var pathPart = part.split('?')[0];
    
    var name = safeDecode(pathPart).trim();
    var issuer = issuerMatch ? safeDecode(issuerMatch[1]).trim() : name;
    
    if (secretMatch) {
      accounts.push({
        'ACCOUNT_NAME': issuer,
        'ACCOUNT_SECRET': secretMatch[1].trim()
      });
    }
  });
  
  console.log("Gefundene Accounts: " + accounts.length);
  return accounts;
}

function sendAccountsToWatch(accounts) {
  Pebble.sendAppMessage({ 'CLEAR_ACCOUNTS': 1 }, function() {
    sendNextAccount(accounts, 0);
  }, function(e) {
    console.log("Fehler beim Löschen: " + JSON.stringify(e));
  });
}

function sendNextAccount(accounts, index) {
  if (index >= accounts.length) {
    // Schicke eine schöne Push-Benachrichtigung an die Uhr, wenn alles fertig ist!
    Pebble.showSimpleNotificationOnPebble("Authenticator", accounts.length + " Accounts importiert!");
    return;
  }

  Pebble.sendAppMessage(accounts[index], function() {
    sendNextAccount(accounts, index + 1);
  }, function(e) {
    setTimeout(function() { sendNextAccount(accounts, index); }, 1000);
  });
}