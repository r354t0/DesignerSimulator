import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  OUTPUT_TAGS,INPUT_TAGS,parseConfig,normaliseInput,
  writeValueForTag,parseOutputs,
} from "../src/validation.mjs";
const base=JSON.parse(readFileSync(new URL("../config.example.json",import.meta.url),"utf8"));
const node=(tag)=>"ns=2;s=HIL."+tag;
const config=()=>({
  ...base,endpoint:"opc.tcp://192.168.1.10:4990",
  read:Object.fromEntries(OUTPUT_TAGS.map(x=>[x,node(x)])),
  write:Object.fromEntries(INPUT_TAGS.map(x=>[x,node(x)])),
});
test("Fails closed for unset OPC UA NodeIds and insecure gateway settings",()=>{
  assert.throws(()=>parseConfig(base),/NodeIds/);
  const good=config();
  assert.doesNotThrow(()=>parseConfig(good));
  for(const entry of [
    {...good,listenHost:"0.0.0.0"},
    {...good,securityMode:"None"},
    {...good,securityPolicy:"None"},
    {...good,pollMs:10},
    {...good,allowedOrigins:["https://malicious.example"]},
  ])assert.throws(()=>parseConfig(entry));
});
test("Explicit write arming checks all mapped inputs",()=>{
  const c=config();
  c.allowWrites=true;
  assert.doesNotThrow(()=>parseConfig(c));
  c.write.PB_Reset="";
  assert.throws(()=>parseConfig(c),/NodeIds/);
});
test("Whitelist rejects arbitrary writes and wrong types",()=>{
  const m=config().write;
  assert.equal(normaliseInput("PB_Auto",true,m),true);
  assert.equal(normaliseInput("_310_PI_2560",123.45,m),123.45);
  assert.equal(normaliseInput("TMR_Freq_SP",60000,m),60000);
  assert.throws(()=>normaliseInput("ST_Run_Rly",true,m),/no autorizado/);
  assert.throws(()=>normaliseInput("_310_SV_2560",true,m),/no autorizado/);
  assert.throws(()=>normaliseInput("PB_Auto",1,m),/BOOL/);
  assert.throws(()=>normaliseInput("TMR_Freq_SP",1.5,m),/DINT/);
  assert.throws(()=>normaliseInput("_310_PI_2560",Infinity,m));
});
test("Float/Int32/Bool write Variant types preserve CCW tags",()=>{
  const DataType={Boolean:1,Float:2,Int32:3};
  assert.deepEqual(writeValueForTag("PB_Reset",true,DataType),{dataType:1,value:true});
  assert.deepEqual(writeValueForTag("_310_PI_2560",150.2,DataType),
    {dataType:2,value:150.2});
  assert.deepEqual(writeValueForTag("TMR_Freq_SP",60000,DataType),
    {dataType:3,value:60000});
});
test("Reads must have complete Good-quality BOOL values",()=>{
  const names=OUTPUT_TAGS;
  const values=names.map(()=>({statusCode:"Good",value:{value:false}}));
  assert.equal(Object.keys(parseOutputs(names,values)).length,6);
  values[2].statusCode="BadNotConnected";
  assert.throws(()=>parseOutputs(names,values),/Calidad no buena/);
  values[2].statusCode="Good";values[2].value.value=1;
  assert.throws(()=>parseOutputs(names,values),/BOOL/);
});
