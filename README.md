# Blackjack Card Counter

Eine kleine Web-App, mit der du Blackjack-Runden aus einem Online-Casino
(oder am echten Tisch) 1:1 nachlegen kannst. Die App zählt automatisch mit
(Hi-Lo-System) und gibt dir zu jeder Hand eine Handlungsempfehlung
(Hit / Stand / Double / Split / Surrender) inklusive True-Count-Abweichungen
und Versicherungs-Tipp.

## Nutzung

Einfach `index.html` im Browser öffnen (kein Server, kein Build nötig) —
läuft komplett offline. Am besten in einem zweiten Fenster/Tab neben der
Casino-App bzw. auf dem Handy neben dem Laptop.

1. **Ziel wählen**: Oben bei "Dealer", "Spieler" oder "Weitere Karten"
   (für Karten anderer Mitspieler am Tisch) auf "Karten hier zufügen" tippen.
2. **Karten legen**: Unten in der Kartenübersicht genau die Karten antippen,
   die im Casino ausgeteilt werden — Rang und Farbe wie im Spiel.
3. Die App zeigt dir laufend:
   - **Running Count** und **True Count** (Hi-Lo)
   - **Empfehlung** für die aktive Spielerhand (Hit/Stand/Double/Split/Surrender)
   - **Versicherungs-Tipp**, sobald der Dealer ein Ass zeigt
   - **Wett-Empfehlung** auf Basis des True Counts (Bet-Spread)
4. **Split**: Erscheint automatisch, wenn die aktive Hand ein Paar ist.
5. **Neue Runde**: Leert Dealer-/Spielerhände, der Count bleibt erhalten
   (Karten sind ja noch aus dem Schuh draußen).
6. **Neuer Schuh**: Setzt Count und "bereits gesehene Karten" komplett
   zurück (z. B. wenn das Casino neu mischt).
7. **Zurück**: Macht die letzte Karten-/Split-Aktion rückgängig.

Einstellungen (Zahnrad oben rechts): Anzahl Decks, Dealer-Regel bei Soft 17,
Double-after-Split, Surrender erlaubt, sowie deine Grundeinheit für die
Wett-Empfehlung. Der Zustand wird lokal im Browser gespeichert
(`localStorage`) und bleibt auch nach einem Reload erhalten.

## Wie die Empfehlung berechnet wird

- **Basisstrategie**: Standard-Tabelle für Multi-Deck-Blackjack
  (konfigurierbar über S17/H17, DAS, Surrender).
- **Count-Abweichungen**: Ausgewählte Indexe aus der bekannten
  "Illustrious 18" (z. B. 16 vs. 10 bei True Count ≥ 0 stehen bleiben statt
  ziehen), die je nach True Count die Basisstrategie überstimmen.
- **Versicherung**: Empfohlen ab True Count ≥ 3.
- **Wett-Empfehlung**: Einfacher Bet-Spread (1x bis 8x Grundeinheit),
  steigt mit dem True Count.

## Hinweis

Kartenzählen ist beim klassischen Karten-Blackjack mit festem Schuh legal,
funktioniert aber **nur**, wenn tatsächlich aus einem Schuh mit begrenzter
Penetration gespielt wird. Viele Online-Casino-Spiele (RNG-Blackjack oder
Live-Tische mit Continuous-Shuffle-Machine) mischen jede Runde neu — dort
bringt Kartenzählen keinen Vorteil. Prüfe die Spielregeln deines Anbieters,
und beachte dessen Nutzungsbedingungen sowie die Regeln zum verantwortungsvollen
Spielen.
