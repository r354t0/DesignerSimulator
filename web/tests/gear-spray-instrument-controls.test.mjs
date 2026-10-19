import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {initialGearSprayProject, gearNumber, writeGearScadaInput}
  from "../src/plc/gearSpraySceneModel.ts";

const code=readFileSync(new URL("../src/components/ide/GearSprayScene.tsx",import.meta.url),"utf8");
const controls=code.slice(code.indexOf("function NumberSetting("),code.indexOf("function Pilot("));
const panel=code.slice(code.indexOf("Instrumentación y setpoints"),code.indexOf('Pilotos LED y equipos'));

test("Instrumentación usa descripción como título y tag debajo",()=>{
  assert.match(controls,/\{label\}<\/span>/);
  assert.match(controls,/\{name\}<\/span>/);
  assert.ok(controls.indexOf("{label}</span>") < controls.indexOf("{name}</span>"));
  assert.match(panel,/label=\{isAir\?"Presión de aire":"Presión de lubricante"\}/);
  for(const caption of [
    "Frecuencia entre lubricaciones","Pulsos por lubricación",
    "Tiempo máximo de lubricación","Duración de mantenimiento"
  ]) assert.ok(panel.includes(caption),caption);
});

test("La entrada analógica ofrece número y slider dentro de las escalas originales",()=>{
  assert.match(controls,/type="number"/);
  assert.match(controls,/type="range"/);
  assert.match(controls,/onCommit\(Number\(e.target.value\)\)/);
  assert.match(panel,/min=\{0\} max=\{isAir\?148:1480\} step=\{0.1\}/);
  assert.match(panel,/Referencia original: 0–148/);
  assert.match(panel,/Referencia original: 0–1480/);
  let p=initialGearSprayProject();
  p=writeGearScadaInput(p,"_310_PI_2561",148);
  p=writeGearScadaInput(p,"_310_PI_2560",1480);
  assert.equal(gearNumber(p,"_310_PI_2561"),148);
  assert.equal(gearNumber(p,"_310_PI_2560"),1480);
  // Se permite entrada numérica excepcional para FAT: la escala del
  // programa original no llega al umbral >1500 del diagnóstico CCW.
  p=writeGearScadaInput(p,"_310_PI_2560",1501);
  assert.equal(gearNumber(p,"_310_PI_2560"),1501);
});

test("Los setpoints DINT se pueden editar con ambos controles sin inventar máximos de proceso",()=>{
  assert.match(panel,/GEAR_HMI_SETPOINTS\.map/);
  assert.match(panel,/integer value=\{gearNumber\(project,sp.name\)\}/);
  assert.match(controls,/max\?\?windowMax/);
  assert.match(controls,/Ampliar escala del deslizador/);
  assert.match(panel,/programa no define un máximo operativo/);
  let p=initialGearSprayProject();
  p=writeGearScadaInput(p,"TMR_Freq_SP",200);
  assert.equal(gearNumber(p,"TMR_Freq_SP"),200);
});

test("Las entradas digitales muestran una descripción y el tag entre paréntesis",()=>{
  assert.match(panel,/Confirmación de molino en marcha/);
  assert.match(panel,/Pulso del dosificador/);
  assert.match(panel,/Sensor de nivel bajo de lubricante/);
  assert.match(panel,/\(\{x.name\}\)/);
  assert.match(panel,/checked=\{v\(x.name\)\}/);
  assert.match(panel,/onDigitalInput\(x.name as GearDigitalInput,event.target.checked\)/);
});
