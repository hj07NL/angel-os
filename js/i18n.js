/* Vertaalsysteem. Standaardtaal: Nederlands. Alle gedeelde interfaceteksten staan hier op één plek.
   Gebruik: AOS.t('key') of AOS.t('key', { n: 3 }). Ontbrekende sleutels vallen terug op de sleutel zelf. */
(function () {
  'use strict';
  const nl = {
    // apps
    'app.home': 'Startpagina', 'app.agenda': 'Agenda & taken', 'app.library': 'Websitebibliotheek', 'app.angel': 'Angel',
    'app.notes': 'Notities', 'app.projects': 'Projecten', 'app.personax': 'PersonaX AI', 'app.settings': 'Instellingen',
    'app.quality': 'Kwaliteitscontrole', 'app.tasks': 'Taakbeheer', 'app.health': 'Websitecontrole', 'app.launcher': 'Appbibliotheek',
    'app.viewer': 'Websiteviewer', 'app.notifications': 'Meldingen',
    // algemeen
    'common.save': 'Opslaan', 'common.cancel': 'Annuleren', 'common.add': 'Toevoegen', 'common.delete': 'Verwijderen', 'common.edit': 'Bewerken',
    'common.close': 'Sluiten', 'common.open': 'Openen', 'common.new': 'Nieuw', 'common.search': 'Zoeken', 'common.today': 'Vandaag', 'common.tomorrow': 'Morgen',
    'common.yes': 'Ja', 'common.no': 'Nee', 'common.ok': 'OK', 'common.undo': 'Ongedaan maken', 'common.confirm': 'Bevestigen', 'common.back': 'Terug',
    'common.loading': 'Laden…', 'common.none': 'Niets', 'common.unknown': 'Onbekend', 'common.settings': 'Instellingen', 'common.rename': 'Hernoemen',
    'common.move': 'Verplaatsen', 'common.hide': 'Verbergen', 'common.show': 'Tonen', 'common.reset': 'Herstellen', 'common.all': 'Alles', 'common.done': 'Klaar',
    'common.apply': 'Toepassen', 'common.saved': 'Opgeslagen', 'common.error': 'Er ging iets mis', 'common.retry': 'Opnieuw proberen', 'common.never': 'Nooit',
    'common.name': 'Naam', 'common.url': 'URL', 'common.icon': 'Icoon', 'common.empty': 'Hier staat nog niets.', 'common.more': 'Meer',
    // shell
    'island.search': 'Zoek of vraag Angel', 'island.focus': 'Focus', 'island.next': 'Volgende', 'island.quick': 'Snel noteren — bijv. ‘Morgen om 16:00 economie leren’',
    'island.toSearch': 'Naar zoekbalk', 'island.noTasks': 'Geen open taken voor vandaag 🎉', 'island.start': 'Start', 'island.pause': 'Pauze', 'island.resume': 'Verder',
    'island.weather': 'Weer', 'island.openAngel': 'Open Angel', 'island.notifications': 'Meldingen',
    'launcher.search': 'Zoek apps', 'launcher.edit': 'Bewerken', 'launcher.doneEdit': 'Klaar', 'launcher.addWebsite': 'Website als app', 'launcher.addGroup': 'Nieuwe groep',
    'launcher.hidden': 'Verborgen apps', 'launcher.openIn': 'Openen in', 'launcher.openOs': 'Binnen Angel OS', 'launcher.openTab': 'Nieuw tabblad', 'launcher.inDock': 'In dock',
    // taken
    'task.type.task': 'Taak', 'task.type.reminder': 'Herinnering', 'task.type.event': 'Afspraak', 'task.type.homework': 'Huiswerk', 'task.type.test': 'Toets',
    'task.type.project': 'Project', 'task.type.reading': 'Lezen',
    'task.added': 'Toegevoegd', 'task.overdue': 'Te laat', 'task.rolled': '{n} taken doorgeschoven', 'task.noneToday': 'Niets gepland voor vandaag.',
    'roll.auto': 'Automatisch naar de volgende dag', 'roll.overdue': 'Uit: blijft in ‘Te laat’ staan', 'roll.ask': 'Eerst vragen',
    // websites
    'site.status.online': 'Online', 'site.status.offline': 'Offline of onbereikbaar', 'site.status.redirected': 'Doorverwezen', 'site.status.https_valid': 'HTTPS geldig',
    'site.status.cert_problem': 'Certificaatprobleem', 'site.status.suspicious': 'Mogelijk verdacht', 'site.status.not_verified': 'Beveiliging niet geverifieerd',
    'site.status.inconclusive': 'Controle onduidelijk', 'site.status.parked': 'Geparkeerd domein', 'site.status.unchecked': 'Nog niet gecontroleerd',
    'site.reorganize': 'Websites opnieuw indelen', 'site.uncategorized': 'Niet ingedeeld',
    // meldingen
    'notif.task_reminders': 'Taakherinneringen', 'notif.overdue': 'Meldingen voor te late taken', 'notif.daily_summary': 'Dagplanning-samenvatting',
    'notif.site_availability': 'Website-beschikbaarheid', 'notif.site_security': 'Website-beveiliging', 'notif.recommendations': 'Aanbevelingen van Angel',
    'notif.weather': 'Weermeldingen', 'notif.weekly': 'Weekoverzicht', 'notif.monthly': 'Maandelijks websiterapport', 'notif.empty': 'Geen meldingen.',
    // widgets
    'widget.clock': 'Klok & datum', 'widget.weather': 'Weer', 'widget.agenda': 'Agenda', 'widget.todo': 'Vandaag te doen', 'widget.quick': 'Snel noteren',
    'widget.recent': 'Recent bezocht', 'widget.favorites': 'Favoriete websites', 'widget.added': 'Recent toegevoegd', 'widget.health': 'Website-waarschuwingen',
    'widget.suggestions': 'Suggesties van Angel', 'widget.quicknote': 'Snelle notitie', 'widget.stats': 'Productiviteit',
    // weer
    'weather.clear': 'Helder', 'weather.partly': 'Half bewolkt', 'weather.cloudy': 'Bewolkt', 'weather.fog': 'Mist', 'weather.drizzle': 'Motregen', 'weather.rain': 'Regen',
    'weather.snow': 'Sneeuw', 'weather.storm': 'Onweer', 'weather.unavailable': 'Weer niet beschikbaar', 'weather.setCity': 'Kies een stad',
    // fouten
    'err.storage': 'Opslaan mislukt', 'err.network': 'Geen verbinding met de dienst. Probeer het later opnieuw.', 'err.ai': 'De AI-dienst reageerde niet. Angel gebruikt nu de ingebouwde regels.',
    'err.invalidUrl': 'Ongeldige URL', 'err.fileType': 'Alleen afbeeldingen (PNG, JPG, GIF, WebP) zijn toegestaan', 'err.fileSize': 'Afbeelding is te groot (max. {mb} MB)'
  };
  const dict = { nl };
  let lang = 'nl';
  function t(key, vars) {
    let s = (dict[lang] && dict[lang][key]) || dict.nl[key] || key;
    if (vars) Object.keys(vars).forEach((k) => { s = s.replace('{' + k + '}', vars[k]); });
    return s;
  }
  window.AOS_I18N = { t, dict, setLang(l) { if (dict[l]) lang = l; }, get lang() { return lang; } };
})();
