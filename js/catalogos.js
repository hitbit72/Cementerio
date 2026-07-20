/* =====================================================================
   CATÁLOGOS PEQUEÑOS (Población, Provincia): "buscar o crear"
   Estas tablas se cargan enteras al entrar en Difuntos/Propietarios (son
   catálogos pequeños, muy por debajo del límite de 1000 filas de
   Supabase), así que el filtrado mientras se escribe se hace en el propio
   navegador, sin ir a la base de datos en cada pulsación.

   Al guardar un formulario, si el texto escrito no coincide (sin distinguir
   mayúsculas) con ningún registro ya cargado, se crea uno nuevo en la
   tabla correspondiente y se reutiliza su id.
   ===================================================================== */

async function resolveCatalogId(tableName, listRef, inputText) {
  const nombre = (inputText || '').trim();
  if (!nombre) return null;

  const existente = listRef.find(r => r.nombre.trim().toLowerCase() === nombre.toLowerCase());
  if (existente) return existente.id;

  try {
    const { data, error } = await sb.from(tableName).insert({ nombre }).select().single();
    if (error) throw error;
    listRef.push(data);
    return data.id;
  } catch (e) {
    // Alguien pudo crear el mismo registro justo a la vez (choque con la
    // restricción de nombre único): lo buscamos y lo reutilizamos en vez
    // de fallar.
    if (e.code === '23505') {
      const { data: encontrado } = await sb
        .from(tableName)
        .select('id, nombre')
        .ilike('nombre', nombre)
        .limit(1)
        .maybeSingle();
      if (encontrado) {
        listRef.push(encontrado);
        return encontrado.id;
      }
    }
    throw e;
  }
}
