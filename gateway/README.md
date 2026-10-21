# Micro850 real por OPC UA — DesignerSimulator Gear Spray

Este gateway permite hacer pruebas **Hardware-in-the-Loop (HIL)** sin ejecutar el
Ladder de DesignerSimulator como un segundo controlador. La lógica P01–P07 se
ejecuta en el **Micro850 real** y la planta (aire, bomba, presión, dosificador,
nivel) en el navegador. El switch Ethernet **no transforma protocolos**.

## Arquitectura de red

```text
 Micro850 (programa CCW / P01-P07) —┐
 Otros instrumentos Ethernet ————┤ SWITCH INDUSTRIAL (red OT aislada)
 PC con FactoryTalk Linx Gateway —─┘
                   │ servidor OPC UA (opc.tcp://IP:PUERTO)
                   ▼
             gateway/ (Node.js) en PC con navegador
                   │ WebSocket local 127.0.0.1:8765
                   ▼
             DesignerSimulator · Escena 06 (PLC real)
                   │
       Salidas BOOL del Micro850 → física virtual
       Física virtual / botones → entradas SIM_* del Micro850
```

Micro850 ofrece **CIP Symbolic**; FactoryTalk Linx/Gateway expone sus tags a
clientes OPC UA. No atribuir al PLC un servidor OPC UA integrado sin confirmar
el modelo exacto. Otros equipos del switch pueden usar EtherNet/IP, Modbus,
OPC UA u otros protocolos; el switch no los convierte.

## Requisitos

- PLC Micro850 y switch industrial con puertos Ethernet, segmento OT protegido.
- Proyecto CCW P01–P07 en el PLC; **instrumentos y actuadores de planta reales
  aislados para pruebas**. Crear variables globales de simulación conmutadas
  por un modo de laboratorio en CCW (por ejemplo `SIM_PI_2561`,
  `SIM_PI_2560`, `SIM_SQS_2561`, `SIM_LSL`,
  `SIM_PB_Auto`). No intentar escribir directamente los canales
  físicos I/O de la máquina desde el navegador.
- FactoryTalk Linx con el controlador visible (CIP symbolic) y
  FactoryTalk Linx Gateway configurado como **OPC UA Server**.
- Node.js **20 o posterior** en el PC donde abrirás DesignerSimulator.
- OPC UA Client compatible con navegación de NodeIds (por ejemplo UaExpert).
- Certificados cliente/servidor OPC UA confiables, seguridad
  **SignAndEncrypt + Basic256Sha256** o una política moderna compatible.
  Es posible que se requiera configurar el trust store del gateway y del
  servidor. No desactivar seguridad para compensar un error de certificados.
- Crear en CCW un watchdog de simulación: una pérdida de comunicación debe
  conducir a un estado seguro decidido **en el PLC**. El WebSocket y el
  navegador no son mecanismos de parada de seguridad.

## Instalación (Windows PowerShell)

Desde la raíz del repositorio:

```powershell
cd gateway
Copy-Item config.example.json config.json
npm install
npm test
```

Abre `config.json`:

1. `endpoint`: URL copiada del endpoint OPC UA real de FactoryTalk Linx
   Gateway, por ejemplo `opc.tcp://192.168.10.30:4990` **solo como ejemplo**.
2. `read`: asigna los **6 NodeIds de salidas** (solo lectura) que produce
   P01–P07. Cada valor debe ser el NodeId real consultado con un navegador OPC UA;
   no basta con colocar el nombre del tag.
3. `write`: asigna los **15 NodeIds** de variables globales de simulación/HMI
   **escribibles**. Los nombres son claves lógicas de DesignerSimulator, el
   NodeId puede pertenecer a una variable `SIM_*` del PLC.
4. `observe`: opcional. Asigna NodeIds a `SM_Cycle_State`, `Fault_Code`,
   `ST_Cycle_Rly`, `ST_General_Trip_Rly`, `DO_LS_Healthy` y
   `CTN_Lubeflo.ACC`. Si no los configuras el SCADA mostrará
   «Sin NodeId de lectura» para los valores que lo necesitan.
5. `pollMs`: 50 o 100 ms como valor de ensayo. No garantiza captura de
   pulsos cortos; para contar pulsos de dosificación de 100 ms, considera
   una retención de flancos o contador en el PLC para no perder eventos.
6. `allowedOrigins`: orígenes de DesignerSimulator admitidos en localhost.
   El servidor WebSocket escucha **solo en 127.0.0.1**. Si usas otra máquina
   para el navegador, ejecuta el gateway allí y comunica OPC UA por Ethernet;
   no abras el servidor WebSocket directamente a la red OT.
7. `allowWrites`: conserva inicialmente `false` para validar lectura.
   Solo pon `true` cuando **todos los 15 NodeIds** de escritura estén
   revisados y el PLC esté aislado de los actuadores físicos. El proceso
   rechazará por diseño mapeos incompletos.

En caso de autentificación por usuario OPC UA, puedes pasar las credenciales
sin guardarlas en `config.json`:

```powershell
$env:GEAR_OPCUA_USERNAME = "usuario_opc"
$env:GEAR_OPCUA_PASSWORD = "<tu contraseña OPC UA>"
npm start
```

Si el endpoint no requiere usuario: simplemente `npm start`. El gateway
muestra `ws://127.0.0.1:8765`. **No confirma comunicación OPC UA hasta que
los seis valores de salida sean BOOL y presenten calidad Good.**

En DesignerSimulator: **Escena 06 → Micro850 real · OPC UA → Conectar OPC UA**.
Mantén el motor Ladder de DesignerSimulator sin RUN. Cuando aparezcan
«Conectado» y las lecturas de salidas, habilita «Simulación física automática»:
el micro850 controla las válvulas, la física calcula los sensores y el gateway
escribe solo las entradas correspondientes cuando `allowWrites=true`.

### Comprobación sugerida en laboratorio

1. **Solo lectura:** Micro850 en CCW, seis NodeIds de salidas validados,
   `allowWrites=false`. Comprobar cambios en pilotos de válvulas y estado.
2. **Escritura de AI:** habilitar simulación y `allowWrites=true` solo
   después de aislar salidas de potencia. Comparar presión `_310_PI_2561`
   y `_310_PI_2560` en CCW y DesignerSimulator.
3. **DI:** comprobar que `_310_SQS_2561` y `_310_LSL` alcanzan
   los globales configurados en CCW.
4. **HMI:** enviar `PB_Manual` momentáneo y confirmar que P02 lo reconoce.
5. **Ciclo completo:** observar estados 0/10/20/30/90 y las salidas físicas
   virtuales. Inyectar fallas en la planta y observar P05.
6. **Desconexión:** retirar cable Ethernet del banco; el SCADA debe mostrar
   desconexión y limpiar salidas visibles; verificar **separadamente** el
   watchdog y el estado seguro en CCW.

## Restricciones importantes

- **READ** del PLC: `_310_SV_2560`, `_310_SV_2561`,
  `_310_SV_2563`, `_310_UY_2560`,
  `_310_YI_SystemHealthy`, `_310_YI_LubricationSystemRunning`.
- **WRITE** hacia tags globales SIM del PLC: dos AI REAL (OPC UA Float), tres
  DI BOOL, seis pulsadores BOOL y cuatro setpoints DINT (Int32).
- La ruta OPC UA y los NodeIds dependen de tu aplicación FactoryTalk; el
  archivo de ejemplo contiene NodeIds vacíos deliberadamente.
- El gateway solo acepta conexiones WebSocket desde orígenes localhost y
  valida el tipo de cada valor y su dirección. Rechaza NodeIds sin
  configuración y nunca permite escritura de mandos de salida.
- El servidor WebSocket no incluye TLS porque queda limitado a loopback.
  Si publicas DesignerSimulator en HTTPS o usas navegador y gateway en PCs
  distintos, configura un proxy WSS con certificado confiable; no expongas
  `ws://...` a la LAN ni a Internet.
- Si los valores dejan de actualizarse, DesignerSimulator marca la lectura
  como vencida después de 1,8 s y deja de aceptar nuevos mandos. La
  **protección de la maquinaria debe quedar dentro del PLC y del
  circuito de seguridad**, no depender del navegador.

## Referencias

- Rockwell Automation `2080-UM002R-EN-E`: OPC mediante FactoryTalk Linx y
  Gateway (Micro850 con firmware >=7.011).
- Rockwell Automation: FactoryTalk Linx Gateway UA Server endpoints.
- NodeOPCUA: API oficial del cliente para sesiones, lectura y escritura OPC UA.
