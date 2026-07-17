/* =====================================================================
   SECCIÓN SECTORES
   Listado de sectores + ficha de detalle con gestión de sus nichos.
   Al ser un volumen de datos pequeño/medio (sectores y nichos), se carga
   todo una vez al entrar y se filtra/agrupa en el cliente — evita ir a
   buscar los nichos cada vez que se abre un sector.
   ===================================================================== */

function sectoresSection() {
  return {
    // ---------- Datos ----------
    sectors: [],
    nichosAll: [],
    difuntosAll: [],
    loading: true,
    search: '',

    // ---------- Drawer de sector ----------
    drawerOpen: false,
    drawerMode: 'view', // 'view' | 'edit' | 'create'
    saving: false,
    formError: '',
    current: null,
    form: {},

    // ---------- Formulario de nicho (dentro del drawer) ----------
    nichoFormOpen: false,
    nichoFormMode: 'create',
    nichoForm: {},
    nichoFormOcupado: false,
    nichoFormError: '',
    nichoSaving: false,
    generating: false,

    get canWrite() {
      const role = Alpine.store('session').profile?.role;
      return role === 'admin' || role === 'avanzado';
    },
    get canManageSector() {
      return Alpine.store('session').profile?.role === 'admin';
    },

    get filteredSectors() {
      const q = this.search.trim().toLowerCase();
      if (!q) return this.sectors;
      return this.sectors.filter(s =>
        (s.nombre || '').toLowerCase().includes(q) ||
        (s.situacion || '').toLowerCase().includes(q)
      );
    },

    get nichosForCurrent() {
      if (!this.current) return [];
      return this.nichosAll
        .filter(n => n.sector_id === this.current.id)
        .sort((a, b) => (a.numero_nicho || 0) - (b.numero_nicho || 0));
    },

    async init() {
      await Promise.all([this.fetchSectors(), this.fetchNichos(), this.fetchDifuntos()]);
      this.loading = false;
    },

    async fetchSectors() {
      const { data, error } = await sb.from('sector').select('*').order('orden').order('nombre');
      if (error) { console.error(error); return; }
      this.sectors = data || [];
    },

    async fetchNichos() {
      const { data, error } = await sb.from('nichos').select('id, numero_nicho, sector_id, estado, observaciones');
      if (error) { console.error(error); return; }
      this.nichosAll = data || [];
    },

    async fetchDifuntos() {
      const { data, error } = await sb.from('difunto').select('id, nombre, apellidos, nicho_id').not('nicho_id', 'is', null);
      if (error) { console.error(error); return; }
      this.difuntosAll = data || [];
    },

    statsFor(sectorId) {
      const nichos = this.nichosAll.filter(n => n.sector_id === sectorId);
      return {
        total: nichos.length,
        ocupados: nichos.filter(n => n.estado === 'Ocupado').length,
        vacios: nichos.filter(n => n.estado === 'Vacio').length,
        reservados: nichos.filter(n => n.estado === 'Reservado').length,
      };
    },

    ocupantesFor(nichoId) {
      return this.difuntosAll.filter(d => d.nicho_id === nichoId);
    },

    // ---------- Drawer sector: abrir ----------

    openCreate() {
      this.drawerMode = 'create';
      this.current = null;
      this.form = { nombre: '', tipo: 'Nicho', filas: 0, columnas: 0, inicio: 1, orden: 0, situacion: '', plano_img: '', observaciones: '' };
      this.formError = '';
      this.drawerOpen = true;
    },

    openDetail(sector) {
      this.drawerMode = 'view';
      this.current = sector;
      this.formError = '';
      this.nichoFormOpen = false;
      this.drawerOpen = true;
    },

    startEdit() {
      const s = this.current;
      this.form = {
        id: s.id, nombre: s.nombre || '', tipo: s.tipo || 'Nicho',
        filas: s.filas ?? 0, columnas: s.columnas ?? 0, inicio: s.inicio ?? 1, orden: s.orden ?? 0,
        situacion: s.situacion || '', plano_img: s.plano_img || '', observaciones: s.observaciones || '',
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
      this.nichoFormOpen = false;
    },

    // ---------- Guardar / borrar sector ----------

    async saveForm() {
      this.formError = '';
      if (!this.form.nombre?.trim()) {
        this.formError = 'El nombre del sector es obligatorio.';
        return;
      }

      const payload = {
        nombre: this.form.nombre.trim(),
        tipo: this.form.tipo,
        filas: parseInt(this.form.filas, 10) || 0,
        columnas: parseInt(this.form.columnas, 10) || 0,
        inicio: parseInt(this.form.inicio, 10) || 1,
        orden: parseInt(this.form.orden, 10) || 0,
        situacion: this.form.situacion || null,
        plano_img: this.form.plano_img || null,
        observaciones: this.form.observaciones || null,
      };

      this.saving = true;
      try {
        if (this.drawerMode === 'create') {
          const { error } = await sb.from('sector').insert(payload);
          if (error) throw error;
        } else {
          const { error } = await sb.from('sector').update(payload).eq('id', this.form.id);
          if (error) throw error;
        }
        await this.fetchSectors();
        this.closeDrawer();
      } catch (e) {
        console.error('Error guardando sector:', e);
        this.formError = 'No se ha podido guardar. Comprueba los datos e inténtalo de nuevo.';
      } finally {
        this.saving = false;
      }
    },

    async deleteCurrent() {
      if (!this.current) return;
      if (!confirm(`¿Seguro que quieres eliminar el sector "${this.current.nombre}"? Esto también borrará sus nichos, si no tienen difuntos asignados.`)) return;

      try {
        const { error } = await sb.from('sector').delete().eq('id', this.current.id);
        if (error) throw error;
        await Promise.all([this.fetchSectors(), this.fetchNichos()]);
        this.closeDrawer();
      } catch (e) {
        console.error('Error eliminando sector:', e);
        if (e.code === '23503') {
          alert('No se puede eliminar: hay difuntos asignados a nichos de este sector. Reasígnalos primero.');
        } else {
          alert('No se ha podido eliminar el sector.');
        }
      }
    },

    // ---------- Nichos: crear / editar ----------

    openNichoCreate() {
      this.nichoFormMode = 'create';
      this.nichoForm = { numero_nicho: '', reservado: false, observaciones: '' };
      this.nichoFormOcupado = false;
      this.nichoFormError = '';
      this.nichoFormOpen = true;
    },

    openNichoEdit(n) {
      this.nichoFormMode = 'edit';
      this.nichoFormOcupado = this.ocupantesFor(n.id).length > 0;
      this.nichoForm = {
        id: n.id,
        numero_nicho: n.numero_nicho,
        reservado: n.estado === 'Reservado',
        observaciones: n.observaciones || '',
      };
      this.nichoFormError = '';
      this.nichoFormOpen = true;
    },

    cancelNichoForm() {
      this.nichoFormOpen = false;
    },

    async saveNichoForm() {
      this.nichoFormError = '';
      const numero = parseInt(this.nichoForm.numero_nicho, 10);
      if (!numero || numero <= 0) {
        this.nichoFormError = 'Indica un número de nicho válido.';
        return;
      }

      const payload = {
        numero_nicho: numero,
        sector_id: this.current.id,
        observaciones: this.nichoForm.observaciones || null,
      };

      // Ocupado/Vacío se derivan del trigger a partir de los difuntos asignados.
      // Solo tocamos `estado` a mano cuando el nicho no está ocupado, para
      // decidir entre Vacío y Reservado (que sí es una decisión manual).
      if (!this.nichoFormOcupado) {
        payload.estado = this.nichoForm.reservado ? 'Reservado' : 'Vacio';
      }

      this.nichoSaving = true;
      try {
        if (this.nichoFormMode === 'create') {
          const { error } = await sb.from('nichos').insert(payload);
          if (error) throw error;
        } else {
          const { error } = await sb.from('nichos').update(payload).eq('id', this.nichoForm.id);
          if (error) throw error;
        }
        await this.fetchNichos();
        this.nichoFormOpen = false;
      } catch (e) {
        console.error('Error guardando nicho:', e);
        this.nichoFormError = e.code === '23505'
          ? 'Ya existe un nicho con ese número en este sector.'
          : 'No se ha podido guardar el nicho.';
      } finally {
        this.nichoSaving = false;
      }
    },

    async deleteNicho(n) {
      if (!confirm(`¿Eliminar el nicho nº ${n.numero_nicho}?`)) return;
      try {
        const { error } = await sb.from('nichos').delete().eq('id', n.id);
        if (error) throw error;
        await this.fetchNichos();
      } catch (e) {
        console.error('Error eliminando nicho:', e);
        if (e.code === '23503') {
          alert('No se puede eliminar: hay un difunto asignado a este nicho.');
        } else {
          alert('No se ha podido eliminar el nicho.');
        }
      }
    },

    // ---------- Generar nichos automáticamente ----------

    async generarNichos() {
      const filas = parseInt(this.current.filas, 10) || 0;
      const columnas = parseInt(this.current.columnas, 10) || 0;
      const inicio = parseInt(this.current.inicio, 10) || 1;
      const total = filas * columnas;

      if (total <= 0) {
        alert('Este sector no tiene filas/columnas definidas (o el resultado es 0). Edítalo primero.');
        return;
      }
      if (!confirm(`Se crearán ${total} nichos numerados del ${inicio} al ${inicio + total - 1}, todos como "Vacío". ¿Continuar?`)) return;

      const nuevos = [];
      for (let i = 0; i < total; i++) {
        nuevos.push({ sector_id: this.current.id, numero_nicho: inicio + i, estado: 'Vacio' });
      }

      this.generating = true;
      try {
        const { error } = await sb.from('nichos').insert(nuevos);
        if (error) throw error;
        await this.fetchNichos();
      } catch (e) {
        console.error('Error generando nichos:', e);
        alert('No se han podido generar los nichos. Puede que ya exista alguno con esos números.');
      } finally {
        this.generating = false;
      }
    },
  };
}

document.addEventListener('alpine:init', () => {
  Alpine.data('sectoresSection', sectoresSection);
});
