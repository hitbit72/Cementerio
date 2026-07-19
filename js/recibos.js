/* =====================================================================
   SECCIÓN RECIBOS
   Listado con búsqueda/paginación + ficha con formulario.
   Sector y Nicho son obligatorios; el Propietario/Familiar es opcional.
   ===================================================================== */

function recibosSection() {
  return {
    // ---------- Listado ----------
    rows: [],
    loading: true,
    search: '',
    searchDebounceId: null,
    sectorFiltro: '',
    estadoFiltro: '',
    sectores: [],
    page: 0,
    totalCount: 0,

    // ---------- Panel de detalle ----------
    drawerOpen: false,
    drawerMode: 'view', // 'view' | 'edit' | 'create'
    saving: false,
    formError: '',
    current: null,
    form: {},
    formSectorId: '',
    nichoOptions: [],

    // ---------- Autocompletado de propietario en el formulario ----------
    propSearch: '',
    propResults: [],
    propSelected: null,

    get canWrite() {
      const role = Alpine.store('session').profile?.role;
      return role === 'admin' || role === 'avanzado';
    },

    get totalPages() {
      return Math.max(1, Math.ceil(this.totalCount / PAGE_SIZE));
    },

    async init() {
      const { data: sectores } = await sb.from('sector').select('id, nombre').order('nombre');
      this.sectores = sectores || [];
      this.fetchRows();
    },

    onSearchInput() {
      clearTimeout(this.searchDebounceId);
      this.searchDebounceId = setTimeout(() => {
        this.page = 0;
        this.fetchRows();
      }, 350);
    },

    onFilterChange() {
      this.page = 0;
      this.fetchRows();
    },

    async fetchRows() {
      this.loading = true;
      try {
        let query = sb
          .from('recibos')
          .select(
            this.sectorFiltro
              ? '*, nichos!inner(numero_nicho, sector_id, sector:sector_id(nombre)), propietario:propietario_id(nombre, apellidos, dni)'
              : '*, nichos(numero_nicho, sector_id, sector:sector_id(nombre)), propietario:propietario_id(nombre, apellidos, dni)',
            { count: 'exact' }
          );

        if (this.sectorFiltro) {
          query = query.eq('nichos.sector_id', this.sectorFiltro);
        }
        if (this.estadoFiltro) {
          query = query.eq('estado', this.estadoFiltro);
        }

        const q = this.search.trim();
        if (q) {
          query = query.or(`expediente.ilike.%${q}%,docnum.ilike.%${q}%,referencia.ilike.%${q}%,entidad.ilike.%${q}%,mutua.ilike.%${q}%`);
        }

        const from = this.page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, count, error } = await query
          .order('fecha', { ascending: false })
          .range(from, to);

        if (error) throw error;
        this.rows = data || [];
        this.totalCount = count || 0;
      } catch (e) {
        console.error('Error cargando recibos:', e);
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
      return `${sectorNombre} Nº${row.nichos.numero_nicho}`;
    },

    propietarioLabel(row) {
      const p = row.propietario;
      if (!p) return '—';
      const nombreCompleto = `${p.nombre} ${p.apellidos || ''}`.trim();
      return p.dni ? `${nombreCompleto} (${p.dni})` : nombreCompleto;
    },

    fmtDate(value) {
      if (!value) return '—';
      const [y, m, d] = value.split('-');
      return `${d}/${m}/${y}`;
    },

    fmtImporte(value) {
      if (value === null || value === undefined) return '—';
      return Number(value).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    },

    // ---------- Abrir panel ----------

    openCreate() {
      this.drawerMode = 'create';
      this.current = null;
      this.form = {
        propietario_id: '', fecha: '', expediente: '', docnum: '', mutua: '',
        referencia: '', entidad: '', importe: '', nicho_id: '', fecha_pago: '',
        estado: 'Pendiente', observaciones: '',
      };
      this.formSectorId = '';
      this.nichoOptions = [];
      this.propSearch = '';
      this.propSelected = null;
      this.propResults = [];
      this.formError = '';
      this.drawerOpen = true;
    },

    async openDetail(row) {
      this.drawerMode = 'view';
      this.formError = '';
      this.drawerOpen = true;
      this.current = null;

      const { data, error } = await sb
        .from('recibos')
        .select('*, nichos(id, numero_nicho, sector_id, sector:sector_id(nombre)), propietario:propietario_id(id, nombre, apellidos, dni, telefono)')
        .eq('id', row.id)
        .single();

      if (error) {
        console.error('Error cargando el recibo:', error);
        this.formError = 'No se ha podido cargar el recibo.';
        return;
      }
      this.current = data;
    },

    async startEdit() {
      const r = this.current;
      this.form = {
        id: r.id,
        propietario_id: r.propietario_id || '',
        fecha: r.fecha || '',
        expediente: r.expediente || '',
        docnum: r.docnum || '',
        mutua: r.mutua || '',
        referencia: r.referencia || '',
        entidad: r.entidad || '',
        importe: r.importe ?? '',
        nicho_id: r.nicho_id || '',
        fecha_pago: r.fecha_pago || '',
        estado: r.estado || 'Pendiente',
        observaciones: r.observaciones || '',
      };
      this.formSectorId = r.nichos?.sector_id || '';
      if (this.formSectorId) await this.loadNichoOptions(this.formSectorId, r.nicho_id);

      if (r.propietario) {
        this.propSelected = r.propietario;
        this.propSearch = `${r.propietario.nombre} ${r.propietario.apellidos || ''}`.trim();
      } else {
        this.propSelected = null;
        this.propSearch = '';
      }
      this.propResults = [];

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

    // ---------- Autocompletado de propietario ----------

    onPropSearchInput() {
      this.propSelected = null;
      this.form.propietario_id = '';
      clearTimeout(this._propDebounce);
      this._propDebounce = setTimeout(async () => {
        const q = this.propSearch.trim();
        if (!q) { this.propResults = []; return; }
        const { data, error } = await sb
          .from('propietario')
          .select('id, nombre, apellidos, dni')
          .or(`nombre.ilike.%${q}%,apellidos.ilike.%${q}%,dni.ilike.%${q}%`)
          .limit(8);
        if (error) { console.error(error); return; }
        this.propResults = data || [];
      }, 300);
    },

    pickPropietario(p) {
      this.propSelected = p;
      this.form.propietario_id = p.id;
      this.propSearch = `${p.nombre} ${p.apellidos || ''}`.trim() + (p.dni ? ` (${p.dni})` : '');
      this.propResults = [];
    },

    clearPropietario() {
      this.propSelected = null;
      this.form.propietario_id = '';
      this.propSearch = '';
      this.propResults = [];
    },

    // ---------- Guardar / borrar ----------

    async saveForm() {
      this.formError = '';
      if (!this.formSectorId) {
        this.formError = 'El sector es obligatorio.';
        return;
      }
      if (!this.form.nicho_id) {
        this.formError = 'El nicho es obligatorio.';
        return;
      }

      const payload = {
        propietario_id: this.form.propietario_id || null,
        fecha: this.form.fecha || null,
        expediente: this.form.expediente || null,
        docnum: this.form.docnum || null,
        mutua: this.form.mutua || null,
        referencia: this.form.referencia || null,
        entidad: this.form.entidad || null,
        importe: this.form.importe === '' ? 0 : parseFloat(this.form.importe),
        nicho_id: this.form.nicho_id,
        fecha_pago: this.form.fecha_pago || null,
        estado: this.form.estado || 'Pendiente',
        observaciones: this.form.observaciones || null,
      };

      this.saving = true;
      try {
        if (this.drawerMode === 'create') {
          const { error } = await sb.from('recibos').insert(payload);
          if (error) throw error;
        } else {
          const { error } = await sb.from('recibos').update(payload).eq('id', this.form.id);
          if (error) throw error;
        }
        this.closeDrawer();
        this.fetchRows();
      } catch (e) {
        console.error('Error guardando recibo:', e);
        this.formError = 'No se ha podido guardar. Comprueba los datos e inténtalo de nuevo.';
      } finally {
        this.saving = false;
      }
    },

    async deleteCurrent() {
      if (!this.current) return;
      if (!confirm('¿Seguro que quieres eliminar este recibo? Esta acción no se puede deshacer.')) return;

      try {
        const { error } = await sb.from('recibos').delete().eq('id', this.current.id);
        if (error) throw error;
        this.closeDrawer();
        this.fetchRows();
      } catch (e) {
        console.error('Error eliminando recibo:', e);
        alert('No se ha podido eliminar el recibo.');
      }
    },
  };
}

document.addEventListener('alpine:init', () => {
  Alpine.data('recibosSection', recibosSection);
});
