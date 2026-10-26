import {
  GEAR_OPC_DEFAULT_SOCKET, validGearOpcInput,validGearPhysicalTelemetry,
  validGearOpcOutputSnapshot, initialGearOpcStatus,
  type GearOpcSnapshot,type GearOpcStatus,
} from "./gearOpcUaBridge.ts";
import type {GearPhysicalState} from "./gearSprayPhysics.ts";

/** Browser-side bridge: never opens OPC UA TCP. The only peer is a local,
 * origin-restricted WebSocket gateway. No writes when offline/read-only.
 */
export class GearOpcUaClient {
  private socket:WebSocket|null=null;
  private watchdog:number|undefined;
  private status:GearOpcStatus=initialGearOpcStatus();
  private lastSnapshotTs=0;
  private onStatus:(status:GearOpcStatus)=>void;
  private onSnapshot:(message:GearOpcSnapshot)=>void;
  private onPhysical:(physical:GearPhysicalState)=>void;

  constructor(
    onStatus:(status:GearOpcStatus)=>void,
    onSnapshot:(message:GearOpcSnapshot)=>void,
    onPhysical:(physical:GearPhysicalState)=>void=()=>{},
  ){
    this.onStatus=onStatus;this.onSnapshot=onSnapshot;
    this.onPhysical=onPhysical;
  }
  private update(patch:Partial<GearOpcStatus>){
    this.status={...this.status,...patch};
    this.onStatus(this.status);
  }
  connect(url=GEAR_OPC_DEFAULT_SOCKET){
    this.disconnect();
    let target:URL;
    try{
      target=new URL(url);
      if(!["ws:","wss:"].includes(target.protocol))throw Error("Protocolo no permitido");
      if(target.protocol==="ws:"&&!["127.0.0.1","localhost","::1","[::1]"].includes(target.hostname))
        throw Error("Para una IP remota configura wss:// con TLS");
    }catch(error){
      this.update({connected:false,writable:false,detail:String(error)});
      return;
    }
    this.update({connected:false,writable:false,detail:"Conectando al gateway local…"});
    const ws=new WebSocket(target.href);
    this.socket=ws;
    ws.onmessage=(event)=>{
      if(this.socket!==ws)return;
      let message:unknown;
      try{message=JSON.parse(String(event.data));}catch{return;}
      if(!message||typeof message!=="object")return;
      const value=message as Record<string,unknown>;
      if(value.type==="status"){
        this.update({
          connected:value.connected===true,
          writable:value.connected===true&&value.writable===true,
          detail:typeof value.detail==="string"?value.detail:"Estado OPC UA",
          mappedInputs:typeof value.mappedInputs==="number"?value.mappedInputs:0,
          mappedOutputs:typeof value.mappedOutputs==="number"?value.mappedOutputs:0,
        });
      }else if(validGearOpcOutputSnapshot(message)){
        this.lastSnapshotTs=Date.now();
        this.update({lastUpdate:this.lastSnapshotTs,connected:true,
          observedTags:Object.keys(message.diagnostics??{})});
        this.onSnapshot(message);
        if(message.physical)this.onPhysical(message.physical);
      }else if(value.type==="physical"&&validGearPhysicalTelemetry(value.physical)){
        this.onPhysical(value.physical);
      }else if(value.type==="error"){
        this.update({detail:typeof value.message==="string"?value.message:"Error OPC UA"});
      }
    };
    ws.onerror=()=>{
      if(this.socket===ws)this.update({connected:false,writable:false,detail:"Error WebSocket"});
    };
    ws.onclose=()=>{
      if(this.socket===ws){
        this.update({connected:false,writable:false,detail:"Gateway desconectado"});
        this.socket=null;
      }
    };
    this.watchdog=window.setInterval(()=>{
      if(this.socket!==ws)return;
      if(this.lastSnapshotTs&&Date.now()-this.lastSnapshotTs>1800){
        this.update({connected:false,writable:false,detail:"Datos OPC UA vencidos (>1,8 s)"});
      }
    },250);
  }
  sendInput(tag:string,value:boolean|number):boolean{
    if(!validGearOpcInput(tag,value)||!this.status.connected||
      !this.status.writable||!this.socket||
      this.socket.readyState!==WebSocket.OPEN)return false;
    this.socket.send(JSON.stringify({type:"input",tag,value}));
    return true;
  }
  sendPhysicalConfig(patch:Partial<Pick<GearPhysicalState,
    "enabled"|"airSupply"|"drumPercent"|"pressureDecayFactor"|
    "airLoss"|"filterBlocked"|"doserBlocked">>):boolean{
    if(!this.status.connected||!this.status.writable||!this.socket||
       this.socket.readyState!==WebSocket.OPEN)return false;
    this.socket.send(JSON.stringify({type:"physical-config",patch}));
    return true;
  }
  sendPhysicalReset():boolean{
    if(!this.status.connected||!this.status.writable||!this.socket||
       this.socket.readyState!==WebSocket.OPEN)return false;
    this.socket.send(JSON.stringify({type:"physical-reset"}));
    return true;
  }
  disconnect(){
    if(this.watchdog!==undefined)window.clearInterval(this.watchdog);
    this.watchdog=undefined;this.lastSnapshotTs=0;
    if(this.socket){const socket=this.socket;this.socket=null;socket.close();}
    this.update(initialGearOpcStatus());
  }
}
