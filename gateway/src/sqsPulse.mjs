/** Guarantee a HIGH -> 100 ms -> LOW write sequence for SQS-2561.
 * Calling gateway serializes each pair. The PLC sees a nominal 100 ms pulse;
 * UA transport scheduling can introduce additional physical timing jitter.
 * @param {() => Promise<void>} writeHigh
 * @param {() => Promise<void>} writeLow
 * @param {(ms:number) => Promise<void>} wait
 */
export const SQS_PULSE_HIGH_MS=100;
export async function writeSqsPulse100(
  writeHigh,writeLow,
  wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
){
  await writeHigh();
  try{
    await wait(SQS_PULSE_HIGH_MS);
  }finally{
    await writeLow();
  }
}
