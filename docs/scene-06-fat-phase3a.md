# FAT Fase 3A — migración inicial de P01 Mapping y P02 Mode Manager

## Alcance
Validar la primera plantilla Ladder CCW de Gear Spray, cargada con **Cargar P01 + P02 (Fase 3A)**. Esta plantilla es independiente de los tres rungs de prueba de la Etapa B y no controla todavía de forma automática las electroválvulas. La secuencia P03, el control de presión de bomba P04 y las alarmas P05–P07 siguen pendientes.

## Preparación
1. Seleccionar escena 06, poner PLC en STOP.
2. Si queda cargada la plantilla FAT, usar **Restaurar programa anterior** primero.
3. Hacer clic en **Cargar P01 + P02 (Fase 3A)** y confirmar. Revisar en MainRoutine los rungs P01 y P02; utilizar Build. La carga realiza una copia del programa previo en esta sesión.
4. Desactivar **Simulación física automática** para inyectar manualmente ambas presiones. Dejar el molino inicialmente DETENIDO, entradas SQS/LSL a FALSE y PLC en RUN.

## Casos
| ID | Paso | Resultado esperado |
|---|---|---|
| 3A01 | Poner presión de aire en 40 y luego en 45 | `AirPress_In` FALSE a 40; TRUE a 45. `AirPressure_In_Scaled` copia la medición. |
| 3A02 | Poner presión de lubricante en 1501 y luego 900 | `LubePress_Hi` TRUE por encima de 1500 y FALSE a 900 (usar campo numérico, no slider). |
| 3A03 | Activar y desactivar `_310_SQS_2561` | Los tags `PDB` y `DI_PDB` siguen el sensor físico. No aparece ningún alias temporal. |
| 3A04 | Pulsar AUTO con molino detenido, luego activar señal Molino RUN | `ST_Auto_Mode` retenido; `ST_Run_Rly` pasa a TRUE al tener confirmación del molino. Piloto «Lubricación en marcha» ON. |
| 3A05 | Con modo AUTO y molino en marcha, poner lubricante a 200 y luego 600 | `LubePress_Lo` TRUE debajo de 400 y FALSE por encima, condicionado a `Run_Rly`. |
| 3A06 | Cargar nuevamente la plantilla desde STOP y seleccionar MANUAL sin marcha de molino | `ST_Man_Mode` y `ST_Run_Rly` TRUE. Activar señal de molino: `ST_Man_Mode` pasa a FALSE. |
| 3A07 | En STOP recargar plantilla, activar señal Molino RUN y pulsar MANT | `ST_Maint_Mode` TRUE y `ST_Run_Rly` TRUE. Bombas, electroválvulas y sirena permanecen OFF. |
| 3A08 | En STOP restaurar programa anterior | Regresa la versión anterior de MainRoutine y Controller Tags; P01/P02 dejan de estar cargadas. |

## Criterios
- Usar **Controller Tags** para validar los estados internos; la pantalla SCADA conserva instrumentación, mandos y pilotos básicos.
- El proyecto no recrea las unidades ni los parámetros exactos de escalamiento del variador/instrumentos: usar las presiones ya escaladas del modelo.
- La entrada física `_310_SQS_2561` se vincula con `DI_PDB`, acorde a la aclaración del autor. No utilizar `DI_PDB_2`.
- La correspondencia entre `Run_Rly` y `ST_Run_Rly` es una decisión explícita pendiente de corroborar en FAT.
- La plantilla conserva cada ecuación de P02 en **un solo rung**, incluidos sus enclavamientos y contactos OR. No se crean rungs auxiliares para las solicitudes AUTO/MANUAL/MANT; el rung `ST_Run_Rly` utiliza tres vías OR que representan la expresión booleana del CCW.
- **No** considerar aprobadas las alarmas, máquina de estados, control de bomba, dosificación ni enclavamientos de seguridad de P03–P07.
- El respaldo de la programación anterior vive solo en memoria. Evitar recargar el navegador antes de restaurar.
