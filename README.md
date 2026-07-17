# Registro del Cementerio — Ayuntamiento de Jimena

App web estática (HTML + JS + Alpine.js) conectada directamente a Supabase.
Sin build, sin backend propio: todo el acceso a datos pasa por Supabase
(Auth + RLS), así que puedes alojarla en cualquier hosting estático.

## 1. Configurar Supabase

Edita `js/config.js` y pon tus valores reales
(Supabase → Project Settings → API):

```js
const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'TU-ANON-KEY-PUBLICA';
```

La `anon key` es pública a propósito: la seguridad real la dan las políticas
RLS del esquema (`profiles.role`), no esta clave.

## 2. Crear usuarios

De momento no hay pantalla de "crear cuenta" (app interna, no autoregistro
público). Para dar de alta a alguien:

1. Supabase → Authentication → Users → **Add user** (con email + contraseña).
2. Se le crea automáticamente una fila en `profiles` con rol `consulta`
   (por el trigger `on_auth_user_created`).
3. Para ascenderlo a `admin`, en el SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'persona@ejemplo.com';
   ```

## 3. Probar en local

No hace falta servidor: puedes abrir `login.html` directamente en el
navegador, o servir la carpeta con cualquier servidor estático simple, p.ej.:

```bash
npx serve .
```

## 4. Desplegar (hosting estático)

Cualquiera de estas opciones sirve, sin configuración especial porque no hay
build step:

- **Netlify**: arrastra la carpeta a app.netlify.com/drop, o conéctala a un
  repo de Git y despliega directo (Build command: vacío / Publish directory: `.`).
- **Vercel**: `vercel deploy` desde esta carpeta, o importa el repo desde el
  dashboard (Framework preset: "Other").
- **GitHub Pages**: sube esta carpeta a un repo y activa Pages apuntando a
  la rama/carpeta raíz.

Importante: en Supabase → Authentication → URL Configuration, añade la URL
final donde publiques la app (ej. `https://tu-app.netlify.app`) a la lista de
"Site URL" / "Redirect URLs" si en el futuro añades login social o enlaces
de recuperación de contraseña.

## 5. Estructura del proyecto

```
├── login.html          Pantalla de inicio de sesión
├── index.html          App shell: menú lateral, panel, secciones
├── css/styles.css       Sistema de diseño compartido
└── js/
    ├── config.js        Claves de Supabase (EDITAR)
    ├── auth.js           Helpers de sesión/perfil/logout
    └── app.js            Lógica del menú y estadísticas del panel
```

## 6. Qué falta por construir

El panel lateral ya tiene los enlaces a **Sectores y nichos**, **Difuntos**,
**Propietarios**, **Recibos** y (solo para `admin`) **Usuarios** — de momento
muestran un aviso de "pendiente de construir". Estas son las próximas
pantallas a implementar, sección a sección.
