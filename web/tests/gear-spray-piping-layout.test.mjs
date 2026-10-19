import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const scene=readFileSync(
  new URL("../src/components/ide/GearSprayScene.tsx",import.meta.url),"utf8");
const graphic=scene.slice(scene.indexOf("function ProcessGraphic("),scene.indexOf("function InfoModal("));

test("La escena 06 representa uniones continuas del aire y la grasa con tees",()=>{
  assert.match(graphic,/const pipe=\(d:string,kind:"air"\|"lube",flow:boolean\)/);
  assert.match(graphic,/const tee=\(x:number,y:number,kind:"air"\|"lube"\)/);
  assert.ok(graphic.includes('pipe("M42 305 H230 V156 H964 V548","air",air)'),
    "Aire principal debe tener un recorrido continuo hasta el colector");
  assert.ok(graphic.includes('pipe("M230 305 H465 V412 H446","air",pump)'),
    "SV-2560 debe alimentar el actuador neumático de la bomba");
  assert.ok(graphic.includes('tee(230,305,"air")'));
  assert.ok(graphic.includes('pipe("M403 483 V445 H779","lube",grease&&pump)'),
    "Línea de grasa debe conectar tambor, bomba y dosificador");
  assert.ok(graphic.includes('pipe("M911 "+(y+9)+" H1019","lube",grease&&pump)'));
  assert.ok(graphic.includes('pipe("M964 "+(y-12)+" H1019","air",air)'));
  assert.match(graphic,/nozzleYs=\[326,366,406,446,486,526\]/);
  assert.match(graphic,/una entrada de grasa y otra de aire/);
});

test("PI-2561 se encuentra junto al dosificador y ninguna etiqueta tapa su entrada",()=>{
  assert.ok(graphic.includes('pipe("M704 156 V188","air",air)'));
  assert.ok(graphic.includes('tee(704,156,"air")'));
  assert.ok(graphic.includes('<circle cx="704" cy="205"'));
  assert.ok(graphic.includes('<rect x="638" y="255" width="124" height="34"'));
  assert.ok(graphic.includes('<rect x="779" y="301" width="132" height="251"'));
  assert.match(graphic,/PI-2561 · AIRE/);
  assert.match(graphic,/PI-2560 · GRASA/);
});

test("Los instrumentos mantienen sus tags CCW y la vista no escribe salidas",()=>{
  for(const ref of [
    'solenoid(464,156,"SV-2563",air,"air")',
    'solenoid(394,305,"SV-2560",pump,"air")',
    'solenoid(612,445,"SV-2561",grease,"lube")',
    '"_310_SQS_2561"',
    '"_310_PLC104_YI_MillRun"',
    'gearNumber(project,"_310_PI_2561").toFixed(1)',
    'gearNumber(project,"_310_PI_2560").toFixed(1)',
  ]) assert.ok(graphic.includes(ref),"Falta enlace: "+ref);
  assert.doesNotMatch(graphic,/onDigitalInput|onAnalogInput|setTagValue|onPushButton/,
    "La vista SVG no debe escribir tags del controlador");
});
