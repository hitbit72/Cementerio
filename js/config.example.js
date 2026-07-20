/* ============================================================================
   CONFIGURACIÓN DE SUPABASE
   Rellena estos dos valores con los de tu proyecto:
   Panel de Supabase → Project Settings → API
     - Project URL           → SUPABASE_URL
     - anon / public API key → SUPABASE_ANON_KEY
   La "anon key" es pública y segura de exponer en el navegador: el acceso
   real a los datos lo controlan las políticas RLS del esquema, no esta clave.
   ============================================================================= */

const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'TU-ANON-KEY-PUBLICA';

// Cliente único compartido por toda la app (login.html e index.html)
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
