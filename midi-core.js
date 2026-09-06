// Variable globali per la connessione MIDI
let midiAccess = null;
let activeOutput = null;

// Inizializza la Web MIDI API con supporto Web Bluetooth / BLE MIDI
async function initMIDI(onDevicesUpdated) {
  // Supporto standard Web MIDI
  if (!navigator.requestMIDIAccess) {
    alert("La Web MIDI API non è supportata da questo browser.");
    return false;
  }

  try {
    // sysex: true può servire su alcuni dispositivi BLE MIDI
    midiAccess = await navigator.requestMIDIAccess({ sysex: true }).catch(() => {
      // Fallback senza sysex se l'utente o il browser rifiuta i permessi Sysex
      return navigator.requestMIDIAccess();
    });

    updateDeviceList(onDevicesUpdated);

    // Monitora il collegamento/scollegamento a caldo sia di cavi USB sia di periferiche BLE
    midiAccess.onstatechange = () => updateDeviceList(onDevicesUpdated);
    return true;
  } catch (err) {
    console.error("Errore accesso MIDI:", err);
    return false;
  }
}

// Aggiorna la lista dei dispositivi (inclusi SK-7 BLE)
function updateDeviceList(callback) {
  if (!midiAccess) return;
  
  const outputs = Array.from(midiAccess.outputs.values());
  if (callback) callback(outputs);
}

// Funzione di comodo se usi la scansione nativa Web Bluetooth per il dispositivo SK-7
async function requestBLEDevice() {
  if (!navigator.bluetooth) {
    alert("Web Bluetooth non supportato su questo browser.");
    return;
  }
  
  try {
    // UUID standard per il servizio MIDI over Bluetooth Low Energy
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['03b80e5a-0000-1000-8000-00805f9b34fb'] }]
    });
    console.log("Dispositivo BLE selezionato:", device.name);
  } catch (err) {
    console.log("Annullata selezione BLE o errore:", err);
  }
}

// Imposta la porta di uscita attiva
function selectMIDIOutput(deviceId) {
  if (!midiAccess) return;
  activeOutput = midiAccess.outputs.get(deviceId) || null;
}

// Funzione per cambiare il PRESET sul VoiceLive 2 (Program Change + Bank Select)
function sendPresetChange(presetNumber, channel = 0) {
  if (!activeOutput) {
    console.warn("Nessun dispositivo MIDI selezionato.");
    return;
  }

  const zeroBased = presetNumber - 1;
  const bank = Math.floor(zeroBased / 128); // CC 0
  const program = zeroBased % 128;         // PC

  // 1. Invio Bank Select (CC 0)
  activeOutput.send([0xB0 + channel, 0x00, bank]);

  // 2. Invio Program Change (PC)
  activeOutput.send([0xC0 + channel, program]);

  console.log(`[MIDI OUT] Preset ${presetNumber} -> Banco ${bank}, PC ${program} (Canale ${channel + 1})`);
}

// Funzione per inviare Control Change (CC) per gli effetti
function sendCC(ccNumber, value, channel = 0) {
  if (!activeOutput) return;
  activeOutput.send([0xB0 + channel, ccNumber, value]);
}
