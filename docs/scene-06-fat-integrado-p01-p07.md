# Escena 06 — FAT integrado P01–P07

## Alcance

Plantilla Ladder unificada en DesignerSimulator para pruebas virtuales del Gear Spray del molino de bolas. No equivale a un PLC de seguridad validado y requiere cotejo SAT/CCW antes de utilizar los resultados en planta.

## Preparación

1. Escena 06, PLC STOP. Si está cargada una plantilla anterior, restaurarla antes de continuar.
2. Abrir «Instrumentación y setpoints» → «Cargar P01–P07 (FAT integrado)». Confirmar respaldo temporal y ejecutar Build.
3. Revisar los comentarios P01 a P07. En P01, LubePress_Lo permanece en el quinto rung. Se eliminaron el rung 8 de P01 y la conversión inicial de P03.
4. Consignas de ejemplo al cargar: frecuencia 60000 ms, pulsos por ciclo 5, alarma de flujo bajo 10000 ms, mantenimiento 30 min. Son valores solo para FAT, no para campo.
5. Física automática: aire 100, tambor 100 %, pérdida de presión 1×, ninguna falla seleccionada.
6. Utilizar modo MANUAL con molino detenido para ensayos iniciales, y AUTO con señal externa Mill Run para ensayos de ciclo.
7. Durante todas las pruebas observar SCADA, Controller Tags y Ladder simultáneamente. No recargar navegador antes de guardar/restaurar el respaldo.

## Matriz de verificación FAT conjunta

| ID | Verificación | Resultado esperado |
|---|---|---|
| F01 | Build P01–P07 y revisión del orden | Carga íntegra sin errores; rungs de cada sección identificados |
| F02 | MANUAL, molino detenido, PLC RUN | Habilitación de marcha y transición de P03 0 → 10 → 20 |
| F03 | Presión lubricante inferior a 800 | P04 activa ST_Pump_Sol_Rly, DO_Pump_Sol y la válvula física de aire de bomba |
| F04 | Presión lubricante 900 y después superior a 1000 | P04 mantiene bomba en banda de histéresis y desactiva sobre umbral alto |
| F05 | Activar dosificación hasta completar 5 pulsos | DI_PDB alimenta CTN_Lubeflo.ACC y CTN_Lubeflo.DN; ciclo pasa a purga |
| F06 | Esperar purga 30 s | TMR_Purge.DN desactiva al vencer; el rung 11 de P03 ejecuta RES CTN_Lubeflo |
| F07 | Pérdida de aire con aire de atomización solicitado | P05 activa falla por aire tras 5 s, trip y Fault_Code=1 |
| F08 | Sin pulsos con bomba y aire normales | P05 TMR_LoFlo.DN activa alarma por flujo bajo según TMR_LubeFlo_SP, Fault_Code=2 |
| F09 | Presión lubricante inferior a 400 con aire y flujo normales | Tras 10 s, alarma por presión baja y Fault_Code=3 |
| F10 | Presión alta deliberada | P05 mantiene deshabilitada la alarma de presión alta mediante AFI original equivalente a EQU 0,1 |
| F11 | Simular nivel bajo, liberar sensor y RESET | P05 responde con enclavamientos ST_Level_Rly, ST_Level_Latch, ST_Level_Fail |
| F12 | Alarma audible y acuse | P05 gobierna DO_Alarm_Out y ST_Siren_Accept; Fault_Code se actualiza |
| F13 | Activar mantenimiento con molino en marcha | P06 contabiliza entrada a mantenimiento y calcula duración en ms |
| F14 | Ensayar reloj de minuto, horas y cuenta atrás | TMR_OneMinCnt, CNT_Hour24 y CTN_MaintMode operan con RES; CNT_Shutdown carga 20 mediante LOAD y decrece |
| F15 | Visualizar P07 en Controller Tags | NextCycle_Show, FloAlrm_Remain, Maint_Duration_Remain_Min, Shutdown_Time_Remaining y Fault_Code coherentes |
| F16 | PAUSE / SCAN / RUN / STOP, cambio de escena | Se congela el proceso en PAUSE, STOP desenergiza salidas y no aparece rearme accidental |

## Correspondencia y adaptaciones documentadas

- P04: cuatro rungs originales. Referencia de presión tomada del escalamiento existente de P01, con comparaciones 800/1000 y enclavamiento en un único rung.
- P05: condiciones de aire, flujo, presión, nivel, alarma sonora, acuse y prioridades. Se elimina la conversión ANY_TO_TIME redundante del setpoint de flujo; se usa directamente TMR_LubeFlo_SP (ms). El AFI original se representa mediante comparación siempre falsa EQU(0,1), por lo tanto la alarma de presión alta continúa deshabilitada.
- P06: doce rungs originales más cálculo auxiliar de duración en ms. CTU se reinicia mediante RES; CTD utiliza LOAD como en CCW (no RES), carga PRE=20 y marca DN al llegar a cero.
- P07: catorce expresiones fuente; se omiten las conversiones auxiliares redundantes de ET/CV a DINT/REAL y se usan directamente TIMER.ACC / COUNTER.ACC. Los cálculos SUB y DIV de duración permanecen juntos en el mismo rung.
- P03 y P01 conservan todas las correcciones previamente aprobadas: DI_PDB operativo, sin ONS de ensayo, TON preset TMR_Freq_SP, uso de miembros .DN y RES CTN_Lubeflo.
- Las variables no representadas en el SCADA continúan disponibles en Controller Tags. Las escalas y presets de campo deberán compararse con el proyecto final de CCW.

## Evidencia

Las pruebas automatizadas se encuentran en web/tests/gear-spray-complete-p04-p07.test.mjs, además de las suites P01–P03. Estas verificaciones no sustituyen una revisión visual de rungs, simulación, temporizadores y transiciones en el navegador.

Registrar una única respuesta consolidada por F01–F16 con capturas de cualquier discrepancia. No se avanzará a otra fase hasta corregir los hallazgos en conjunto.
