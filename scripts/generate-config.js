/* =====================================================================
   Genera js/config.js a partir de variables de entorno, en tiempo de
   despliegue (Vercel). No requiere ninguna dependencia npm.

   Se ejecuta automáticamente como "Build Command" (ver vercel.json).
   ===================================================================== */

const fs = require('fs');
const path = require('path');

const url = process.env.SBASE_URL;
const anonKey = process.env.SBASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    'Faltan variables de entorno: SBASE_URL y/o SBASE_ANON_KEY.\n' +
    'Añádelas en Vercel → Project Settings → Environment Variables.'
  );
  process.exit(1);
}

const contenido = `/* =====================================================================
   Generado automáticamente en el despliegue por scripts/generate-config.js
   a partir de las variables de entorno SBASE_URL / SBASE_ANON_KEY de Vercel.
   NO EDITAR A MANO: los cambios se perderán en el próximo despliegue.
   ===================================================================== */

const SUPABASE_URL = ${JSON.stringify(url)};
const SUPABASE_ANON_KEY = ${JSON.stringify(anonKey)};

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
`;

const destino = path.join(__dirname, '..', 'js', 'config.js');
fs.writeFileSync(destino, contenido);
console.log(`js/config.js generado correctamente a partir de variables de entorno.`);
