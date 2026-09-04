import type { Dictionary } from './index';

/**
 * Spanish dictionary — plain, student-friendly Latin American Spanish for
 * high-school multi-language learners. Short words, no jargon. Gamified names
 * are translated by FUNCTION (Gear→Equipo, Shop→Tienda), matching how the EN
 * display names already function-first override the lore names. Proper nouns
 * (Porter's Portal, Flux as currency) stay as-is.
 */
export const es: Dictionary = {
  // ── Nav item display names ──
  'nav.home': 'Inicio',
  'nav.resources': 'Recursos',
  'nav.feedback': 'Comentarios',
  'nav.calendar': 'Calendario',
  'nav.loadout': 'Equipo',
  'nav.fortune': 'Fortuna',
  'nav.fluxShop': 'Tienda',
  'nav.badges': 'Insignias',
  'nav.skills': 'Habilidades',
  'nav.bossEncounters': 'Jefes',
  'nav.intelDossier': 'Mis Estadísticas',
  'nav.progress': 'Progreso',
  'nav.leaderboard': 'Tabla de Posiciones',
  'nav.dashboard': 'Panel',
  'nav.grading': 'Calificaciones',
  'nav.studentReports': 'Reportes de Estudiantes',
  'nav.resourceEditor': 'Editor de Lecciones',
  'nav.userManagement': 'Gestión de Usuarios',
  'nav.enrollmentCodes': 'Códigos de Inscripción',
  'nav.xpCommand': 'Gamificación',
  'nav.operatives': 'Estudiantes',
  'nav.xpProtocols': 'Recompensas',
  'nav.bossOps': 'Batallas de Jefes',
  'nav.analytics': 'Analíticas',

  // ── Nav group labels ──
  'navGroup.learning': 'Aprendizaje',
  'navGroup.operations': 'Operaciones',
  'navGroup.intel': 'Información',
  'navGroup.admin_ops': 'Operaciones',
  'navGroup.classroom': 'Clase',
  'navGroup.systems': 'Sistemas',

  // ── Nav flavor subtitles ──
  'navFlavor.loadout': 'Equipo',
  'navFlavor.fluxShop': 'Flux',
  'navFlavor.badges': 'Logros',
  'navFlavor.bossEncounters': 'Encuentros',
  'navFlavor.intelDossier': 'Expediente',

  // ── Sidebar chrome / footer actions ──
  'app.title': "Porter's Portal",
  'app.subtitle.admin': 'Sistema de Admin',
  'app.subtitle.student': 'Terminal de Operativo',
  'app.skipToContent': 'Saltar al contenido principal',
  'app.crosBanner.text': '¿Usas Chromebook? Activa el Modo de Rendimiento para un desplazamiento más fluido.',
  'app.crosBanner.enable': 'Activar',
  'app.crosBanner.dismiss': 'Cerrar',
  'app.footer.settings': 'Configuración',
  'app.footer.signOut': 'Cerrar Sesión',
  'app.footer.reportBug': 'Reportar un error',
  'app.footer.requestSong': 'Pedir una canción',
  'app.footer.expandSidebar': 'Expandir menú',
  'app.footer.collapseSidebar': 'Contraer menú',
  'app.footer.openSettings': 'Abrir configuración',
  'app.footer.level': 'Nivel {level}',
  'app.footer.agent': 'Agente',
  'app.nav.mainAria': 'Navegación principal',
  'app.nav.mobileAria': 'Navegación móvil',
  'app.nav.quickAria': 'Navegación rápida',
  'app.nav.openMenu': 'Abrir menú de navegación',
  'app.nav.closeMenu': 'Cerrar menú de navegación',
  'app.bottomNav.progress': 'Progreso',

  // ── Urgency dot ──
  'nav.urgencyDot.aria': 'Tiene tareas por entregar pronto',

  // ── Command palette ──
  'palette.ariaLabel': 'Paleta de comandos — buscar navegación',
  'palette.placeholder': 'Buscar pestañas…',
  'palette.searchAria': 'Buscar pestañas de navegación',
  'palette.noResults': 'No hay pestañas que coincidan.',
  'palette.groupTag': 'grupo',

  // ── Settings modal ──
  'settings.title': 'Centro de Control de Usuario',
  'settings.section.visuals': 'Visuales y Rendimiento',
  'settings.performance.title': 'Modo de Rendimiento',
  'settings.performance.description': 'Desactiva desenfoques y animaciones pesadas para equipos antiguos.',
  'settings.section.privacy': 'Privacidad e Identidad',
  'settings.privacy.title': 'Nombre en Clave Privado',
  'settings.privacy.description': 'Oculta tu nombre real en las tablas de posiciones y usa tu nombre en clave.',
  'settings.codename.label': 'Nombre en Clave de Operativo',
  'settings.codename.placeholder': 'Escribe tu nombre en clave...',
  'settings.codename.chars': '{count}/24 caracteres',
  'settings.section.interface': 'Interfaz',
  'settings.language.label': 'Idioma',
  'settings.language.description': 'Elige el idioma de los menús y botones.',
  'settings.sound.title': 'Efectos de Sonido',
  'settings.sound.description': 'Reproduce sonidos para ganar XP, subir de nivel y otras acciones.',
  'settings.volume.label': 'Volumen General',
  'settings.section.notifications': 'Notificaciones',
  'settings.push.title': 'Notificaciones Push',
  'settings.push.description': 'Recibe alertas de escritorio de misiones, recompensas y anuncios cuando la pestaña esté en segundo plano.',
  'settings.push.denied': 'Bloqueado por tu navegador. Permite las notificaciones en la configuración del navegador.',
  'settings.push.unsupported': 'Las notificaciones push no son compatibles con este navegador.',
  'settings.push.enabledToast': '¡Notificaciones push activadas!',
  'settings.push.deniedToast': 'Notificaciones bloqueadas por el navegador. Revisa la configuración del navegador.',
  'settings.section.appearance': 'Apariencia',
  'settings.appearance.light': 'Claro',
  'settings.appearance.dark': 'Oscuro',
  'settings.section.enrollment': 'Inscripción',
  'settings.enrollment.joinTitle': 'Unirse a Otra Clase',
  'settings.enrollment.join': 'Unirse',
  'settings.enrollment.errorCode': 'Ingresa un código válido.',
  'settings.enrollment.errorRedeem': 'No se pudo canjear el código.',
  'settings.enrollment.errorGeneric': 'Algo salió mal. Inténtalo de nuevo.',
  'settings.enrollment.success': '¡Inscrito en {className}!',
  'settings.enrollment.joinedToast': '¡Te uniste a {className}!',
  'settings.save': 'Aplicar Cambios',
  'settings.saveError': 'No se pudieron guardar los cambios.',

  // ── Save status indicator ──
  'save.saving': 'Guardando...',
  'save.saved': 'Guardado',
  'save.retrying': 'Reintentando guardar...',
  'save.error.session': 'Sesión expirada — actualiza la página para recuperar tu trabajo',
  'save.error.prolonged': 'No se puede guardar en el servidor — ¡NO actualices ni cierres esta pestaña! El trabajo solo está en esta pestaña.',
  'save.error.short': 'Error al guardar — el trabajo está seguro solo en esta pestaña',
  'save.offline': 'Sin conexión — trabajo guardado localmente',
  'save.serverOnly': 'Guardando solo en el servidor',
  'save.sessionExpiredChip': 'Sesión expirada — actualiza para recuperar el trabajo',

  // ── Proctor session chrome ──
  'proctor.session.active': 'Sesión Activa',
  'proctor.session.paused': 'Ausente (Pausado)',
  'proctor.session.tokenError': 'No se pudo iniciar la sesión de evaluación. Revisa tu conexión a internet y actualiza la página.',
};
