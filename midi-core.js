// midi-core.js - Gestione Bluetooth Low Energy (BLE) e MIDI per VoiceLive / SK-7

let bluetoothDevice = null;
let midiCharacteristic = null;
let connectionCallback = null;

const MIDI_SERVICE_UUID = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
const MIDI_CHARACTERISTIC_UUID = '7772e5db-3868-4112-a1a9-f2669d106bf3';

function log(message) {
  const logDiv = document.getElementById("log");
  if (logDiv) {
    const timestamp = new Date().toLocaleTimeString();
    logDiv.innerHTML += `[${timestamp}] ${message}\n`;
    logDiv.scrollTop = logDiv.scrollHeight;
  }
  console.log(message);
}

/**
 * Connessione manuale standard (richiesta esplicita tramite click dell'utente)
 */
async function connectOutputSK7(callback) {
  connectionCallback = callback;

  if (!navigator.bluetooth) {
    log("Errore: Il tuo browser non supporta il Web Bluetooth.");
    alert("Il tuo browser non supporta il Bluetooth. Usa Google Chrome o Edge.");
    if (connectionCallback) connectionCallback(null);
    return;
  }

  try {
    log("Ricerca dispositivi Bluetooth in corso...");
    
    const options = {
      filters: [{ namePrefix: 'SK-7' }],
      optionalServices: [MIDI_SERVICE_UUID]
    };

    try {
      bluetoothDevice = await navigator.bluetooth.requestDevice(options);
    } catch (e) {
      log("Filtro SK-7 non trovato, tentativo di ricerca generica BLE MIDI...");
      bluetoothDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [MIDI_SERVICE_UUID]
      });
    }

    if (!bluetoothDevice) {
      log("Nessun dispositivo selezionato.");
      if (connectionCallback) connectionCallback(null);
      return;
    }

    bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

    log(`Connessione a ${bluetoothDevice.name || 'Dispositivo'}...`);
    const server = await bluetoothDevice.gatt.connect();

    log("Ricerca servizio MIDI...");
    const service = await server.getPrimaryService(MIDI_SERVICE_UUID);

    log("Ricerca caratteristica MIDI...");
    midiCharacteristic = await service.getCharacteristic(MIDI_CHARACTERISTIC_UUID);

    log(`Connessione BLE completata con successo: ${bluetoothDevice.name}`);
    if (connectionCallback) connectionCallback(bluetoothDevice.name || "SK-7");

  } catch (error) {
    log("Errore di connessione BLE: " + error);
    if (connectionCallback) connectionCallback(null);
  }
}

function onDisconnected(event) {
  log("Dispositivo BLE disconnesso.");
  bluetoothDevice = null;
  midiCharacteristic = null;
  if (connectionCallback) connectionCallback(null);
}

/**
 * Invia un messaggio Program Change MIDI per cambiare il preset sul VoiceLive / SK-7
 */
async function sendPresetChange(presetNumber) {
  if (!midiCharacteristic) {
    log("Impossibile inviare il preset: Dispositivo SK-7 non connesso.");
    return;
  }

  try {
    let programNumber = parseInt(presetNumber, 10) - 1;
    if (programNumber < 0) programNumber = 0;
    if (programNumber > 383) programNumber = 383;

    const packet = new Uint8Array([
      0x80, // Header
      0x80, // Timestamp + Status byte
      0xC0 | getActiveChannel(), // Program Change sul canale selezionato
      prog = programNumber % 128  // Numero Preset (0-127)
    ]);
    
    await midiCharacteristic.writeValue(packet);
    log(`Inviato Preset MIDI: ${presetNumber} (Program ${prog}) sul canale ${getActiveChannel() + 1}`);

  } catch (error) {
    log("Errore durante l'invio del comando MIDI: " + error);
  }
}

function getActiveChannel() {
  const channelSelect = document.getElementById("midiChannel");
  if (channelSelect) {
    return parseInt(channelSelect.value, 10) || 0;
  }
  return 0;
}
