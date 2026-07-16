/* =====================================================================
   SECCIÓN DIFUNTOS
   Listado con búsqueda/paginación + ficha de detalle con edición
   y gestión de familiares (tabla `relacion`).
   ===================================================================== */

const DIFUNTO_PAGE_SIZE = 25;

function difuntosSection() {
  return {
    // ---------- Listado ----------
    rows: [],
    loading: true,
    search: '',
    searchDebounceId: null,
    sectorFiltro: '',
    sectores: [],
    poblaciones: [],
    page: 0,
    totalCount: 0,

    // ---------- Panel de detalle ----------
    drawerOpen: false,
    drawerMode: 'view', // 'view' | 'edit' | 'create'
    saving: false,
    formError: '',
    current: null,      // registro completo tal como viene de Supabase (modo vista)
    form: {},            // datos editables
    formSectorId: '',     // sector elegido en el formulario (para filtrar nichos)
    nichoOptions: [],

    // ---------- Familiares ----------
    familiares: [],
    familiaresLoading: false,
    famSearch: '',
    famResults: [],
    famSelected: null,
    famRelacion: '',
    famSaving: false,

    get canWrite() {
      const role = Alpine.store('session').profile?.role;
      return role === 'admin' || role === 'avanzado';
    },

    get totalPages() {
      return Math.max(1, Math.ceil(this.totalCount / DIFUNTO_PAGE_SIZE));
    },

    async init() {
      const [{ data: sectores }, { data: poblaciones }] = await Promise.all([
        sb.from('sector').select('id, nombre').order('nombre'),
        sb.from('poblacion').select('id, nombre').order('nombre'),
      ]);
      this.sectores = sectores || [];
      this.poblaciones = poblaciones || [];
      this.fetchRows();
    },

    onSearchInput() {
      clearTimeout(this.searchDebounceId);
      this.searchDebounceId = setTimeout(() => {
        this.page = 0;
        this.fetchRows();
      }, 350);
    },

    onSectorFilterChange() {
      this.page = 0;
      this.fetchRows();
    },

    async fetchRows() {
      this.loading = true;
      try {
        let query = sb
          .from('difunto')
          .select(
            this.sectorFiltro
              ? '*, nichos!inner(numero_nicho, sector_id, sector:sector_id(nombre)), poblacion:poblacion_id(nombre)'
              : '*, nichos(numero_nicho, sector_id, sector:sector_id(nombre)), poblacion:poblacion_id(nombre)',
            { count: 'exact' }
          );

        if (this.sectorFiltro) {
          query = query.eq('nichos.sector_id', this.sectorFiltro);
        }

        const q = this.search.trim();
        if (q) {
          query = query.or(`nombre.ilike.%${q}%,apellidos.ilike.%${q}%,num_registro.ilike.%${q}%`);
        }

        const from = this.page * DIFUNTO_PAGE_SIZE;
        const to = from + DIFUNTO_PAGE_SIZE - 1;

        const { data, count, error } = await query
          .order('apellidos', { ascending: true })
          .order('nombre', { ascending: true })
          .range(from, to);

        if (error) throw error;
        this.rows = data || [];
        this.totalCount = count || 0;
      } catch (e) {
        console.error('Error cargando difuntos:', e);
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

    ubicacion(row) {
      if (!row.nichos) return '—';
      const sectorNombre = row.nichos.sector?.nombre || '';
      return `${sectorNombre} · Nº ${row.nichos.numero_nicho}`;
    },

    fmtDate(value) {
      if (!value) return '—';
      const [y, m, d] = value.split('-');
      return `${d}/${m}/${y}`;
    },

    // ---------- Abrir panel ----------

    openCreate() {
      this.drawerMode = 'create';
      this.current = null;
      this.form = {
        num_registro: '', nombre: '', apellidos: '', fnacido: '', ffallecido: '',
        causa: '', direccion: '', poblacion_id: '', nicho_id: '', observaciones: '',
      };
      this.formSectorId = '';
      this.nichoOptions = [];
      this.familiares = [];
      this.formError = '';
      this.drawerOpen = true;
    },

    async openDetail(row) {
      this.drawerMode = 'view';
      this.formError = '';
      this.drawerOpen = true;
      this.current = null;

      const { data, error } = await sb
        .from('difunto')
        .select('*, nichos(id, numero_nicho, sector_id, sector:sector_id(nombre)), poblacion:poblacion_id(nombre), musuario_profile:musuario(nombre, email)')
        .eq('id', row.id)
        .single();

      if (error) {
        console.error('Error cargando la ficha:', error);
        this.formError = 'No se ha podido cargar la ficha.';
        return;
      }
      this.current = data;
      this.loadFamiliares(data.id);
    },

    startEdit() {
      const d = this.current;
      this.form = {
        id: d.id,
        num_registro: d.num_registro || '',
        nombre: d.nombre || '',
        apellidos: d.apellidos || '',
        fnacido: d.fnacido || '',
        ffallecido: d.ffallecido || '',
        causa: d.causa || '',
        direccion: d.direccion || '',
        poblacion_id: d.poblacion_id || '',
        nicho_id: d.nicho_id || '',
        observaciones: d.observaciones || '',
      };
      this.formSectorId = d.nichos?.sector_id || '';
      if (this.formSectorId) this.loadNichoOptions(this.formSectorId, d.nicho_id);
      this.drawerMode = 'edit';
      this.formError = '';
    },

    cancelEdit() {
      if (this.drawerMode === 'create') {
        this.closeDrawer();
      } else {
        this.drawerMode = 'view';
      }
    },

    closeDrawer() {
      this.drawerOpen = false;
      this.current = null;
      this.familiares = [];
    },

    async onSectorChangeInForm() {
      this.form.nicho_id = '';
      if (!this.formSectorId) { this.nichoOptions = []; return; }
      await this.loadNichoOptions(this.formSectorId);
    },

    async loadNichoOptions(sectorId, keepSelectedId) {
      const { data, error } = await sb
        .from('nichos')
        .select('id, numero_nicho, estado')
        .eq('sector_id', sectorId)
        .order('numero_nicho');
      if (error) { console.error(error); this.nichoOptions = []; return; }
      this.nichoOptions = data || [];
      if (keepSelectedId) this.form.nicho_id = keepSelectedId;
    },

    // ---------- Guardar / borrar ----------

    async saveForm() {
      this.formError = '';
      if (!this.form.nombre?.trim()) {
        this.formError = 'El nombre es obligatorio.';
        return;
      }

      const payload = {
        num_registro: this.form.num_registro || null,
        nombre: this.form.nombre.trim(),
        apellidos: this.form.apellidos?.trim() || null,
        fnacido: this.form.fnacido || null,
        ffallecido: this.form.ffallecido || null,
        causa: this.form.causa || null,
        direccion: this.form.direccion || null,
        poblacion_id: this.form.poblacion_id || null,
        nicho_id: this.form.nicho_id || null,
        observaciones: this.form.observaciones || null,
      };

      this.saving = true;
      try {
        if (this.drawerMode === 'create') {
          const { error } = await sb.from('difunto').insert(payload);
          if (error) throw error;
        } else {
          const { error } = await sb.from('difunto').update(payload).eq('id', this.form.id);
          if (error) throw error;
        }
        this.closeDrawer();
        this.fetchRows();
      } catch (e) {
        console.error('Error guardando difunto:', e);
        this.formError = 'No se ha podido guardar. Comprueba los datos e inténtalo de nuevo.';
      } finally {
        this.saving = false;
      }
    },

    async deleteCurrent() {
      if (!this.current) return;
      const nombreCompleto = `${this.current.nombre} ${this.current.apellidos || ''}`.trim();
      if (!confirm(`¿Seguro que quieres eliminar el registro de "${nombreCompleto}"? Esta acción no se puede deshacer.`)) return;

      try {
        const { error } = await sb.from('difunto').delete().eq('id', this.current.id);
        if (error) throw error;
        this.closeDrawer();
        this.fetchRows();
      } catch (e) {
        console.error('Error eliminando difunto:', e);
        alert('No se ha podido eliminar el registro.');
      }
    },

    // ---------- Familiares ----------

    async loadFamiliares(difuntoId) {
      this.familiaresLoading = true;
      const { data, error } = await sb
        .from('relacion')
        .select('id, relacion, observaciones, propietario:familiar_id(id, nombre, apellidos, dni, telefono)')
        .eq('difunto_id', difuntoId);
      this.familiaresLoading = false;
      if (error) { console.error(error); this.familiares = []; return; }
      this.familiares = data || [];
    },

    onFamSearchInput() {
      clearTimeout(this._famDebounce);
      this._famDebounce = setTimeout(async () => {
        const q = this.famSearch.trim();
        if (!q) { this.famResults = []; return; }
        const { data, error } = await sb
          .from('propietario')
          .select('id, nombre, apellidos, dni')
          .or(`nombre.ilike.%${q}%,apellidos.ilike.%${q}%,dni.ilike.%${q}%`)
          .limit(8);
        if (error) { console.error(error); return; }
        this.famResults = data || [];
      }, 300);
    },

    pickFamiliar(p) {
      this.famSelected = p;
      this.famSearch = `${p.nombre} ${p.apellidos || ''}`.trim();
      this.famResults = [];
    },

    async addFamiliar() {
      if (!this.famSelected) return;
      this.famSaving = true;
      try {
        const { error } = await sb.from('relacion').insert({
          difunto_id: this.current.id,
          familiar_id: this.famSelected.id,
          relacion: this.famRelacion || null,
        });
        if (error) throw error;
        this.famSearch = '';
        this.famSelected = null;
        this.famRelacion = '';
        this.famResults = [];
        this.loadFamiliares(this.current.id);
      } catch (e) {
        console.error('Error añadiendo familiar:', e);
        alert('No se ha podido añadir. ¿Quizá ya existe esa relación?');
      } finally {
        this.famSaving = false;
      }
    },

    async removeFamiliar(rel) {
      if (!confirm(`¿Quitar a ${rel.propietario?.nombre || 'esta persona'} como familiar de este difunto?`)) return;
      const { error } = await sb.from('relacion').delete().eq('id', rel.id);
      if (error) { console.error(error); alert('No se ha podido quitar la relación.'); return; }
      this.loadFamiliares(this.current.id);
    },
  };
}

document.addEventListener('alpine:init', () => {
  Alpine.data('difuntosSection', difuntosSection);
});
