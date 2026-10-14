/**
 * @license
 * Copyright 2020 Sébastien CANET
 * SPDX-License-Identifier: GPL-3.0
 */

/**
 * @fileoverview Utility functions for handling typed variables.
 * fake IDE code Arduino
 * boardSelector: boards list
 * serialMenu: serial port list
 * serialConnectButton: open modal with serial console
 * verifyButton: verify and compile in hex file
 * uploadButton: upload hex file in Arduino board
 * @author scanet@libreduc.cc (Sébastien CANET)
 */

const {ipcRenderer} = require('electron');
const {exec} = require('child_process');
const fs = require('fs-extra');
const tableify = require('tableify')
const { SerialPort } = require('serialport');
// RoboSiddhi ESP build helpers (safe command construction + diagnostics). Fallback if missing.
var RoboSiddhiBuild = null;
try { RoboSiddhiBuild = require('./www/blocklyduino/js/robosiddhi_build.js'); } catch (e) { try { RoboSiddhiBuild = require('../www/blocklyduino/js/robosiddhi_build.js'); } catch (e2) {} }
function RoboSiddhiShowError(stderr, fqbn) {
    var msg = stderr;
    try { if (RoboSiddhiBuild) msg = RoboSiddhiBuild.diagnoseCompilerError(stderr, fqbn); } catch (e) {}
    document.getElementById('content_serial').style.color = '#FF0000';
    // escape HTML to avoid injecting compiler output as markup
    var esc = String(msg).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    document.getElementById('content_serial').innerHTML = esc.replace(/\n/g,'<br>');
}

//populate COM port modal with all com port detected on system
document.getElementById('serialButton').addEventListener("mouseover", function (event) {
    SerialPort.list().then(ports => {
        let portsList = ports.map(function(obj) {
            return {
                path: obj.path,
                manufacturer: obj.manufacturer,
                vendorId: obj.vendorId,
                productId: obj.productId
            }
        });
        if (portsList.length === 0) {
            document.getElementById('portListModalBody').innerHTML = "Aucun port n'est disponible";
        } else {
            document.getElementById('portListModalBody').innerHTML = tableify(portsList);
        }
    })
});

//COM port list inside the modal
document.getElementById('serialMenu').addEventListener("mouseover", function (event) {
    SerialPort.list().then(ports => {
        var menu = document.getElementById('serialMenu');
        var current = menu.value;
        menu.options.length = 0;
        var noneOpt = document.createElement('option');
        noneOpt.value = 'none';
        noneOpt.text = '...';
        menu.appendChild(noneOpt);
        ports.forEach(function (port) {
            var option = document.createElement('option');
            option.value = port.path;
            option.text = port.path;
            menu.appendChild(option);
        });
        if (current && current !== 'none') {
            var stillThere = ports.some(function (p) { return p.path === current; });
            if (stillThere) menu.value = current;
        }
    });
});

// ---- AUTO DETECT + AUTO SELECT COM PORT (ESP32 etc) ----
var _lastPortsKey = '__init__';
function _portsKey(ports) {
    return ports.map(function (p) { return p.path; }).sort().join(',');
}
function _pickEspPort(ports) {
    if (!ports || !ports.length) return null;
    var espVids = ['10c4', '1a86', '303a', '0403', '2341', '10c5', '067b', '2e8a'];
    for (var i = 0; i < ports.length; i++) {
        var vid = (ports[i].vendorId || '').toString().toLowerCase();
        if (vid && espVids.indexOf(vid) !== -1) return ports[i];
    }
    for (var j = 0; j < ports.length; j++) {
        var hay = ((ports[j].manufacturer || '') + ' ' + (ports[j].friendlyName || '') + ' ' + (ports[j].pnpId || '')).toLowerCase();
        if (/cp210|ch340|ch341|ftdi|esp32|silicon|wch|prolific|usb-serial|usb serial/.test(hay)) return ports[j];
    }
    return ports[0];
}
function autoRefreshSerialPorts() {
    SerialPort.list().then(function (ports) {
        var menu = document.getElementById('serialMenu');
        if (!menu) return;
        var key = _portsKey(ports);
        if (key === _lastPortsKey) return;
        _lastPortsKey = key;
        var current = menu.value;
        var stillExists = current && current !== 'none' && ports.some(function (p) { return p.path === current; });
        menu.options.length = 0;
        var noneOpt = document.createElement('option');
        noneOpt.value = 'none';
        noneOpt.text = '...';
        menu.appendChild(noneOpt);
        ports.forEach(function (port) {
            var option = document.createElement('option');
            option.value = port.path;
            option.text = port.path;
            menu.appendChild(option);
        });
        // update modal table also
        try {
            var portsList = ports.map(function (obj) {
                return { path: obj.path, manufacturer: obj.manufacturer, vendorId: obj.vendorId, productId: obj.productId };
            });
            if (portsList.length === 0) {
                document.getElementById('portListModalBody').innerHTML = "No port available - connect ESP32";
            } else {
                document.getElementById('portListModalBody').innerHTML = tableify(portsList);
            }
        } catch (e) {}
        if (ports.length === 0) {
            menu.value = 'none';
            try { Code.setPort(); } catch (e) {}
            return;
        }
        if (stillExists) {
            menu.value = current;
            return;
        }
        // naya device aaya ya pehli baar list mili -> auto select (ESP32 ko priority)
        var pick = _pickEspPort(ports);
        if (pick) {
            menu.value = pick.path;
            try { Code.setPort(); } catch (e) {}
            var msgEl = document.getElementById('content_serial');
            if (msgEl) {
                msgEl.style.color = '#00FF00';
                msgEl.innerHTML = 'Auto-selected port: ' + pick.path + (pick.manufacturer ? ' (' + pick.manufacturer + ')' : '') + ' - ESP32 ready';
            }
        }
    }).catch(function (e) {
        console.log('auto port scan failed:', e);
    });
}
window.addEventListener('load', function () {
    setTimeout(autoRefreshSerialPorts, 800);
    setInterval(autoRefreshSerialPorts, 2000);
});

window.addEventListener('load', function load(event) {
    document.getElementById('verifyButton').onclick = function (event) {
        try {
            fs.accessSync('.\\compiler\\tmp', fs.constants.W_OK);
        } catch (err) {
            fs.mkdirSync('.\\compiler\\tmp', {
                recursive: false
            }, (err) => {
                if (err)
                    throw err;
            });
        }
        var file_path = '.\\tmp';
        var file = '.\\compiler\\tmp\\tmp.ino';
        // hamesha workspace se fresh full code lo (ACE innerText kate-phate mil sakta hai)
        var data = Blockly.Arduino.workspaceToCode(Code.workspace);
        try { editor.setValue(data, 1); } catch (e) {}
        if (data.indexOf('void setup') === -1 || data.indexOf('void loop') === -1) {
            document.getElementById('content_serial').style.color = '#FF0000';
            document.getElementById('content_serial').innerHTML = 'Blocks incomplete: Logic se setup_loop block lo aur uske andar code jodo, phir Verify dabao.';
            return;
        }
        var boardSelected = document.getElementById('boardMenu').value;
        if ((boardSelected == "none") || (boardSelected == "...") || (boardSelected == "") || (boardSelected == "undefined")) {
            document.getElementById('content_serial').style.color = '#FF0000';
            document.getElementById('content_serial').innerHTML = MSG['IDE_select_board'];
            return;
        } else {
            document.getElementById('content_serial').style.color = '#FFFFFF';
            document.getElementById('content_serial').innerHTML = MSG['IDE_upload1'] + profile.default['description'];
            var upload_arg = profile.default['upload_arg'];
            var verbose = false;
            try { verbose = document.getElementById('detailedCompilation').checked === true; } catch (e) {}
            if (RoboSiddhiBuild) { try { var cmd = RoboSiddhiBuild.compileCommand(upload_arg, file_path, verbose); } catch (e) {
                    document.getElementById('content_serial').style.color = '#FF0000';
                    document.getElementById('content_serial').innerHTML = e.message;
                    return;
                } }
            else if (verbose)
                var cmd = 'arduino-cli.exe compile -v -b ' + upload_arg + ' ' + file_path;
            else
                var cmd = 'arduino-cli.exe compile -b ' + upload_arg + ' ' + file_path;

            fs.writeFileSync(file, data);
            document.getElementById('content_serial').innerHTML += '<br>' + MSG['IDE_verif_progress'];
            exec(cmd, {
                cwd: './compiler'
            }, (error, stdout, stderr) => {
                if (error) {
                    RoboSiddhiShowError(stderr || (error && error.message) || 'Compile failed', upload_arg);
                    return;
                }
                document.getElementById('content_serial').style.color = '#00FF00';
                document.getElementById('content_serial').innerHTML = stdout + '<br>' + MSG['IDE_verif_ok'];
            });
        }
    };
    document.getElementById('uploadButton').onclick = function (event) {
        try {
            fs.accessSync('.\\compiler\\tmp', fs.constants.W_OK);
        } catch (err) {
            fs.mkdirSync('.\\compiler\\tmp', {
                recursive: false
            }, (err) => {
                if (err)
                    throw err;
            });
        }
        var file_path = '.\\tmp';
        var file = '.\\compiler\\tmp\\tmp.ino';
        // hamesha workspace se fresh full code lo (ACE innerText kate-phate mil sakta hai)
        var data = Blockly.Arduino.workspaceToCode(Code.workspace);
        try { editor.setValue(data, 1); } catch (e) {}
        if (data.indexOf('void setup') === -1 || data.indexOf('void loop') === -1) {
            document.getElementById('content_serial').style.color = '#FF0000';
            document.getElementById('content_serial').innerHTML = 'Blocks incomplete: Logic se setup_loop block lo aur uske andar code jodo, phir Verify dabao.';
            return;
        }
        var boardSelected = document.getElementById('boardMenu').value;
        var comPortSelected = document.getElementById('serialMenu').value;
        if ((boardSelected == "none") || (boardSelected == "...") || (boardSelected == "") || (boardSelected == "undefined")) {
            document.getElementById('content_serial').style.color = '#FF0000';
            document.getElementById('content_serial').innerHTML = MSG['IDE_select_board'];
            return;
        } else {
            if (comPortSelected === "none") {
                document.getElementById('content_serial').style.color = '#FF0000';
                document.getElementById('content_serial').innerHTML = MSG['IDE_select_port'];
                return;
            } else {
                document.getElementById('content_serial').style.color = '#FFFFFF';
                document.getElementById('content_serial').innerHTML = MSG['IDE_upload1'] + profile.default['description'] + MSG['IDE_upload2'] + comPortSelected;
                document.getElementById('content_serial').innerHTML += '<br>' + MSG['IDE_upload3'];
                var upload_arg = profile.default['upload_arg'];
            }
        }
        var verboseUp = false;
        try { verboseUp = document.getElementById('detailedCompilation').checked === true; } catch (e) {}
        if (RoboSiddhiBuild) { try { var cmd = RoboSiddhiBuild.uploadCommand(upload_arg, comPortSelected, file_path, verboseUp); } catch (e) {
                document.getElementById('content_serial').style.color = '#FF0000';
                document.getElementById('content_serial').innerHTML = e.message;
                return;
            } }
        else if (verboseUp)
            var cmd = 'arduino-cli.exe upload -v -p ' + comPortSelected + ' -b ' + upload_arg + ' ' + file_path;
        else
            var cmd = 'arduino-cli.exe upload -p ' + comPortSelected + ' -b ' + upload_arg + ' ' + file_path;
        fs.writeFileSync(file, data);
        exec(cmd, {
            cwd: './compiler'
        }, (error, stdout, stderr) => {
            if (error) {
                RoboSiddhiShowError(stderr || (error && error.message) || 'Upload failed', upload_arg);
                return;
            }
            document.getElementById('content_serial').style.color = '#00FF00';
            document.getElementById('content_serial').innerHTML = stdout + '<br>' + MSG['IDE_upload_ok'];
        });
    };
    document.getElementById('serialConnectButton').addEventListener('click', function () {
        var langChoice = document.getElementById('languageMenu').value;
        var boardSelected = document.getElementById('boardMenu').value;
        var comPortSelected = document.getElementById('serialMenu').value;
        if ((boardSelected == "none") || (boardSelected == "...") || (boardSelected == "") || (boardSelected == "undefined")) {
            document.getElementById('content_serial').style.color = '#FF0000';
            document.getElementById('content_serial').innerHTML = MSG['IDE_select_board'];
            return;
        } else if (comPortSelected === "none") {
                document.getElementById('content_serial').style.color = '#FF0000';
                document.getElementById('content_serial').innerHTML = MSG['IDE_select_port'];
                return;
            } else {
                document.getElementById('content_hoverButton').style.color = '#FFFFFF';
                document.getElementById('content_hoverButton').innerHTML = MSG['IDE_connect'] + comPortSelected;
                localStorage.setItem("comPort", comPortSelected);
                localStorage.setItem("availableSpeed", JSON.stringify(profile.default['serialList']));
                ipcRenderer.send("serialConnect", langChoice);
        }
    });
    document.getElementById('wiringButton').addEventListener('click', function () {
  		// var val = location.search.match(new RegExp('[?&]lang=([^&]+)'));
  		// var argLangChoice = val ? decodeURIComponent(val[1].replace(/\+/g, '%20')) : 'en';
        var langChoice = document.getElementById('languageMenu').value;
        ipcRenderer.send("hackCable", langChoice);
    });
    document.getElementById('factoryButton').addEventListener('click', function () {
  		// var val = location.search.match(new RegExp('[?&]lang=([^&]+)'));
  		// var argLangChoice = val ? decodeURIComponent(val[1].replace(/\+/g, '%20')) : 'en';
        var langChoice = document.getElementById('languageMenu').value;
        ipcRenderer.send("blockFactory", langChoice);
    });
    document.getElementById('htmlButton').addEventListener('click', function () {
  		// var val = location.search.match(new RegExp('[?&]lang=([^&]+)'));
  		// var argLangChoice = val ? decodeURIComponent(val[1].replace(/\+/g, '%20')) : 'en';
        var langChoice = document.getElementById('languageMenu').value;
        ipcRenderer.send("blocklyHTML", langChoice);
    });
});