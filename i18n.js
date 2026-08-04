/* DayO 경량 다국어 엔진 — 6개 국어 (KO, EN, ZH, JA, FR, ES) */
(function () {
  'use strict';

  var STORAGE_KEY = 'dayo_lang';
  var SUPPORTED = ['KO', 'EN', 'ZH', 'JA', 'FR', 'ES'];
  var FALLBACK = ['KO', 'EN'];

  var LANG_META = {
    KO: { flag: '🇰🇷', label: '한국어' },
    EN: { flag: '🇺🇸', label: 'English' },
    ZH: { flag: '🇨🇳', label: '中文' },
    JA: { flag: '🇯🇵', label: '日本語' },
    FR: { flag: '🇫🇷', label: 'Français' },
    ES: { flag: '🇪🇸', label: 'Español' }
  };

  var DICT = {
    'nav.about': {
      KO: '회사 소개', EN: 'About', ZH: '公司介绍', JA: '会社紹介', FR: 'À propos', ES: 'Sobre nosotros'
    },
    'nav.partners': {
      KO: '대화 파트너', EN: 'Partners', ZH: '对话伙伴', JA: '会話パートナー', FR: 'Partenaires', ES: 'Compañeros'
    },
    'nav.booking': {
      KO: '대화 예약하기', EN: 'Book a Chat', ZH: '预约对话', JA: '会話予約', FR: 'Réserver', ES: 'Reservar'
    },
    'nav.faq': {
      KO: '자주 묻는 질문', EN: 'FAQ', ZH: '常见问题', JA: 'よくある質問', FR: 'FAQ', ES: 'Preguntas'
    },
    'nav.startChat': {
      KO: '☕ 대화 시작해요!', EN: '☕ Start Chatting!', ZH: '☕ 开始对话！', JA: '☕ 会話を始める！', FR: '☕ Commencer !', ES: '☕ ¡Empezar!'
    },
    'nav.mypage': {
      KO: '마이페이지', EN: 'My Page', ZH: '我的页面', JA: 'マイページ', FR: 'Mon espace', ES: 'Mi página'
    },
    'nav.partnerJoin': {
      KO: '파트너 참여', EN: 'Join as Partner', ZH: '成为伙伴', JA: 'パートナー参加', FR: 'Devenir partenaire', ES: 'Ser compañero'
    },
    'nav.partnerStudio': {
      KO: '☕ 파트너 스튜디오로 이동', EN: '☕ Go to Partner Studio', ZH: '☕ 前往伙伴工作室', JA: '☕ パートナースタジオへ', FR: '☕ Aller au Studio', ES: '☕ Ir al Estudio'
    },
    'nav.learnerMypage': {
      KO: '🎓 학습자 마이페이지로 이동', EN: '🎓 Go to Learner My Page', ZH: '🎓 前往学习者页面', JA: '🎓 学習者ページへ', FR: '🎓 Aller à Mon espace', ES: '🎓 Ir a Mi página'
    },
    'lang.select': {
      KO: '언어 선택', EN: 'Select language', ZH: '选择语言', JA: '言語を選択', FR: 'Choisir la langue', ES: 'Elegir idioma'
    },
    'login.required': {
      KO: '로그인이 필요한 서비스입니다 🔑', EN: 'Please sign in to continue 🔑', ZH: '需要登录 🔑', JA: 'ログインが必要です 🔑', FR: 'Connexion requise 🔑', ES: 'Inicia sesión 🔑'
    },
    'login.title': {
      KO: '로그인이 필요한 서비스예요', EN: 'Sign in required', ZH: '需要登录', JA: 'ログインが必要です', FR: 'Connexion requise', ES: 'Inicio de sesión requerido'
    },
    'login.desc': {
      KO: '로그인하면 예약한 대화 세션과 나의 학습 리포트를<br>마이페이지에서 한눈에 확인할 수 있어요.',
      EN: 'Sign in to view your booked sessions and<br>learning reports in one place.',
      ZH: '登录后可在我的页面查看<br>预约会话和学习报告。',
      JA: 'ログインすると予約セッションと<br>学習レポートをマイページで確認できます。',
      FR: 'Connectez-vous pour voir vos sessions<br>et rapports en un seul endroit.',
      ES: 'Inicia sesión para ver tus sesiones<br>y reportes en un solo lugar.'
    },
    'login.quick': {
      KO: '☕ 3초 만에 로그인하기', EN: '☕ Quick sign in', ZH: '☕ 3秒登录', JA: '☕ 3秒ログイン', FR: '☕ Connexion rapide', ES: '☕ Inicio rápido'
    },
    'login.email': {
      KO: '✉️ 이메일로 로그인', EN: '✉️ Sign in with email', ZH: '✉️ 邮箱登录', JA: '✉️ メールでログイン', FR: '✉️ Connexion par e-mail', ES: '✉️ Iniciar con email'
    },
    'login.partnerLink': {
      KO: '파트너 스튜디오 둘러보기', EN: 'Explore Partner Studio', ZH: '浏览伙伴工作室', JA: 'パートナースタジオを見る', FR: 'Découvrir le Studio', ES: 'Explorar el Estudio'
    },
    'login.dismiss': {
      KO: '다음에 할게요', EN: 'Maybe later', ZH: '稍后再说', JA: 'あとで', FR: 'Plus tard', ES: 'Más tarde'
    },
    'login.success': {
      KO: '로그인되었습니다! 마이페이지로 이동할게요 💖', EN: 'Signed in! Going to My Page 💖', ZH: '已登录！前往我的页面 💖', JA: 'ログインしました！マイページへ 💖', FR: 'Connecté ! Direction Mon espace 💖', ES: '¡Sesión iniciada! 💖'
    },
    'login.partnerPrompt': {
      KO: '대화 파트너로 활동하고 싶다면?', EN: 'Want to be a conversation partner?', ZH: '想成为对话伙伴？', JA: '会話パートナーになりたい？', FR: 'Devenir partenaire de conversation ?', ES: '¿Quieres ser compañero?'
    },
    'mypage.brand': {
      KO: 'DayO 마이페이지', EN: 'DayO My Page', ZH: 'DayO 我的页面', JA: 'DayO マイページ', FR: 'DayO Mon espace', ES: 'DayO Mi página'
    },
    'mypage.brandSub': {
      KO: 'MY CONVERSATION LOUNGE', EN: 'MY CONVERSATION LOUNGE', ZH: 'MY CONVERSATION LOUNGE', JA: 'MY CONVERSATION LOUNGE', FR: 'MY CONVERSATION LOUNGE', ES: 'MY CONVERSATION LOUNGE'
    },
    'mypage.welcome': {
      KO: '지민 님, 반갑습니다! 🍰', EN: 'Welcome back, Jimin! 🍰', ZH: '欢迎回来，智敏！🍰', JA: 'ジミンさん、こんにちは！🍰', FR: 'Bonjour Jimin ! 🍰', ES: '¡Hola Jimin! 🍰'
    },
    'mypage.eyebrow': {
      KO: 'MY CONVERSATION LOUNGE', EN: 'MY CONVERSATION LOUNGE', ZH: 'MY CONVERSATION LOUNGE', JA: 'MY CONVERSATION LOUNGE', FR: 'MY CONVERSATION LOUNGE', ES: 'MY CONVERSATION LOUNGE'
    },
    'mypage.heading': {
      KO: '오늘도 한 잔의 대화, 준비되셨나요? ☕', EN: 'Ready for a cozy chat today? ☕', ZH: '今天准备好对话了吗？☕', JA: '今日も会話の一杯、準備できましたか？☕', FR: 'Prêt(e) pour un café-conversation ? ☕', ES: '¿Listo para una charla hoy? ☕'
    },
    'mypage.headingDesc': {
      KO: '내 대화 현황과 예약한 세션, 예습 자료를 한 곳에서 확인할 수 있어요.',
      EN: 'View your chat stats, booked sessions, and prep materials in one place.',
      ZH: '在一处查看对话现状、预约和预习资料。',
      JA: '会話状況、予約、予習資料を一箇所で確認できます。',
      FR: 'Consultez vos stats, sessions et matériels de préparation.',
      ES: 'Consulta tus estadísticas, sesiones y materiales.'
    },
    'mypage.speaking.eyebrow': {
      KO: 'MONTHLY SPEAKING REPORT', EN: 'MONTHLY SPEAKING REPORT', ZH: 'MONTHLY SPEAKING REPORT', JA: 'MONTHLY SPEAKING REPORT', FR: 'MONTHLY SPEAKING REPORT', ES: 'MONTHLY SPEAKING REPORT'
    },
    'mypage.speaking.title': {
      KO: '🎉 이번 달 나는 <em>영어 🇺🇸 1시간 20분</em>, <em>프랑스어 🇫🇷 40분</em> 대화했어요!',
      EN: '🎉 This month I chatted <em>English 🇺🇸 1h 20m</em> and <em>French 🇫🇷 40m</em>!',
      ZH: '🎉 本月我聊了 <em>英语 🇺🇸 1小时20分</em>、<em>法语 🇫🇷 40分</em>！',
      JA: '🎉 今月は <em>英語 🇺🇸 1時間20分</em>、<em>フランス語 🇫🇷 40分</em> 話しました！',
      FR: '🎉 Ce mois : <em>anglais 🇺🇸 1h20</em> et <em>français 🇫🇷 40min</em> !',
      ES: '🎉 Este mes: <em>inglés 🇺🇸 1h 20m</em> y <em>francés 🇫🇷 40m</em>!'
    },
    'mypage.speaking.desc': {
      KO: '총 2시간, 지난달보다 45분 더 이야기했어요. 이 속도라면 다음 달엔 3시간도 문제없어요 💪',
      EN: '2 hours total — 45 min more than last month. At this pace, 3 hours next month! 💪',
      ZH: '共2小时，比上月多45分钟。按这个速度下个月3小时没问题 💪',
      JA: '合計2時間、先月より45分多く話しました。この調子なら来月3時間も 💪',
      FR: '2 h au total — 45 min de plus. À ce rythme, 3 h le mois prochain ! 💪',
      ES: '2 horas en total — 45 min más. ¡A este ritmo, 3 horas el próximo mes! 💪'
    },
    'mypage.speaking.en': {
      KO: '🇺🇸 영어', EN: '🇺🇸 English', ZH: '🇺🇸 英语', JA: '🇺🇸 英語', FR: '🇺🇸 Anglais', ES: '🇺🇸 Inglés'
    },
    'mypage.speaking.fr': {
      KO: '🇫🇷 프랑스어', EN: '🇫🇷 French', ZH: '🇫🇷 法语', JA: '🇫🇷 フランス語', FR: '🇫🇷 Français', ES: '🇫🇷 Francés'
    },
    'mypage.status.title': {
      KO: '🎓 내 대화 현황', EN: '🎓 My Chat Stats', ZH: '🎓 我的对话现状', JA: '🎓 会話状況', FR: '🎓 Mes statistiques', ES: '🎓 Mis estadísticas'
    },
    'mypage.status.sub': {
      KO: '이번 달 나의 대화 기록과 남은 이용권이에요.',
      EN: 'Your chat history and remaining sessions this month.',
      ZH: '本月对话记录和剩余次数。',
      JA: '今月の会話記録と残り回数です。',
      FR: 'Vos sessions et crédits restants ce mois.',
      ES: 'Tus sesiones y créditos restantes este mes.'
    },
    'mypage.status.newBooking': {
      KO: '📅 새 대화 예약하기', EN: '📅 Book New Chat', ZH: '📅 预约新对话', JA: '📅 新規予約', FR: '📅 Nouvelle réservation', ES: '📅 Nueva reserva'
    },
    'mypage.status.monthly': {
      KO: '이번 달 참여 대화', EN: 'Chats this month', ZH: '本月参与对话', JA: '今月の会話', FR: 'Sessions ce mois', ES: 'Charlas este mes'
    },
    'mypage.status.remaining': {
      KO: '잔여 대화 세션 이용권', EN: 'Sessions remaining', ZH: '剩余对话次数', JA: '残りセッション', FR: 'Sessions restantes', ES: 'Sesiones restantes'
    },
    'mypage.status.time': {
      KO: '이번 달 대화 시간', EN: 'Chat time this month', ZH: '本月对话时间', JA: '今月の会話時間', FR: 'Temps de conversation', ES: 'Tiempo de charla'
    },
    'mypage.status.monthlyNote': {
      KO: '지난달보다 3회 더 이야기했어요!', EN: '3 more chats than last month!', ZH: '比上月多3次！', JA: '先月より3回多い！', FR: '3 sessions de plus !', ES: '¡3 charlas más!'
    },
    'mypage.status.remainingValue': {
      KO: '4회 남음', EN: '4 left', ZH: '剩余4次', JA: '残り4回', FR: '4 restantes', ES: '4 restantes'
    },
    'mypage.status.timeNote': {
      KO: '연속 3주째 대화를 이어가는 중이에요 💖', EN: '3 weeks in a row — keep it up! 💖', ZH: '已连续3周对话 💖', JA: '3週連続で会話中 💖', FR: '3 semaines d\'affilée 💖', ES: '¡3 semanas seguidas! 💖'
    },
    'mypage.sessions.title': {
      KO: '📅 내 예약 세션', EN: '📅 Upcoming Sessions', ZH: '📅 我的预约', JA: '📅 予約セッション', FR: '📅 Sessions à venir', ES: '📅 Próximas sesiones'
    },
    'mypage.sessions.sub': {
      KO: '예약한 대화 파트너와의 일정이에요.',
      EN: 'Your schedule with conversation partners.',
      ZH: '与对话伙伴的预约日程。',
      JA: '予約したパートナーとの日程です。',
      FR: 'Votre planning avec les partenaires.',
      ES: 'Tu agenda con los compañeros.'
    },
    'mypage.sessions.enter': {
      KO: '☕ 대화 스튜디오 입장', EN: '☕ Enter Studio', ZH: '☕ 进入对话工作室', JA: '☕ スタジオ入室', FR: '☕ Entrer au Studio', ES: '☕ Entrar al Estudio'
    },
    'mypage.sessions.materials': {
      KO: '📚 대화 자료 보기', EN: '📚 View Materials', ZH: '📚 查看资料', JA: '📚 資料を見る', FR: '📚 Voir les supports', ES: '📚 Ver materiales'
    },
    'mypage.library.title': {
      KO: '📚 수업 대화 자료함', EN: '📚 Chat Materials', ZH: '📚 对话资料库', JA: '📚 会話資料', FR: '📚 Supports de cours', ES: '📚 Materiales'
    },
    'mypage.library.sub': {
      KO: '대화 전 예습하고, 끝난 뒤 복습해 보세요.',
      EN: 'Prep before and review after your chats.',
      ZH: '对话前预习，结束后复习。',
      JA: '会話前に予習、後に復習しましょう。',
      FR: 'Préparez-vous avant, révisez après.',
      ES: 'Prepárate antes y repasa después.'
    },
    'mypage.history.title': {
      KO: '🕘 지난 대화', EN: '🕘 Past Chats', ZH: '🕘 过往对话', JA: '🕘 過去の会話', FR: '🕘 Conversations passées', ES: '🕘 Charlas anteriores'
    },
    'mypage.history.sub': {
      KO: '대화가 끝난 뒤 리포트를 열어 복습해 보세요.',
      EN: 'Open reports after chats to review.',
      ZH: '对话结束后打开报告复习。',
      JA: '会話後にレポートで復習しましょう。',
      FR: 'Ouvrez les rapports après vos sessions.',
      ES: 'Abre los reportes tras cada charla.'
    },
    'mypage.history.report': {
      KO: '📊 상세 리포트 보기', EN: '📊 View Report', ZH: '📊 查看详细报告', JA: '📊 詳細レポート', FR: '📊 Voir le rapport', ES: '📊 Ver informe'
    },
    'mypage.switch.eyebrow': {
      KO: 'FOR CONVERSATION PARTNERS', EN: 'FOR CONVERSATION PARTNERS', ZH: 'FOR CONVERSATION PARTNERS', JA: 'FOR CONVERSATION PARTNERS', FR: 'FOR CONVERSATION PARTNERS', ES: 'FOR CONVERSATION PARTNERS'
    },
    'mypage.switch.title': {
      KO: 'DayO의 대화 파트너이신가요? 파트너 전용 공간으로 이동합니다 ☕',
      EN: 'Are you a DayO conversation partner? Go to your studio ☕',
      ZH: '您是DayO对话伙伴？前往专属空间 ☕',
      JA: 'DayOの会話パートナーですか？スタジオへ ☕',
      FR: 'Partenaire DayO ? Accédez à votre studio ☕',
      ES: '¿Eres compañero DayO? Ve a tu estudio ☕'
    },
    'mypage.switch.sub': {
      KO: '프로필과 대화 가능 시간을 관리하고, 예정된 세션을 확인할 수 있어요.',
      EN: 'Manage your profile, schedule, and upcoming sessions.',
      ZH: '管理资料、可用时间和预定会话。',
      JA: 'プロフィール、スケジュール、予定セッションを管理できます。',
      FR: 'Gérez profil, horaires et sessions à venir.',
      ES: 'Gestiona perfil, horarios y sesiones.'
    },
    'partner.brand': {
      KO: 'DayO Partner Studio', EN: 'DayO Partner Studio', ZH: 'DayO Partner Studio', JA: 'DayO Partner Studio', FR: 'DayO Partner Studio', ES: 'DayO Partner Studio'
    },
    'partner.brandSub': {
      KO: 'CONVERSATION PARTNER PORTAL', EN: 'CONVERSATION PARTNER PORTAL', ZH: 'CONVERSATION PARTNER PORTAL', JA: 'CONVERSATION PARTNER PORTAL', FR: 'CONVERSATION PARTNER PORTAL', ES: 'CONVERSATION PARTNER PORTAL'
    },
    'partner.welcome': {
      KO: 'Camille 님, 반갑습니다! ☕', EN: 'Welcome, Camille! ☕', ZH: '欢迎，Camille！☕', JA: 'Camilleさん、こんにちは！☕', FR: 'Bonjour Camille ! ☕', ES: '¡Hola Camille! ☕'
    },
    'partner.eyebrow': {
      KO: 'MY PARTNER STUDIO', EN: 'MY PARTNER STUDIO', ZH: 'MY PARTNER STUDIO', JA: 'MY PARTNER STUDIO', FR: 'MY PARTNER STUDIO', ES: 'MY PARTNER STUDIO'
    },
    'partner.heading': {
      KO: '오늘도 다정한 대화를 준비해 볼까요? 🍰', EN: 'Ready for warm conversations today? 🍰', ZH: '今天也准备好温暖的对话吧？🍰', JA: '今日も温かい会話の準備を 🍰', FR: 'Prêt(e) pour des échanges chaleureux ? 🍰', ES: '¿Listo para conversaciones cálidas? 🍰'
    },
    'partner.headingDesc': {
      KO: '프로필과 가능한 시간을 관리하고, 예정된 대화 세션을 확인할 수 있어요.',
      EN: 'Manage your profile, availability, and upcoming sessions.',
      ZH: '管理资料、可用时间和预定会话。',
      JA: 'プロフィール、空き時間、予定セッションを管理できます。',
      FR: 'Gérez profil, disponibilités et sessions.',
      ES: 'Gestiona perfil, horarios y sesiones.'
    },
    'partner.profile.title': {
      KO: '대화 파트너 프로필', EN: 'Partner Profile', ZH: '对话伙伴资料', JA: 'パートナープロフィール', FR: 'Profil partenaire', ES: 'Perfil de compañero'
    },
    'partner.profile.sub': {
      KO: '예약 화면에 표시될 정보를 편하게 다듬어 보세요.',
      EN: 'Polish the info shown on booking screens.',
      ZH: '完善预约页面显示的信息。',
      JA: '予約画面に表示される情報を整えましょう。',
      FR: 'Affinez les infos affichées aux apprenants.',
      ES: 'Mejora la info mostrada en reservas.'
    },
    'partner.profile.nickname': {
      KO: '닉네임', EN: 'Nickname', ZH: '昵称', JA: 'ニックネーム', FR: 'Pseudo', ES: 'Apodo'
    },
    'partner.profile.history': {
      KO: '📜 변경 이력', EN: '📜 History', ZH: '📜 变更记录', JA: '📜 変更履歴', FR: '📜 Historique', ES: '📜 Historial'
    },
    'partner.profile.origin': {
      KO: '대표 출신 국가 (Passport Origin)', EN: 'Passport Origin', ZH: '代表出身国', JA: '代表出身国', FR: 'Pays d\'origine', ES: 'País de origen'
    },
    'partner.profile.languages': {
      KO: '가능 언어', EN: 'Languages', ZH: '可用语言', JA: '対応言語', FR: 'Langues', ES: 'Idiomas'
    },
    'partner.profile.langGuide': {
      KO: '💡 선택하신 언어만 유저 대화 예약 서비스에 반영됩니다.',
      EN: '💡 Only selected languages appear in booking.',
      ZH: '💡 仅所选语言会反映在预约服务中。',
      JA: '💡 選択した言語のみ予約に反映されます。',
      FR: '💡 Seules les langues choisies apparaissent.',
      ES: '💡 Solo los idiomas seleccionados se muestran.'
    },
    'partner.profile.intro': {
      KO: '한 줄 소개', EN: 'One-line intro', ZH: '一句话介绍', JA: '一言紹介', FR: 'Intro en une ligne', ES: 'Intro breve'
    },
    'partner.profile.photoChange': {
      KO: '📷 사진 변경', EN: '📷 Change Photo', ZH: '📷 更换照片', JA: '📷 写真変更', FR: '📷 Changer la photo', ES: '📷 Cambiar foto'
    },
    'partner.schedule.title': {
      KO: '📅 주간 대화 가능 시간', EN: '📅 Weekly Availability', ZH: '📅 每周可用时间', JA: '📅 週間スケジュール', FR: '📅 Disponibilités hebdo', ES: '📅 Disponibilidad semanal'
    },
    'partner.schedule.sub': {
      KO: '요일을 고르고 예약을 받을 수 있는 시간을 열어주세요.',
      EN: 'Pick days and open time slots for bookings.',
      ZH: '选择日期并开放可预约时段。',
      JA: '曜日を選び、予約可能な時間を開放してください。',
      FR: 'Choisissez les jours et créneaux ouverts.',
      ES: 'Elige días y horarios disponibles.'
    },
    'partner.gcal.title': {
      KO: '📅 Google Calendar 연동하기', EN: '📅 Connect Google Calendar', ZH: '📅 连接Google日历', JA: '📅 Googleカレンダー連携', FR: '📅 Lier Google Calendar', ES: '📅 Conectar Google Calendar'
    },
    'partner.gcal.desc': {
      KO: '개인 일정이 있는 시간은 자동으로 예약 차단돼요!',
      EN: 'Busy times are auto-blocked from bookings!',
      ZH: '有个人日程的时间会自动屏蔽预约！',
      JA: '個人予定の時間は自動でブロック！',
      FR: 'Vos créneaux occupés sont bloqués !',
      ES: '¡Tus horarios ocupados se bloquean!'
    },
    'partner.schedule.save': {
      KO: '💾 변경된 스케줄 저장하기', EN: '💾 Save Schedule', ZH: '💾 保存日程', JA: '💾 スケジュール保存', FR: '💾 Enregistrer', ES: '💾 Guardar horario'
    },
    'partner.sessions.title': {
      KO: '⏰ 다가오는 대화', EN: '⏰ Upcoming Chats', ZH: '⏰ 即将开始的对话', JA: '⏰ 予定の会話', FR: '⏰ Sessions à venir', ES: '⏰ Próximas charlas'
    },
    'partner.sessions.sub': {
      KO: '곧 시작할 세션을 확인하세요.', EN: 'Check sessions starting soon.', ZH: '查看即将开始的会话。', JA: 'まもなく始まるセッションを確認。', FR: 'Vérifiez les sessions imminentes.', ES: 'Revisa las sesiones próximas.'
    },
    'partner.sessions.enter': {
      KO: '☕ 스튜디오 입장', EN: '☕ Enter Studio', ZH: '☕ 进入工作室', JA: '☕ スタジオ入室', FR: '☕ Entrer', ES: '☕ Entrar'
    },
    'partner.sessions.materials': {
      KO: '📚 대화 자료 보기', EN: '📚 View Materials', ZH: '📚 查看资料', JA: '📚 資料を見る', FR: '📚 Voir supports', ES: '📚 Ver materiales'
    },
    'partner.report.title': {
      KO: '💰 활동 리포트', EN: '💰 Activity Report', ZH: '💰 活动报告', JA: '💰 活動レポート', FR: '💰 Rapport d\'activité', ES: '💰 Informe de actividad'
    },
    'partner.report.sub': {
      KO: '이번 달의 따뜻한 성과예요.', EN: 'Your warm achievements this month.', ZH: '本月温暖成果。', JA: '今月の成果です。', FR: 'Vos résultats ce mois.', ES: 'Tus logros este mes.'
    },
    'partner.report.completed': {
      KO: '이번 달 완료한 대화', EN: 'Chats completed', ZH: '本月完成对话', JA: '今月完了した会話', FR: 'Sessions terminées', ES: 'Charlas completadas'
    },
    'partner.report.satisfaction': {
      KO: '평균 수업 만족도', EN: 'Avg. satisfaction', ZH: '平均满意度', JA: '平均満足度', FR: 'Satisfaction moyenne', ES: 'Satisfacción media'
    },
    'partner.report.points': {
      KO: '정산 예정 포인트', EN: 'Points to settle', ZH: '待结算积分', JA: '精算予定ポイント', FR: 'Points à régler', ES: 'Puntos pendientes'
    },
    'partner.convert.eyebrow': {
      KO: 'LEARN KOREAN WITH DAYO', EN: 'LEARN KOREAN WITH DAYO', ZH: 'LEARN KOREAN WITH DAYO', JA: 'LEARN KOREAN WITH DAYO', FR: 'LEARN KOREAN WITH DAYO', ES: 'LEARN KOREAN WITH DAYO'
    },
    'partner.convert.title': {
      KO: '내가 활동하고 적립한 포인트로 한국어 회화 대화도 즐겨보세요! 💖',
      EN: 'Use your earned points for Korean conversation too! 💖',
      ZH: '用赚取的积分享受韩语对话吧！💖',
      JA: '獲得ポイントで韓国語会話も楽しもう！💖',
      FR: 'Utilisez vos points pour le coréen aussi ! 💖',
      ES: '¡Usa tus puntos para coreano también! 💖'
    },
    'partner.convert.sub': {
      KO: '학습자 모드로 전환하면 적립 포인트로 바로 대화를 예약할 수 있어요.',
      EN: 'Switch to learner mode to book chats with your points.',
      ZH: '切换到学习者模式即可用积分预约。',
      JA: '学習者モードでポイント予約ができます。',
      FR: 'Passez en mode apprenant pour réserver.',
      ES: 'Cambia a modo aprendiz para reservar.'
    },
    'partner.convert.booking': {
      KO: '🎓 한국어 대화 예약하러 가기', EN: '🎓 Book Korean Chat', ZH: '🎓 预约韩语对话', JA: '🎓 韓国語会話を予約', FR: '🎓 Réserver en coréen', ES: '🎓 Reservar coreano'
    },
    'room.booking': {
      KO: '📅 대화 예약하기', EN: '📅 Book Chat', ZH: '📅 预约对话', JA: '📅 会話予約', FR: '📅 Réserver', ES: '📅 Reservar'
    },
    'room.share': {
      KO: '🖥️ 화면 공유', EN: '🖥️ Share Screen', ZH: '🖥️ 共享屏幕', JA: '🖥️ 画面共有', FR: '🖥️ Partager l\'écran', ES: '🖥️ Compartir pantalla'
    },
    'room.end': {
      KO: '🚪 수업 종료', EN: '🚪 End Session', ZH: '🚪 结束课程', JA: '🚪 セッション終了', FR: '🚪 Terminer', ES: '🚪 Terminar'
    },
    'room.partnerStatus': {
      KO: 'Live · 프랑스어 대화 파트너', EN: 'Live · French Partner', ZH: 'Live · 法语伙伴', JA: 'Live · フランス語パートナー', FR: 'Live · Partenaire français', ES: 'Live · Compañero francés'
    },
    'room.chatting': {
      KO: '원어민 대화 파트너와 대화 중', EN: 'Chatting with your partner', ZH: '正在与对话伙伴交流', JA: 'パートナーと会話中', FR: 'En conversation avec votre partenaire', ES: 'Charlando con tu compañero'
    },
    'room.wordHelp': {
      KO: '💡 단어도움', EN: '💡 Word Help', ZH: '💡 单词帮助', JA: '💡 単語ヘルプ', FR: '💡 Mots', ES: '💡 Palabras'
    },
    'room.sentenceHelp': {
      KO: '📝 문장도움', EN: '📝 Sentence Help', ZH: '📝 句子帮助', JA: '📝 文ヘルプ', FR: '📝 Phrases', ES: '📝 Frases'
    },
    'report.title': {
      KO: '📊 지난 대화 상세 리포트', EN: '📊 Chat Detail Report', ZH: '📊 详细对话报告', JA: '📊 詳細レポート', FR: '📊 Rapport détaillé', ES: '📊 Informe detallado'
    },
    'report.partnerLabel': {
      KO: '대화 파트너', EN: 'Partner', ZH: '对话伙伴', JA: '会話パートナー', FR: 'Partenaire', ES: 'Compañero'
    },
    'report.topicLabel': {
      KO: '대화 주제', EN: 'Topic', ZH: '对话主题', JA: '会話テーマ', FR: 'Sujet', ES: 'Tema'
    },
    'report.aiTitle': {
      KO: '✨ 수업 중 AI 코파일럿 활동 이력', EN: '✨ AI Copilot Activity', ZH: '✨ AI副驾活动记录', JA: '✨ AIコパイロット履歴', FR: '✨ Activité AI Copilot', ES: '✨ Actividad AI Copilot'
    },
    'report.aiDesc': {
      KO: '대화 중 도움받은 기록이에요. 복습하면 다음 대화가 훨씬 편해져요!',
      EN: 'Records from your chat. Review to make the next one easier!',
      ZH: '对话中的帮助记录。复习后下次更轻松！',
      JA: '会話中のヘルプ記録。復習で次が楽に！',
      FR: 'Aide reçue pendant la session. Révisez pour la prochaine !',
      ES: 'Ayuda recibida en la charla. ¡Repasa para la próxima!'
    },
    'report.words': {
      KO: '💡 수업 중 찾은 단어', EN: '💡 Words found', ZH: '💡 找到的词', JA: '💡 見つけた単語', FR: '💡 Mots trouvés', ES: '💡 Palabras encontradas'
    },
    'report.sentences': {
      KO: '📝 수업 중 도움받은 문장', EN: '📝 Sentences helped', ZH: '📝 帮助的句子', JA: '📝 ヘルプした文', FR: '📝 Phrases aidées', ES: '📝 Frases ayudadas'
    }
  };

  var currentLang = 'KO';

  var CSS = [
    '.i18n-wrap{position:relative;display:inline-flex;}',
    '.i18n-btn{display:inline-flex;align-items:center;gap:.35rem;padding:.5rem .75rem;',
    'border:1px solid var(--coral-pale,#FFE8E3);border-radius:999px;background:var(--cream,#FFF8F5);',
    'color:var(--text,#594842);font-family:inherit;font-size:.78rem;font-weight:700;cursor:pointer;',
    'white-space:nowrap;transition:transform .2s,border-color .2s,background .2s;}',
    '.i18n-btn:hover{transform:translateY(-1px);border-color:var(--coral,#FF6B57);}',
    '.i18n-btn .i18n-flag{font-size:1rem;line-height:1;}',
    '.i18n-menu{position:absolute;top:calc(100% + .45rem);right:0;min-width:168px;padding:.35rem;',
    'border:1px solid rgba(255,214,223,.75);border-radius:16px;background:#FFFCFA;',
    'box-shadow:0 14px 36px rgba(113,83,72,.16);opacity:0;visibility:hidden;transform:translateY(-6px);',
    'transition:opacity .15s,transform .15s,visibility .15s;z-index:120;}',
    '.i18n-wrap.is-open .i18n-menu{opacity:1;visibility:visible;transform:translateY(0);}',
    '.i18n-opt{display:flex;align-items:center;gap:.55rem;width:100%;padding:.55rem .65rem;',
    'border:none;border-radius:12px;background:transparent;color:var(--text,#594842);',
    'font-family:inherit;font-size:.78rem;font-weight:700;text-align:left;cursor:pointer;}',
    '.i18n-opt:hover{background:var(--coral-pale,#FFE9E4);}',
    '.i18n-opt.is-active{color:var(--coral-dark,#E85B48);background:var(--coral-pale,#FFE9E4);}',
    '[data-i18n-lang="block"] .i18n-wrap{width:100%;}',
    '[data-i18n-lang="block"] .i18n-btn{width:100%;justify-content:center;}',
    '[data-i18n].i18n-flash{animation:i18nFlash .12s ease;}',
    '@keyframes i18nFlash{0%{opacity:.55}100%{opacity:1}}'
  ].join('');

  function detectLang() {
    var raw = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    if (/^ko/.test(raw)) return 'KO';
    if (/^zh/.test(raw)) return 'ZH';
    if (/^ja/.test(raw)) return 'JA';
    if (/^fr/.test(raw)) return 'FR';
    if (/^es/.test(raw)) return 'ES';
    return 'EN';
  }

  function normalizeLang(code) {
    var upper = String(code || '').toUpperCase();
    return SUPPORTED.indexOf(upper) > -1 ? upper : detectLang();
  }

  function getLang() {
    return currentLang;
  }

  function setLang(code, persist) {
    currentLang = normalizeLang(code);
    if (persist !== false) {
      try { localStorage.setItem(STORAGE_KEY, currentLang); } catch (e) { /* ignore */ }
    }
    apply();
    document.dispatchEvent(new CustomEvent('dayo:langchange', { detail: { lang: currentLang } }));
  }

  function lookup(key, lang) {
    var entry = DICT[key];
    if (!entry) return null;
    if (entry[lang]) return entry[lang];
    for (var i = 0; i < FALLBACK.length; i++) {
      if (entry[FALLBACK[i]]) return entry[FALLBACK[i]];
    }
    return null;
  }

  function t(key, lang) {
    return lookup(key, lang || currentLang) || key;
  }

  function htmlLang(code) {
    return { KO: 'ko', EN: 'en', ZH: 'zh', JA: 'ja', FR: 'fr', ES: 'es' }[code] || 'en';
  }

  function apply() {
    var nodes = document.querySelectorAll('[data-i18n]');
    Array.prototype.forEach.call(nodes, function (node) {
      var key = node.getAttribute('data-i18n');
      var text = lookup(key, currentLang);
      if (!text) return;
      if (node.getAttribute('data-i18n-html') === 'true') {
        node.innerHTML = text;
      } else if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
        if (node.hasAttribute('placeholder')) node.placeholder = text;
        else node.value = text;
      } else {
        node.textContent = text;
      }
      node.classList.add('i18n-flash');
      setTimeout(function () { node.classList.remove('i18n-flash'); }, 120);
    });

    document.documentElement.lang = htmlLang(currentLang);

    Array.prototype.forEach.call(document.querySelectorAll('.i18n-opt'), function (btn) {
      var active = btn.dataset.lang === currentLang;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });

    var triggers = document.querySelectorAll('.i18n-btn');
    Array.prototype.forEach.call(triggers, function (btn) {
      var meta = LANG_META[currentLang];
      if (!meta) return;
      var flag = btn.querySelector('.i18n-flag');
      var label = btn.querySelector('.i18n-label');
      if (flag) flag.textContent = meta.flag;
      if (label) label.textContent = meta.label;
    });
  }

  function closeAllMenus() {
    Array.prototype.forEach.call(document.querySelectorAll('.i18n-wrap.is-open'), function (wrap) {
      wrap.classList.remove('is-open');
    });
  }

  function buildSwitcher() {
    var options = SUPPORTED.map(function (code) {
      var meta = LANG_META[code];
      return '<button class="i18n-opt" type="button" role="option" data-lang="' + code + '">' +
        '<span aria-hidden="true">' + meta.flag + '</span>' + meta.label + '</button>';
    }).join('');

    return '<div class="i18n-wrap">' +
      '<button class="i18n-btn" type="button" aria-haspopup="listbox" aria-label="' + t('lang.select') + '">' +
      '<span class="i18n-flag" aria-hidden="true">' + LANG_META[currentLang].flag + '</span>' +
      '<span class="i18n-label">' + LANG_META[currentLang].label + '</span>' +
      '</button>' +
      '<div class="i18n-menu" role="listbox">' + options + '</div>' +
      '</div>';
  }

  function mountSwitchers() {
    var slots = document.querySelectorAll('[data-i18n-lang]');
    Array.prototype.forEach.call(slots, function (slot) {
      slot.innerHTML = buildSwitcher();
    });

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.i18n-btn');
      if (btn) {
        e.stopPropagation();
        var wrap = btn.closest('.i18n-wrap');
        var open = wrap.classList.contains('is-open');
        closeAllMenus();
        if (!open) wrap.classList.add('is-open');
        return;
      }
      var opt = e.target.closest('.i18n-opt');
      if (opt) {
        setLang(opt.dataset.lang);
        closeAllMenus();
        return;
      }
      if (!e.target.closest('.i18n-wrap')) closeAllMenus();
    });
  }

  function init() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      currentLang = saved ? normalizeLang(saved) : detectLang();
    } catch (e) {
      currentLang = detectLang();
    }

    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    mountSwitchers();
    apply();

    window.DayOI18n = { t: t, getLang: getLang, setLang: setLang, apply: apply };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
