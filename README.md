# Registro del Cementerio — Ayuntamiento

Aplicación web de gestión municipal para el cementerio de Jimena: registro de
difuntos, nichos y sectores, propietarios/familiares y recibos de pago.
Sustituye a la antigua aplicación creada con AppSheet, con datos migrados
desde el Excel original.

## Qué hace

Es un sistema interno para el personal del Ayuntamiento que permite:

- Buscar y consultar quién está enterrado en cada nicho, con su historial de
  familiares asociados.
- Ver de un vistazo la ocupación de cada sector del cementerio (plano visual
  con nichos ocupados, vacíos y reservados).
- Dar de alta y mantener actualizados los datos de propietarios/familiares
  responsables de cada nicho.
- Registrar y consultar los recibos de pago asociados a cada nicho y
  propietario.
- Controlar el acceso por roles, para que no todo el personal pueda borrar o
  modificar datos sensibles.

No es una app de cara al público: requiere iniciar sesión, y todos los datos
viven en una base de datos privada (Supabase), no en archivos locales.

## Tecnologías utilizadas

La aplicación es **100% estática**: no hay servidor propio ni proceso de
compilación (build). Es HTML, CSS y JavaScript "de toda la vida" que se
ejecuta directamente en el navegador y habla directamente con Supabase.

- **HTML5** — estructura de las dos páginas de la app (`login.html`, `index.html`).
- **CSS3** — hoja de estilos propia (`css/styles.css`), sin frameworks de CSS.
- **JavaScript** (ES2017+, sin transpilar ni empaquetar) — toda la lógica de
  la aplicación.
- **[Alpine.js](https://alpinejs.dev/)** — librería ligera (un único
  `<script>`, sin build tools) que añade reactividad al HTML: mostrar/ocultar
  paneles, listas que se repintan solas, formularios, etc. Se eligió en vez
  de React/Vue porque no añade complejidad de instalación ni de compilación,
  y el equipo que mantiene la app ya conocía HTML+JS simple.
- **[Supabase](https://supabase.com/)** como backend completo:
  - **Postgres** — la base de datos relacional (tablas, relaciones, triggers).
  - **Supabase Auth** — inicio de sesión por correo/contraseña.
  - **Row Level Security (RLS)** — las reglas de permisos por rol viven en la
    propia base de datos, no solo en el código de la app (ver más abajo).
  - **supabase-js** (cliente JS oficial, cargado desde CDN) — para hacer
    todas las consultas desde el navegador.

No hay ningún lenguaje de servidor (PHP, Node, Python...): toda la lógica de
negocio corre en el navegador del usuario, y la seguridad real la garantiza
Supabase mediante RLS, no el código JavaScript (que cualquiera podría leer
con las herramientas de desarrollador del navegador).

## Estructura del proyecto

```
├── login.html          Pantalla de inicio de sesión
├── index.html          App shell: menú lateral + todas las secciones
├── css/
│   └── styles.css       Sistema de diseño compartido por toda la app
└── js/
    ├── config.js         Claves de conexión a Supabase
    ├── auth.js           Helpers de sesión, perfil de usuario y logout
    ├── app.js             Menú lateral, navegación y panel principal
    ├── difuntos.js        Lógica de la sección Difuntos
    ├── sectores.js         Lógica de la sección Sectores
    ├── propietarios.js      Lógica de la sección Propietarios/Familiares
    ├── recibos.js            Lógica de la sección Recibos
    └── usuarios.js             Lógica de la sección Usuarios
```

Cada sección de la app es un componente Alpine independiente
(`x-data="difuntosSection()"`, etc.) que se monta dentro de `index.html` y
solo carga sus datos cuando el usuario entra en esa sección.

## Roles y permisos

Hay tres roles, gestionados en la tabla `profiles` y aplicados con RLS
directamente en la base de datos (no solo ocultando botones en el HTML):

| Rol         | Puede ver todo | Crear/editar/borrar datos | Crear/borrar sectores | Gestionar usuarios |
|-------------|:---:|:---:|:---:|:---:|
| `consulta`  | ✅ | ❌ | ❌ | ❌ |
| `avanzado`  | ✅ | ✅ | ❌ (solo editar) | ❌ |
| `admin`     | ✅ | ✅ | ✅ | ✅ |

Los usuarios nuevos se dan de alta desde el panel de Supabase
(Authentication → Users), nunca desde la app — ver la sección "Usuarios" más
abajo para el motivo.

## Secciones de la aplicación

### Panel (Dashboard)
Página de inicio tras el login. Muestra cifras clave en tiempo real: número
de difuntos registrados, nichos ocupados/vacíos y recibos pendientes.

### Sectores
Listado de los sectores del cementerio con el número de nichos y su
ocupación. Este listado se lee de una **vista de Postgres**
(`v_sector_resumen`) que ya trae los conteos calculados en la base de
datos — así, aunque el cementerio tenga miles de nichos y difuntos, la app
nunca necesita traerlos todos de golpe solo para contar cuántos hay
ocupados por sector (Supabase limita cada consulta a 1000 filas por
defecto, y antes esta sección chocaba con ese límite). Al abrir un sector
se puede:
- Editar sus datos generales (nombre, tipo, filas/columnas, plano, etc.).
- Ver una **cuadrícula visual** de sus nichos, coloreada según su estado
  (ocupado, vacío, reservado, o sin crear todavía), respetando el orden real
  de numeración del cementerio (por columnas, de abajo a arriba). Esta
  cuadrícula, y el listado de nichos que la acompaña, se cargan con una
  consulta acotada solo a los nichos de ese sector (con sus difuntos ya
  incluidos), nunca a todo el cementerio.
- Añadir, editar o eliminar nichos uno a uno, o generarlos automáticamente
  a partir de filas × columnas.

El estado "Ocupado"/"Vacío" de un nicho **no se edita a mano**: se calcula
automáticamente en la base de datos (mediante un trigger) contando si tiene
o no un difunto asignado. "Reservado" sigue siendo una decisión manual del
Ayuntamiento.

### Difuntos
Listado buscable y paginado de todas las personas registradas, con filtro
por sector. La ficha de cada difunto muestra sus datos (fechas, edad, causa,
nicho, población...) y permite:
- Editar sus datos o eliminarlo (según el rol).
- Ver y gestionar sus **familiares asociados**, vinculando a un propietario
  ya existente con un tipo de relación (hijo/a, nieto/a...).

### Propietarios / Familiares
Listado con nombre, apellidos, apodo, teléfono, población y número de
difuntos asociados. La ficha de cada propietario muestra el resto de sus
datos de contacto y, en espejo con la sección Difuntos, la lista de
**difuntos asociados** a esa persona.

### Recibos
Listado de recibos con su ubicación (sector/nicho), el propietario asociado
(con su DNI si lo tiene), mutua, fecha y número de documento, importe,
estado (pagado/pendiente/anulado) y observaciones. Al crear o editar un
recibo, el **sector y el nicho son obligatorios**; el propietario/familiar
es opcional.

### Usuarios (solo `admin`)
Listado de todas las personas con acceso a la app, con su rol actual.
Permite cambiar el nombre y el rol de cualquier usuario. **No permite crear
usuarios nuevos**: hacerlo requeriría exponer en el navegador una clave de
Supabase con privilegios totales (`service_role`), lo cual sería un riesgo
de seguridad grave. Por eso las altas se hacen desde el panel de Supabase, y
en cuanto se crean aparecen aquí automáticamente listas para asignarles rol.

## Puesta en marcha

### Desarrollo local

Copia `js/config.example.js` como `js/config.js` y rellena los dos valores
con los de tu proyecto Supabase (Project Settings → API). Este archivo real
está en `.gitignore`, así que nunca se sube al repositorio.

El proyecto no necesita `npm install` ni ningún paso de compilación para
probarlo en local: basta con abrir `login.html` directamente en el
navegador, o servir la carpeta con cualquier servidor estático simple
(`npx serve .`).

### Despliegue en Vercel con variables de entorno

Si tu proyecto está conectado a Vercel mediante su integración con GitHub,
**ten en cuenta que Vercel no lee las "Repository variables" de GitHub
Actions** — son dos sistemas independientes. Las variables de entorno de
Vercel se configuran aparte, en su propio panel.

1. En Vercel → tu proyecto → **Settings → Environment Variables**, añade:
   - `SBASE_URL` → la Project URL de Supabase
   - `SBASE_ANON_KEY` → la anon/public key de Supabase
2. El repositorio ya incluye `vercel.json` y `scripts/generate-config.js`:
   en cada despliegue, Vercel ejecuta ese script como *Build Command*, que
   genera `js/config.js` a partir de esas dos variables de entorno. No hace
   falta ningún framework ni build tradicional — es un script Node sin
   dependencias.
3. Si algún día cambias de Supabase (por ejemplo, pasas de un proyecto de
   pruebas a uno de producción), solo tienes que actualizar esas dos
   variables en Vercel y volver a desplegar — no hace falta tocar código.
