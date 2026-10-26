/**
 * Local-only OPC UA -> WebSocket bridge for Gear Spray HIL.
 * Requires a third-party UA server such as FactoryTalk Linx Gateway.
 * No PLC program, scan, or safety logic executes in this process.
 *
 * Run npm install && cp config.example.json config.json && npm start.
 * Default is READ ONLY; all field outputs are READ from real PLC,
 * and the sensor/HMI inputs are the ONLY OPC UA nodes that may be written.
 */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {WebSocket,WebSocketServer} from "ws";
import {
  OPCUAClient,AttributeIds,DataType,MessageSecurityMode,SecurityPolicy,
} from "node-opcua";
import {parseConfig,writeValueForTag,parseOutputs,normaliseInput,OBSERVE_TYPES}
  from "./validation.mjs";
import {writeSqsPulse100} from "./sqsPulse.mjs";
import {initialHilPhysical,configureHilPhysical,stepHilPhysical,sensorsFromHil} from "./physicalPlant.mjs";

const configPath=process.env.GEAR_OPCUA_CONFIG ||
  resolve(process.cwd(),"config.json");
let config;
try{config=parseConfig(JSON.parse(readFileSync(configPath,"utf8")));}
catch(err){
  console.error("Configuración OPC UA inválida:",err.message);
  console.error("Copia config.example.json a config.json y configura los NodeIds reales de FactoryTalk.");
  process.exit(1);
}

const clients=new Set();
const server=new WebSocketServer({
  host:config.listenHost,port:config.listenPort,
  maxPayload:4096,perMessageDeflate:false,
  verifyClient(info,done){
    const origin=info.origin||info.req.headers.origin;
    done(Boolean(origin&&config.allowedOrigins.includes(origin)),403,
      "Origen no permitido");
  },
});
const report=(message)=>{
  const frame=JSON.stringify(message);
  for(const ws of clients){
    if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<65536)
      ws.send(frame);
  }
};
const status=(detail,connected=false)=>({
  type:"status",connected,
  writable:connected&&config.allowWrites&&
    Object.values(config.write).every(node=>typeof node==="string"&&node.length>0),
  detail,mappedInputs:Object.values(config.write).filter(Boolean).length,
  mappedOutputs:Object.values(config.read).filter(Boolean).length,
});
let detail="Esperando FactoryTalk Linx Gateway";
let session=null;
let client=null;
let live=false;
let closed=false;
let writing=Promise.resolve();
let queueSize=0;
let sqsPulseActive=false;
let hil=initialHilPhysical();
let lastOutputs={};
let lastReadAt=0;
let lastSensorWriteAt=0;
let lastSentSensors={};
let lastHilTick=Date.now();
const canWrite=()=>live&&config.allowWrites&&
  Object.values(config.write).every(id=>typeof id==="string"&&id.length>0);
const reportHil=()=>report({type:"physical",physical:hil,ts:Date.now()});
function resetHil(keepEnabled=false){
  hil={...initialHilPhysical(),enabled:keepEnabled&&hil.enabled};
  lastSentSensors={};
  reportHil();
}
function enqueueHilWrite(tag,value){
  if(!canWrite()||!session||queueSize>=100)return false;
  if(tag==="_310_SQS_2561"&&sqsPulseActive)return false;
  if(tag==="_310_SQS_2561"&&value===true)sqsPulseActive=true;
  const owner=session;
  queueSize++;
  writing=writing.catch(()=>{}).then(async()=>{
    if(!live||owner!==session)return;
    const write=async v=>{
      const result=await owner.write({nodeId:config.write[tag],
        attributeId:AttributeIds.Value,
        value:{value:writeValueForTag(tag,v,DataType)}});
      if(!String(result).startsWith("Good"))
        throw Error("Escritura HIL "+tag+": "+result);
    };
    if(tag==="_310_SQS_2561"&&value===true)
      await writeSqsPulse100(()=>write(true),()=>write(false));
    else await write(value);
  }).catch(err=>{
    console.error("Error escribiendo físico:",err.message);
    report({type:"error",message:err.message});
  }).finally(()=>{
    queueSize--;
    if(tag==="_310_SQS_2561"&&value===true)sqsPulseActive=false;
  });
  return true;
}
const physicalTimer=setInterval(()=>{
  const now=Date.now();
  const dt=Math.min(200,Math.max(0,now-lastHilTick));
  lastHilTick=now;
  // Never simulate using missing/stale PLC outputs or when write is disabled.
  if(!hil.enabled||!canWrite()||now-lastReadAt>1800)return;
  const before=hil;
  hil=stepHilPhysical(hil,{
    pumpSolenoid:lastOutputs._310_SV_2560===true,
    lubricantSolenoid:lastOutputs._310_SV_2561===true,
    atomizationSolenoid:lastOutputs._310_SV_2563===true,
  },dt);
  if(hil.totalPulses>before.totalPulses){
    for(let i=before.totalPulses;i<hil.totalPulses;i++)
      enqueueHilWrite("_310_SQS_2561",true);
  }
  if(now-lastSensorWriteAt>=100){
    lastSensorWriteAt=now;
    const sensors=sensorsFromHil(hil);
    for(const tag of ["_310_PI_2561","_310_PI_2560","_310_LSL"]){
      if(sensors[tag]!==lastSentSensors[tag]&&enqueueHilWrite(tag,sensors[tag]))
        lastSentSensors[tag]=sensors[tag];
    }
  }
},50);

server.on("connection",(ws)=>{
  clients.add(ws);
  ws.send(JSON.stringify(status(detail,live)));
  ws.send(JSON.stringify({type:"physical",physical:hil,ts:Date.now()}));
  ws.on("message",(raw)=>{
    let m;
    try{m=JSON.parse(String(raw));}catch{
      ws.send(JSON.stringify({type:"error",message:"JSON inválido"}));return;
    }
    if(!m||m.type!=="input"||typeof m.tag!=="string"){
      ws.send(JSON.stringify({type:"error",message:"Mensaje no permitido"}));return;
    }
    let value;
    try{value=normaliseInput(m.tag,m.value,config.write);}
    catch(err){ws.send(JSON.stringify({type:"error",message:err.message}));return;}
    if(!config.allowWrites||!live||!session){
      ws.send(JSON.stringify({type:"error",message:"Escritura bloqueada o OPC UA desconectado"}));return;
    }
    if(queueSize>=100){
      ws.send(JSON.stringify({type:"error",message:"Cola OPC UA saturada"}));return;
    }
    const isSqs=m.tag==="_310_SQS_2561";
    // One rising edge schedules HIGH -> 100 ms -> LOW in the gateway.
    // Browser LOW updates cannot shorten the pulse; repeated HIGH is ignored.
    if(isSqs&&sqsPulseActive)return;
    if(isSqs&&value===true)sqsPulseActive=true;
    queueSize++;
    const sessionForWrite=session;
    writing=writing.catch(()=>{}).then(async()=>{
      if(!live||session!==sessionForWrite||
        ws.readyState!==WebSocket.OPEN)return;
      const write=async(nextValue)=>{
        const result=await sessionForWrite.write({
          nodeId:config.write[m.tag],attributeId:AttributeIds.Value,
          value:{value:writeValueForTag(m.tag,nextValue,DataType)},
        });
        if(!String(result).startsWith("Good"))
          throw Error("OPC UA escritura rechazada: "+result);
      };
      if(isSqs&&value===true){
        // Pulse timing is anchored to a successful OPC UA HIGH write,
        // independently from Vite/browser rendering or 50ms physics ticks.
        await writeSqsPulse100(()=>write(true),()=>write(false));
      }else{
        await write(value);
      }
    }).catch(err=>{
      if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({
        type:"error",message:"Error escribiendo "+m.tag+": "+err.message,
      }));
    }).finally(()=>{
      queueSize--;
      if(isSqs&&value===true)sqsPulseActive=false;
    });
  });
  ws.on("close",()=>clients.delete(ws));
  ws.on("error",()=>clients.delete(ws));
});
server.on("listening",()=>console.log(
  "DesignerSimulator OPC UA Bridge en ws://"+config.listenHost+":"+config.listenPort+
  " (escritura "+(config.allowWrites?"habilitada por configuración":"DESHABILITADA")+")"
));

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function disconnect(){
  live=false;session=null;
  if(client){
    const old=client;client=null;
    try{await old.disconnect();}catch{/* Already disconnected */}
  }
}
async function connect(){
  const opts={
    applicationName:"DesignerSimulator GearSpray HIL Bridge",
    securityMode:MessageSecurityMode[config.securityMode],
    securityPolicy:SecurityPolicy[config.securityPolicy],
    endpointMustExist:true,
    connectionStrategy:{initialDelay:1000,maxRetry:1,maxDelay:3000},
    requestedSessionTimeout:60000,
  };
  client=OPCUAClient.create(opts);
  await client.connect(config.endpoint);
  const username=process.env.GEAR_OPCUA_USERNAME;
  const password=process.env.GEAR_OPCUA_PASSWORD;
  session=await client.createSession(username?{
    type:1,userName:username,password:password||"",
  }:undefined);
  live=true;detail="OPC UA conectado · "+config.endpoint;
  console.log(detail);
  report(status(detail,true));
}
async function readOnePass(){
  if(!session||!live)return;
  const outputNames=Object.keys(config.read);
  const observed=Object.entries(config.observe??{}).filter(([,nodeId])=>nodeId);
  const nodes=[
    ...outputNames.map(name=>config.read[name]),
    ...observed.map(([,nodeId])=>nodeId),
  ];
  const values=await session.read(nodes.map(nodeId=>({
    nodeId,attributeId:AttributeIds.Value,
  })));
  const outputs=parseOutputs(outputNames,values.slice(0,outputNames.length));
  const diagnostics={};
  observed.forEach(([name],i)=>{
    const reading=values[outputNames.length+i];
    if(String(reading?.statusCode??"Bad").startsWith("Good")&&
      typeof reading?.value?.value===OBSERVE_TYPES[name]){
      diagnostics[name]=reading.value.value;
    }
  });
  report({type:"snapshot",outputs,diagnostics,quality:"Good",ts:Date.now()});
}
async function main(){
  while(!closed){
    try{
      await connect();
      while(!closed&&live){
        const started=Date.now();
        await readOnePass();
        await sleep(Math.max(5,config.pollMs-(Date.now()-started)));
      }
    }catch(err){
      detail="OPC UA: "+err.message;
      console.error(detail);
      live=false;report(status(detail,false));
    }finally{
      await disconnect();
    }
    if(!closed)await sleep(2500);
  }
}
async function stop(){
  if(closed)return;
  closed=true;live=false;
  report(status("Gateway detenido",false));
  await disconnect();
  for(const ws of clients)ws.close();
  server.close();
}
process.once("SIGINT",()=>{void stop();});
process.once("SIGTERM",()=>{void stop();});
void main();
