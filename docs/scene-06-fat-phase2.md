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
