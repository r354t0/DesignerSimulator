# Escena 06 — Gear Spray / Lubricación de molino de bolas
**Estado:** Fase 1 implementada en la rama `feature/ide-workspace-v1`. SCADA y E/S conectadas al motor existente; física y lógica CCW todavía pendientes.  
**Origen:** `PLC_107_Molino_Bolas_SM.rar`; rutinas P01–P07, `FB_GearSpray_Sequence`, `Maintance_Duration` y capacitación Gear Spray Cerro Corona.

## Objetivo y alcance
Usar **el motor PLC existente en DesignerSimulator** (RUN/STOP/PAUSE, scan, tags, Timer/Counter, Ladder y observabilidad) para ensayar el comportamiento del proyecto CCW Micro850 a través de un SCADA industrial. Un archivo CCW **no se ejecuta directamente** en este motor: se requiere una transcripción/compilación controlada de las rutinas y un intérprete determinista para el UDFB en Structured Text, con pruebas de equivalencia.

Mantener **separación estricta** entre:
1. **Entradas físicas simuladas**: únicamente el modelo de proceso y las acciones de operador modifican señales de campo;
2. **Programa**: las siete rutinas y el bloque de estados determinan las salidas;
3. **Vista SCADA**: anima las salidas reales calculadas por el motor y lee sus diagnósticos. No decide la secuencia por su cuenta.

## Layout y componentes
- **Vista de proceso** (izquierda, hasta 50 % del ancho al maximizar): dibujo SVG vectorial sobre fondo blanco, basado en “Esquema del proceso” de la capacitación. Dos circuitos diferenciados, **aire comprimido** y **lubricante**, además de señales eléctricas.
- Equipos: tambor, bomba neumática, filtro/aislamiento de aire, válvula de aire de bomba, regulador y manómetros, filtro de grasa, transmisor de presión, válvula de grasa, bloque dosificador, detector/proximidad, válvula de aire de atomización, colector, boquillas sobre corona/piñón del molino.
- **Tablero de mando** (derecha): modos AUTO/MANUAL/MANT, impulso extra, RESET/acuse, liberación de presión; simulación de señal de marcha del molino; campos de configuración únicamente para setpoints permitidos por el programa.
- **Pilotos LED**: agrupar **Estado del sistema**, **Entradas** y **Salidas**, conforme a las escenas 1–5.
- **Diagnóstico**: presión de aire y lubricante, pulsos de medición, cuenta/temporizadores, estado 0/10/20/30/90, alarmas y código de falla. Incluir controles de fallas simuladas (aire insuficiente, filtro o dosificador bloqueado, nivel bajo, fallos de presión) claramente etiquetados como **simulación**.
- El SCADA responde a mosaicos y conserva las reglas Maximize tabset.

## Inventario de E/S de P01_Mapping (nombres CCW originales)
| Naturaleza | Tag de proyecto CCW | Alias interno y finalidad |
|---|---|---|
| AI simulada | `_310_PI_2561` | `AI_AirPressure_Scaled`: presión de aire |
| AI simulada | `_310_PI_2560` | `AI_LubePressure_Scaled`: presión de lubricante |
| DI física | `_310_PLC104_YI_MillRun` | `DI_Mill_Run`: molino en marcha |
| DI física | `_310_SQS_2561` | `DI_PDB_2`: sensor de dosificación / proximidad |
| DI física | `_310_LSL` | `DI_Low_Level`: bajo nivel (verificar polaridad) |
| DO física | `_310_SV_2560` | `DO_Pump_Sol`: bomba neumática |
| DO física | `_310_SV_2563` | `DO_Air_Sol`: aire de atomización |
| DO física | `_310_SV_2561` | `DO_Lubecon_Sol`: solenoide de grasa |
| DO física | `_310_UY_2560` | `DO_Alarm_Out`: alarma audible |
| DO física | `_310_YI_SystemHealthy` | `DO_LS_Healthy`: healthy |
| DO física | `_310_YI_LubricationSystemRunning` | `DO_LS_Running_Output`: running |

**Pendiente de correspondencia:** P03 cuenta `DI_PDB`, pero P01 mapea la entrada física a `DI_PDB_2`. El programa original incluye **ambos** tags. No renombrarlos ni asumir equivalencia: exponer su estado y hacer que el usuario/una configuración confirmada defina la conexión. En el primer prototipo se puede ofrecer un puente **opcional y explícito** para ensayos.

## Operación HMI y setpoints
- Pulsadores existentes del proyecto: `PB_Auto`, `PB_Manual`, `PB_Maint`, `PB_Extra`, `PB_Reset`, `PB_Lubpress_Release`. Otros tags HMI del proyecto: `PB_Set`, `PB_View`, `PB_CloseMenu`: no descartarlos en la lista de tags; incorporar si se simulan las funciones de menú.
- Setpoints existentes: `TMR_Freq_SP`, `CNT_LubeFlo_SP`, `TMR_LubeFlo_SP`, `Maint_Duration_Min`. Preservar tipos y unidades en la fase de portado; las conversión `ANY_TO_TIME` y el cálculo `Maint_Duration_ms := Maint_Duration_Min * 60 * 1000` deben mantener la misma semántica de CCW.
- No crear un control de salida directa en la operación normal: la prueba física de actuadores debe indicar claramente cuando es **forzado** para FAT.

## Estructura interna y diagnósticos
**Modos y marcha:** `ST_Auto_Mode`, `ST_Man_Mode`, `ST_Maint_Mode`, `ST_Run_Rly`, `ST_Auto_Selected`.  
**Ciclo:** `ST_Cycle_Rly`, `ST_Pump_Rly`, `ST_Airsol_Rly`, `ST_Pump_Sol_Rly`, `SM_Cycle_State`, `SM_Cycle_Blocked`, `SM_Cycle_RearmHold`.  
**Flujo:** `DI_PDB`, `DI_PDB_2`, `CNT_Lubeflo_Dn`, `CNT_Lubeflo_Rst`, `CNT_LubeFlo_SP`.  
**Presiones:** `AI_AirPressure_Scaled`, `AI_LubePressure_Scaled`, `ST_AirPress_In`, `ST_LubePress_800`, `ST_LubePress_1000`, `ST_LubePress_Lo`, `ST_LubePress_Hi`.  
**Alarmas:** `ALM_AirFail_Rly`, `ALM_LoFlo_Rly`, `ALM_LoPress_Rly`, `ALM_HiPress_Rly`, `ALM_LoLevel_Rly`, `WARN_PreShutdown`, `Fault_Code`.  
**Salidas:** todas las `DO_` mapeadas, con sus señales físicas `_310_`.
**Timers:** `TMR_Freq`, `TMR_Startup_Cycle`, `TMR_Purge`, `TMR_AirFail`, `TMR_LoFlo`, `TMR_LubePress_Lo`, `TMR_LubePress_Hi`, `TMR_Maint`, `TMR_OneMinCnt`, `TMR_SecCnt`.  
**Otros contadores:** `CNT_Hour24`, `CNT_Shutdown`, y contador de mantenimiento `CTN_MaintMode`.  
**HMI:** `NextCycle_Show`, `FloAlrm_Remain`, `Maint_Duration_Remain_Min`, `CNT_Shutdown_Remaining`.

## Bloque FB_GearSpray_Sequence (ST)
- Estados explícitos: **0 INACTIVO**, **10 ESPERA**, **20 LUBRICACIÓN**, **30 PURGA**, **90 BLOQUEADO**.
- Permiso: `i_Run && (i_Healthy || i_Manual)`.
- Solicitud: `i_FreqDone || !i_StartupDone || i_ExtraPulse`.
- Prioridad: ausencia de `i_Run` → 0; trip/no permiso → bloqueo 90; desbloqueo con reset bajo condiciones habilitadas; transición 10 → 20 con solicitud de ciclo y sin `i_FlowDone`; 20 → 30 al completar flujo; 30 → 10 cuando la purga acaba; `RecoveryHold` mantiene el rearme.
- La emulación UDFB debe usar **el mismo período de scan** y actualizar las salidas `o_CycleRun`, `o_State`, `o_Blocked`, `o_RearmHold`, respetando orden de rutinas. No basta con una animación independiente.

## Umbrales explícitos de las rutinas
- P01: aire `> 40.0`, lubricante alto `> 1500.0`, bajo `< 400.0` cuando marcha.
- P04: presión de lubricante baja/alta de mando para válvula de bomba en `800.0` y `1000.0`.
- P03: inicio `TON 1 s`, purga `TOF 30 s`.
- P05: fallo aire `TON 5 s`, fallo de presión baja `TON 10 s`, alta presión `TON 300 ms` **precedido de AFI** → lógica deshabilitada en la versión recibida.
- P06: mantenimiento y cuenta de horas; precaución: el temporizador de un minuto y los contadores de shutdown deben mantener tiempos auténticos o permitir un **factor de tiempo solo en modo simulación**, visible en SCADA.
- **Unidades de AI pendientes:** el material de capacitación menciona psi/kPa/bar en contextos diferentes. No etiquetar todos los umbrales como una unidad física sin comprobar escalamiento de los bloques `FB_AI`/IO.

## Integración con el motor existente
1. Añadir `gear-spray` como escena programable independiente, con sus propios `PracticeScanState`, proyecto y snapshots; no compartir estado con escena 5.
2. Añadir inventario tipado y puente de sensores: motor recibe las presiones y pulsos generados por simulación; salidas solo proceden de la lógica.
3. Portar P01–P07 a las instrucciones que ya existen: contactos XIC/XIO, OTE/OTL/OTU, operaciones MOV/ADD/SUB/MUL/DIV, comparadores, TON/TOF/CTU/CTD y presets INT/DINT.
4. **Extensiones explícitas** para elementos no nativos: conversiones `ANY_TO_*`, `NOT`, `AFI`, contadores IEC CCW (PV/CV/Q vs PRE/ACC/DN), temporización y `FB_GearSpray_Sequence` en ST. No fingir que se importa o ejecuta CCW sin adaptación.
5. Mantener E/S SCADA separadas de tags internos del programa. Las variables internas se crean cuando se carga la solución portada, como en las demás escenas; la escena sin plantilla registra únicamente señales de campo y setpoints operativos.
6. Conectar 100% de los estados mostrados por SCADA a los tags del controlador o a variables físicas claramente diferenciadas.

## Pruebas FAT antes de declarar equivalencia
- IO: tags `_310_` → aliases → salidas; verificar polaridad y `DI_PDB` vs `DI_PDB_2`.
- Modo AUTO con molino ON; MANUAL con molino OFF; mantenimiento con molino ON; cambio de modo incompatible.
- Secuencia: 0 → 10 → 20 → 30 → 10, con pulsos medidos, tiempo de purga y ciclo extra.
- P04: hysteresis 800/1000 con respuesta del solenoide de bomba y presión virtual.
- Fallos: aire bajo 5 s, lubricante bajo 10 s, bajo caudal, nivel bajo y pre-shutdown, alarmas/rearme.
- Alta presión: no disparar artificialmente la alarma bloqueada por `AFI`.
- Rendimiento: distintas frecuencias de scan, PAUSE/STOP, reset, persistencia por escena, modo Maximize tabset con proceso al 50% y grupos LED.
- Conservar capturas de resultados y registrar diferencias entre emulación y proyecto CCW.

## Implementación por entregables
- **Fase 1:** SCADA industrial SVG y tags físicos/setpoints; animación física desacoplada, estructura de escena e información.
- **Fase 2:** física determinista (presión de aire/lubricante, dosificador, depósito, molino, inyección de fallas) conectada a E/S.
- **Fase 3:** rutinas P01–P07 y FB traducidos/adaptados al motor, con documentación de cualquier diferencia.
- **Fase 4:** FAT por modo, estado, alarma y recuperación; ajuste de parámetros y verificación en GitHub Actions.

> Criterio de aceptación: **la lógica, no el SVG, controla las salidas**; los sensores responden a la física simulada; las discrepancias se reportan antes de proclamar equivalencia con CCW.

## Registro de implementación — Fase 1
- `web/src/plc/gearSpraySceneModel.ts`: 21 tags iniciales, exactamente 5 entradas físicas P01, 6 salidas, 6 PB y 4 consignas HMI. El proyecto comienza con MainRoutine vacío; no hereda tags del demo.
- `web/src/components/ide/GearSprayScene.tsx`: esquema SVG industrial, tarjetas de instrumentación y control de entradas manuales; grupos LED Estado / Entradas / Salidas; diálogo de información.
- `web/src/App.tsx`: nueva opción `gear`, sesión Ladder independiente, lectura/escritura a través del motor compartido, manteniendo las salidas de campo exclusivamente bajo el control de la lógica programada.
- `web/src/components/ide/ControllerTags.tsx`: alcance independiente de Gear Spray.
- `web/tests/gear-spray-scada-phase1.test.mjs`: FAT de inventario, comandos, bloqueo de escritura de salidas, independencia de sesión, referencias originales y aviso explícito de limitaciones.
- **Limitaciones intencionales:** no se ejecutan aún P01–P07 ni la UDFB; la presión y DI se ingresan manualmente (sin modelo físico); la salida de programa por defecto es FALSE porque MainRoutine aún está vacío. No anunciar pruebas de secuencia, presión, flujo ni alarmas como aprobadas hasta fases siguientes.
