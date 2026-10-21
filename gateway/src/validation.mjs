/** Pure validation used by the OPC UA gateway; runnable without a PLC. */
export const OUTPUT_TAGS=[
  "_310_SV_2560","_310_SV_2561","_310_SV_2563",
  "_310_UY_2560","_310_YI_SystemHealthy",
  "_310_YI_LubricationSystemRunning",
];
export const ANALOG_TAGS=["_310_PI_2561","_310_PI_2560"];
export const INPUT_BOOL_TAGS=[
  "_310_PLC104_YI_MillRun","_310_SQS_2561","_310_LSL",
  "PB_Auto","PB_Manual","PB_Maint","PB_Extra","PB_Reset",
  "PB_Lubpress_Release",
];
export const INPUT_INT_TAGS=[
  "TMR_Freq_SP","CNT_LubeFlo_SP","TMR_LubeFlo_SP","Maint_Duration_Min",
];
export const INPUT_TAGS=[...ANALOG_TAGS,...INPUT_BOOL_TAGS,...INPUT_INT_TAGS];
const assert= (condition,message)=>{
  if(!condition)throw new Error(message);
};
export function parseConfig(raw){
  assert(raw&&typeof raw==="object","Debe ser un objeto JSON");
  assert(typeof raw.endpoint==="string"&&raw.endpoint.startsWith("opc.tcp://"),
    "Endpoint debe iniciar opc.tcp://");
  assert(["SignAndEncrypt","Sign"].includes(raw.securityMode),
    "securityMode no seguro (usar SignAndEncrypt)");
  assert(["Basic256Sha256","Aes128_Sha256_RsaOaep",
    "Aes256_Sha256_RsaPss"].includes(raw.securityPolicy),
    "securityPolicy no compatible con el perfil seguro");
  assert(Number.isInteger(raw.pollMs)&&raw.pollMs>=50&&raw.pollMs<=1000,
    "pollMs debe ser 50–1000");
  assert(raw.listenHost==="127.0.0.1"||raw.listenHost==="::1",
    "El WebSocket solo puede escuchar en loopback");
  assert(Number.isInteger(raw.listenPort)&&raw.listenPort>=1024&&raw.listenPort<=65535,
    "Puerto WebSocket inválido");
  assert(Array.isArray(raw.allowedOrigins)&&raw.allowedOrigins.length>0&&
    raw.allowedOrigins.every(x=>typeof x==="string"&&
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(x)),
    "Los orígenes permitidos deben ser locales");
  assert(raw.allowWrites===true||raw.allowWrites===false,
    "allowWrites debe ser BOOL");
  assert(raw.read&&typeof raw.read==="object"&&
    OUTPUT_TAGS.every(name=>validNodeId(raw.read[name])),
    "Configura los 6 NodeIds de salida reales en read");
  assert(raw.write&&typeof raw.write==="object",
    "Falta el mapa write");
  for(const key of Object.keys(raw.write))
    assert(INPUT_TAGS.includes(key),"Escritura OPC UA no permitida: "+key);
  if(raw.allowWrites)
    assert(INPUT_TAGS.every(name=>validNodeId(raw.write[name])),
      "Antes de habilitar escrituras configura los 15 NodeIds de entrada reales");
  return raw;
}
export const validNodeId=(v)=>typeof v==="string"&&
  /^(ns=\d+;[isgb]=|nsu=)/.test(v);
export function normaliseInput(tag,value,map){
  assert(INPUT_TAGS.includes(tag)&&validNodeId(map[tag]),
    "Tag no autorizado/no mapeado: "+tag);
  if(INPUT_BOOL_TAGS.includes(tag)){
    assert(typeof value==="boolean","Se requiere BOOL");
  }else{
    assert(typeof value==="number"&&Number.isFinite(value)&&
      value>=0,"Se requiere número positivo finito");
    if(INPUT_INT_TAGS.includes(tag))assert(Number.isInteger(value)&&
      value<=2147483647,"DINT fuera de rango");
    else assert(value<=1e9,"REAL fuera de rango");
  }
  return value;
}
export function writeValueForTag(tag,value,DataType){
  return {dataType:INPUT_BOOL_TAGS.includes(tag)?DataType.Boolean:
    INPUT_INT_TAGS.includes(tag)?DataType.Int32:DataType.Float,
    value};
}
export function parseOutputs(names,dataValues){
  assert(Array.isArray(dataValues)&&dataValues.length===names.length,
    "Respuesta OPC UA incompleta");
  const outputs={};
  names.forEach((name,i)=>{
    const data=dataValues[i];
    const quality=String(data?.statusCode??"Bad");
    assert(quality.startsWith("Good"),"Calidad no buena en "+name+": "+quality);
    assert(typeof data?.value?.value==="boolean",
      "El valor OPC UA de "+name+" no es BOOL");
    outputs[name]=data.value.value;
  });
  return outputs;
}
