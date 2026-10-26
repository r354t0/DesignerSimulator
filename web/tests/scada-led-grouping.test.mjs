import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path=>readFileSync(new URL(path,import.meta.url),"utf8");
const scenarios=[
  {scene:"Conveyor",status:["EN MARCHA","DETENIDA","LOTE COMPLETO"],
    inputs:["PB START","PB STOP","PB RESET","PE-01 · CAJA"],
    outputs:["MOTOR"],
    telemetry:["Cajas detectadas","readConveyorCount(project)"]},
  {scene:"Sort",status:["EN MARCHA","IDLE","LOTE COMPLETO","LÍNEAS LIBRES"],
    inputs:["PB START","PB STOP","PB RESET","TIPO B","SALIDA A","SALIDA B"],
    outputs:["MOTOR","DESVIADOR B"],
    telemetry:["Progreso del lote","CNT_BatchBoxes","CNT_Lotes"]},
  {scene:"Tank",status:["RUN","IDLE","ALARMA","LOTE TERMINADO"],
    inputs:["PB START","PB STOP","PB DRENAR","PB RESET","NIVEL BAJO","NIVEL ALTO"],
    outputs:["BOMBA","VÁLVULA ENTRADA","VÁLVULA DRENAJE","AGITADOR M-02"],
    telemetry:["Temporizadores TON","Nivel","Llenado","Drenado"]},
  {scene:"Traffic",status:["RUN","IDLE","SOLICITUD PENDIENTE","FALLO / CONFLICTO"],
    inputs:["PB START","PB STOP","PB RESET","PB PEATÓN","DEMANDA N-S",
      "DEMANDA E-O","PASO N-S","PASO E-O"],
    outputs:["VERDE N-S","AMARILLO N-S","ROJO N-S","VERDE E-O",
      "AMARILLO E-O","ROJO E-O","CRUCE PEATONAL"],
    telemetry:["Supervisión de ciclo","Vehículos N-S","Vehículos E-O"]},
];

test("shared SCADA signal group renders the three standardized labels and icon categories",()=>{
  const group=read("../src/components/ide/ScadaLedGroup.tsx");
  for(const title of ["Estado del sistema","Entradas digitales","Salidas digitales"])
    assert.match(group,new RegExp(title));
  assert.match(group,/container:|scada-pilot-grid grid grid-cols-2 gap-2/);
  for(const type of ["status","inputs","outputs"])
    assert.match(group,new RegExp(type+":"));
  assert.match(group,/aria-label=\{title\}/);
  assert.match(group,/children/);
});

for(const info of scenarios){
  test("SCADA "+info.scene+" groups every existing pilot in the appropriate category",()=>{
    const view=read("../src/components/ide/"+info.scene+"Scene.tsx");
    assert.match(view,/import \{ ScadaLedGroup \} from "\.\/ScadaLedGroup"/);
    const start=view.indexOf('<ScadaLedGroup kind="status">');
    const input=view.indexOf('<ScadaLedGroup kind="inputs">');
    const output=view.indexOf('<ScadaLedGroup kind="outputs">');
    assert.ok(start>0&&start<input&&input<output,"groups must appear in status/input/output order");
    assert.equal((view.match(/<ScadaLedGroup kind=/g)||[]).length,3);
    const sections=[
      [view.slice(start,input),info.status],
      [view.slice(input,output),info.inputs],
      [view.slice(output,view.indexOf("</ScadaLedGroup>",output)),info.outputs],
    ];
    for(const [section,labels] of sections)
      for(const label of labels)
        assert.ok(section.includes('label="'+label+'"'),
          info.scene+" must include "+label+" in its expected category");
    assert.match(view,/scada-led-panel/);
    assert.match(view,/scada-control-shell/);
    for(const preserved of info.telemetry)
      assert.ok(view.includes(preserved),info.scene+" lost "+preserved);
  });
}

test("Conveyor and Sort optional reset pilots remain conditional",()=>{
  for(const scene of ["Conveyor","Sort"]){
    const source=read("../src/components/ide/"+scene+"Scene.tsx");
    const group=source.slice(source.indexOf('<ScadaLedGroup kind="inputs">'),
      source.indexOf('<ScadaLedGroup kind="outputs">'));
    assert.match(group,/resetAvailable && \(/);
    assert.match(group,/PB RESET/);
    assert.match(source,/resetAvailable && \(/);
  }
});
test("SCADA grouped LEDs continue to read real PLC/physics inputs and outputs",()=>{
  const con=read("../src/components/ide/ConveyorScene.tsx");
  assert.match(con,/label="MOTOR" lit=\{motorOn\}/);
  assert.match(con,/label="PE-01 · CAJA" lit=\{sensor\}/);
  const sort=read("../src/components/ide/SortScene.tsx");
  assert.match(sort,/label="MOTOR" active=\{motor\}/);
  assert.match(sort,/label="DESVIADOR B" active=\{divert\}/);
  assert.match(sort,/label="TIPO B" active=\{detection\}/);
  const tank=read("../src/components/ide/TankScene.tsx");
  for(const [name,expr] of [
    ["BOMBA","pump"],["VÁLVULA ENTRADA","inlet"],
    ["VÁLVULA DRENAJE","drain"],["AGITADOR M-02","mixer"],
    ["ALARMA","alarm"],["NIVEL BAJO","low"],["NIVEL ALTO","high"],
  ])assert.ok(tank.includes('label="'+name+'" active={'+expr+'}'),
    "Tank "+name+" must still use "+expr);
  const traffic=read("../src/components/ide/TrafficScene.tsx");
  for(const [name,expr] of [
    ["VERDE N-S","nsG"],["AMARILLO N-S","nsY"],["ROJO N-S","nsR"],
    ["VERDE E-O","ewG"],["AMARILLO E-O","ewY"],["ROJO E-O","ewR"],
    ["CRUCE PEATONAL","walk"],["SOLICITUD PENDIENTE","pending"],
    ["FALLO / CONFLICTO","fault"],
  ])assert.ok(traffic.includes('label="'+name+'"')&&traffic.includes('lit={'+expr+'}'),
    "Traffic "+name+" must still be wired to "+expr);
});
test("LED groups adapt to true panel width and preserve existing SCADA scene layout",()=>{
  const css=read("../src/workspace.css");
  assert.match(css,/\.scada-led-panel\s*\{\s*container: scada-leds \/ inline-size/);
  assert.match(css,/@container scada-leds \(max-width: 340px\)/);
  assert.match(css,/@container scada-leds \(min-width: 680px\)/);
  assert.match(css,/\.scada-led-panel \.scada-pilot-grid/);
  assert.match(css,/grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css,/\.scada-scene-workspace/);
});
