import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const scene=readFileSync(
  new URL("../src/components/ide/GearSprayScene.tsx",import.meta.url),"utf8");
const graphic=scene.slice(scene.indexOf("function ProcessGraphic("),scene.indexOf("function InfoModal("));

test("Escena 06 conserva tuberías separadas para aire y grasa",()=>{
  assert.match(graphic,/const pipe=\(d:string,kind:"air"\|"lube",flow:boolean\)/);
  assert.match(graphic,/pipe\("M43 286 H282", "air", pump\|\|air\)/);
  assert.match(graphic,/pipe\("M282 286 V124 H909 V475", "air", air\)/);
  assert.match(graphic,/pipe\("M282 286 H444 V370", "air", pump\)/);
  assert.match(graphic,/pipe\("M383 427 V382 H743", "lube", grease&&pump\)/);
  assert.match(graphic,/pipe\("M855 "\+y\+" H961","lube",grease&&pump\)/);
  assert.match(graphic,/pipe\("M909 "\+\(y-13\)\+" H961","air",air\)/);
  assert.match(graphic,/nozzleYs=\[246,290,334,378,422,466\]/);
  assert.match(graphic,/cruza las seis líneas de grasa SIN conexión/);
});

test("Instrumentos reubicados siguen enlazados a las E/S físicas correctas",()=>{
  for(const ref of [
    'solenoid(444,124,"SV-2563",air,"air")',
    'solenoid(444,286,"SV-2560",pump,"air")',
    'solenoid(615,382,"SV-2561",grease,"lube")',
    '"_310_SQS_2561"',
    '"_310_PLC104_YI_MillRun"',
    'gearNumber(project,"_310_PI_2561").toFixed(1)',
    'gearNumber(project,"_310_PI_2560").toFixed(1)',
  ]) assert.ok(graphic.includes(ref),"Falta enlace: "+ref);
  assert.match(graphic,/PI-2561 · AIRE/);
  assert.match(graphic,/PI-2560 · GRASA/);
  assert.doesNotMatch(graphic,/onDigitalInput|onAnalogInput|setTagValue|onPushButton/,
    "La vista SVG no debe escribir tags del controlador");
});
