/* =====================================================================
   HELPERS DE AUTENTICACIÓN
   Funciones compartidas entre login.html e index.html.
   ===================================================================== */

// Comprueba que hay sesión activa; si no, redirige a login.
// Devuelve la sesión si existe.
async function requireSession() {
  const { data: { session }, error } = await sb.auth.getSession();
  if (error) console.error('Error comprobando sesión:', error);
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

// Trae el perfil (rol, nombre) del usuario autenticado desde public.profiles
async function getProfile(userId) {
  const { data, error } = await sb
    .from('profiles')
    .select('id, email, nombre, role')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error cargando el perfil:', error);
    return null;
  }
  return data;
}

async function signOut() {
  await sb.auth.signOut();
  window.location.href = 'login.html';
}
