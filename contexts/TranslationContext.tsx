
import React, { createContext, useContext, useState, useCallback } from 'react';

export type Language = 'en' | 'es' | 'zh-CN' | 'zh-TW' | 'ar' | 'hi' | 'fr' | 'pt' | 'ru' | 'ja' | 'ko' | 'de';

export const LANGUAGE_OPTIONS: { code: Language; label: string; nativeLabel: string; rtl?: boolean }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Espanol' },
  { code: 'fr', label: 'French', nativeLabel: 'Francais' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Portugues' },
  { code: 'zh-CN', label: 'Chinese (Simplified)', nativeLabel: '简体中文' },
  { code: 'zh-TW', label: 'Chinese (Traditional)', nativeLabel: '繁體中文' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { code: 'ko', label: 'Korean', nativeLabel: '한국어' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية', rtl: true },
  { code: 'ru', label: 'Russian', nativeLabel: 'Русский' },
];

// Core UI translations
const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.resources': 'Resources',
    'nav.missions': 'Missions',
    'nav.badges': 'Badges',
    'nav.skills': 'Skills',
    'nav.fortune': 'Fortune',
    'nav.leaderboard': 'Leaderboard',
    'nav.tutoring': 'Tutoring',
    'nav.loadout': 'Agent Loadout',
    'common.search': 'Search',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.submit': 'Submit',
    'common.close': 'Close',
    'common.loading': 'Loading...',
    'common.noResults': 'No results found.',
    'streak.current': 'Current Streak',
    'streak.best': 'Best',
    'streak.days': 'Days',
    'streak.freezes': 'Streak Freezes',
    'proctor.active': 'Active Session',
    'proctor.away': 'Away (Paused)',
    'proctor.fullscreen': 'Full Screen',
    'proctor.exitFullscreen': 'Exit Full Screen',
    'proctor.replay': 'Replay',
    'proctor.tts.play': 'Read Aloud',
    'proctor.tts.stop': 'Stop Reading',
    'proctor.annotate': 'Annotate',
    'proctor.annotate.clear': 'Clear Annotations',
    'xp.earned': 'XP Earned',
    'xp.level': 'Level',
    'xp.flux': 'Cyber-Flux',
    'chat.send': 'Send Message',
    'chat.muted': 'You are muted.',
  },
  es: {
    'nav.dashboard': 'Tablero',
    'nav.resources': 'Recursos',
    'nav.missions': 'Misiones',
    'nav.badges': 'Insignias',
    'nav.skills': 'Habilidades',
    'nav.fortune': 'Fortuna',
    'nav.leaderboard': 'Clasificacion',
    'nav.tutoring': 'Tutoria',
    'nav.loadout': 'Equipamiento',
    'common.search': 'Buscar',
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'common.delete': 'Eliminar',
    'common.submit': 'Enviar',
    'common.close': 'Cerrar',
    'common.loading': 'Cargando...',
    'common.noResults': 'No se encontraron resultados.',
    'streak.current': 'Racha actual',
    'streak.best': 'Mejor',
    'streak.days': 'Dias',
    'streak.freezes': 'Congelaciones',
    'proctor.active': 'Sesion activa',
    'proctor.away': 'Ausente (Pausado)',
    'proctor.fullscreen': 'Pantalla completa',
    'proctor.exitFullscreen': 'Salir de pantalla completa',
    'proctor.replay': 'Repetir',
    'proctor.tts.play': 'Leer en voz alta',
    'proctor.tts.stop': 'Dejar de leer',
    'proctor.annotate': 'Anotar',
    'proctor.annotate.clear': 'Borrar anotaciones',
    'xp.earned': 'XP ganado',
    'xp.level': 'Nivel',
    'xp.flux': 'Cyber-Flux',
    'chat.send': 'Enviar mensaje',
    'chat.muted': 'Estas silenciado.',
  },
  fr: {
    'nav.dashboard': 'Tableau de bord', 'nav.resources': 'Ressources', 'nav.missions': 'Missions', 'nav.badges': 'Badges', 'nav.skills': 'Competences', 'nav.fortune': 'Fortune', 'nav.leaderboard': 'Classement', 'nav.tutoring': 'Tutorat', 'nav.loadout': 'Equipement', 'common.search': 'Rechercher', 'common.save': 'Enregistrer', 'common.cancel': 'Annuler', 'common.delete': 'Supprimer', 'common.submit': 'Soumettre', 'common.close': 'Fermer', 'common.loading': 'Chargement...', 'common.noResults': 'Aucun resultat.', 'streak.current': 'Serie actuelle', 'streak.best': 'Meilleur', 'streak.days': 'Jours', 'streak.freezes': 'Gels de serie', 'proctor.active': 'Session active', 'proctor.away': 'Absent (Pause)', 'proctor.fullscreen': 'Plein ecran', 'proctor.exitFullscreen': 'Quitter le plein ecran', 'proctor.replay': 'Rejouer', 'proctor.tts.play': 'Lire a voix haute', 'proctor.tts.stop': 'Arreter la lecture', 'proctor.annotate': 'Annoter', 'proctor.annotate.clear': 'Effacer les annotations', 'xp.earned': 'XP gagne', 'xp.level': 'Niveau', 'xp.flux': 'Cyber-Flux', 'chat.send': 'Envoyer', 'chat.muted': 'Vous etes en sourdine.',
  },
  de: { 'nav.dashboard': 'Ubersicht', 'nav.resources': 'Ressourcen', 'nav.missions': 'Missionen', 'common.search': 'Suchen', 'common.save': 'Speichern', 'common.cancel': 'Abbrechen', 'common.delete': 'Loschen', 'common.submit': 'Absenden', 'common.close': 'Schliessen', 'common.loading': 'Laden...', 'proctor.tts.play': 'Vorlesen', 'proctor.tts.stop': 'Vorlesen beenden', 'proctor.annotate': 'Anmerken' },
  pt: { 'nav.dashboard': 'Painel', 'nav.resources': 'Recursos', 'nav.missions': 'Missoes', 'common.search': 'Pesquisar', 'common.save': 'Salvar', 'common.cancel': 'Cancelar', 'common.submit': 'Enviar', 'common.close': 'Fechar', 'proctor.tts.play': 'Ler em voz alta', 'proctor.tts.stop': 'Parar leitura', 'proctor.annotate': 'Anotar' },
  'zh-CN': { 'nav.dashboard': '仪表板', 'nav.resources': '资源', 'nav.missions': '任务', 'common.search': '搜索', 'common.save': '保存', 'common.cancel': '取消', 'common.submit': '提交', 'common.close': '关闭', 'common.loading': '加载中...', 'proctor.tts.play': '朗读', 'proctor.tts.stop': '停止朗读', 'proctor.annotate': '批注' },
  'zh-TW': { 'nav.dashboard': '儀表板', 'nav.resources': '資源', 'nav.missions': '任務', 'common.search': '搜尋', 'common.save': '儲存', 'common.cancel': '取消', 'common.submit': '提交', 'common.close': '關閉', 'proctor.tts.play': '朗讀', 'proctor.tts.stop': '停止朗讀', 'proctor.annotate': '註釋' },
  ja: { 'nav.dashboard': 'ダッシュボード', 'nav.resources': 'リソース', 'nav.missions': 'ミッション', 'common.search': '検索', 'common.save': '保存', 'common.cancel': 'キャンセル', 'common.submit': '送信', 'common.close': '閉じる', 'proctor.tts.play': '読み上げ', 'proctor.tts.stop': '停止', 'proctor.annotate': '注釈' },
  ko: { 'nav.dashboard': '대시보드', 'nav.resources': '리소스', 'nav.missions': '미션', 'common.search': '검색', 'common.save': '저장', 'common.cancel': '취소', 'common.submit': '제출', 'common.close': '닫기', 'proctor.tts.play': '읽어주기', 'proctor.tts.stop': '중지', 'proctor.annotate': '주석' },
  hi: { 'nav.dashboard': 'डैशबोर्ड', 'nav.resources': 'संसाधन', 'nav.missions': 'मिशन', 'common.search': 'खोजें', 'common.save': 'सहेजें', 'common.cancel': 'रद्द करें', 'common.submit': 'जमा करें', 'common.close': 'बंद करें', 'proctor.tts.play': 'पढ़कर सुनाएं', 'proctor.tts.stop': 'रोकें', 'proctor.annotate': 'टिप्पणी' },
  ar: { 'nav.dashboard': 'لوحة القيادة', 'nav.resources': 'الموارد', 'nav.missions': 'المهام', 'common.search': 'بحث', 'common.save': 'حفظ', 'common.cancel': 'إلغاء', 'common.submit': 'إرسال', 'common.close': 'إغلاق', 'proctor.tts.play': 'قراءة بصوت عالٍ', 'proctor.tts.stop': 'إيقاف القراءة', 'proctor.annotate': 'تعليق' },
  ru: { 'nav.dashboard': 'Панель', 'nav.resources': 'Ресурсы', 'nav.missions': 'Миссии', 'common.search': 'Поиск', 'common.save': 'Сохранить', 'common.cancel': 'Отмена', 'common.submit': 'Отправить', 'common.close': 'Закрыть', 'proctor.tts.play': 'Читать вслух', 'proctor.tts.stop': 'Остановить', 'proctor.annotate': 'Аннотация' },
};

interface TranslationContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const TranslationContext = createContext<TranslationContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
  isRTL: false,
});

export const useTranslation = () => useContext(TranslationContext);

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('porterPortalLanguage') as Language) || 'en';
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('porterPortalLanguage', lang);
    document.documentElement.dir = LANGUAGE_OPTIONS.find(l => l.code === lang)?.rtl ? 'rtl' : 'ltr';
  }, []);

  const t = useCallback((key: string): string => {
    return TRANSLATIONS[language]?.[key] || TRANSLATIONS.en[key] || key;
  }, [language]);

  const isRTL = LANGUAGE_OPTIONS.find(l => l.code === language)?.rtl || false;

  return (
    <TranslationContext.Provider value={{ language, setLanguage, t, isRTL }}>
      {children}
    </TranslationContext.Provider>
  );
};
