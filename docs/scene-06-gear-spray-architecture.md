# Escena 06 — Gear Spray / Lubricación de molino de bolas
**Estado:** Fases 1–2 implementadas y **Fase 3A P01/P02 disponible como plantilla Ladder optativa** en `feature/ide-workspace-v1`. P03–P07 y FB_GearSpray_Sequence están pendientes; no existe aún equivalencia funcional con todo el programa CCW.  
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
- **Pilotos LED**: mostrar únicamente el estado del sistema y la salida de alarma audible, con descripción y tag en renglones separados. Las entradas digitales se accionan en Instrumentación y las tres electroválvulas se observan en el diagrama del proceso. Se retiró el panel «Programa y referencias».
- **Diagnóstico**: presión de aire y lubricante, pulsos de medición, cuenta/temporizadores, estado 0/10/20/30/90, alarmas y código de falla. Incluir controles de fallas simuladas (aire insuficiente, filtro o dosificador bloqueado, nivel bajo, fallos de presión) claramente etiquetados como **simulación**.
- El SCADA responde a mosaicos y conserva las reglas Maximize tabset.

## Inventario de E/S de P01_Mapping (nombres CCW originales)
| Naturaleza | Tag de proyecto CCW | Alias interno y finalidad |
|---|---|---|
| AI simulada | `_310_PI_2561` | `AI_AirPressure_Scaled`: presión de aire |
| AI simulada | `_310_PI_2560` | `AI_LubePressure_Scaled`: presión de lubricante |
| DI física | `_310_PLC104_YI_MillRun` | `DI_Mill_Run`: molino en marcha |
| DI física | `_310_SQS_2561` | `DI_PDB`: pulso de dosificador físico hacia el conteo del ciclo |
| DI física | `_310_LSL` | `DI_Low_Level`: bajo nivel (verificar polaridad) |
| DO física | `_310_SV_2560` | `DO_Pump_Sol`: bomba neumática |
| DO física | `_310_SV_2563` | `DO_Air_Sol`: aire de atomización |
| DO física | `_310_SV_2561` | `DO_Lubecon_Sol`: solenoide de grasa |
| DO física | `_310_UY_2560` | `DO_Alarm_Out`: alarma audible |
| DO física | `_310_YI_SystemHealthy` | `DO_LS_Healthy`: healthy |
| DO física | `_310_YI_LubricationSystemRunning` | `DO_LS_Running_Output`: running |

**Aclaración del autor del programa:** `DI_PDB` es la señal operativa del contador del dosificador y `_310_SQS_2561` es su entrada física. La segunda variable creada únicamente para ensayos no debe utilizarse. El simulador mantiene una copia síncrona de SQS a `DI_PDB` durante la Fase 2; el portado posterior de P01 debe respetar esta asignación.

## Operación HMI y setpoints
- Pulsadores existentes del proyecto: `PB_Auto`, `PB_Manual`, `PB_Maint`, `PB_Extra`, `PB_Reset`, `PB_Lubpress_Release`. Otros tags HMI del proyecto: `PB_Set`, `PB_View`, `PB_CloseMenu`: no descartarlos en la lista de tags; incorporar si se simulan las funciones de menú.
- Setpoints existentes: `TMR_Freq_SP`, `CNT_LubeFlo_SP`, `TMR_LubeFlo_SP`, `Maint_Duration_Min`. Preservar tipos y unidades en la fase de portado; las conversión `ANY_TO_TIME` y el cálculo `Maint_Duration_ms := Maint_Duration_Min * 60 * 1000` deben mantener la misma semántica de CCW.
- No crear un control de salida directa en la operación normal: la prueba física de actuadores debe indicar claramente cuando es **forzado** para FAT.

## Estructura interna y diagnósticos
**Modos y marcha:** `ST_Auto_Mode`, `ST_Man_Mode`, `ST_Maint_Mode`, `ST_Run_Rly`, `ST_Auto_Selected`.  
**Ciclo:** `ST_Cycle_Rly`, `ST_Pump_Rly`, `ST_Airsol_Rly`, `ST_Pump_Sol_Rly`, `SM_Cycle_State`, `SM_Cycle_Blocked`, `SM_Cycle_RearmHold`.  
**Flujo:** `DI_PDB`, `CNT_Lubeflo_Dn`, `CNT_Lubeflo_Rst`, `CNT_LubeFlo_SP`.  
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
- IO: tags `_310_` → señales de ciclo → salidas; verificar que `_310_SQS_2561` se copie a `DI_PDB` y comprobar la polaridad de LSL.
- Modo AUTO con molino ON; MANUAL con molino OFF; mantenimiento con molino ON; cambio de modo incompatible.
- Secuencia: 0 → 10 → 20 → 30 → 10, con pulsos medidos, tiempo de purga y ciclo extra.
- P04: hysteresis 800/1000 con respuesta del solenoide de bomba y presión virtual.
- Fallos: aire bajo 5 s, lubricante bajo 10 s, bajo caudal, nivel bajo y pre-shutdown, alarmas/rearme.
- Alta presión: no disparar artificialmente la alarma bloqueada por `AFI`.
- Rendimiento: distintas frecuencias de scan, PAUSE/STOP, reset, persistencia por escena, modo Maximize tabset con proceso al 50% y grupos LED.
- Conservar capturas de resultados y registrar diferencias entre emulación y proyecto CCW.

## Escalamiento de entradas — referencia original
- El documento original `Gear Spary Bolas.pdf` (Cscape, rungs 99–100) muestra:
  - Presión de aire: señal de entrada **6400–32000** escalada a **0–148**.
  - Presión de lubricante: señal de entrada **6900–32000** escalada a **0–1480**.
- El PDF CCW `P01_Mapping.pdf` solo copia `_310_PI_2561` a `AI_AirPressure_Scaled` y `_310_PI_2560` a `AI_LubePressure_Scaled`, sin mostrar los parámetros del escalamiento previo. Los deslizadores de escena 06 usan **rangos del Cscape original como referencia**, pendientes de validar en el proyecto CCW. No se presume una unidad física confirmada.
- La lógica CCW evalúa presión alta de lubricante en `>1500`, fuera de la referencia de 1480: **discrepancia que requiere validación**. Por eso el campo numérico permite valores fuera del rango del deslizador para inyección de fallas en pruebas FAT, con aviso visual.
- Los cuatro setpoints son `DINT` sin máximos operativos verificados. **Se editan exclusivamente con campo numérico** (sin barra deslizante), conservando validación `0..2147483647`; los deslizadores se reservan para las dos entradas analógicas.
- Etiquetas en pantalla: nombre descriptivo arriba y tag real abajo; las DI mantienen checkbox y agregan descripción seguida del tag entre paréntesis.

- **Disposición de escena 06:** el panel completo «Instrumentación y setpoints» aparece bajo «Vista de proceso» y sus tarjetas de diagnóstico, en la columna izquierda. El panel derecho mantiene mandos, pilotos y alarmas.

## Fase 2 — simulación física determinista (implementada)
- Módulo `web/src/plc/gearSprayPhysics.ts`: modelo de **planta**, no lógica PLC. Recibe exclusivamente las salidas reales `_310_SV_2560` (bomba), `_310_SV_2561` (lubricante) y `_310_SV_2563` (aire atomizador). El estado es independiente del programa y de otras escenas.
- `App.tsx` integra un paso físico fijo de 50 ms **solo en RUN** con la escena 06 activa; STOP/PAUSE y el cambio de escena congelan el proceso. Inyecta las presiones `_310_PI_2561`, `_310_PI_2560` y las señales digitales `_310_SQS_2561`, `DI_PDB` y `_310_LSL` al motor Ladder, con bordes de sensor evaluados sin avanzar temporizadores.
- Modelo intencionalmente **didáctico**, no calibrado: suministro de aire ajustable, presión de lubricante con llenado/descarga por bomba, descenso del nivel de tambor, pulsos a intervalos de 500 ms cuando la válvula de lubricante está abierta y existe presión suficiente, y fallas de pérdida de aire, filtro obstruido o dosificador atascado.
- El sensor `_310_LSL` se asume **TRUE para nivel bajo** al 10 % o menos; su polaridad debe corroborarse. El alias operativo `DI_PDB` está registrado y recibe los mismos pulsos que `_310_SQS_2561`, tanto manualmente como con el modelo físico activo.
- **Compatibilidad con fase 1**: modelo físico desactivado inicialmente; el operador conserva las entradas manuales numéricas/slider y las casillas. Al activar la física, las entradas de presión, SQS y LSL se vuelven de solo lectura y la configuración del ambiente/fallas se realiza en el panel bajo la vista de proceso. `_310_PLC104_YI_MillRun` continúa siendo una entrada externa operable.
- Las salidas **nunca** se generan mediante simulación: requieren una MainRoutine válida que las active. Sin P01–P07 portadas, la fase 2 permite FAT de la planta frente a programas Ladder desarrollados en DesignerSimulator, pero **no** declara equivalencia con CCW.
- Las pruebas de `web/tests/gear-spray-phase2-physics.test.mjs` cubren determinismo, presión, pulsos, nivel y fallas.

## Ajuste Fase 2 — velocidad de caída de presión
- En **Simulación física automática** se añadió «Velocidad de pérdida de presión» de **0.25× a 4×**, con 1× predeterminado y pasos de 0.25.
- El multiplicador `pressureDecayFactor` acelera o desacelera **solo la despresurización** del aire cuando existe pérdida de suministro y del lubricante cuando baja su presión objetivo. La presurización sigue a la tasa original. Su efecto pertenece al modelo físico simplificado, no a la calibración real del sistema.
- `Restablecer física` retorna el multiplicador a 1×. La simulación conserva la retención de PAUSE/STOP.

## Inicio Fase 3A — P01 y P02 en Ladder editable
- Se añadió `web/src/plc/gearSprayPhase3Program.ts` con `createGearPhase3AProject()`: proyecto Ladder optativo e independiente de la plantilla FAT, que registra sus propios tags de proceso y rungs editables.
- **P01**: copia de presiones de aire/lubricante (`MOV`), límites aire **>40**, lubricante alto **>1500** y bajo **<400** habilitado por marcha; entrada física de molino, proximidad, copia a `DI_PDB` y memoria de flanco (`ONS`), nivel bajo; puente entre variables internas de mando y salidas de campo.
- **P02**: selección retenida AUTO/MANUAL/MANT y condición `ST_Run_Rly`; cada ecuación y cada enclavamiento están en **un único rung Ladder** con contactos y ramas OR reales, sin auxiliares que introduzcan dependencia entre scans. La expresión de marcha usa distribución booleana equivalente para representar tres caminos paralelos en un rung. El estado de marcha alimenta `_310_YI_LubricationSystemRunning`.
- **Límite deliberado:** P03–P07, secuencia UDFB, control automático de bomba, dosificación y alarmas **todavía no están portados**. En esta plantilla, las tres electroválvulas y la sirena siguen desenergizadas. No interpretar los modos AUTO/MANUAL/MANT como un sistema de lubricación funcional completo.
- **Correspondencia que requiere FAT:** `Run_Rly` se alimenta de `ST_Run_Rly` como interpretación de implementación para la condición de baja presión de P01. No se asume equivalencia definitiva hasta la revisión funcional del usuario.
- Se puede cargar con «Cargar P01 + P02 (Fase 3A)» solo en STOP, después de restaurar cualquier FAT temporal. Se conserva copia local del MainRoutine previo y hay botón «Restaurar programa anterior a Fase 3A». No recargar el navegador hasta guardar o restaurar: ambas copias residen en memoria.
- Pruebas de compilación/escaneo en `web/tests/gear-spray-phase3a.test.mjs`.

- **Comentarios de rung:** `PracticeRung.comment` es metadato editable en el editor (`+ Añadir comentario al rung`, multilinea, hasta 240 caracteres). El inicio de P01, P02 y el regreso al mapeo P01 están marcados. El comentario persiste con el rung al reordenarlo y **no cambia la firma de compilación ni reinicia RUN**.

## Implementación por entregables
- **Fase 1:** SCADA industrial SVG y tags físicos/setpoints; animación física desacoplada, estructura de escena e información.
- **Fase 2:** física determinista (presión de aire/lubricante, dosificador, depósito, molino, inyección de fallas) conectada a E/S.
- **Fase 3:** rutinas P01–P07 y FB traducidos/adaptados al motor, con documentación de cualquier diferencia.
- **Fase 4:** FAT por modo, estado, alarma y recuperación; ajuste de parámetros y verificación en GitHub Actions.

> Criterio de aceptación: **la lógica, no el SVG, controla las salidas**; los sensores responden a la física simulada; las discrepancias se reportan antes de proclamar equivalencia con CCW.

## Registro de implementación — Fase 1
- `web/src/plc/gearSpraySceneModel.ts`: 22 tags iniciales: 5 entradas físicas, 6 salidas, 6 PB, 4 consignas HMI y el alias de conteo `DI_PDB`. El proyecto comienza con MainRoutine vacío; no hereda tags del demo.
- `web/src/components/ide/GearSprayScene.tsx`: esquema SVG industrial, tarjetas de instrumentación y control de entradas manuales; grupos LED Estado / Entradas / Salidas; diálogo de información.
- `web/src/App.tsx`: nueva opción `gear`, sesión Ladder independiente, lectura/escritura a través del motor compartido, manteniendo las salidas de campo exclusivamente bajo el control de la lógica programada.
- `web/src/components/ide/ControllerTags.tsx`: alcance independiente de Gear Spray.
- `web/tests/gear-spray-scada-phase1.test.mjs`: FAT de inventario, comandos, bloqueo de escritura de salidas, independencia de sesión, referencias originales y aviso explícito de limitaciones.
- **Limitaciones intencionales:** no se ejecutan aún P01–P07 ni la UDFB. Las presiones y entradas pueden ingresarse manualmente o mediante el modelo físico opcional. La salida de programa por defecto es FALSE porque MainRoutine aún está vacío. No declarar equivalencia con CCW antes de portar su lógica y realizar FAT.
