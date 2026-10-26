# Escena 06 — FAT Fase 2, Etapa B: circuito físico de lubricación

## Alcance
Verificar el modelo físico de la planta Gear Spray con salidas generadas por un
**programa Ladder temporal**. No verifica P01–P07 ni la UDFB CCW, que todavía
no están portadas. Los valores de presión y el consumo son modelos didácticos,
no calibrados. Verificar en navegador; pasar pruebas automáticas no equivale a
aprobación de FAT visual.

## Preparación segura
1. Seleccionar **Escena 06 – Gear Spray**; colocar el PLC en **STOP**.
2. Bajo **Instrumentación y setpoints → Banco de pruebas FAT – Etapa B**,
   pulsar **Cargar Ladder temporal FAT** y confirmar. El programa anterior
   queda respaldado en memoria hasta pulsar **Restaurar programa anterior**.
3. Confirmar que **MainRoutine** tiene 3 rungs sencillos, todos XIC–OTE:
   - \`FAT_CMD_Pump\` → \`_310_SV_2560\`;
   - \`FAT_CMD_Lubricant\` → \`_310_SV_2561\`;
   - \`FAT_CMD_Atomization\` → \`_310_SV_2563\`.
4. Usar **Build** y verificar éxito antes de **RUN**.
5. Activar **Simulación física automática**, pulsar **Restablecer física**,
   conservar suministro de aire **100** y tambor **100 %**; no marcar fallas.
6. Dejar los tres mandos FAT apagados antes de iniciar las pruebas.
7. Poner PLC en **RUN**. Los controles FAT funcionan únicamente en RUN.
   Las salidas siempre proceden del PLC, nunca de los checkboxes directamente.

## Casos FAT — Etapa B
| ID | Procedimiento | Resultado esperado |
|---|---|---|
| B01 | Verificar Ladder temporal compilado, mandos OFF | Tres rungs, tres salidas OFF; el programa CCW no se emula |
| B02 | Esperar 2 s sin activar mandos | Presión aire se estabiliza cerca de 100, lubricante 0, pulsos 0 |
| B03 | Encender solamente FAT_CMD_Pump; esperar 5 s | SV-2560 ON, presión lubricante se aproxima a 1050, dosificador sin pulsos |
| B04 | Mantener bomba y abrir FAT_CMD_Lubricant; observar 3 s | SV-2561 ON, presión se aproxima a 820, aparecen pulsos SQS/DI_PDB y disminuye nivel |
| B05 | Mantener bomba + lubricante y activar FAT_CMD_Atomization | SV-2563 ON; animación de seis boquillas activa |
| B06 | Apagar FAT_CMD_Atomization, luego FAT_CMD_Lubricant | Animación de spray se desactiva; nuevos pulsos se detienen |
| B07 | Apagar FAT_CMD_Pump; esperar 6 s | SV-2560 OFF, lubricante vuelve hacia 0, aire de acometida se mantiene |
| B08 | PLC STOP; usar Restaurar programa anterior | Se recupera el programa anterior a la plantilla, sin sobrescribir la lógica personal |

## Criterios y precauciones
- No realizar B08 hasta comprobar B01–B07. Antes de detener el PLC, asegurar
  todos los comandos FAT en OFF.
- La física se actualiza cada 50 ms durante RUN de la escena Gear Spray;
  los tiempos estimados son de **simulación**, susceptibles al temporizador del navegador.
- SQS/DI_PDB son señales pulsantes cortas. El contador acumulado
  **Pulsos dosificador** es más legible que el estado momentáneo BOOL.
- En B04, el dosificador pulsa al alcanzar presión suficiente (>=400) y con
  válvula abierta; la descarga del tambor se modela en pasos de 0.2 % por pulso.
- Estado **PAUSE** suspende física y scan; la comprobación formal de PAUSE/STOP
  se realizará en Etapa D.
- B08 restaura el proyecto respaldado solo dentro de la sesión actual. No
  recargar el navegador mientras la plantilla esté cargada.
- Ante discrepancias: anotar ID, valor de entrada/salida/tag y captura.


## FAT Fase 2 — Etapa D: RUN, PAUSE, SCAN, STOP y cambio de escena

**Prerrequisitos:** PLC STOP; plantilla Ladder temporal FAT cargada y Build
satisfactorio. Física automática habilitada; aire de acometida = 100,
tambor = 100 %, fallas desactivadas. Verificar cada paso en el navegador.

| ID | Acción | Resultado esperado |
|---|---|---|
| D01 | RUN con los tres mandos FAT desactivados | El número de scans aumenta; presión de aire converge a 100, presión de lubricante es 0 y no hay pulsos |
| D02 | En RUN activar bomba, válvula de lubricante y aire de atomización | Las tres salidas OTE activas; presión de lubricante alcanza >400; aparecen pulsos DI_PDB y decrece nivel |
| D03 | Pulsar PAUSE con dosificación activa; observar 3–5 s | Número de scans, nivel, presiones y contador de pulsos congelados. **Los OTE conservan su último estado ON**: PAUSE no es parada de seguridad |
| D04 | Pulsar SCAN exactamente una vez mientras PAUSE | Número de scans aumenta exactamente 1; estado PAUSE se mantiene; el modelo físico sigue congelado |
| D05 | Pulsar RUN para reanudar | Se conserva el programa/estado del scan y vuelven a avanzar los pulsos, la física y el contador |
| D06 | Pulsar STOP con las tres salidas activadas | El PLC pone las bobinas OTE en OFF y el banco FAT desmarca los tres mandos. Los valores físicos quedan **congelados**, no decaen hasta el próximo RUN |
| D07 | Volver a pulsar RUN después de STOP sin tocar mandos | Las tres electroválvulas permanecen OFF; no hay rearranque inesperado. La presión residual de lubricante cae progresivamente al reanudarse el modelo físico |
| D08 | En RUN activar bomba; cambiar a otra escena y regresar a Gear Spray | El controlador de Gear Spray queda en STOP, los mandos FAT desmarcados y su Ladder conservado; la física no avanzó durante la ausencia |
| D09 | En STOP restaurar el programa anterior | MainRoutine y tags originales reaparecen; no quedan comandos FAT activos |

**Precauciones / interpretación:**
- STOP desenergiza las bobinas OTE, pero no simula el vaciado instantáneo de una
  instalación real. La presión visual no cambia hasta la siguiente ejecución
  física en RUN. PAUSE mantiene la imagen OTE de la última evaluación, aunque
  no continúan los movimientos ni pulsos.
- Los tres comandos FAT se desarman en STOP, incluso al cambiar de escena o
  cuando la aplicación entra a STOP por una modificación estructural del Ladder.
  Esta salvaguarda es específica de la plantilla temporal y **no** modifica
  las entradas normales ni la lógica CCW definitiva.
- Al volver a RUN tras D06, observar la caída de presión de lubricante sin
  activar la bomba, debida a la dinámica de descarga física simulada.
- SCAN durante PAUSE ejecuta un ciclo Ladder pero **no** avanza el reloj de la
  física: un SCAN por sí solo no debe generar pulsos de dosificación.
- No recargar el navegador antes de restaurar la copia guardada: el respaldo
  del programa anterior existe solamente en memoria de esta sesión.
- En D08 el estado físico del modelo permanece guardado y congelado durante
  el cambio de escena, mientras la sesión de control permanece en STOP al
  regresar. No confundir retención de valores con actividad física.
