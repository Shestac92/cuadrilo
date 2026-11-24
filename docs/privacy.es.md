# Política de privacidad

*Última actualización: 2 de noviembre de 2026*

Esta política explica qué datos personales se tratan cuando usas {{platformName}} («la plataforma»), para qué y qué derechos tienes. Está redactada conforme al RGPD de la UE y del Reino Unido y, en la medida de lo posible, a otras leyes de protección de datos.

## 1. Quién es responsable de tus datos

El **profesor** que te ha dado una cuenta es el **responsable del tratamiento**: decide para qué y cómo se usan tus datos y es la persona a la que debes dirigirte.

- Responsable: {{teacherName}}
- Contacto: {{teacherContact}}

La plataforma es el programa que el profesor utiliza para dar sus clases. {{hostName}} la aloja por cuenta del profesor en {{hostingCountry}} y trata los datos solo para que funcione (encargado del tratamiento). No usa los datos para sus propios fines.

## 2. Qué datos se tratan

La plataforma está diseñada para recoger lo mínimo. **No** pedimos tu nombre, correo electrónico, teléfono, fecha de nacimiento, dirección ni datos de pago.

| Dato | Detalle |
|---|---|
| Cuenta | Un nombre de usuario y una contraseña elegidos y entregados por el profesor. La contraseña se guarda solo como hash irreversible. |
| Tu trabajo | Respuestas a los ejercicios (incluidos los textos que escribes), tareas y su estado, palabras que guardas en tu vocabulario, la lección y el capítulo donde te quedaste. |
| Comentarios del profesor | Comentarios y subrayados que el profesor añade a tus respuestas. |
| Lecciones | A qué lecciones tienes acceso y desde cuándo, los grupos a los que perteneces. |
| Clases en línea | En qué clases participaste, cuándo entraste, la lección y el capítulo que ves durante la clase (se muestran en directo al profesor), las líneas que escribes en la pizarra de la clase. |
| Técnicos | Una cookie de sesión (véase el apartado 5). Tu dirección IP se usa brevemente, solo en memoria, para limitar los intentos repetidos de acceso fallidos. |

**Por favor, no incluyas información personal en tu nombre de usuario ni en los campos de texto libre** (respuestas, pizarra, comentarios) salvo que sea parte del ejercicio. Lo que escribas ahí se guarda tal cual.

## 3. Para qué se usan y con qué base jurídica

| Finalidad | Base jurídica (RGPD) |
|---|---|
| Darte una cuenta y permitirte hacer lecciones y tareas y recibir comentarios | Ejecución del contrato de enseñanza contigo o con tu padre, madre o tutor (art. 6.1.b) |
| Mantener la seguridad de la plataforma (sesiones, límite de accesos fallidos) | Interés legítimo (art. 6.1.f) |
| Cargar contenido de terceros (apartado 6) | Tu consentimiento, que das al pulsar el botón que lo carga (art. 6.1.a) |
| Alumnos por debajo de la edad de consentimiento digital | Consentimiento del padre, madre o tutor, recogido por el profesor (art. 8) |

No vendemos tus datos, no mostramos publicidad, no elaboramos perfiles ni tomamos decisiones automatizadas sobre ti.

## 4. Menores

Los alumnos pueden ser menores. Antes de dar una cuenta a un menor, el profesor obtiene el consentimiento de su padre, madre o tutor. Ellos pueden ejercer todos los derechos descritos abajo en nombre del menor, dirigiéndose al profesor.

## 5. Cookies y almacenamiento local

La plataforma usa solo lo estrictamente necesario, por eso no se muestra ningún banner de cookies.

| Nombre | Dónde | Finalidad | Duración |
|---|---|---|---|
| `app_session` | Cookie (HttpOnly, SameSite=Lax, Secure) | Mantiene tu sesión iniciada | Hasta 30 días o hasta que cierres sesión |
| `mantine-color-scheme-value` | Almacenamiento local | Recuerda el tema claro u oscuro | Hasta que borres los datos del navegador |
| Aviso de la última clase | Almacenamiento de sesión | Evita mostrar dos veces el mismo aviso de clase | Hasta que cierres la pestaña |

No usamos cookies de analítica, publicidad ni seguimiento.

## 6. Contenido de terceros

El profesor puede añadir a una lección contenido de otros servicios. No se carga hasta que pulsas un botón, y al cargarlo se envían tu dirección IP y datos del navegador a ese servicio, que además puede instalar sus propias cookies según su propia política:

- **YouTube** (modo de privacidad mejorada, `youtube-nocookie.com`): se carga al pulsar reproducir.
- **Genially** (`view.genially.com`): se carga al pulsar «Cargar el ejercicio». Lo que haces dentro de un Genially lo trata Genially; la plataforma no lo guarda.

Si no pulsas el botón, no se envía nada.

## 7. Quién recibe tus datos y transferencias

- El profesor (responsable) ve todo lo descrito en el apartado 2 sobre sus alumnos.
- El proveedor de alojamiento trata los datos por cuenta del profesor en {{hostingCountry}}. {{transferNote}}
- Los profesores pueden conectar un asistente de IA para gestionar el contenido de las lecciones. Recibe lecciones y archivos multimedia, **no** cuentas de alumnos, respuestas ni otros datos de alumnos.
- Solo se comunican datos a las autoridades cuando la ley lo exige.

## 8. Cuánto tiempo se conservan

Los datos se conservan **al menos un año**. Después, el profesor decide si los conserva o los elimina. La plataforma no elimina datos automáticamente. Los registros de sesión caducan a los 30 días. Los datos eliminados pueden permanecer en las copias de seguridad hasta que estas se renueven.

## 9. Tus derechos

Tienes derecho a acceder a tus datos, rectificarlos, suprimirlos, recibir una copia en formato portable, limitar u oponerte a su tratamiento, retirar tu consentimiento en cualquier momento (sin afectar a lo ya tratado) y presentar una reclamación ante tu autoridad de protección de datos (en España, la Agencia Española de Protección de Datos).

**Cómo:** contacta con el profesor ({{teacherContact}}). El profesor puede descargar un archivo con todos tus datos y eliminar tu cuenta con todos sus datos de forma definitiva, directamente en la plataforma. Recibirás respuesta en el plazo de un mes.

Residentes en California y otros estados de EE. UU.: no vendemos ni compartimos información personal con fines publicitarios y solo la usamos para prestar el servicio.

## 10. Seguridad

Las contraseñas y los tokens de sesión se guardan solo como hashes. Las conexiones usan HTTPS. La cookie de sesión no es accesible para scripts de la página. Los datos de los alumnos solo están disponibles para el alumno afectado y para los profesores de esta instalación.

## 11. Cambios y contacto

Si esta política cambia, la nueva versión se publicará aquí con una nueva fecha. Preguntas: {{teacherContact}}.

---

### Notas para el operador (no forman parte del texto publicado)

- Los marcadores se completan desde `.env` al compilar el cliente: `PLATFORM_NAME` se define aparte (véase `.env.example`); `CONTROLLER_NAME`, `CONTROLLER_CONTACT`, `HOST_NAME`, `HOSTING_COUNTRY`, `TRANSFER_NOTE` (por ejemplo «Los datos no salen de {{hostingCountry}}» o la garantía utilizada, como cláusulas contractuales tipo). La compilación avisa de los marcadores vacíos. La fecha de arriba se cambia a mano cuando cambia el texto.
- Este texto se preparó a partir de lo que hace el código. No es asesoramiento jurídico: conviene que lo revise un profesional antes de usarlo en un país concreto.
