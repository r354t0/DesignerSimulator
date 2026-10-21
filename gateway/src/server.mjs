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
import {parseConfig,writeValueForTag,parseOutputs,normaliseInput}
  from "./validation.mjs";

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

server.on("connection",(ws)=>{
  clients.add(ws);
  ws.send(JSON.stringify(status(detail,live)));
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
    queueSize++;
    const sessionForWrite=session;
    writing=writing.catch(()=>{}).then(async()=>{
      if(!live||session!==sessionForWrite||
        ws.readyState!==WebSocket.OPEN)return;
      const result=await sessionForWrite.write({
        nodeId:config.write[m.tag],attributeId:AttributeIds.Value,
        value:{value:writeValueForTag(m.tag,value,DataType)},
      });
      if(!String(result).startsWith("Good"))
        throw Error("OPC UA escritura rechazada: "+result);
    }).catch(err=>{
      if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({
        type:"error",message:"Error escribiendo "+m.tag+": "+err.message,
      }));
    }).finally(()=>{queueSize--;});
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
  const values=await session.read(outputNames.map(name=>({
    nodeId:config.read[name],attributeId:AttributeIds.Value,
  })));
  const outputs=parseOutputs(outputNames,values);
  report({type:"snapshot",outputs,quality:"Good",ts:Date.now()});
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
