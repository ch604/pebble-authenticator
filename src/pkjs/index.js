var Clay = require('@rebble/clay');
var clayConfig = require('./clay-config.json');
var customClay = require('./custom-clay.js'); 

var clay = new Clay(clayConfig, customClay, { autoHandleEvents: true }); 

Pebble.addEventListener('showConfiguration', function(e) {
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
      console.log("Error parsing the list.");
    }
  }

  console.log("Sending " + accounts.length + " accounts to the watch.");

  Pebble.sendAppMessage({ 'CLEAR_ACCOUNTS': 1 }, function() {
    if (accounts.length > 0) {
      sendNextAccount(accounts, 0);
    } else {
      Pebble.showSimpleNotificationOnPebble("Authenticator", "No accounts on the watch.");
    }
  }, function(error) {
    console.log("Error clearing: " + JSON.stringify(error));
  });
});

function sendNextAccount(accounts, index) {
  if (index >= accounts.length) {
    Pebble.showSimpleNotificationOnPebble("Authenticator", accounts.length + " accounts saved!");
    return;
  }

  Pebble.sendAppMessage(accounts[index], function() {
    sendNextAccount(accounts, index + 1);
  }, function(e) {
    setTimeout(function() { sendNextAccount(accounts, index); }, 1000);
  });
}