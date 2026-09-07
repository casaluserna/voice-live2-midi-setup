// midi-core.js - Gestione Bluetooth Low Energy (BLE) e MIDI per VoiceLive / SK-7

let bluetoothDevice = null;
let midiCharacteristic = null;
let connectionCallback = null;

// UUID standard per MIDI BLE (può variare leggermente a seconda del dispositivo, ma questo è lo standard BLE MIDI)
const MIDI_SERVICE_UUID = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
const MIDI_CHARACTERISTIC_UUID = '7772e5db-3868-4112-a1a9-f2669d106bf3';

// Funzione di log interna per l'app
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
 * Tenta di ripristinare la connessione automaticamente all'avvio senza mostrare popup,
 * sfruttando i dispositivi già autorizzati dal browser.
 */
async function autoConnectSK7(callback) {
  connectionCallback = callback;

  if (!navigator.bluetooth || !navigator.bluetooth.getDevices) {
    log("API navigator.bluetooth.getDevices non supportata da questo browser.");
    if (connectionCallback) connectionCallback(null);
    return;
  }

  try {
    const devices = await navigator.bluetooth.getDevices();
    // Cerca un dispositivo precedentemente associato che contenga "SK-7" o compatibile MIDI BLE
    const sk7Device = devices.find(d => (d.name && d.name.includes("SK-7")) || d.name);

    if (sk7Device) {
      log(`Dispositivo trovato in cache: ${sk7Device.name}. Riconnessione in corso...`);
      bluetoothDevice = sk7Device;
      
      bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

      const server = await bluetoothDevice.gatt.connect();
      const service = await server.getPrimaryService(MIDI_SERVICE_UUID);
      midiCharacteristic = await service.getCharacteristic(MIDI_CHARACTERISTIC_UUID);

      log(`Riconnesso con successo a: ${bluetoothDevice.name}`);
      if (connectionCallback) connectionCallback(bluetoothDevice.name);
      return;
    }
  } catch (err) {
    log("Impossibile eseguire la riconnessione automatica: " + err.message);
  }

  if (connectionCallback) connectionCallback(null);
}

/**
 * Connessione manuale standard (apre il popup di selezione del browser)
 */
async function connectOutputSK7(callback) {
  connectionCallback = callback;

  try {
    log("Ricerca dispositivi Bluetooth in corso...");
    
    const options = {
      filters: [{ namePrefix: 'SK-7' }],
      optionalServices: [MIDI_SERVICE_UUID]
    };

    // Fallback di ricerca se non trova il filtro esatto
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
    // Correzione indice preset (i preset MIDI partono da 0 a 127 o banchi estesi)
    // Scalato sul numero effettivo scelto dall'utente (es. 1 -> 0)
    let programNumber = parseInt(presetNumber, 10) - 1;
    if (programNumber < 0) programNumber = 0;
    if (programNumber > 383) programNumber = 383;

    // Gestione banchi se il preset supera 127 (Standard MIDI Program Change gestisce 128 preset per banco)
    let bank = Math.floor(programNumber / 128);
    let prog = programNumber % 128;

    let midiMessages = [];

    // Se il VoiceLive supporta i messaggi di Bank Select (CC 0 / CC 32)
    if (bank > 0) {
      midiMessages.push([0x80, 0x80, 0xB0, 0x00, 0x00]); // Header timestamp BLE MIDI + Control Change Bank MSB
      midiMessages.push([0x80, 0x80, 0xC0 | getActiveChannel(), prog]); // Program Change
    } else {
      // Pacchetto BLE MIDI Standard per Program Change: [Header, Timestamp, Status/Channel, Program]
      // Header BLE MIDI tipico: 0x80 0x80 (oppure timestamp bytes)
      const packet = new Uint8Array([
        0x80, // Header
        0x80, // Timestamp + Status byte
        0xC0 | getActiveChannel(), // Program Change sul canale selezionato
        prog  // Numero Preset (0-127)
      ]);
      
      await midiCharacteristic.writeValue(packet);
      log(`Inviato Preset MIDI: ${presetNumber} (Program ${prog}) sul canale ${getActiveChannel() + 1}`);
      return;
    }

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
