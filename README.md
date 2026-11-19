# Specter 3D Playground

Ein interaktiver 3D-Simulator für Specter DIY und Specter Desktop: echte Specter-Firmware (MicroPython/WASM) in einem realistischen Specter-2-Gehäuse, dazu Smartphones mit Bitcoin Keeper, ein Air-gapped Laptop, SD-Karten, Smartcards und ein 3D-QR-Scanner.

**Nur Testdaten. Keine echte Hardware-Sicherheit. Niemals echte Seeds, Private Keys oder Funds eingeben.**

## Schnellstart

Voraussetzung: Python 3.8+ **oder** Node.js 18+.

### Windows
`start.cmd` doppelklicken. Der Browser öffnet `http://127.0.0.1:8000/`.

### macOS / Linux
```bash
chmod +x start.sh
./start.sh
```

### Manuell
```bash
python serve.py 8000
# oder ohne Python:
node server.mjs 8000
```
Dann **http://127.0.0.1:8000/** öffnen.

> Der lokale Server setzt die richtigen WASM-MIME-Typen und COOP/COEP-Header. Für die volle Erfahrung bitte den Server verwenden, nicht `file://`.

## Demo in 60 Sekunden

1. **Power-Knopf** am Gerät klicken (oder Leertaste).
2. PIN **`1234`** auf dem Touchscreen eingeben, dann **Next**.
3. **„Load key from smartcard“** wählen, **OK**.
4. **Desktop** öffnen: Specter Desktop mit vorinstallierten Demo-Wallets (`Default` und `2-of-3 Multisig`).
5. **Keeper** öffnen: Bitcoin Keeper auf Handy A mit Vaults, Receive, Send und Scan.
6. **Scan** auf dem Gerät: QR-Karte oder Handy in den Rahmen ziehen. jsQR liefert die Bytes an die echte Firmware.

## Air-gapped Flow

1. Desktop/Keeper: PSBT erzeugen und als QR zeigen.
2. Specter: **Scan QR code** öffnen, PSBT-Karte/Handy in den Rahmen ziehen.
3. PSBT prüfen, **Confirm** tippen.
4. Der signierte PSBT erscheint als QR auf dem Specter-Display.
5. Desktop/Keeper: **Scan device** liest den signierten QR zurück.
6. Alternativ: PSBT auf die microSD schreiben, am Gerät öffnen/signieren, Karte zurücklesen.

## Steuerung

| Aktion | Bedienung |
|---|---|
| Power an/aus | Power-Knopf am Gerät oder `Leertaste` |
| Touchscreen | Screen antippen/ziehen |
| Gerät drehen | Gerät im Hand-Modus ziehen |
| Kamera | Leerraum ziehen, Scrollen = Zoom |
| SD / Smartcard | Karte ziehen, Slot klicken oder Workbench |
| QR scannen | Gerät in Scan-POV, QR/Handy in den Rahmen ziehen |
| Desktop / Keeper | Dock-Buttons oder Laptop/Handy anklicken |
| Workbench | Dock-Button „Workbench“ |
| Hilfe | `H` |

## Enthalten

- Echte Specter-DIY-Firmware 1.10.5 (MicroPython/WASM) aus `cryptoadvance/specter-diy`
- Specter-2-Gehäuse aus dem Specter2-Videopaket (`assets/models/specter2.glb`), inkl. Shell, Glas, Board, Buttons, microSD und Kamera
- Live-Firmware-Display, physischer Power-Button, SD-/Smartcard-Slots
- 3D-QR-Scanner mit jsQR und Kamera-POV
- Handys auf Ständern (kein Zittern), frei verschiebbar
- Funktionales **Specter Desktop** (Wallets, PSBT, QR, SD, Scan)
- Funktionales **Bitcoin Keeper** (Home, Vaults, Receive, Send, Scan)
- Workbench: SD-Dateien, Demo-Daten, 3 MemoryCards, QR-Bibliothek, optional USB-Bridge, Log, Reset

## Projektstruktur

```
index.html            # 3D-App, HUD, Desktop/Keeper-Fenster
styles.css
src/                  # Three.js, Gerät, Hand, Welt, Apps, Firmware-Bridge
runtime/              # Browser-Worker + Demo-Daten
builds/               # echte Specter-Firmware-Artefakte
assets/models/        # specter2.glb
vendor/               # three.js, qrcode, jsQR
serve.py              # Python-Server mit WASM-MIME/COOP/COEP
server.mjs            # Node-Server-Fallback
start.cmd / start.sh  # Ein-Klick-Start
```

## Hinweise

- Das Specter-2-Modell stammt aus dem vom Nutzer bereitgestellten `SPECTER2_VIDEO_PAKET`; das MacBook-Modell aus diesem Paket ist **nicht** enthalten (Lizenz ungeklärt).
- Specter Desktop und Bitcoin Keeper sind funktionale, lokal laufende Simulator-Oberflächen, keine Upstream-Builds.
- Firmware/Simulator: siehe `LICENSE-specter-diy` und `LICENSE-simulator`. three.js (MIT), qrcode (MIT), jsQR (Apache-2.0).
- GitHub: <https://github.com/Schnuartz/specter-3d-playground>
