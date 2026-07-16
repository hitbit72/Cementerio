/* =====================================================================
   APP SHELL — sesión, navegación por rol y datos del dashboard
   ===================================================================== */

function appShell() {
  return {
    // Estado
    profile: null,
    sidebarOpen: false,
    activeSection: (location.hash || '#dashboard').replace('#', ''),
    statsLoading: true,
    stats: {
      difuntos: null,
      nichosOcupados: null,
      nichosVacios: null,
      propietarios: null,
      recibosPendientes: null,
    },

    // Definición de secciones del menú. `adminOnly` las oculta para el rol 'consulta'.
    navSections: [
      {
        label: 'General',
        items: [
          { key: 'dashboard', label: 'Panel', icon: 'grid' },
        ],
      },
      {
        label: 'Registro',
        items: [
          { key: 'sectores', label: 'Sectores y nichos', icon: 'map' },
          { key: 'difuntos', label: 'Difuntos', icon: 'record' },
          { key: 'propietarios', label: 'Propietarios', icon: 'users' },
          { key: 'recibos', label: 'Recibos', icon: 'receipt' },
        ],
      },
      {
        label: 'Administración',
        adminOnly: true,
        items: [
          { key: 'usuarios', label: 'Usuarios', icon: 'shield' },
        ],
      },
    ],

    async init() {
      const session = await requireSession();
      if (!session) return;

      this.profile = await getProfile(session.user.id);

      // Si por lo que sea no hay fila en profiles todavía, trata al usuario como 'consulta'
      if (!this.profile) {
        this.profile = { email: session.user.email, nombre: null, role: 'consulta' };
      }

      // Otras secciones (Difuntos, Propietarios...) leen el rol desde aquí,
      // sin depender directamente del componente appShell.
      Alpine.store('session').profile = this.profile;

      window.addEventListener('hashchange', () => {
        this.activeSection = (location.hash || '#dashboard').replace('#', '');
      });

      this.loadStats();
    },

    get visibleNavSections() {
      const isAdmin = this.profile?.role === 'admin';
      return this.navSections.filter(section => !section.adminOnly || isAdmin);
    },

    get sectionTitle() {
      for (const section of this.navSections) {
        const found = section.items.find(i => i.key === this.activeSection);
        if (found) return found.label;
      }
      return 'Panel';
    },

    get initials() {
      const source = this.profile?.nombre || this.profile?.email || '?';
      return source.trim().charAt(0).toUpperCase();
    },

    goTo(key) {
      location.hash = key;
      this.activeSection = key;
      this.sidebarOpen = false;
    },

    async loadStats() {
      this.statsLoading = true;
      try {
        const [difuntos, nichosOcupados, nichosVacios, propietarios, recibosPendientes] = await Promise.all([
          sb.from('difunto').select('id', { count: 'exact', head: true }),
          sb.from('nichos').select('id', { count: 'exact', head: true }).eq('estado', 'Ocupado'),
          sb.from('nichos').select('id', { count: 'exact', head: true }).eq('estado', 'Vacio'),
          sb.from('propietario').select('id', { count: 'exact', head: true }),
          sb.from('recibos').select('id', { count: 'exact', head: true }).eq('estado', 'Pendiente'),
        ]);

        this.stats = {
          difuntos: difuntos.count ?? '—',
          nichosOcupados: nichosOcupados.count ?? '—',
          nichosVacios: nichosVacios.count ?? '—',
          propietarios: propietarios.count ?? '—',
          recibosPendientes: recibosPendientes.count ?? '—',
        };
      } catch (e) {
        console.error('Error cargando estadísticas:', e);
      } finally {
        this.statsLoading = false;
      }
    },

    signOut,
  };
}

// Iconos de línea minimalistas, en el mismo estilo, referenciados por clave
const NAV_ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  record: '<circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-4 3.2-6.5 7-6.5s7 2.5 7 6.5"/>',
  users: '<circle cx="8.5" cy="8" r="3"/><circle cx="16" cy="9" r="2.4"/><path d="M2.5 19c0-3.5 2.7-5.8 6-5.8s6 2.3 6 5.8"/><path d="M14.5 13.6c2.6.3 4.5 2.4 4.5 5.4"/>',
  receipt: '<path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5z"/><path d="M8.5 8h7M8.5 12h7"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
};

document.addEventListener('alpine:init', () => {
  Alpine.store('session', { profile: null });
  Alpine.data('appShell', appShell);
});
