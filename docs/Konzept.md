# App-Konzept: Verknüpfte Kalender- und To-Do-App

## Vision

Eine App, die Kalender und To-Dos wirklich miteinander verbindet, statt sie getrennt laufen zu lassen. Sie hilft dabei, Aufgaben zu kategorisieren, zu planen und einen klaren Überblick zu behalten: was zu tun ist, wie viel schon erreicht wurde, und wann bzw. in welchen Zeithorizont es einzusortieren ist. Der Ansatz ist bewusst ein Mittelweg zwischen klassischen To-Do-Apps und Kalendern (z. B. Outlook), die heute nicht miteinander verbunden sind.

## Kernfunktionen

### 0. Alleinstellungsmerkmale (Kern-Differenzierung)

- Gefährdungs- und Meilenstein-Tracking: Die App warnt, wenn ein Event gefährdet ist, weil zugehörige Vorbereitungs-Tasks noch nicht erledigt sind. Meilenstein-Fortschritt ergibt sich automatisch aus den To-Dos. Das ist der zentrale Unterschied zu klassischen To-Do-Apps.
- Drilldown von einem To-Do zum zugehörigen Event (und umgekehrt sichtbar, zu welchem Event ein Task gehört).
- Der Planungs-Wizard als schneller Weg, mehrere Tage oder ganze Projekte auf einmal zu planen.
- To-Do-Listen sind nicht stumpf, sondern smart: sie können Meilensteine und Gefährdungs-Status tragen und aus einer Liste ein richtiges Projekt machen.

### 0b. Wiederkehrende und wiederverwendbare Tasks

- Bei wiederkehrenden Events (z. B. Geburtstag einer bestimmten Person) können die zugehörigen Aufgaben ebenfalls wiederkehren – einmal pro Person gepflegt (z. B. Person A: Geschenk kaufen; Person B: nur Karte schicken; Person C: nur Gruß).
- Suggested Tasks: Wird ein neues Event angelegt, das einem früheren ähnelt (z. B. Heimspiel des Sohnes), fragt die App, ob die Aufgaben des früheren Events importiert werden sollen. Von dort aus frei weiter bearbeitbar.
- Mittelweg zwischen rein manuell und starrem Regelset: kein starres System, aber weniger Tipparbeit.
- (Später denkbar: Importer für die initiale Pflege; Verbindung mit dem Outlook-Kalender – nicht Teil der ersten Version.)

### 1. Übersicht nach Zeithorizont

- Homescreen als Listenansicht, gegliedert in: Heute, Morgen, Nächste 3 Tage, Später.
- Eigener Überfällig-Bereich (Bucket) ganz oben in der Listenansicht, optisch prominent und nicht zu übersehen.
- Alle überfälligen Aufgaben gesammelt an einem Ort, übersichtlich dargestellt.
- Überfällige Aufgaben bleiben im Bucket liegen, bis der Nutzer aktiv handelt. Kein stilles Wegrutschen.
- Schnelle Aktionen direkt im Bucket verfügbar (idealerweise per Swipe): zeitlich verschieben bzw. snoozen, abhaken (erledigt), oder löschen (keine Relevanz mehr).
- Wird der Bucket zu voll, macht er dezent auf sich aufmerksam (z. B. Badge mit Anzahl), damit er als Weckruf wirkt und nicht selbst zur ignorierten Liste wird.

### 2. Aufgaben, die sich aus Events ableiten

- Aufgaben werden manuell an Events gehängt (keine automatischen Regelsets in der ersten Version, da man nicht für jeden Geburtstag dasselbe tut). Regelsets sind ein optionales späteres Komfort-Feature.
- Beispiel Geburtstag: 7 Tage vorher Aufgabe Geschenk kaufen, am Tag davor Aufgabe Geschenk einpacken.
- Aufgaben mit eigenen, konfigurierbaren Erinnerungen relativ zum Event.
- Aufgaben sind mit ihrem Event verknüpft und hängen von ihm ab.
- Beim Verschieben eines Events wird der Nutzer gefragt, ob die zugehörigen Aufgaben mitwandern sollen. Grund: manche To-Dos müssen trotzdem zum ursprünglichen Zeitpunkt fertig sein (z. B. Deadlines).
- Smarter Default je nach Richtung: Beim Vorverlegen des Events schlägt die App Mitverschieben vor (sonst wird es zu knapp); beim Nach-hinten-Verschieben schlägt sie Beibehalten vor. Der Vorschlag lässt sich immer bestätigen oder ändern.

### 3. Verschachtelte Aufgaben (Tasks mit Subtasks)

- Ein Task kann mehrere Unteraufgaben enthalten.
- Beispiel: Wochenende bei Freunden mit einer Packliste als Subtasks.
- Beispiel: Keller ausräumen als übergeordneter Task mit mehreren vorbereitenden Schritten.

### 4. Schnelle Planungsansicht

- Umgesetzt als geführter Planungs-Wizard (Schritt-für-Schritt-Ablauf).
- Schritt 1 (Brain-Dump): alles ungefiltert in eine Liste im To-Do-Style kippen, ohne sich um Reihenfolge oder Timing zu kümmern.
- Schritt 2 (Strukturieren): die Liste veredeln, also Zeiträume bzw. Daten zuweisen, kategorisieren, in Listen gruppieren.
- Stapelverarbeitung: mehrere To-Dos auf einmal markieren und gemeinsam einem Tag bzw. Datum zuordnen.
- Feinsortierung innerhalb eines Tages (nach Uhrzeit oder Reihenfolge, was zuerst zu tun ist) als optionaler späterer Schritt.
- Zweck: die zwei Denkweisen trennen – erst alles rauslassen, dann strukturieren.
- Zusätzlich: Fokus- und Projektplanung sowie kurzfristige Planung (z. B. die nächsten 3 Tage oder ein Wochenende).

### 5. Aufgaben-Aktionen und Flow

- Abhaken (completed), Snooze bzw. Verschieben, Löschen.
- Swipe-Actions für schnelles Bearbeiten.
- Flexible Quick-Actions zum Verschieben bei ALLEN Tasks (nicht nur überfälligen): morgen, übermorgen, nächste Woche, oder eigenes Datum wählen. Erlaubt blitzschnelles Nachjustieren im Alltag.
- Bucket leeren mit minimalem Aufwand (Ein-Tipp-Aktionen), damit überfällige Tasks nicht aus Trägheit ignoriert werden.
- Fortschritts-Indikator, um auf einen Blick zu sehen, wie viel erledigt ist.
- Smarte Hinweise: z. B. Warnung, wenn eine Aufgabe zu oft gesnoozed wird.
- Überfällige Aufgaben werden sauber verschoben statt gelöscht, sofern sie nicht bewusst abgeschlossen oder entfernt werden.

## Ansichtstypen

- Homescreen: Listenansicht nach Zeithorizont.
- Weitere Ansichten: Fokus- und Projektansicht, Planungsansicht.

## Leitprinzipien

- Verbindung von Events und Aufgaben statt getrennter Silos.
- Übersichtlichkeit und schneller Überblick.
- Effektive, schnelle Planung.
- Nichts geht verloren: überfällige Dinge bleiben sichtbar und werden aktiv gehandhabt.

## Offene Punkte / zu diskutieren

- Wird im Gespräch ergänzt.
