import {
  createRung, createTag, insertInstruction, setTagValue,
  type PracticeProject,
} from "./practiceDocument.ts";
import {initialGearSprayProject} from "./gearSpraySceneModel.ts";

/** Dedicated temporary output exercises for Phase 2 FAT.
 * These three independent rungs do NOT implement P01-P07 or machine states.
 * Only this optional template adds the FAT_* command tags.
 */
export const GEAR_FAT_COMMANDS=[
  {name:"FAT_CMD_Pump",description:"FAT: energizar aire de bomba",output:"_310_SV_2560"},
  {name:"FAT_CMD_Lubricant",description:"FAT: abrir válvula de lubricante",output:"_310_SV_2561"},
  {name:"FAT_CMD_Atomization",description:"FAT: abrir aire de atomización",output:"_310_SV_2563"},
] as const;
export type GearFatCommand=typeof GEAR_FAT_COMMANDS[number]["name"];

export function createGearFatProject():PracticeProject {
  let p=initialGearSprayProject();
  for(const cmd of GEAR_FAT_COMMANDS)
    p=createTag(p,cmd.name,cmd.description,"BOOL");
  for(let i=0;i<GEAR_FAT_COMMANDS.length;i++){
    const cmd=GEAR_FAT_COMMANDS[i];
    const rungId=i===0?"rung-1":"gear-fat-"+i;
    if(i>0)p=createRung(p,rungId);
    p=insertInstruction(p,rungId,0,{
      id:"gear-fat-contact-"+i,kind:"XIC",tag:cmd.name,
    });
    p=insertInstruction(p,rungId,1,{
      id:"gear-fat-coil-"+i,kind:"OTE",tag:cmd.output,
    });
  }
  return p;
}

/** Disarm only temporary FAT inputs, never ordinary project I/O.
 * Outputs are switched OFF separately by stopPracticeScans.
 * Prevents unintended motor / solenoid restart after STOP and scene change.
 */
export function clearGearFatCommands(project:PracticeProject):PracticeProject {
  let result=project;
  for(const command of GEAR_FAT_COMMANDS){
    const tag=result.tags.find(t=>t.name===command.name);
    if(tag?.type==="BOOL"&&tag.value===true)
      result=setTagValue(result,command.name,false);
  }
  return result;
}

export function isGearFatCommand(value:string):value is GearFatCommand {
  return GEAR_FAT_COMMANDS.some(command=>command.name===value);
}
