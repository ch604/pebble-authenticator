module.exports = function() {
  var clayConfig = this;

  // Hilfsfunktion: Liest Parameter aus der Web-Adresse (URL) aus
  function getQueryParam(variable) {
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
      var pair = vars[i].split('=');
      if (pair[0] == variable) {
        return decodeURIComponent(pair[1]);
      }
    }
    return false;
  }

  clayConfig.on(clayConfig.EVENTS.AFTER_BUILD, function() {
    var clearBtn = clayConfig.getItemById('clear_btn');
    
    clearBtn.on('click', function() {
      var isConfirmed = window.confirm("Bist du sicher, dass du alle Accounts auf der Uhr unwiderruflich löschen möchtest?");
      
      if (isConfirmed) {
        var result = { ACTION_CLEAR_ALL: true };
        
        // Wir schnappen uns den dynamischen Return-Pfad, den Pebble uns mitgegeben hat
        // (Falls keiner da ist, nutzen wir den Standard-Pfad als Fallback)
        var returnTo = getQueryParam('return_to') || 'pebblejs://close#';
        
        // Schließt das Fenster und sendet unsere Daten an die index.js
        window.location.href = returnTo + encodeURIComponent(JSON.stringify(result));
      }
    });
  });
};