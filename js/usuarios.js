/* =====================================================================
   SECCIÓN USUARIOS (solo 'admin')
   Gestiona los perfiles (public.profiles) ya existentes: nombre y rol.
   No crea usuarios nuevos: eso requiere la service_role key de Supabase,
   que nunca debe exponerse en código de cliente/navegador. Los usuarios
   nuevos se dan de alta desde el propio panel de Supabase (Authentication
   > Users), y automáticamente aparecen aquí listos para asignarles rol.
   ===================================================================== */

function usuariosSection() {
  return {
    rows: [],
    loading: true,
    search: '',
    myId: null,

    drawerOpen: false,
    saving: false,
    formError: '',
    current: null,
    form: {},

    get isAdmin() {
      return Alpine.store('session').profile?.role === 'admin';
    },

    get filteredRows() {
      const q = this.search.trim().toLowerCase();
      if (!q) return this.rows;
      return this.rows.filter(r =>
        (r.email || '').toLowerCase().includes(q) ||
        (r.nombre || '').toLowerCase().includes(q)
      );
    },

    async init() {
      const { data: { session } } = await sb.auth.getSession();
      this.myId = session?.user?.id || null;
      if (!this.isAdmin) { this.loading = false; return; }
      this.fetchRows();
    },

    async fetchRows() {
      this.loading = true;
      const { data, error } = await sb
        .from('profiles')
        .select('id, email, nombre, role, created_at')
        .order('email');
      this.loading = false;
      if (error) { console.error('Error cargando usuarios:', error); return; }
      this.rows = data || [];
    },

    roleLabel(role) {
      return { admin: 'Administrador', avanzado: 'Avanzado', consulta: 'Consulta' }[role] || role;
    },

    fmtDate(value) {
      if (!value) return '—';
      return new Date(value).toLocaleDateString('es-ES');
    },

    openEdit(row) {
      this.current = row;
      this.form = { id: row.id, nombre: row.nombre || '', role: row.role };
      this.formError = '';
      this.drawerOpen = true;
    },

    closeDrawer() {
      this.drawerOpen = false;
      this.current = null;
    },

    async saveForm() {
      this.formError = '';

      // Salvaguarda: si te quitas a ti mismo el rol admin, pierdes acceso a esta
      // sección de inmediato. Se permite (quizá es intencional), pero se avisa.
      if (this.current.id === this.myId && this.form.role !== 'admin') {
        const ok = confirm('Vas a quitarte a ti mismo el rol de administrador. Perderás acceso a esta sección. ¿Continuar?');
        if (!ok) return;
      }

      this.saving = true;
      try {
        const { error } = await sb
          .from('profiles')
          .update({ nombre: this.form.nombre || null, role: this.form.role })
          .eq('id', this.form.id);
        if (error) throw error;

        await this.fetchRows();

        // Si me edité a mí mismo, avisa al resto de la app (menú lateral,
        // permisos de escritura en otras secciones, etc.) para que refresque
        // su copia del perfil.
        if (this.current.id === this.myId) {
          window.dispatchEvent(new CustomEvent('own-profile-updated'));
        }

        this.closeDrawer();
      } catch (e) {
        console.error('Error guardando usuario:', e);
        this.formError = 'No se ha podido guardar el cambio.';
      } finally {
        this.saving = false;
      }
    },
  };
}

document.addEventListener('alpine:init', () => {
  Alpine.data('usuariosSection', usuariosSection);
});
