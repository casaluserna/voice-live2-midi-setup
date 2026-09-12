/**
 * midi-manager.js
 * Gestione unificata connessioni MIDI (Cavo USB / Bluetooth SK-7)
 * per VoiceLive 2 Controller
 */

const MidiManager = {
  midiAccess: null,
  activeOutput: null,
  midiChannel: 0, // 0 = Canale 1 (0xBn / 0xCn)

  // Inizializza l'accesso Web MIDI
  async init(selectElementId = "midiOutputSelect", statusElementId = "midiStatus") {
    this.selectEl = document.getElementById(selectElementId);
    this.statusEl = document.getElementById(statusElementId);

    if (!navigator.requestMIDIAccess) {
      this.updateStatus("Web MIDI non supportato su questo browser ❌", "error");
      return false;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this.refreshPorts();

      // Rilevamento a caldo se inserisci/stacchi cavo o dongle
      this.midiAccess.onstatechange = (event) => {
        console.log(`[MIDI] Porta cambiata: ${event.port.name} -> ${event.port.state}`);
        this.refreshPorts();
      };

      if (this.selectEl) {
        this.selectEl.addEventListener("change", (e) => this.onUserSelectPort(e.target.value));
      }

      return true;
    } catch (err) {
      console.error("[MIDI] Errore richiesta accesso:", err);
      this.updateStatus("Accesso MIDI negato 🔒", "error");
      return false;
    }
  },

  // Scansiona e aggiorna la lista dispositivi (USB o BLE)
  refreshPorts() {
    if (!this.midiAccess || !this.selectEl) return;

    this.selectEl.innerHTML = '<option value="">-- Seleziona Interfaccia MIDI --</option>';
    const savedDeviceName = localStorage.getItem("vl2_preferred_midi_device");
    let autoSelected = false;

    for (let output of this.midiAccess.outputs.values()) {
      const option = document.createElement("option");
      option.value = output.id;

      // Etichetta leggibile per distinguere cavo da wireless
      const nameLower = output.name.toLowerCase();
      if (nameLower.includes("voicelive")) {
        option.textContent = `🔌 Cavo USB: ${output.name}`;
      } else if (nameLower.includes("sk-7") || nameLower.includes("ble") || nameLower.includes("bluetooth")) {
        option.textContent = `📶 Bluetooth: ${output.name}`;
      } else {
        option.textContent = `🎛️ ${output.name}`;
      }

      // 1. Ripristina periferica precedentemente salvata
      if (savedDeviceName && output.name === savedDeviceName) {
        option.selected = true;
        this.activeOutput = output;
        autoSelected = true;
        this.updateStatus(`Connesso: ${output.name} 🟢`, "connected");
      }

      this.selectEl.appendChild(option);
    }

    // 2. Se non c'è una preferenza salvata ma c'è il cavo VoiceLive 2, aggancialo in automatico
    if (!autoSelected) {
      for (let output of this.midiAccess.outputs.values()) {
        if (output.name.toLowerCase().includes("voicelive")) {
          this.selectEl.value = output.id;
          this.activeOutput = output;
          this.updateStatus(`Connesso: ${output.name} 🟢`, "connected");
          localStorage.setItem("vl2_preferred_midi_device", output.name);
          break;
        }
      }
    }

    if (!this.activeOutput) {
      this.updateStatus("Nessun dispositivo connesso 🔴", "disconnected");
    }
  },

  // Selezione manuale dall'interfaccia
  onUserSelectPort(portId) {
    if (!portId) {
      this.activeOutput = null;
      localStorage.removeItem("vl2_preferred_midi_device");
      this.updateStatus("Disconnesso 🔴", "disconnected");
      return;
    }

    this.activeOutput = this.midiAccess.outputs.get(portId);
    if (this.activeOutput) {
      localStorage.setItem("vl2_preferred_midi_device", this.activeOutput.name);
      this.updateStatus(`Connesso: ${this.activeOutput.name} 🟢`, "connected");
    }
  },

  // Invia un cambio preset (Program Change) al VoiceLive 2
  sendProgramChange(programNumber) {
    if (!this.activeOutput) {
      console.warn("[MIDI] Nessun output attivo per il Program Change.");
      return;
    }
    // Status byte 0xC0 + channel (0x0 = ch 1)
    const status = 0xC0 | (this.midiChannel & 0x0F);
    this.activeOutput.send([status, programNumber]);
    console.log(`[MIDI] PC -> Preset ${programNumber}`);
  },

  // Invia un Control Change (es. attivazione/disattivazione effetti)
  sendControlChange(ccNumber, value) {
    if (!this.activeOutput) {
      console.warn("[MIDI] Nessun output attivo per il Control Change.");
      return;
    }
    // Status byte 0xB0 + channel (0x0 = ch 1)
    const status = 0xB0 | (this.midiChannel & 0x0F);
    this.activeOutput.send([status, ccNumber, value]);
    console.log(`[MIDI] CC -> #${ccNumber} Val: ${value}`);
  },

  updateStatus(msg, stateClass) {
    if (this.statusEl) {
      this.statusEl.textContent = msg;
      this.statusEl.className = `midi-status ${stateClass}`;
    }
  }
};
