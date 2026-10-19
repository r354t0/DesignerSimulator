import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const scene=readFileSync(
  new URL("../src/components/ide/GearSprayScene.tsx",import.meta.url),"utf8");
const graphic=scene.slice(scene.indexOf("function ProcessGraphic("),scene.indexOf("function InfoModal("));

test("La escena 06 representa uniones continuas del aire y la lubricante con tees",()=>{
  assert.match(graphic,/const pipe=\(d:string,kind:"air"\|"lube",flow:boolean\)/);
  assert.match(graphic,/const tee=\(x:number,y:number,kind:"air"\|"lube"\)/);
  assert.ok(graphic.includes('pipe("M42 305 H230 V156 H964 V548","air",air)'),
    "Aire principal debe tener un recorrido continuo hasta el colector");
  assert.ok(graphic.includes('pipe("M230 305 H370 V412 H305","air",pump)'),
    "SV-2560 debe alimentar el actuador neumático de la bomba");
  assert.ok(graphic.includes('tee(230,305,"air")'));
  assert.ok(graphic.includes('pipe("M259 483 V445 H779","lube",grease&&pump)'),
    "Línea de lubricante debe conectar tambor, bomba y dosificador");
  assert.ok(graphic.includes('pipe("M911 "+(y+9)+" H1019","lube",grease&&pump)'));
  assert.ok(graphic.includes('pipe("M964 "+(y-12)+" H1019","air",air)'));
  assert.match(graphic,/nozzleYs=\[326,366,406,446,486,526\]/);
  assert.match(graphic,/una entrada de lubricante y otra de aire/);
});

test("PI-2561 se encuentra junto al dosificador y ninguna etiqueta tapa su entrada",()=>{
  assert.ok(graphic.includes('pipe("M704 156 V188","air",air)'));
  assert.ok(graphic.includes('tee(704,156,"air")'));
  assert.ok(graphic.includes('<circle cx="704" cy="205"'));
  assert.ok(graphic.includes('<rect x="638" y="255" width="124" height="34"'));
  assert.ok(graphic.includes('<rect x="779" y="301" width="132" height="251"'));
  assert.match(graphic,/PI-2561 · AIRE/);
  assert.match(graphic,/PI-2560 · LUBRICANTE/);
});

test("PI-2560 está conectado entre el filtro y SV-2561 sin solaparse con la válvula",()=>{
  assert.ok(graphic.includes('tee(530,445,"lube")'),
    "La derivación debe quedar a la derecha del filtro (x=421) y antes de SV-2561 (x=640)");
  assert.ok(graphic.includes('<path d="M530 445 V416"'),
    "El transmisor debe comunicarse con el circuito de lubricante");
  assert.ok(graphic.includes('<circle cx="530" cy="402" r="14"'));
  assert.ok(graphic.includes('<rect x="473" y="345" width="114" height="34"'));
  assert.ok(graphic.includes('PI-2560 · LUBRICANTE'));
  assert.ok(!graphic.includes('tee(707,445,"lube")'),
    "No debe permanecer la toma de presión posterior a la solenoide");
});

test("Filtro compacto, PI-2560 y SV-2561 tienen separación horizontal",()=>{
  const filter={x:389,width:32};
  const transmitter={x:530,radius:14};
  const valve={x:659,halfWidth:19};
  assert.ok(graphic.includes('<rect x="389" y="432" width="32" height="26"'),
    "Filtro más pequeño que la versión anterior");
  assert.ok(graphic.includes('<circle cx="530" cy="402" r="14"'));
  assert.ok(graphic.includes('solenoid(659,445,"SV-2561",grease,"lube")'));
  assert.ok(transmitter.x-transmitter.radius-(filter.x+filter.width)>=30,
    "Separación mínima de filtro a PI-2560");
  assert.ok(valve.x-valve.halfWidth-(transmitter.x+transmitter.radius)>=40,
    "Separación mínima de PI-2560 a SV-2561");
  assert.ok(graphic.includes('text x="530" y="337" textAnchor="middle"'),
    "La etiqueta de PI-2560 debe quedar centrada");
});

test("La cadena de lubricación ocupa también el sector izquierdo de la escena",()=>{
  // Reparto horizontal: bomba → filtro → presión → electroválvula → dosificador.
  const centers=[263,405,530,659,779];
  assert.ok(graphic.includes('<rect x="208" y="483" width="103" height="109"'),
    "El tambor se debe desplazar a la izquierda");
  assert.ok(graphic.includes('<rect x="224" y="412" width="79" height="55"'),
    "La bomba debe permanecer sobre el tambor en el sector izquierdo");
  assert.ok(graphic.includes('<text x="263" y="395"'));
  assert.ok(graphic.includes('pipe("M259 483 V445 H779","lube",grease&&pump)'),
    "El recorrido de lubricación debe seguir continuo hasta el distribuidor");
  assert.ok(graphic.includes('pipe("M230 305 H370 V412 H305","air",pump)'),
    "El aire de SV-2560 debe seguir conectado a la bomba reubicada");
  for(let i=1;i<centers.length;i++){
    const gap=centers[i]-centers[i-1];
    assert.ok(gap>=110 && gap<=150, "Separación horizontal desequilibrada en tramo "+i);
  }
  assert.deepEqual([...centers].sort((a,b)=>a-b),centers,
    "No cambiar el orden de los instrumentos");
});

test("El nombre del circuito está debajo de la tubería y no aparece GRASA en el SCADA",()=>{
  assert.ok(graphic.includes('<text x="433" y="491" fontSize="11.5" fontWeight="700"'));
  assert.ok(graphic.includes('CIRCUITO DE LUBRICANTE'));
  assert.ok(graphic.includes('PI-2560 · LUBRICANTE'));
  assert.ok(graphic.includes('Lubricante: {grease?"ON":"OFF"}'));
  assert.doesNotMatch(graphic,/\bgrasa\b/i);
});

test("Los instrumentos mantienen sus tags CCW y la vista no escribe salidas",()=>{
  for(const ref of [
    'solenoid(464,156,"SV-2563",air,"air")',
    'solenoid(300,305,"SV-2560",pump,"air")',
    'solenoid(659,445,"SV-2561",grease,"lube")',
    '"_310_SQS_2561"',
    '"_310_PLC104_YI_MillRun"',
    'gearNumber(project,"_310_PI_2561").toFixed(1)',
    'gearNumber(project,"_310_PI_2560").toFixed(1)',
  ]) assert.ok(graphic.includes(ref),"Falta enlace: "+ref);
  assert.doesNotMatch(graphic,/onDigitalInput|onAnalogInput|setTagValue|onPushButton/,
    "La vista SVG no debe escribir tags del controlador");
});
