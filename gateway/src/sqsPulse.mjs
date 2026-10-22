/** Retain SQS-2561 HIGH for 100 ms after the UA write has completed.
 * The caller serializes this write pair. Browser LOW updates are ignored
 * while the one-shot is in flight, so UI jitter cannot truncate it.
 */
export const SQS_PULSE_HIGH_MS=100;
export async function writeSqsPulse100(
  writeHigh:()=>Promise<void>,
  writeLow:()=>Promise<void>,
  wait:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
):Promise<void>{
  await writeHigh();
  try{
    await wait(SQS_PULSE_HIGH_MS);
  }finally{
    await writeLow();
  }
}
