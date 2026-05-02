var Clay = require('@rebble/clay');
var clayConfig = require('./clay-config.json');
var customClay = require('./custom-clay.js'); 

var clay = new Clay(clayConfig, customClay, { autoHandleEvents: false }); 

Pebble.addEventListener('showConfiguration', function(e) {
  // Kein URL-Trick mehr nötig. Öffnet einfach die Seite.
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (e && !e.response) { return; }

  var settings = JSON.parse(decodeURIComponent(e.response));
  var rawData = settings.TOTP_EXPORT_DATA; 
  
  if (typeof rawData === 'object' && rawData !== null) {
    rawData = rawData.value;
  }

  var accounts = [];
  if (rawData) {
    try {
      accounts = JSON.parse(rawData);
    } catch(err) {
      console.log("Fehler beim Parsen der Liste.");
    }
  }

  console.log("Sende " + accounts.length + " Accounts an die Uhr.");

  Pebble.sendAppMessage({ 'CLEAR_ACCOUNTS': 1 }, function() {
    if (accounts.length > 0) {
      sendNextAccount(accounts, 0);
    } else {
      Pebble.showSimpleNotificationOnPebble("Authenticator", "Keine Accounts auf der Uhr.");
    }
  }, function(error) {
    console.log("Fehler beim Leeren: " + JSON.stringify(error));
  });
});

function sendNextAccount(accounts, index) {
  if (index >= accounts.length) {
    Pebble.showSimpleNotificationOnPebble("Authenticator", accounts.length + " Accounts gespeichert!");
    return;
  }

  Pebble.sendAppMessage(accounts[index], function() {
    sendNextAccount(accounts, index + 1);
  }, function(e) {
    setTimeout(function() { sendNextAccount(accounts, index); }, 1000);
  });
}