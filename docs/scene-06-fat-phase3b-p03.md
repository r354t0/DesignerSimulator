# Escena 06 · FAT Fase 3B — P03 Cycle Manager

## Alcance
Comprobar en DesignerSimulator los **10 rungs restantes de P03_Cycle_Manager** (versión CCW que contiene `FB_GearSpray_Sequence`) cargados como Ladder del motor existente. La máquina de estados del rung 5 se ejecuta en cada scan. **P04, P05, P06 y P07 todavía no están portados:** la prueba no acredita la filosofía completa del molino.

## Preparación
1. Selecciona la escena 06 (Gear Spray), PLC en **STOP**.
2. Si está activo el banco FAT de la fase 2, **restaura el programa anterior** antes de cargar P03.
3. En «Instrumentación y setpoints», pulsa **Cargar P01 + P02 + P03 (Fase 3B)** y confirma. El editor conserva temporalmente el programa previo para restaurarlo en STOP.
4. En el editor Ladder, confirma que **P01 – rung 5 `LubePress_Lo`** sigue inmediatamente después de `LubePress_Hi`. Después de P02, localiza los **10 rungs P03** (originales 2–11, sin el MOV inicial), incluido el `FB_GearSpray_Sequence` del rung 5. Ejecuta **Build**.
5. Desactiva por ahora **Simulación física automática**. Usa la prueba manual de sensores para aislar la lógica P03 de la física. Ajusta `TMR_Freq_SP=60000` (milisegundos de ensayo) y `CNT_LubeFlo_SP=2`. Mantén el molino detenido y las fallas desactivadas.
6. `DO_LS_Healthy` inicia **TRUE de forma provisional** hasta que se porte P05. No indica seguridad real ni funcionamiento completo del sistema.

## Pruebas

| ID | Acción | Resultado esperado |
|---|---|---|
| 3B01 | Verificar estructura P03 y ejecutar Build | 10 rungs de P03: eliminado el original R1; TON de frecuencia con PRE `TMR_Freq_SP`, TON de arranque y TOF de purga; CTU en R4 y `RES CTN_Lubeflo` en R11; UDFB visible en R5 |
| 3B02 | Poner RUN y seleccionar MANUAL con molino detenido | `ST_Run_Rly` TRUE; estado `SM_Cycle_State` pasa de 0 a 10 y después a 20 por solicitud del primer ciclo |
| 3B03 | En estado 20, activar/desactivar dos veces `_310_SQS_2561` | `DI_PDB` sigue los pulsos; `CTN_Lubeflo.ACC` llega a 2; `CTN_Lubeflo.DN` TRUE |
| 3B04 | Verificar transición al alcanzar el preset | Estado 20 → 30; `ST_Cycle_Rly` FALSE; `TMR_Purge.DN` permanece TRUE mientras dure la purga |
| 3B05 | Esperar los 30 segundos simulados con frecuencia de 60 s | `TMR_Purge.DN` pasa a FALSE y estado 30 → 10; el rung 11 ejecuta `RES CTN_Lubeflo` (ACC vuelve a cero) |
| 3B06 | Observar las salidas P03 | `DO_Lubecon_Sol` se activa durante el ciclo; `ST_Pump_Rly` solicita bombeo. La válvula neumática física de bomba no se energiza todavía porque depende de P04 |
| 3B07 | Inyectar `ST_General_Trip_Rly=TRUE` desde Tags | Estado 90 bloqueado; `SM_Cycle_Blocked` TRUE y ciclo OFF. Retirar trip y pulsar RESET: se libera el bloqueo con retención de recuperación |
| 3B08 | Activar PAUSE durante RUN y luego STOP | PAUSE congela scans/temporización; STOP apaga `ST_Cycle_Rly`, Q de TON/TOF y salidas OTE |
| 3B09 | PLC STOP y restaurar programa anterior | Regresa el proyecto previo sin alterar los rungs guardados fuera de la sesión FAT |

## Rungs retirados y limpieza
- Se eliminó el **rung 8 del editor** (numeración desde 0) perteneciente a P01: `PDB_RisingTrig` / `P01_PDB_EdgeMemory`. Sigue intacto el mapeo físico `_310_SQS_2561 → PDB → DI_PDB`.
- Se eliminó el **rung 24 del editor original** (primer P03, `gear-p03-r01`). Los rungs restantes de P03 conservan su identidad R2–R11.
- Tags retirados de la plantilla: `PDB_RisingTrig`, `P01_PDB_EdgeMemory`, `TMR_Freq_SP_Time`, `TMR_Freq_Dn`, `TMR_Startup_Cycle_Dn`, `CNT_Lubeflo_Dn`, `CNT_Lubeflo_Rst`, `TMR_Purge_Dn`.

## Diferencias conocidas y criterios
- Se **eliminó el primer rung de P03** (`ANY_TO_TIME`/`MOV`), como se solicitó. El TON original de P03 R2 usa directamente `TMR_Freq_SP` como PRE, en milisegundos.
- Se referencian exclusivamente miembros nativos de TIMER y COUNTER, por ejemplo `TMR_Freq.DN`, `TMR_Startup_Cycle.DN`, `CTN_Lubeflo.DN`, `TMR_Purge.DN`. Los BOOL DONE individuales y el BOOL de reset fueron retirados. El reset usa la instrucción **RES** del rung 11.
- Rung 6 permite liberación de presión mediante `PB_Lubpress_Release` fuera de la rama `ST_Run_Rly AND ST_Cycle_Rly`, exactamente como está representado en el CCW. Solo realizar las pruebas en simulación.
- `DO_LS_Healthy` es provisionalmente TRUE y `ST_General_Trip_Rly` se puede modificar manualmente para FAT; **P05 no está portado**. No declarar seguridad funcional.
- El mapeo del solenoide de lubricante en P01 lee `DO_Lubecon_Sol` de P03 y puede actualizarse al siguiente scan por el orden de rungs; la salida real de bomba espera P04.
- Para probar estados, usar Controller Tags y el diagnóstico del SCADA que muestra `SM_Cycle_State` y acumulado `CTN_Lubeflo`.
- La aprobación automatizada de tests, Build y Lint no reemplaza el FAT visual en navegador. Reportar resultado por caso, capturas y condiciones observadas.
- La copia de programa previo existe solamente en memoria; **no recargar la página antes de restaurarla o guardar**.
