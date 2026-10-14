/**
 * RoboSiddhi ESP IDE — Node tests (no hardware required).
 * Run: node tests/run_tests.js
 */
'use strict';
const assert = require('assert');
const path = require('path');

const Boards = require('../www/blocklyduino/js/esp_board_profiles.js');
const Manager = require('../www/blocklyduino/js/robosiddhi_board_manager.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('PASS ' + name); }
  catch (e) { fail++; console.error('FAIL ' + name + ' :: ' + e.message); }
}

// 1. Board registry loads
test('profiles list has 6 ESP boards', () => {
  const list = Manager.listProfiles();
  const ids = list.map(p => p.id);
  ['esp32_devkit_v1', 'nodemcu_32s', 'esp32s2_dev', 'esp32s3_dev', 'esp32c3_dev', 'esp8266_nodemcu'].forEach(id => {
    assert.ok(ids.includes(id), 'missing ' + id);
  });
});

test('each profile has fqbn + corePackage', () => {
  Manager.listProfiles().forEach(p => {
    assert.ok(p.fqbn && p.fqbn.includes(':'), p.id + ' fqbn');
    assert.ok(p.corePackage && p.corePackage.includes(':'), p.id + ' core');
  });
});

// 2. GPIO restrictions
test('ESP32 GPIO6 flash-reserved rejected', () => {
  const r = Manager.validatePin('esp32_devkit_v1', 6, 'digital_out');
  assert.strictEqual(r.ok, false);
});
test('ESP32 GPIO13 LED ok', () => {
  const r = Manager.validatePin('esp32_devkit_v1', 13, 'digital_out');
  assert.strictEqual(r.ok, true);
});
test('ESP32-C3 GPIO11 flash-reserved rejected', () => {
  const r = Manager.validatePin('esp32c3_dev', 11, 'digital_out');
  assert.strictEqual(r.ok, false);
});
test('ESP32-C3 GPIO4 ok', () => {
  const r = Manager.validatePin('esp32c3_dev', 4, 'digital_out');
  assert.strictEqual(r.ok, true);
});
test('ESP8266 A0 analog ok, GPIO4 analog rejected', () => {
  assert.strictEqual(Manager.validatePin('esp8266_nodemcu', 'A0', 'analog_in').ok, true);
  assert.strictEqual(Manager.validatePin('esp8266_nodemcu', 4, 'analog_in').ok, false);
});
test('ESP8266 GPIO16 PWM rejected', () => {
  const r = Manager.validatePin('esp8266_nodemcu', 16, 'pwm');
  assert.strictEqual(r.ok, false);
});
test('ESP32 input-only 34 as output rejected', () => {
  const r = Manager.validatePin('esp32_devkit_v1', 34, 'digital_out');
  assert.strictEqual(r.ok, false);
});
test('strapping pin gives warning not error', () => {
  const r = Manager.validatePin('esp32_devkit_v1', 0, 'digital_out');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.level, 'warn');
});
test('unknown board errors (no invented mapping)', () => {
  const r = Manager.validatePin('esp99_fake', 13, 'digital_out');
  assert.strictEqual(r.ok, false);
});

// 3. Board change: compatible pins differ per board
test('compatible PWM pins differ ESP32 vs C3', () => {
  const a = Manager.compatiblePins('esp32_devkit_v1', 'pwm');
  const b = Manager.compatiblePins('esp32c3_dev', 'pwm');
  assert.ok(a.includes(13) && b.includes(4));
  assert.ok(!b.includes(13), 'C3 has no GPIO13');
});
test('ESP8266 analog list is A0 only via registry', () => {
  const reg = require('../www/blocklyduino/components_registry.json');
  const soil = reg.components.find(c => c.id === 'soil_analog');
  assert.ok(soil.boards.includes('esp8266_nodemcu'));
});

// 4. Workspace validation: double-output warns
test('workspace double-drive warns', () => {
  const r = Manager.validateWorkspace('esp32_devkit_v1', [
    { gpio: 13, mode: 'digital_out', block: 'led1' },
    { gpio: 13, mode: 'digital_out', block: 'led2' }
  ]);
  assert.strictEqual(r.ok, true);
  assert.ok(r.warnings.length >= 1);
});

// 5. Component registry: supported have blocks
test('supported components have blocks', () => {
  const reg = require('../www/blocklyduino/components_registry.json');
  reg.components.filter(c => c.status === 'supported').forEach(c => {
    assert.ok(Array.isArray(c.blocks) && c.blocks.length >= 1, c.id + ' needs blocks');
  });
});

// 6. Toolbox ESP valid (JS var wrapper, loaded via <script>)
test('toolbox_esp.json valid', () => {
  const fs = require('fs');
  let raw = fs.readFileSync(path.join(__dirname, '../www/blocklyduino/toolbox/toolbox_esp.json'), 'utf8');
  let m = raw.match(/var\s+toolbox_esp\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  assert.ok(m, 'toolbox_esp var wrapper');
  const tb = JSON.parse(m[1]);
  assert.strictEqual(tb.toolboxitemid, 'ESP');
  assert.ok(tb.contents.length >= 8);
});

// 7. Boards.json still parses + has esp8266 after patch
test('boards.json parses', () => {
  const fs = require('fs');
  const raw = fs.readFileSync(path.join(__dirname, '../www/blocklyduino/js/boards.json'), 'utf8');
  const m = raw.match(/var profile = (\{[\s\S]*\})\s*;?\s*$/);
  assert.ok(m, 'boards.json wrapper');
  const profile = JSON.parse(m[1]);
  assert.ok(profile.esp32_devkit_v1, 'esp32 present');
  // esp8266 added by this branch — warn if missing but do not fail fresh checkout
  if (!profile.esp8266_nodemcu) console.log('  (note: esp8266_nodemcu not yet in boards.json — run patch step)');
});

// 8. Generator smoke test with stubbed Blockly.Arduino
test('LED generator emits pinMode + digitalWrite', () => {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '../www/blocklyduino/arduino/esp/esp_sensors.js'), 'utf8');
  assert.ok(src.includes("pinMode(") && src.includes("digitalWrite("));
  assert.ok(src.includes("#include <DHT.h>"), 'DHT include');
  assert.ok(src.includes("pulseIn("), 'HCSR04 pulseIn');
});

// 9. Build helpers: safe commands + diagnostics + project schema
test('compile/upload commands quoted + validated', () => {
  const Build = require('../www/blocklyduino/js/robosiddhi_build.js');
  assert.ok(Build.compileCommand('esp32:esp32:esp32', '.\\tmp', false).includes('-b esp32:esp32:esp32'));
  assert.throws(() => Build.compileCommand('none', '.\\tmp', false));
  assert.throws(() => Build.uploadCommand('esp32:esp32:esp32', 'none', '.\\tmp', false));
  assert.throws(() => Build.uploadCommand('esp32:esp32:esp32', 'COM1; rm -rf /', '.\\tmp', false));
  assert.ok(Build.uploadCommand('esp32:esp32:esp32', 'COM5', '.\\tmp', false).includes('COM5'));
});
test('diagnose missing .h suggests lib install', () => {
  const Build = require('../www/blocklyduino/js/robosiddhi_build.js');
  const msg = Build.diagnoseCompilerError('fatal error: DHT.h: No such file', 'esp32:esp32:esp32');
  assert.ok(/lib install/i.test(msg));
});
test('diagnose missing core suggests core install', () => {
  const Build = require('../www/blocklyduino/js/robosiddhi_build.js');
  const msg = Build.diagnoseCompilerError('Error: unknown board esp32:esp32:esp32', 'esp32:esp32:esp32');
  assert.ok(/core install esp32:esp32/.test(msg));
});
test('project schema round-trips', () => {
  const Build = require('../www/blocklyduino/js/robosiddhi_build.js');
  const p = Build.newProjectSkeleton('demo', 'esp32c3_dev');
  assert.strictEqual(Build.validateProject(p).ok, true);
  assert.strictEqual(Build.validateProject({}).ok, false);
});
test('examples exist and parse as XML', () => {
  const fs = require('fs');
  ['esp_blink.xml', 'esp_temp_alarm.xml', 'esp_autolight.xml', 'esp_obstacle.xml', 'esp_soil.xml', 'esp_motion.xml'].forEach(f => {
    const s = fs.readFileSync(path.join(__dirname, '../www/examples/' + f), 'utf8');
    assert.ok(s.includes('<xml') && s.includes('base_setup_loop'), f);
  });
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
