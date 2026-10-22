# PROVINCIA ART (ID 3)

Circuito auditado: **CÁMARA y COLEGIO (ver ajustes por circuito)**

## Ficha (datos base de la obra social)

- **id:** 3
- **id_soft:** 102
- **name:** PROVINCIA ART
- **plan:** 100
- **status:** Activa
- **recipe_type:** común, digital, electrónico
- **recipe_validity_days:** 30
- **letterhead:** No es necesario
- **rp:** 4
- **diagnosis:** No es necesario
- **monodrug:** si
- **commercial_name:** opcional
- **substitution:** Si se puede
- **robinson:** false
- **source_modified_at:** 2026-03-23T11:28:24+00:00
- **source_raw:** {"source":"PLATASOFT_LEGACY","id_soft":102,"batch_id":1,"legacy_name":"PROVINCIA ART - CAMARA","migration_action":"CREATE"}
- **active:** true
- **created_at:** 2026-09-28T15:01:02.176033+00:00
- **updated_at:** 2026-10-15T17:47:51.394223+00:00
- **validator_name:** COMPAÑIA en Declaración de dispensa
- **validator_type:** POR FUERA

## Ficha: ajustes por circuito (Cámara / Colegio)

### Circuito CAMARA
- **id:** 27
- **social_work_id:** 3
- **circuit_group:** CAMARA
- **observations:** *Por receta: si supera 80000 requiere autorización.
*Por producto; si supera los 20000 requiere autorización.
*Descartables con autorización. 
Obligatorio presentar Receta 
NO REQUIERE DENUNCIA
- **legacy_name:** PROVINCIA ART - CAMARA
- **updated_at:** 2026-10-21T19:18:19.640817+00:00

### Circuito COLEGIO
- **id:** 28
- **social_work_id:** 3
- **circuit_group:** COLEGIO
- **recipe_type:** comun
- **letterhead:** No requiere
- **diagnosis:** No requiere
- **substitution:** si requiere
- **validator_name:** COFA
- **observations:** A partir de los 80.000 necesita autorización.
- **legacy_name:** PROVINCIA ART - COLEGIO
- **updated_at:** 2026-10-21T19:18:19.640817+00:00

## Observaciones aprobadas

_sin observaciones aprobadas_

## Protocolos internos

_sin protocolos_

## Preguntas frecuentes aprobadas

_sin FAQs_

## Reglas de operación

- **id:** 32
- **social_work_id:** 3
- **rule_scope:** GLOBAL
- **operation_mode:** DIRECT
- **operation_summary:** Provincia ART se opera directamente por defecto.
- **instructions:** Usar validador correspondiente salvo sucursal Colegio.
- **source_type:** CLIENT_PROCEDURE
- **source_reference:** Procedimiento CAMARA-COLEGIO vigente 28/09/2026
- **priority:** 100
- **approved:** true
- **active:** true
- **approved_at:** 2026-09-28T15:04:28.539612+00:00
- **created_at:** 2026-09-28T15:04:28.539612+00:00
- **updated_at:** 2026-09-28T15:04:28.539612+00:00
- **can_receive:** true

- **id:** 33
- **social_work_id:** 3
- **rule_scope:** BRANCH_TYPE
- **branch_type:** COLEGIO
- **operation_mode:** CAMARA_COLEGIO
- **validation_branch_type:** CAMARA
- **presentation_branch_type:** CAMARA
- **operation_summary:** Provincia ART requiere circuito Cámara-Colegio desde sucursales Colegio.
- **instructions:** Realizar el circuito utilizando una sucursal Cámara según procedimiento vigente.
- **source_type:** CLIENT_PROCEDURE
- **source_reference:** Procedimiento CAMARA-COLEGIO vigente 28/09/2026
- **priority:** 200
- **approved:** true
- **active:** true
- **approved_at:** 2026-09-28T15:04:28.539612+00:00
- **created_at:** 2026-09-28T15:04:28.539612+00:00
- **updated_at:** 2026-09-28T15:04:28.539612+00:00
- **can_receive:** true

## Correcciones del administrador (prevalecen sobre lo demás)

### Corrección sobre consulta #5129 — alcance: sin definir (según circuito de origen)
**Veredicto:** INCORRECT
**Pregunta original:** Con respecto a Provincia art, si tengo una receta con 2 medicamentos y no supera los $80.000, pero cada medicamento supera los $20.000 debo pedir autorizacion?

si se debe solicitar autorización, ya que si cada medicamento supera los $20.000 necesita autorizacion de la obra social.

### Corrección sobre consulta #5305 — alcance: sin definir (según circuito de origen)
**Veredicto:** INCORRECT
**Pregunta original:** En provincia art requiere denuncia?

NO REQUIERE DENUNCIA

### Corrección sobre consulta #5306 — alcance: sin definir (según circuito de origen)
**Veredicto:** INCORRECT
**Pregunta original:** Pero se presenta con la receta?

Obligatorio presentar Receta NO REQUIERE DENUNCIA

### Corrección sobre consulta #5444 — alcance: BOTH
**Veredicto:** INCORRECT
**Pregunta original:** provincia art necesita copia denuncia

Provincia ART no requiere copia de la denuncia. Es obligatorio presentar la receta.

### Corrección sobre consulta #5463 — alcance: BOTH
**Veredicto:** INCORRECT
**Pregunta original:** Hola ! Tenemos esta receta de un afiliado de Provincia Art, que en el lugar de numero de afiliado, han colocado el numero de siniestro, hay posibilidad de recibirla asi ?

¡Hola! Sí, podemos recibirla. Provincia ART se gestiona con el DNI del paciente, no con número de afiliado

Debemos pedirle al farmacéutico que salve la receta colocando el DNI correcto, con firma y sello  y adjuntar una copia del DNI u otra constancia donde figure ese dato

### Corrección sobre consulta #5457 — alcance: BOTH
**Veredicto:** INCORRECT
**Pregunta original:** provincia art necesita copia del DN

No se requiere copia del DNI para Provincia ART.

## Normativas vigentes

### PROVINCIA ART - Norma de atención (ID 55)
- Archivo: Provincia_ART-Anexo_Farmacias_(30_01_25)_29012025.doc
- Canal de facturación: Cámara
- Rol del documento: PRIMARY
- Vigencia: — → —
- Extracción: DOC

Vigente a partir del 30 de Enero de 2025.	
Las marcas "@" identifican los puntos que deben DECLARARSE  OBLIGATORIAMENTE en el momento de la venta a través del sistema de validación ingresando en www.plataformacsf.com o bien mediante los sistemas de facturación integrados. 

En todas las recetas declaradas electrónicamente, la Liquidación de Recetas y CIERRE DE LOTES debe efectuarse obligatoriamente utilizando la herramienta que brinda dicho sistema para tal fin.

Los datos consignados en las declaraciones deben reflejar fielmente lo indicado en la prescripción (beneficiario, profesional y/o institución, productos, fecha de prescripción, etc.). Caso contrario, la receta es plausible de observación  y débito.	
Aclaración:
El Cierre DE LOTES y DECLARACIÓN DE DISPENSA electrónico es OBLIGATORIO. SIEMPRE deben figurar en el Resumen de Facturación general confeccionado a través de www.plataformacsf.com (ver punto 11).

Por lo tanto, en un mismo Resumen de Facturación electrónico debe figurar INDISPENSABLEMENTE:
  - DECLARACIÓN DE DISPENSA de PROVINCIA ART para recetas sin validación online ("Plan MIXTO DECLARACIÓN")	
Descuentos: (Válidos sólo para pacientes ambulatorios)	
General:	100%	
Habilitación del beneficiario:	
Con el DNI, nombre y apellido del beneficiario.	
Denuncia de siniestro (ver punto 14)	
No es preciso que concurra el beneficiario personalmente a la farmacia. Puede hacerlo en su nombre cualquier otra persona que presente la documentación que acredite su identidad en relación con el beneficiario.	
Aclaración importante: al realizar la declaración de dispensa correspondiente, proseguir la misma aunque el sistema advierta "no se encontraron datos del afiliado".

	
Recetario:	
Tipo de recetario:	De todo tipo (Particular o de Instituciones);
Recetarios electrónicos / digitales que cumplan con requisitos de identificación (código de barra, QR, etc.) con firma y sello digital de acuerdo a la reglamentación de la ley.
Recetarios digitales (prescripción pre-impresa ya sea total o parcial) sin los requisitos de identificación antes mencionados pero que contengan firma y sello original del profesional.

Cabe recordar que la prescripción tradicional (manuscrita) enviada vía mail, Whatsapp o impresa NO es válida. Ésta debe ser siempre original.

En el caso de recetarios electrónicos / digitales es obligatorio grabar el número correspondiente al validar dichas dispensas.
Cabe recordar que por el momento, debe presentarse una copia impresa de dichas prescripciones electrónicas / digitales, hasta tanto finalicen los procesos de integración correspondientes.	
Datos que deben figurar de puño y letra del profesional, y con la misma tinta, o bien pre impresos en recetarios electrónicos / digitales:	Nombre y apellido del paciente;
DNI del paciente y/o Nro. de Siniestro si existe (no es requisito imprescindible); (*)
Diagnóstico;
Medicamentos recetados por principio activo, indicando una marca sugerida incluida en el Vademécum. Se rechazarán recetas que no presenten Principio Activo 
Cantidad de cada medicamento;
Firma y sello con número de matrícula y aclaración; 
Fecha de prescripción.


Las correcciones y/o enmiendas relativas a la prescripción debe estar salvadas por el profesional con su firma y sello. No podrá salvarse de ninguna manera la matrícula y nombre del médico.

(*) Cuando en una receta el número de beneficiario sea poco legible o se encuentre incompleto, la farmacia debe repetirlo al dorso, en forma clara y correcta, indicando junto al número consignado por el  médico la frase "ver al dorso". El beneficiario debe firmar nuevamente como prueba de conformidad.
	
Validez de la receta:	
Dispensa. El día de la prescripción y los 30 (treinta) días siguientes.	
Presentación: Hasta 60 días posteriores a la fecha de venta e incluyendo la misma	
Refacturación: Hasta 60 días posteriores a la fecha en que la farmacia recibe la receta rechazada.
Aclaración: los débitos son NO REFACTURABLES a excepción de aquellos inherentes a la auditoria.	
 Topes de cobertura:	
Límites de cantidades:		
Renglones por receta:

Envases por renglón:	Hasta 4 (cuatro) de distinto principio activo, concentración y forma farmacéutica

Hasta 1 (uno) chico.	
Importe por receta:		Las recetas cuyo precio de venta al público supere los $80.000 (pesos ochenta mil) requieren autorización de la Entidad (ver formulario punto 13)	
Importe por producto:	Los productos cuyo precio de venta al público supere los $20.000 (pesos veinte mil) requieren autorización de la Entidad (ver formulario punto 13).	
Antibióticos Inyectables: 	Presentación	Entregar	
	Envase de 1 (una) ampolla o frasco ampolla. 	Hasta 5 (cinco)	
Psicofármacos:	El profesional debe confeccionar además los duplicados, o los recetarios que correspondan según normas legales en vigencia.	
Otras especificaciones:	Cuando el médico:
No especifica cantidades	Debe entregarse:
El envase de menor contenido.	
	Sólo indica la palabra "grande"	La presentación siguiente a la menor.	
	Equivoca la cantidad y/o contenido	El tamaño inmediato inferior al indicado.	
Productos Cubiertos:	
Los descuentos mencionados en el punto 1 se aplicarán únicamente sobre las especialidades medicinales comprendidas en el VADEMÉCUM de la entidad. 	
Autorizaciones Especiales:	
Sólo podrán expenderse recetas que NO cumplan con todos los requisitos cuando se hallen autorizadas por la Entidad ya sea en la receta, vía medios electrónicos o bien mediante Formulario de autorización (ver punto 13). 

Ante consultas sobre cómo proceder ante algún rechazo o DNI / Nro. de siniestro inválido, la farmacia podrá comunicarse con PROVINCIA ART:
Lunes a viernes de 8 hs. a 20 hs. al 0800-333-1278
Días hábiles de 20 hs. a 8 hs. y sábados, domingos y feriados al 0800-333-1333.	
Medicamentos Faltantes:	

Si por cualquier circunstancia, en la farmacia falta el o los medicamentos indicados por el médico, la farmacia debe obligarse a obtenerlos dentro de las 24 horas de haber sido requeridos por el afiliado, quien debe conocer tal obligación a efectos de concurrir a adquirirlos una vez que haya transcurrido dicho plazo. En ese caso la farmacia no debe retener la receta.
	
Datos a completar por la farmacia:	
NÚMERO DE TRANSACCIÓN ON LINE. Debe indicarse en el encabezado de la receta "TR: XXXX", o bien puede imprimirse el comprobante que emite el sistema.	
Fecha de venta;	
Si el producto no contiene número de troquel, adjuntar código de barras del mismo;	
Importes (unitarios, a cargo del beneficiario, a cargo de la entidad, totales)	
La farmacia deberá adjuntar cualquiera de los comprobantes de venta detallados:
Ticket fiscal propiamente dicho.
Documento no fiscal HOMOLOGADO
Duplicado o triplicado del ticket fiscal (idéntico al original pero con una leyenda de fondo "NO FISCAL").
Facturas A, B o C.	
Sello de la Farmacia y firma del Farmacéutico;	
Firma y aclaración, con número de DNI (el cual deberá ser exhibido), domicilio y teléfono de quien retira los medicamentos.	
Recomendaciones Especiales:	
Colocar en la receta el número de orden correspondiente;	
Adjuntar los troqueles del siguiente modo:
	De acuerdo al  orden de la prescripción.
Incluyendo el código de barras, si lo hubiera.
Se sugiere adherirlos con goma de pegar (sin utilizar abrochadora o cinta adhesiva, debido a que dificultan la lectura del código de barras).	
Los troqueles deberán ajustarse a lo siguiente:	Encontrarse en perfecto estado y sin signos de uso previo (perforaciones, evidencias o marcas de sustancias adhesivas).
Sin signos de desgaste del material en todo o parte del troquel.
Sin impresiones mediante sellos de cualquier tipo de leyendas legibles o no.
Sin diferencias en tamaño, grosor y/o color del troquel para un mismo producto, presentación y lote.
No deberán presentar cualquier otro signo que otorgue carácter dudoso al troquel.	
Las recetas deben presentarse numeradas en forma correlativa.  	
Cierre electrónico de lotes:	
MUY IMPORTANTE: Todas las RECETAS DECLARADAS ELECTRÓNICAMENTE deben liquidarse OBLIGATORIAMENTE mediante la herramienta CIERRE DE LOTES que provee para ello el sistema de validación a fin de incluirlas en el Resumen de Facturación electrónico que su farmacia presentará en COMPAÑÍA. Caso contrario, es motivo de rechazo de las mismas. Utilice dicha herramienta teniendo en cuenta las indicaciones del Instructivo General del sistema. 

Aclaración: la IMPRESIÓN PREVIA del Cierre de Lote NO es válida para la presentación de recetas:

   
	@	
Atención de Consultas:	
Sobre otros aspectos referidos a las normas de atención, comuníquese con el Departamento de Atención al Cliente de COMPAÑÍA al (011) 4136-9090 - Fax: (011) 4136-9001. E-mail: info@csf.com.ar, de Lunes a Viernes, de 9:00 a 18:00 horas. 	
Ante dificultades o consultas exclusivamente técnicas fuera de nuestro horario de atención, les solicitamos que envíe un correo electrónico a validaciones@csf.com.ar indicando en el titulo la palabra "Problema" más el código de su Farmacia.
	@	
Formulario de autorización:		

		
Denuncia de siniestro:		


		



### PROVINCIA ART - Norma de atención (ID 103)
- Archivo: PROVINCIA NORMAS OCT 24.pdf
- Canal de facturación: Colegio
- Rol del documento: PRIMARY
- Vigencia: — → —
- Extracción: TEXTO INDEXADO EN OPENAI (procesado no disponible; PDF SIN TEXTO (escaneado: requiere OCR))

===== PÁGINA 1 =====

DESCUENTO A CARGO DE PROVINCIA ART
AMBULATORIO 100% (Cien por ciento)
RECETARIO

Convencional (Rp/) y/o recetario Provincia ART.
PARA LA VENTA: 30 (treinta) días a partir de la fecha de emisión
e incluyendo la misma.
PARA LA PRESENTACIÓN: 45 (cuarenta y cinco) días corridos, a
partir de la fecha de venta e incluyendo la misma.
PARA LA REFACTURACIÓN: 45 (cuarenta y cinco) días corridos a
partir de haber recibido la liquidación.
RECORDÁ QUE LOS DÉBITOS SON NO REFACTURABLES, SALVO
ERRORES INHERENTES A LA AUDITORÍA.

REQUISITOS VALIDOS PARA TODOS LOS PLANES:

* Nombre, Apellido del afiliado, Número de DNI y/o Número de Siniestro.

* Fecha de emisión de la receta.

* Nombre y Apellido del Médico, Tipo y Número de Matrícula, Firma y sello
aclaratorio del profesional (legible, sin excepción).Para el caso de receta
electrónica con el código de barras es suficiente.

* Detalle de los medicamentos con su nombre genérico.

* Cantidades de los medicamentos en números y letras.

* En caso de que la receta tenga el nombre o marca comercial del
medicamento, además del nombre genérico, el farmacéutico tiene la
obligación de expender el medicamento según la monodroga, pudiendo
entregar una marca de igual o menor precio a la recetada.

===== PÁGINA 2 =====

POR RECETA Medicamento Chico podrá prescribirse 4 (cuatro) (diferentes)
POR RENGLÓN Medicamento Chico podrá prescribirse 1 (uno)
INYECTABLES Hasta 5 dosis en ampollas individuales o multidosis.

* Por renglón: $20.000

* Porreceta: $80.000

* Hasta? recetas por afiliado por mes
Cuando el/la profesional prescriba medicamentos bajo control (alcaloides, psicofármacos,
etc.), la farmacia retendrá la receta original y remitirá con la facturación una copia fiel de la
misma, firmada por el farmacéutico/a y con el correspondiente sello aclaratorio / pudiendo
ser por duplicado o triplicado.

* TAMAÑO NO ESPECIFICADO: el/la farmacéutico/a entregará, siempre que no medie
indicación en contrario, el envase de menor contenido del producto prescrito y
solamente una unidad, salvo en caso de inyectables.

* ESPECIFICA “GRANDE” * vender la presentación siguiente a la de menor tamaño.

===== PÁGINA 3 =====

DATOS A COMPLETAR POR LA FARMACIA
Adjuntar a la receta preferentemente el comprobantede autorización O)
de dispensa (CAD) o copia del Ticket Fiscal donde figuren los siguientes
datos:
* Pegar con adhesivo o con cinta adhesiva transparente (no abrochar) en la
receta el troquel con su código de barras o la solapa identificatoria de cada
uno de los productos vendidos, en el mismo orden en que fueron prescriptos.
« Sello de la farmacia y firma del farmacéutico director técnico.
* Fecha de dispensación.
* Detalle de los medicamentados.
* Importes unitarios y totales y porcentaje a cargo de la entidad.
* Cantidades entregadas de cada medicamento prescripto.
* Número de autorización emitido por el sistema de validación on line.
e Firma, aclaración de firma y número de documento de identidad (el cual
deberá ser exhibido), domicilio y teléfono de la persona que retira la receta.
* De no poder discriminar en ninguno de los tickets todos estos datos
solicitados, será necesario llenar manualmente el sello con la transcripción de
importes al dorso de la receta, adjuntando también la copia del Ticket Fiscal o
comprobante de venta.
* Las recetas no deberán tener enmiendas y/o agregados no convalidados con
la firma del/la profesional actuante y su sello.
* No podrá salvarse de ninguna manera la matrícula y nombre del médico.
A TENER EN CUENTA

* Alado de la prescripción se indicará el precio unitario, luego el importe total. A continuación
de la liquidación ella beneficiario/a o quien lo/la represente firmará el conforme.

* El/la farmacéutico/a deberá requerir al titular o tercera persona a quien se encomendase
la compra sus datos identificatorios, los cuales deberán coincidir con los contenidos en su
DNI. Si una tercera persona retira el medicamento, se deberán aclarar sus datos en el dorso
de la receta (nombre, DNI, domicilio y teléfono).

* Al dorso se deberá colocar el troquel extraído del medicamento dispensado. Ante la
eventualidad de medicamentos cuyo envase no posea el correspondiente troquel,
provisoriamente se escribirá la sigla “S/T” (sin troquel) al lado de la prescripción. El código
del troquel deberá estar perfectamente legible, sin enmiendas, tachaduras, ni cubierto por

* cinta de remarque.

===== PÁGINA 4 =====

IMPORTANTE
Por consultas sobre cómo proceder ante algún rechazo por medicamento no cubierto o DNI /
Nro. de siniestro invalido, la Farmacia podrá comunicarse con Provincia ART:
* De lunes a viernes de 8 a 20 hs. al 0800-333-1278
* Los días hábiles de 20 a 08 hs. y los días Sábado, Domingo y Feriados al 0800-333-1333
(CEM).
