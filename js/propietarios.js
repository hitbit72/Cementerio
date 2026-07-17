/* =====================================================================
   SECCIÓN PROPIETARIOS / FAMILIARES
   Listado con búsqueda/paginación + ficha de detalle con edición
   y gestión de los difuntos asociados (tabla `relacion`, vista inversa
   de lo que ya hace difuntos.js).
   ===================================================================== */

const PROPIETARIO_PAGE_SIZE = 25;

function propietariosSection() {
  return {
    // ---------- Listado ----------
    rows: [],
    loading: true,
    search: '',
    searchDebounceId: null,
    poblaciones: [],
    provincias: [],
    relacionCounts: {}, // { propietario_id: numeroDeDifuntos }
    page: 0,
    totalCount: 0,

    // ---------- Panel de detalle ----------
    drawerOpen: false,
    drawerMode: 'view', // 'view' | 'edit' | 'create'
    saving: false,
    formError: '',
    current: null,
    form: {},

    // ---------- Difuntos asociados ----------
    difuntos: [],
    difuntosLoading: false,
    difSearch: '',
    difResults: [],
    difSelected: null,
    difRelacion: '',
    difSaving: false,

    get canWrite() {
      const role = Alpine.store('session').profile?.role;
      return role === 'admin' || role === 'avanzado';
    },

    get totalPages() {
      return Math.max(1, Math.ceil(this.totalCount / PROPIETARIO_PAGE_SIZE));
    },

    async init() {
      const [{ data: poblaciones }, { data: provincias }] = await Promise.all([
        sb.from('poblacion').select('id, nombre').order('nombre'),
        sb.from('provincia').select('id, nombre').order('nombre'),
      ]);
      this.poblaciones = poblaciones || [];
      this.provincias = provincias || [];
      await this.fetchRelacionCounts();
      this.fetchRows();
    },

    async fetchRelacionCounts() {
      const { data, error } = await sb.from('relacion').select('familiar_id');
      if (error) { console.error(error); return; }
      const counts = {};
      (data || []).forEach(r => { counts[r.familiar_id] = (counts[r.familiar_id] || 0) + 1; });
      this.relacionCounts = counts;
    },

    countFor(propietarioId) {
      return this.relacionCounts[propietarioId] || 0;
    },

    onSearchInput() {
      clearTimeout(this.searchDebounceId);
      this.searchDebounceId = setTimeout(() => {
        this.page = 0;
        this.fetchRows();
      }, 450);
    },

    async fetchRows() {
      this.loading = true;
      try {
        let query = sb
          .from('propietario')
          .select('*, poblacion:poblacion_id(nombre)', { count: 'exact' });

        const q = this.search.trim();
        if (q) {
          query = query.or(`nombre.ilike.%${q}%,apellidos.ilike.%${q}%,mote.ilike.%${q}%,dni.ilike.%${q}%,telefono.ilike.%${q}%`);
        }

        const from = this.page * PROPIETARIO_PAGE_SIZE;
        const to = from + PROPIETARIO_PAGE_SIZE - 1;

        const { data, count, error } = await query
          .order('apellidos', { ascending: true })
          .order('nombre', { ascending: true })
          .range(from, to);

        if (error) throw error;
        this.rows = data || [];
        this.totalCount = count || 0;
      } catch (e) {
        console.error('Error cargando propietarios:', e);
        this.rows = [];
      } finally {
        this.loading = false;
      }
    },

    nextPage() {
      if (this.page + 1 < this.totalPages) { this.page++; this.fetchRows(); }
    },
    prevPage() {
      if (this.page > 0) { this.page--; this.fetchRows(); }
    },

    // ---------- Abrir panel ----------

    openCreate() {
      this.drawerMode = 'create';
      this.current = null;
      this.form = {
        nombre: '', apellidos: '', mote: '', dni: '', telefono: '',
        direccion: '', poblacion_id: '', provincia_id: '', cp: '', email: '', observaciones: '',
      };
      this.difuntos = [];
      this.formError = '';
      this.drawerOpen = true;
    },

    async openDetail(row) {
      this.drawerMode = 'view';
      this.formError = '';
      this.drawerOpen = true;
      this.current = null;

      const { data, error } = await sb
        .from('propietario')
        .select('*, poblacion:poblacion_id(nombre), provincia:provincia_id(nombre)')
        .eq('id', row.id)
        .single();

      if (error) {
        console.error('Error cargando la ficha:', error);
        this.formError = 'No se ha podido cargar la ficha.';
        return;
      }
      this.current = data;
      this.loadDifuntos(data.id);
    },

    startEdit() {
      const p = this.current;
      this.form = {
        id: p.id,
        nombre: p.nombre || '', apellidos: p.apellidos || '', mote: p.mote || '',
        dni: p.dni || '', telefono: p.telefono || '', direccion: p.direccion || '',
        poblacion_id: p.poblacion_id || '', provincia_id: p.provincia_id || '',
        cp: p.cp || '', email: p.email || '', observaciones: p.observaciones || '',
      };
      this.drawerMode = 'edit';
      this.formError = '';
    },

    cancelEdit() {
      if (this.drawerMode === 'create') this.closeDrawer();
      else this.drawerMode = 'view';
    },

    closeDrawer() {
      this.drawerOpen = false;
      this.current = null;
      this.difuntos = [];
    },

    // ---------- Guardar / borrar ----------

    async saveForm() {
      this.formError = '';
      if (!this.form.nombre?.trim()) {
        this.formError = 'El nombre es obligatorio.';
        return;
      }

      const payload = {
        nombre: this.form.nombre.trim(),
        apellidos: this.form.apellidos?.trim() || null,
        mote: this.form.mote || null,
        dni: this.form.dni || null,
        telefono: this.form.telefono || null,
        direccion: this.form.direccion || null,
        poblacion_id: this.form.poblacion_id || null,
        provincia_id: this.form.provincia_id || null,
        cp: this.form.cp || null,
        email: this.form.email || null,
        observaciones: this.form.observaciones || null,
      };

      this.saving = true;
      try {
        if (this.drawerMode === 'create') {
          const { error } = await sb.from('propietario').insert(payload);
          if (error) throw error;
        } else {
          const { error } = await sb.from('propietario').update(payload).eq('id', this.form.id);
          if (error) throw error;
        }
        this.closeDrawer();
        this.fetchRows();
      } catch (e) {
        console.error('Error guardando propietario:', e);
        this.formError = 'No se ha podido guardar. Comprueba los datos e inténtalo de nuevo.';
      } finally {
        this.saving = false;
      }
    },

    async deleteCurrent() {
      if (!this.current) return;
      const nombreCompleto = `${this.current.nombre} ${this.current.apellidos || ''}`.trim();
      if (!confirm(`¿Seguro que quieres eliminar a "${nombreCompleto}"? Esta acción no se puede deshacer.`)) return;

      try {
        const { error } = await sb.from('propietario').delete().eq('id', this.current.id);
        if (error) throw error;
        this.closeDrawer();
        this.fetchRelacionCounts();
        this.fetchRows();
      } catch (e) {
        console.error('Error eliminando propietario:', e);
        if (e.code === '23503') {
          alert('No se puede eliminar: tiene difuntos o recibos asociados. Quítalos primero.');
        } else {
          alert('No se ha podido eliminar el registro.');
        }
      }
    },

    // ---------- Difuntos asociados ----------

    async loadDifuntos(propietarioId) {
      this.difuntosLoading = true;
      const { data, error } = await sb
        .from('relacion')
        .select('id, relacion, observaciones, difunto:difunto_id(id, nombre, apellidos, num_registro)')
        .eq('familiar_id', propietarioId);
      this.difuntosLoading = false;
      if (error) { console.error(error); this.difuntos = []; return; }
      this.difuntos = data || [];
    },

    onDifSearchInput() {
      clearTimeout(this._difDebounce);
      this._difDebounce = setTimeout(async () => {
        const q = this.difSearch.trim();
        if (!q) { this.difResults = []; return; }
        const { data, error } = await sb
          .from('difunto')
          .select('id, nombre, apellidos, num_registro')
          .or(`nombre.ilike.%${q}%,apellidos.ilike.%${q}%,num_registro.ilike.%${q}%`)
          .limit(8);
        if (error) { console.error(error); return; }
        this.difResults = data || [];
      }, 300);
    },

    pickDifunto(d) {
      this.difSelected = d;
      this.difSearch = `${d.nombre} ${d.apellidos || ''}`.trim();
      this.difResults = [];
    },

    async addDifunto() {
      if (!this.difSelected) return;
      this.difSaving = true;
      try {
        const { error } = await sb.from('relacion').insert({
          difunto_id: this.difSelected.id,
          familiar_id: this.current.id,
          relacion: this.difRelacion || null,
        });
        if (error) throw error;
        this.difSearch = '';
        this.difSelected = null;
        this.difRelacion = '';
        this.difResults = [];
        this.loadDifuntos(this.current.id);
        this.fetchRelacionCounts();
      } catch (e) {
        console.error('Error añadiendo difunto:', e);
        alert('No se ha podido añadir. ¿Quizá ya existe esa relación?');
      } finally {
        this.difSaving = false;
      }
    },

    async removeDifunto(rel) {
      if (!confirm(`¿Quitar a ${rel.difunto?.nombre || 'este difunto'} de los asociados a esta persona?`)) return;
      const { error } = await sb.from('relacion').delete().eq('id', rel.id);
      if (error) { console.error(error); alert('No se ha podido quitar la relación.'); return; }
      this.loadDifuntos(this.current.id);
      this.fetchRelacionCounts();
    },
  };
}

document.addEventListener('alpine:init', () => {
  Alpine.data('propietariosSection', propietariosSection);
});
