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

  /* 대화 언어 이름표 — 히어로 롤링, 예약 모달 등에서 공용으로 재사용 */
  var LANG_NAMES = {
    en: { flag: '🇺🇸', KO: '영어', EN: 'English', ZH: '英语', JA: '英語', FR: 'Anglais', ES: 'Inglés' },
    es: { flag: '🇪🇸', KO: '스페인어', EN: 'Spanish', ZH: '西班牙语', JA: 'スペイン語', FR: 'Espagnol', ES: 'Español' },
    fr: { flag: '🇫🇷', KO: '프랑스어', EN: 'French', ZH: '法语', JA: 'フランス語', FR: 'Français', ES: 'Francés' },
    ja: { flag: '🇯🇵', KO: '일본어', EN: 'Japanese', ZH: '日语', JA: '日本語', FR: 'Japonais', ES: 'Japonés' },
    zh: { flag: '🇨🇳', KO: '중국어', EN: 'Chinese', ZH: '中文', JA: '中国語', FR: 'Chinois', ES: 'Chino' },
    vi: { flag: '🇻🇳', KO: '베트남어', EN: 'Vietnamese', ZH: '越南语', JA: 'ベトナム語', FR: 'Vietnamien', ES: 'Vietnamita' },
    de: { flag: '🇩🇪', KO: '독일어', EN: 'German', ZH: '德语', JA: 'ドイツ語', FR: 'Allemand', ES: 'Alemán' },
    it: { flag: '🇮🇹', KO: '이탈리아어', EN: 'Italian', ZH: '意大利语', JA: 'イタリア語', FR: 'Italien', ES: 'Italiano' },
    ru: { flag: '🇷🇺', KO: '러시아어', EN: 'Russian', ZH: '俄语', JA: 'ロシア語', FR: 'Russe', ES: 'Ruso' },
    ko: { flag: '🇰🇷', KO: '한국어', EN: 'Korean', ZH: '韩语', JA: '韓国語', FR: 'Coréen', ES: 'Coreano' }
  };

  /* 주/요일 · 달 이름 — 예약 모달 달력에서 공용으로 재사용 */
  var WEEKDAY_NAMES = {
    KO: ['일', '월', '화', '수', '목', '금', '토'],
    EN: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    ZH: ['日', '一', '二', '三', '四', '五', '六'],
    JA: ['日', '月', '火', '水', '木', '金', '土'],
    FR: ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'],
    ES: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa']
  };

  var MONTH_NAMES = {
    EN: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    FR: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    ES: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  };

  function formatMonthTitle(year, month, lang) {
    if (lang === 'KO') return year + '년 ' + (month + 1) + '월';
    if (lang === 'ZH') return year + '年 ' + (month + 1) + '月';
    if (lang === 'JA') return year + '年 ' + (month + 1) + '月';
    if (lang === 'FR') return MONTH_NAMES.FR[month] + ' ' + year;
    if (lang === 'ES') return MONTH_NAMES.ES[month] + ' de ' + year;
    return MONTH_NAMES.EN[month] + ' ' + year;
  }

  var DICT = {
    'nav.about': {
      KO: '서비스 소개', EN: 'About', ZH: '服务介绍', JA: 'サービス紹介', FR: 'À propos', ES: 'Sobre nosotros'
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
    'nav.ask': {
      KO: '💬 질문 있어요', EN: '💬 Ask a question', ZH: '💬 我有问题', JA: '💬 質問があります', FR: '💬 Une question', ES: '💬 Tengo una pregunta'
    },
    'nav.startChat': {
      KO: '🚀 바로 대화 시작하기', EN: '🚀 Start chatting now', ZH: '🚀 马上开始对话', JA: '🚀 今すぐ会話を始める', FR: '🚀 Commencer maintenant', ES: '🚀 Empezar ya'
    },
    'nav.menuOpen': { KO: '메뉴 열기', EN: 'Open menu', ZH: '打开菜单', JA: 'メニューを開く', FR: 'Ouvrir le menu', ES: 'Abrir menú' },
    'nav.menuClose': { KO: '메뉴 닫기', EN: 'Close menu', ZH: '关闭菜单', JA: 'メニューを閉じる', FR: 'Fermer le menu', ES: 'Cerrar menú' },
    'nav.mypage': {
      KO: '마이페이지', EN: 'My Page', ZH: '我的页面', JA: 'マイページ', FR: 'Mon espace', ES: 'Mi página'
    },
    'nav.partnerJoin': {
      KO: '파트너 참여', EN: 'Join as Partner', ZH: '成为伙伴', JA: 'パートナー参加', FR: 'Devenir partenaire', ES: 'Ser compañero'
    },
    'nav.partnerStudio': {
      KO: '파트너 스튜디오로 이동', EN: 'Go to Partner Studio', ZH: '前往伙伴工作室', JA: 'パートナースタジオへ', FR: 'Aller au Studio', ES: 'Ir al Estudio'
    },
    'nav.learnerMypage': {
      KO: '학습자 마이페이지로 이동', EN: 'Go to Learner My Page', ZH: '前往学习者页面', JA: '学習者ページへ', FR: 'Aller à Mon espace', ES: 'Ir a Mi página'
    },
    'nav.partnerSpace': {
      KO: '파트너 공간', EN: 'Partner Space', ZH: '伙伴空间', JA: 'パートナー空間', FR: 'Espace partenaire', ES: 'Espacio partner'
    },
    'lang.select': {
      KO: '언어 선택', EN: 'Select language', ZH: '选择语言', JA: '言語を選択', FR: 'Choisir la langue', ES: 'Elegir idioma'
    },
    'login.required': {
      KO: '로그인이 필요한 서비스입니다 🔑', EN: 'Please sign in to continue 🔑', ZH: '需要登录 🔑', JA: 'ログインが必要です 🔑', FR: 'Connexion requise 🔑', ES: 'Inicia sesión 🔑'
    },
    'login.headerBtn': {
      KO: '로그인 / 회원가입', EN: 'Log in / Sign up', ZH: '登录 / 注册', JA: 'ログイン / 新規登録', FR: 'Connexion / Inscription', ES: 'Iniciar / Registrarse'
    },
    'login.logout': {
      KO: '로그아웃', EN: 'Log out', ZH: '退出登录', JA: 'ログアウト', FR: 'Se déconnecter', ES: 'Cerrar sesión'
    },
    'login.logoutToast': {
      KO: '로그아웃되었습니다. 언제든 다시 만나요 ☕', EN: "You're logged out. See you again soon ☕", ZH: '已退出登录。随时欢迎回来 ☕', JA: 'ログアウトしました。またいつでもどうぞ ☕', FR: 'Déconnexion réussie. À bientôt ☕', ES: 'Sesión cerrada. Vuelve cuando quieras ☕'
    },
    'login.greetingFormat': {
      KO: '{name}님', EN: '{name}', ZH: '{name}', JA: '{name}さん', FR: '{name}', ES: '{name}'
    },
    'login.title': {
      KO: '세계 어디서나, 나를 기다리는 다정한 대화 파트너 ☕️',
      EN: 'A warm conversation partner waiting for you, anywhere ☕️',
      ZH: '无论身在何处，都有温柔的对话伙伴在等你 ☕️',
      JA: '世界のどこでも、あなたを待つあたたかい会話パートナー ☕️',
      FR: 'Un partenaire chaleureux qui vous attend partout ☕️',
      ES: 'Un compañero cálido que te espera en cualquier lugar ☕️'
    },
    'login.desc': {
      KO: '로그인하고 나만의 AI 스피킹 리포트를 받아보세요!',
      EN: 'Sign in and get your own AI speaking report!',
      ZH: '登录后领取专属 AI 口语报告！',
      JA: 'ログインして、あなただけのAIスピーキングレポートを受け取りましょう！',
      FR: 'Connectez-vous et recevez votre rapport IA !',
      ES: '¡Inicia sesión y recibe tu informe de speaking con IA!'
    },
    'login.emailPlaceholder': {
      KO: '이메일 주소 입력', EN: 'Enter email address', ZH: '输入邮箱地址', JA: 'メールアドレスを入力', FR: 'Adresse e-mail', ES: 'Correo electrónico'
    },
    'login.passwordPlaceholder': {
      KO: '비밀번호 입력', EN: 'Enter password', ZH: '输入密码', JA: 'パスワードを入力', FR: 'Mot de passe', ES: 'Contraseña'
    },
    'login.nicknamePlaceholder': {
      KO: '닉네임 또는 이메일을 입력해 주세요', EN: 'Enter nickname or email', ZH: '请输入昵称或邮箱', JA: 'ニックネームまたはメールを入力', FR: 'Pseudo ou e-mail', ES: 'Apodo o correo'
    },
    'login.startBtn': {
      KO: 'DayO 시작하기 🚀', EN: 'Start DayO 🚀', ZH: '开始 DayO 🚀', JA: 'DayOをはじめる 🚀', FR: 'Commencer DayO 🚀', ES: 'Empezar DayO 🚀'
    },
    'login.socialDivider': {
      KO: '또는 소셜 계정으로 시작하기',
      EN: 'Or continue with a social account',
      ZH: '或使用社交账号开始',
      JA: 'またはソーシャルアカウントで始める',
      FR: 'Ou continuer avec un compte social',
      ES: 'O continúa con una cuenta social'
    },
    'login.social.kakao': {
      KO: '카카오로 시작하기', EN: 'Continue with Kakao', ZH: '用 Kakao 开始', JA: 'Kakaoで始める', FR: 'Continuer avec Kakao', ES: 'Continuar con Kakao'
    },
    'login.social.naver': {
      KO: '네이버로 시작하기', EN: 'Continue with Naver', ZH: '用 Naver 开始', JA: 'Naverで始める', FR: 'Continuer avec Naver', ES: 'Continuar con Naver'
    },
    'login.social.google': {
      KO: 'Google로 시작하기', EN: 'Continue with Google', ZH: '用 Google 开始', JA: 'Googleで始める', FR: 'Continuer avec Google', ES: 'Continuar con Google'
    },
    'login.passwordMismatch': {
      KO: '비밀번호가 올바르지 않아요. 다시 확인해 주세요 🔑',
      EN: 'Incorrect password. Please try again 🔑',
      ZH: '密码不正确，请再试一次 🔑',
      JA: 'パスワードが正しくありません。もう一度ご確認ください 🔑',
      FR: 'Mot de passe incorrect. Réessayez 🔑',
      ES: 'Contraseña incorrecta. Inténtalo de nuevo 🔑'
    },
    'login.welcomeTitle': {
      KO: '🎉 DayO에 오신 걸 환영해요, {name}님!',
      EN: '🎉 Welcome to DayO, {name}!',
      ZH: '🎉 欢迎来到 DayO，{name}！',
      JA: '🎉 DayOへようこそ、{name}さん！',
      FR: '🎉 Bienvenue sur DayO, {name} !',
      ES: '🎉 ¡Bienvenido/a a DayO, {name}!'
    },
    'login.welcomeBody': {
      KO: '첫 수업 체험권은 9,900원이에요. 총 30분(25분 화상 대화 + 5분 미니 퀴즈/리포트)으로 시작해 볼까요?',
      EN: 'Your first-class trial pass is 9,900 KRW. A session is 30 minutes (25 min live chat + 5 min mini quiz/report). Ready to start?',
      ZH: '首次体验券为9,900韩元。每节课共30分钟（25分钟视频对话 + 5分钟小测验/报告）。要开始吗？',
      JA: '初回体験チケットは9,900ウォンです。1回30分（25分のビデオ会話 + 5分のミニクイズ/レポート）で始めましょうか？',
      FR: "Le pass d'essai (1re séance) est à 9 900 KRW. Une session dure 30 min (25 min de conversation + 5 min de mini-quiz/rapport). On commence ?",
      ES: 'El pase de prueba (1.ª clase) cuesta 9.900 KRW. Cada sesión dura 30 min (25 min de charla + 5 min de mini quiz/informe). ¿Empezamos?'
    },
    'login.welcomeCta': {
      KO: '지금 바로 시작하기', EN: 'Start right now', ZH: '马上开始', JA: '今すぐはじめる', FR: 'Commencer maintenant', ES: 'Empezar ahora'
    },
    'login.welcomeToast': {
      KO: '{name}님, 환영해요! 오늘도 따뜻한 대화를 시작해 볼까요? 💖',
      EN: 'Welcome, {name}! Ready for a warm chat today? 💖',
      ZH: '欢迎，{name}！今天也来一段温暖的对话吧 💖',
      JA: '{name}さん、ようこそ！今日もあたたかい会話を始めましょう 💖',
      FR: 'Bienvenue, {name} ! Prêt(e) pour une conversation chaleureuse ? 💖',
      ES: '¡Bienvenido/a, {name}! ¿Listo/a para una charla cálida? 💖'
    },
    'login.quick': {
      KO: '☕ 로그인하기', EN: '☕ Sign in', ZH: '☕ 登录', JA: '☕ ログイン', FR: '☕ Connexion', ES: '☕ Iniciar sesión'
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
    'mypage.status.remainingNote': {
      KO: '모든 이용권은 결제 후 90일 내 소진 필수.',
      EN: 'All passes must be used within 90 days of payment.',
      ZH: '所有次数券须在付款后90天内用完。',
      JA: 'すべての利用券は決済後90日以内に使い切る必要があります。',
      FR: 'Tous les tickets doivent être utilisés dans les 90 jours après paiement.',
      ES: 'Todos los pases deben usarse en 90 días tras el pago.'
    },
    'mypage.status.timeNote': {
      KO: '연속 3주째 대화를 이어가는 중이에요 💖', EN: '3 weeks in a row — keep it up! 💖', ZH: '已连续3周对话 💖', JA: '3週連続で会話中 💖', FR: '3 semaines d\'affilée 💖', ES: '¡3 semanas seguidas! 💖'
    },
    'mypage.sessions.title': {
      KO: '📅 내 예약 세션', EN: '📅 Upcoming Sessions', ZH: '📅 我的预约', JA: '📅 予約セッション', FR: '📅 Sessions à venir', ES: '📅 Próximas sesiones'
    },
    'mypage.sessions.sub': {
      KO: '수업 시작 1시간 전까지 요일·시간 변경/취소가 가능해요.',
      EN: 'You can change or cancel the day/time until 1 hour before class.',
      ZH: '开课1小时前可更改或取消星期和时间。',
      JA: '授業開始1時間前まで曜日・時間の変更/キャンセルが可能です。',
      FR: 'Changement ou annulation du jour/heure possible jusqu’à 1 h avant le cours.',
      ES: 'Puedes cambiar o cancelar día/hora hasta 1 hora antes de la clase.'
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
    },

    /* ===== Hero (index.html) ===== */
    'hero.titleLead': {
      KO: '{lang}, 이제', EN: '{lang}, now', ZH: '{lang}，现在', JA: '{lang}、いま', FR: '{lang}, maintenant', ES: '{lang}, ahora'
    },
    'hero.titleEm': {
      KO: '돼요!', EN: "it's possible!", ZH: '都行！', JA: 'できる！', FR: "c'est possible !", ES: '¡es posible!'
    },
    'hero.subtitle': {
      KO: '오픽부터 워홀까지, 눈 맞추며 시작하는 1:1 라이브 대화',
      EN: 'From OPIc to working holidays, live 1:1 conversations that start with eye contact.',
      ZH: '从OPIc到打工度假，眼神交流开始的1:1实时对话。',
      JA: 'OPIcからワーホリまで、目を合わせて始める1:1ライブ会話。',
      FR: "De l'OPIc au PVT, des conversations en direct 1:1, les yeux dans les yeux.",
      ES: 'Desde el OPIc hasta el working holiday, charlas 1:1 en vivo mirándote a los ojos.'
    },
    'hero.badge': {
      KO: '🍰 내 회화 수준 진단', EN: '🍰 Speaking level check', ZH: '🍰 会话水平诊断', JA: '🍰 会話レベル診断', FR: '🍰 Diagnostic de niveau', ES: '🍰 Diagnóstico de nivel'
    },
    'hero.cta': {
      KO: '🍰 내 스피킹 감각 무료로 테스트하기 ›', EN: '🍰 Test my speaking sense for free ›', ZH: '🍰 免费测试我的口语感觉 ›', JA: '🍰 スピーキング感覚を無料でテスト ›', FR: '🍰 Tester gratuitement mon niveau ›', ES: '🍰 Probar gratis mi nivel de habla ›'
    },
    'hero.liveBadge': {
      KO: 'AI 코파일럿 실시간 지원 중', EN: 'AI copilot live support', ZH: 'AI副驾实时支持中', JA: 'AIコパイロットがリアルタイム支援中', FR: 'Copilote IA en direct', ES: 'Copiloto IA en vivo'
    },
    'hero.avatarAriaFormat': {
      KO: '미소 짓는 {name} 파스텔 아바타', EN: 'Smiling pastel avatar of {name}', ZH: '微笑的{name}粉彩头像', JA: '微笑む{name}のパステルアバター', FR: 'Avatar pastel souriant de {name}', ES: 'Avatar pastel sonriente de {name}'
    },

    /* ===== Journey / About (index.html) ===== */
    'journey.eyebrow': {
      KO: 'How it works', EN: 'How it works', ZH: 'How it works', JA: 'How it works', FR: 'How it works', ES: 'How it works'
    },
    'journey.title': {
      KO: '3단계로 완성하는 나만의 회화 여정', EN: 'Your speaking journey in 3 simple steps', ZH: '3步完成属于我的会话之旅', JA: '3ステップで完成する会話の旅', FR: 'Votre parcours en 3 étapes', ES: 'Tu camino de conversación en 3 pasos'
    },
    'journey.step1.tag': { KO: 'STEP 01', EN: 'STEP 01', ZH: 'STEP 01', JA: 'STEP 01', FR: 'ÉTAPE 01', ES: 'PASO 01' },
    'journey.step1.title': {
      KO: '스피킹 감각 테스트', EN: 'Speaking sense test', ZH: '口语感觉测试', JA: 'スピーキング感覚テスト', FR: 'Test de speaking', ES: 'Prueba de speaking'
    },
    'journey.step1.desc': {
      KO: '부담 없이 확인하는 내 스피킹 위치',
      EN: 'A pressure-free check of where your speaking stands.',
      ZH: '轻松确认我的口语水平。',
      JA: '気軽に確認できるスピーキングの立ち位置。',
      FR: 'Un test sans pression de votre niveau.',
      ES: 'Una prueba sin presión de tu nivel de habla.'
    },
    'journey.step2.tag': { KO: 'STEP 02', EN: 'STEP 02', ZH: 'STEP 02', JA: 'STEP 02', FR: 'ÉTAPE 02', ES: 'PASO 02' },
    'journey.step2.title': {
      KO: 'AI 실시간 코칭', EN: 'Real-time AI coaching', ZH: 'AI实时指导', JA: 'AIリアルタイムコーチング', FR: 'Coaching IA en direct', ES: 'Coaching de IA en vivo'
    },
    'journey.step2.desc': {
      KO: '대화 중 막혀도 AI가 실시간으로 단어와 문장 지원',
      EN: "Stuck mid-chat? AI backs you up with words and sentences instantly.",
      ZH: '对话中卡壳时，AI实时提供单词和句子支持。',
      JA: '会話中に詰まってもAIがリアルタイムで単語や文をサポート。',
      FR: "Bloqué en pleine conversation ? L'IA vous aide en temps réel.",
      ES: '¿Te trabas? La IA te ayuda con palabras y frases al instante.'
    },
    'journey.step3.tag': { KO: 'STEP 03', EN: 'STEP 03', ZH: 'STEP 03', JA: 'STEP 03', FR: 'ÉTAPE 03', ES: 'PASO 03' },
    'journey.step3.title': {
      KO: '1:1 원어민 눈맞춤 대화', EN: '1:1 eye-contact conversation', ZH: '1:1面对面对话', JA: '1:1で目を合わせる会話', FR: 'Conversation 1:1 en face à face', ES: 'Conversación 1:1 cara a cara'
    },
    'journey.step3.desc': {
      KO: '울렁증 없이 친구처럼 다정하게 트이는 실전 회화',
      EN: 'No jitters — real conversations that open up like chatting with a friend.',
      ZH: '没有紧张感，像朋友一样自然打开的实战会话。',
      JA: '緊張なく友達のように話せる実践会話。',
      FR: 'Sans stress, des conversations qui coulent comme entre amis.',
      ES: 'Sin nervios, charlas reales como con un amigo.'
    },

    /* ===== Partners teaser (index.html) ===== */
    'partnersTeaser.eyebrow': { KO: 'Partners', EN: 'Partners', ZH: 'Partners', JA: 'Partners', FR: 'Partners', ES: 'Partners' },
    'partnersTeaser.title': {
      KO: '다정한 대화 파트너와 눈 맞추며', EN: 'Eye to eye with a warm conversation partner', ZH: '与温暖的对话伙伴眼神交流', JA: '温かい会話パートナーと目を合わせて', FR: 'Face à un partenaire chaleureux', ES: 'Frente a un compañero cálido'
    },
    'partnersTeaser.card1.desc': {
      KO: '카페 같은 분위기로 천천히 이끌어 주는 프랑스어 대화 파트너',
      EN: 'A French partner who guides you slowly, café-style.',
      ZH: '以咖啡馆般的氛围慢慢引导的法语对话伙伴。',
      JA: 'カフェのような雰囲気でゆっくり導くフランス語会話パートナー。',
      FR: 'Un partenaire français qui vous guide en douceur, esprit café.',
      ES: 'Un compañero francés que te guía con calma, ambiente de café.'
    },
    'partnersTeaser.card2.desc': {
      KO: '오픽·워홀 실전 상황으로 자연스럽게 말문이 트이는 코칭',
      EN: 'Coaching with real OPIc and working-holiday scenarios to open you up naturally.',
      ZH: '通过OPIc·打工度假实战场景自然打开话题的辅导。',
      JA: 'OPIc・ワーホリの実戦シーンで自然に話が出てくるコーチング。',
      FR: "Un coaching avec des scénarios réels d'OPIc et de PVT.",
      ES: 'Coaching con escenarios reales de OPIc y working holiday.'
    },
    'partnersTeaser.card3.desc': {
      KO: '친구처럼 다정한 일본어 대화로 울렁증 없이 시작해요',
      EN: 'Start jitter-free with friendly Japanese conversation, like chatting with a friend.',
      ZH: '像朋友一样亲切的日语对话，没有紧张感地开始吧。',
      JA: '友達のように温かい日本語会話で緊張せずに始めましょう。',
      FR: 'Commencez sans stress avec une conversation japonaise amicale.',
      ES: 'Empieza sin nervios con una charla en japonés amistosa.'
    },

    /* ===== Booking CTA section (index.html) ===== */
    'bookingCta.eyebrow': { KO: 'Booking', EN: 'Booking', ZH: 'Booking', JA: 'Booking', FR: 'Booking', ES: 'Booking' },
    'bookingCta.title': {
      KO: '지금, 화상 회화 스튜디오에서 만나요', EN: 'Meet now in the video conversation studio', ZH: '现在，在视频会话工作室见面吧', JA: '今すぐ、ビデオ会話スタジオで会いましょう', FR: 'Rejoignez le studio vidéo maintenant', ES: 'Reúnete ahora en el estudio de video'
    },
    'bookingCta.desc': {
      KO: '원어민과 눈 맞추며 대화하는 라이브 룸으로 바로 이동해요.',
      EN: 'Head straight into a live room and talk face-to-face with a native speaker.',
      ZH: '直接进入与母语者眼神交流对话的实时房间。',
      JA: 'ネイティブと目を合わせて話すライブルームへすぐ移動します。',
      FR: 'Direction la salle en direct pour parler avec un locuteur natif.',
      ES: 'Ve directo a la sala en vivo para hablar con un nativo.'
    },
    'bookingCta.book': {
      KO: '📅 대화 예약하기', EN: '📅 Book a Chat', ZH: '📅 预约对话', JA: '📅 会話予約', FR: '📅 Réserver', ES: '📅 Reservar'
    },

    /* ===== Reviews (index.html) ===== */
    'reviews.eyebrow': { KO: 'Real Stories', EN: 'Real Stories', ZH: 'Real Stories', JA: 'Real Stories', FR: 'Real Stories', ES: 'Real Stories' },
    'reviews.title': {
      KO: '2030, 직접 경험한 후기', EN: 'Real reviews from users in their 20s-30s', ZH: '2030真实体验后记', JA: '20〜30代のリアルな体験談', FR: 'Avis réels de la génération 20-30 ans', ES: 'Opiniones reales de 20-30 años'
    },
    'reviews.card1.text': {
      KO: '"워홀 가기 전 한 달 동안 했는데 외국인 울렁증 완전 사라졌어요!"',
      EN: '"I did it for a month before my working holiday and my fear of foreigners totally disappeared!"',
      ZH: '"在打工度假前做了一个月，对外国人的紧张感完全消失了！"',
      JA: '"ワーホリ前に1ヶ月やったら外国人への緊張感が完全になくなりました！"',
      FR: '"Un mois avant mon PVT et ma peur des étrangers a disparu !"',
      ES: '"¡Un mes antes de mi working holiday y mi miedo a hablar con extranjeros desapareció!"'
    },
    'reviews.card1.author': {
      KO: '워홀 준비생 20대 K님', EN: 'K, 20s, preparing for a working holiday', ZH: '打工度假准备生 20多岁K先生', JA: 'ワーホリ準備中の20代Kさん', FR: 'K, 20 ans, prépare son PVT', ES: 'K, de 20 años, prepara su working holiday'
    },
    'reviews.card2.text': {
      KO: '"오픽 AL 한 번에 달성! 막힐 때 AI 코파일럿이 살려준 덕분이에요"',
      EN: '"Got OPIc AL on the first try — the AI copilot saved me whenever I got stuck!"',
      ZH: '"OPIc AL 一次达成！卡壳时全靠AI副驾救场"',
      JA: '"OPIc AL一発達成！詰まった時にAIコパイロットが助けてくれたおかげです"',
      FR: '"OPIc AL du premier coup grâce au copilote IA quand je bloquais !"',
      ES: '"¡Logré el OPIc AL a la primera gracias al copiloto IA cuando me trababa!"'
    },
    'reviews.card2.author': {
      KO: '취준생 20대 L님', EN: 'L, 20s, job seeker', ZH: '求职者 20多岁L先生', JA: '就活中の20代Lさん', FR: 'L, 20 ans, en recherche d\'emploi', ES: 'L, de 20 años, buscando trabajo'
    },
    'reviews.card3.text': {
      KO: '"해외 여행 가서 현지인 카페 주문 완벽 성공! 진짜 돼요!"',
      EN: '"Ordered perfectly at a local café while traveling abroad — it really works!"',
      ZH: '"出国旅行时在当地咖啡馆完美点单成功！真的可以！"',
      JA: '"海外旅行で現地カフェの注文に完璧成功！本当にできる！"',
      FR: '"Commande réussie dans un café local en voyage — ça marche vraiment !"',
      ES: '"¡Pedí perfecto en un café local de viaje — de verdad funciona!"'
    },
    'reviews.card3.author': {
      KO: '직장인 30대 P님', EN: 'P, 30s, office worker', ZH: '职场人 30多岁P先生', JA: '会社員の30代Pさん', FR: 'P, 30 ans, employé de bureau', ES: 'P, de 30 años, empleado de oficina'
    },

    /* ===== Quiz modal (index.html) ===== */
    'quiz.badge': {
      KO: '내 스피킹 감각 알아보기', EN: 'Discover your speaking sense', ZH: '了解我的口语感觉', JA: 'スピーキング感覚を知る', FR: 'Découvrez votre niveau', ES: 'Descubre tu nivel de habla'
    },
    'quiz.title': {
      KO: '스피킹 감각 테스트', EN: 'Speaking sense test', ZH: '口语感觉测试', JA: 'スピーキング感覚テスト', FR: 'Test de speaking', ES: 'Prueba de speaking'
    },
    'quiz.closeAria': { KO: '닫기', EN: 'Close', ZH: '关闭', JA: '閉じる', FR: 'Fermer', ES: 'Cerrar' },
    'quiz.q1.tag': { KO: '☕ 카페', EN: '☕ Café', ZH: '☕ 咖啡馆', JA: '☕ カフェ', FR: '☕ Café', ES: '☕ Café' },
    'quiz.q1.scene': {
      KO: '바리스타가 "{quote}"라고 물어봤어요. 가장 자연스러운 답은?',
      EN: 'The barista asked, "{quote}" What is the most natural reply?',
      ZH: '咖啡师问了"{quote}"。最自然的回答是？',
      JA: 'バリスタが「{quote}」と聞きました。一番自然な答えは？',
      FR: 'Le barista a demandé « {quote} ». Quelle est la réponse la plus naturelle ?',
      ES: 'El barista preguntó "{quote}". ¿Cuál es la respuesta más natural?'
    },
    'quiz.q2.tag': { KO: '✈️ 공항', EN: '✈️ Airport', ZH: '✈️ 机场', JA: '✈️ 空港', FR: '✈️ Aéroport', ES: '✈️ Aeropuerto' },
    'quiz.q2.scene': {
      KO: '체크인 카운터에서 "{quote}"라고 했어요.',
      EN: 'At the check-in counter, they said, "{quote}"',
      ZH: '在值机柜台说了"{quote}"。',
      JA: 'チェックインカウンターで「{quote}」と言われました。',
      FR: 'Au comptoir d\'enregistrement, on vous dit : « {quote} »',
      ES: 'En el mostrador de check-in dijeron: "{quote}"'
    },
    'quiz.q3.tag': { KO: '🚕 택시', EN: '🚕 Taxi', ZH: '🚕 出租车', JA: '🚕 タクシー', FR: '🚕 Taxi', ES: '🚕 Taxi' },
    'quiz.q3.scene': {
      KO: '택시 기사님이 "{quote}"라고 물어봤어요.',
      EN: 'The taxi driver asked, "{quote}"',
      ZH: '出租车司机问了"{quote}"。',
      JA: 'タクシー運転手が「{quote}」と聞きました。',
      FR: 'Le chauffeur de taxi a demandé « {quote} »',
      ES: 'El taxista preguntó "{quote}"'
    },
    'quiz.q4.tag': { KO: '🏨 호텔', EN: '🏨 Hotel', ZH: '🏨 酒店', JA: '🏨 ホテル', FR: '🏨 Hôtel', ES: '🏨 Hotel' },
    'quiz.q4.scene': {
      KO: '프론트에서 "{quote}"라고 물었어요.',
      EN: 'At the front desk, they asked, "{quote}"',
      ZH: '前台问了"{quote}"。',
      JA: 'フロントで「{quote}」と聞かれました。',
      FR: "À la réception, on vous demande : « {quote} »",
      ES: 'En la recepción preguntaron: "{quote}"'
    },
    'quiz.q5.tag': { KO: '🍽️ 레스토랑', EN: '🍽️ Restaurant', ZH: '🍽️ 餐厅', JA: '🍽️ レストラン', FR: '🍽️ Restaurant', ES: '🍽️ Restaurante' },
    'quiz.q5.scene': {
      KO: '"{quote}"라는 질문에 답해야 해요.',
      EN: 'You need to answer: "{quote}"',
      ZH: '需要回答"{quote}"这个问题。',
      JA: '「{quote}」という質問に答える必要があります。',
      FR: 'Vous devez répondre à : « {quote} »',
      ES: 'Debes responder a: "{quote}"'
    },
    'quiz.emailTitle': {
      KO: '내 스피킹 약점 분석표 &<br>맞춤 코스 리포트 받아보기',
      EN: 'Get my speaking weakness report &<br>a personalized course recommendation',
      ZH: '获取我的口语弱点分析表 &<br>专属课程报告',
      JA: 'スピーキング弱点分析表と<br>おすすめコースレポートを受け取る',
      FR: 'Recevez mon analyse de faiblesses &<br>un programme personnalisé',
      ES: 'Recibe mi análisis de debilidades &<br>un curso personalizado'
    },
    'quiz.emailDesc': {
      KO: '테스트 결과를 바탕으로 나만의 스피킹 코스를 추천해 드릴게요',
      EN: "We'll recommend a speaking course made just for you, based on your results.",
      ZH: '根据测试结果为您推荐专属口语课程。',
      JA: 'テスト結果に基づいて、あなただけのスピーキングコースをご提案します。',
      FR: 'Nous vous recommandons un programme sur mesure selon vos résultats.',
      ES: 'Te recomendaremos un curso a tu medida según tus resultados.'
    },
    'quiz.emailPlaceholder': {
      KO: '이메일을 입력해 주세요', EN: 'Enter your email', ZH: '请输入电子邮箱', JA: 'メールアドレスを入力してください', FR: 'Entrez votre e-mail', ES: 'Ingresa tu correo'
    },
    'quiz.emailLocalPlaceholder': {
      KO: '아이디', EN: 'Username', ZH: '用户名', JA: 'ユーザー名', FR: 'Identifiant', ES: 'Usuario'
    },
    'quiz.emailDomainAria': {
      KO: '이메일 도메인 선택', EN: 'Select email domain', ZH: '选择邮箱域名', JA: 'メールドメインを選択', FR: 'Choisir le domaine e-mail', ES: 'Seleccionar dominio de correo'
    },
    'quiz.emailDomain.naver': {
      KO: '네이버 (naver.com)', EN: 'Naver (naver.com)', ZH: 'Naver (naver.com)', JA: 'Naver (naver.com)', FR: 'Naver (naver.com)', ES: 'Naver (naver.com)'
    },
    'quiz.emailDomain.gmail': {
      KO: '구글 (gmail.com)', EN: 'Google (gmail.com)', ZH: 'Google (gmail.com)', JA: 'Google (gmail.com)', FR: 'Google (gmail.com)', ES: 'Google (gmail.com)'
    },
    'quiz.emailDomain.daum': {
      KO: '다음 (daum.net)', EN: 'Daum (daum.net)', ZH: 'Daum (daum.net)', JA: 'Daum (daum.net)', FR: 'Daum (daum.net)', ES: 'Daum (daum.net)'
    },
    'quiz.emailDomain.icloud': {
      KO: '애플 (icloud.com)', EN: 'Apple (icloud.com)', ZH: 'Apple (icloud.com)', JA: 'Apple (icloud.com)', FR: 'Apple (icloud.com)', ES: 'Apple (icloud.com)'
    },
    'quiz.emailDomain.outlook': {
      KO: '아웃룩 (outlook.com)', EN: 'Outlook (outlook.com)', ZH: 'Outlook (outlook.com)', JA: 'Outlook (outlook.com)', FR: 'Outlook (outlook.com)', ES: 'Outlook (outlook.com)'
    },
    'quiz.emailDomain.yahoo': {
      KO: '야후 (yahoo.com)', EN: 'Yahoo (yahoo.com)', ZH: 'Yahoo (yahoo.com)', JA: 'Yahoo (yahoo.com)', FR: 'Yahoo (yahoo.com)', ES: 'Yahoo (yahoo.com)'
    },
    'quiz.emailDomain.hanmail': {
      KO: '한메일 (hanmail.net)', EN: 'Hanmail (hanmail.net)', ZH: 'Hanmail (hanmail.net)', JA: 'Hanmail (hanmail.net)', FR: 'Hanmail (hanmail.net)', ES: 'Hanmail (hanmail.net)'
    },
    'quiz.emailDomain.custom': {
      KO: '직접 입력', EN: 'Enter manually', ZH: '手动输入', JA: '直接入力', FR: 'Saisie manuelle', ES: 'Escribir manualmente'
    },
    'quiz.emailDomainCustomPlaceholder': {
      KO: '예: company.com', EN: 'e.g. company.com', ZH: '例如：company.com', JA: '例：company.com', FR: 'ex. company.com', ES: 'ej. company.com'
    },
    'quiz.emailSubmit': {
      KO: '리포트 받아보기', EN: 'Get my report', ZH: '获取报告', JA: 'レポートを受け取る', FR: 'Recevoir le rapport', ES: 'Recibir el informe'
    },
    'quiz.toastFormat': {
      KO: '{email}로 리포트를 보내드릴게요!', EN: "We'll send the report to {email}!", ZH: '将把报告发送到{email}！', JA: '{email}にレポートをお送りします！', FR: 'Nous enverrons le rapport à {email} !', ES: '¡Enviaremos el informe a {email}!'
    },
    'quiz.nextBtn': {
      KO: '➡️ 다음 문제로 넘어가기', EN: '➡️ Next Question', ZH: '➡️ 下一题', JA: '➡️ 次の問題へ', FR: '➡️ Question suivante', ES: '➡️ Siguiente pregunta'
    },
    'quiz.resultBtn': {
      KO: '🎉 결과 확인하기', EN: '🎉 See My Result', ZH: '🎉 查看结果', JA: '🎉 結果を見る', FR: '🎉 Voir mon résultat', ES: '🎉 Ver mi resultado'
    },

    /* ===== Chatbot FAQ (index.html) ===== */
    'chatbot.title': { KO: 'DayO 도우미', EN: 'DayO Helper', ZH: 'DayO 助手', JA: 'DayOヘルパー', FR: 'Assistant DayO', ES: 'Asistente DayO' },
    'chatbot.fabAria': { KO: 'FAQ 챗봇 열기', EN: 'Open FAQ chatbot', ZH: '打开常见问题聊天机器人', JA: 'FAQチャットボットを開く', FR: 'Ouvrir le chatbot FAQ', ES: 'Abrir chatbot de preguntas' },
    'chatbot.closeAria': { KO: '닫기', EN: 'Close', ZH: '关闭', JA: '閉じる', FR: 'Fermer', ES: 'Cerrar' },
    'chatbot.greeting': {
      KO: '안녕하세요! DayO 도우미예요. 궁금한 점을 골라주시면 알려드릴게요.',
      EN: "Hi! I'm the DayO Helper. Pick a question and I'll answer it for you.",
      ZH: '你好！我是DayO助手。请选择您的问题，我来为您解答。',
      JA: 'こんにちは！DayOヘルパーです。気になる質問を選んでください。',
      FR: "Bonjour ! Je suis l'assistant DayO. Choisissez une question.",
      ES: '¡Hola! Soy el asistente DayO. Elige una pregunta y te responderé.'
    },
    'chatbot.faqLabel': { KO: '자주 묻는 질문', EN: 'Frequently Asked', ZH: '常见问题', JA: 'よくある質問', FR: 'Questions fréquentes', ES: 'Preguntas frecuentes' },
    'chatbot.typing': { KO: '입력 중...', EN: 'Typing...', ZH: '输入中...', JA: '入力中...', FR: 'En train d\'écrire...', ES: 'Escribiendo...' },
    'chatbot.q.class': {
      KO: '수업은 어떻게 진행되나요?', EN: 'How do sessions work?', ZH: '课程是如何进行的？', JA: 'レッスンはどのように進みますか？', FR: 'Comment se déroulent les sessions ?', ES: '¿Cómo funcionan las sesiones?'
    },
    'chatbot.a.class': {
      KO: 'DayO 수업은 1회 총 30분이에요! 25분 동안 원어민 대화 파트너와 1:1 화상 대화를 하고, 이어서 5분 미니 퀴즈/리포트로 마무리해요. AI 코파일럿이 실시간으로 표현도 도와드린답니다.',
      EN: 'Each DayO session is 30 minutes total: 25 minutes of 1:1 video chat with a native partner, plus a 5-minute mini quiz/report. An AI copilot also helps with expressions in real time.',
      ZH: 'DayO每节课共30分钟：25分钟与母语伙伴1:1视频对话，再加上5分钟小测验/报告。AI副驾也会实时帮助您表达。',
      JA: 'DayOのレッスンは1回合計30分です。25分の1:1ビデオ会話のあと、5分のミニクイズ/レポートで締めくくります。AIコパイロットがリアルタイムで表現もサポートします。',
      FR: "Chaque session DayO dure 30 min : 25 min de conversation vidéo 1:1 avec un partenaire natif, puis 5 min de mini-quiz/rapport. Un copilote IA aide aussi en temps réel.",
      ES: 'Cada sesión de DayO dura 30 min: 25 min de charla en video 1:1 con un compañero nativo, más 5 min de mini quiz/informe. Un copiloto IA también te ayuda en tiempo real.'
    },
    'chatbot.q.teachers': {
      KO: '대화 파트너는 어떤 분들인가요?', EN: 'Who are the conversation partners?', ZH: '对话伙伴是怎样的人？', JA: '会話パートナーはどんな方ですか？', FR: 'Qui sont les partenaires de conversation ?', ES: '¿Quiénes son los compañeros de conversación?'
    },
    'chatbot.a.teachers': {
      KO: 'DayO의 트레이닝을 수료한, 다양한 언어가 가능한 각 국가의 원어민들이에요!',
      EN: 'They are native speakers from around the world, trained by DayO and fluent in multiple languages!',
      ZH: '是完成DayO培训、来自各国、能讲多种语言的母语者！',
      JA: 'DayOのトレーニングを修了した、様々な言語ができる各国のネイティブです！',
      FR: 'Ce sont des locuteurs natifs formés par DayO, venant de différents pays et multilingues !',
      ES: '¡Son hablantes nativos de distintos países, capacitados por DayO y multilingües!'
    },
    'chatbot.q.beginner': {
      KO: '영어를 아예 못해도 참여할 수 있나요?', EN: 'Can I join with zero English?', ZH: '完全不会英语也能参加吗？', JA: '英語が全く話せなくても参加できますか？', FR: 'Puis-je participer sans parler anglais ?', ES: '¿Puedo participar sin saber inglés?'
    },
    'chatbot.a.beginner': {
      KO: '물론이죠! 영어를 처음 시작하셔도 괜찮아요. 한국어로 먼저 설명해 드리고, 천천히 영어로 전환하는 맞춤형 수업을 제공해요.',
      EN: "Of course! It's fine even if you're a total beginner. We explain in Korean first and gradually shift to English at your pace.",
      ZH: '当然可以！即使是英语初学者也没问题。我们会先用韩语说明，再逐步切换到英语进行定制授课。',
      JA: 'もちろんです！英語が初めてでも大丈夫です。まず韓国語で説明し、ゆっくり英語に切り替えるカスタムレッスンをご提供します。',
      FR: "Bien sûr ! Même en débutant complet, c'est parfait. Nous expliquons d'abord en coréen puis passons en douceur à l'anglais.",
      ES: '¡Claro! Está bien aunque seas principiante total. Explicamos primero en coreano y pasamos poco a poco al inglés.'
    },
    'chatbot.q.free': {
      KO: '스피킹 테스트는 무료인가요?', EN: 'Is the speaking test free?', ZH: '口语测试是免费的吗？', JA: 'スピーキングテストは無料ですか？', FR: 'Le test de speaking est-il gratuit ?', ES: '¿La prueba de speaking es gratis?'
    },
    'chatbot.a.free': {
      KO: '네, 스피킹 감각 테스트는 완전 무료예요! 부담 없이 나의 스피킹 감각을 확인해 보세요.',
      EN: "Yes, the speaking sense test is completely free! Check your speaking sense with no pressure at all.",
      ZH: '是的，口语感觉测试完全免费！请轻松确认您的口语感觉。',
      JA: 'はい、スピーキング感覚テストは完全無料です！気軽にご自身のスピーキング感覚を確認してください。',
      FR: "Oui, le test de speaking est entièrement gratuit ! Vérifiez votre niveau sans aucune pression.",
      ES: '¡Sí, la prueba de speaking es completamente gratis! Revisa tu nivel de habla sin presión.'
    },
    'chatbot.q.policy': {
      KO: '취소·일정 변경 규정은 어떻게 되나요?',
      EN: 'What are the cancel and reschedule rules?',
      ZH: '取消和改期规定是怎样的？',
      JA: 'キャンセル・日程変更のルールは？',
      FR: 'Quelles sont les règles d’annulation et de report ?',
      ES: '¿Cuáles son las reglas de cancelación y cambio?'
    },
    'chatbot.a.policy': {
      KO: '모든 이용권은 결제 후 90일 내 소진 필수예요. 수업 요일 및 시간 변경/취소는 수업 시작 1시간 전까지 가능하고, 수업 시작 1시간 이내 취소 및 노쇼 발생 시 티켓이 차감되며 ‘토닥토닥 리포트’가 발송돼요.',
      EN: 'All passes must be used within 90 days of payment. You can change or cancel the day/time until 1 hour before class. If you cancel within 1 hour of start or no-show, a ticket is deducted and a “Todaktodak Report” is sent.',
      ZH: '所有次数券须在付款后90天内用完。开课1小时前可更改/取消星期和时间。开课1小时内取消或未到，将扣除次数并发送“托达克托达克报告”。',
      JA: 'すべての利用券は決済後90日以内に使い切る必要があります。授業の曜日・時間の変更/キャンセルは開始1時間前まで可能です。開始1時間以内のキャンセルやノーショー時はチケットが消化され、「トダクトダクレポート」が送られます。',
      FR: 'Tous les tickets doivent être utilisés dans les 90 jours après paiement. Changement/annulation du jour et de l’heure possibles jusqu’à 1 h avant le cours. Annulation dans l’heure ou absence : un ticket est débité et un « Todaktodak Report » est envoyé.',
      ES: 'Todos los pases deben usarse en 90 días tras el pago. Puedes cambiar/cancelar día y hora hasta 1 hora antes. Si cancelas en esa hora o no asistes, se descuenta un ticket y se envía el “Todaktodak Report”.'
    },

    /* ===== Booking modal (booking-modal.js) ===== */
    'book.title': { KO: '☕ 오늘의 대화, 예약해요', EN: "☕ Let's book today's chat", ZH: '☕ 预约今天的对话', JA: '☕ 今日の会話を予約しましょう', FR: "☕ Réservons votre conversation", ES: '☕ Reservemos tu charla' },
    'book.closeAria': { KO: '예약 닫기', EN: 'Close booking', ZH: '关闭预约', JA: '予約を閉じる', FR: 'Fermer la réservation', ES: 'Cerrar reserva' },
    'book.step0': { KO: '언어와 목적', EN: 'Language & Purpose', ZH: '语言与目的', JA: '言語と目的', FR: 'Langue et objectif', ES: 'Idioma y objetivo' },
    'book.step1': { KO: '대화 스타일', EN: 'Chat Style', ZH: '对话风格', JA: '会話スタイル', FR: 'Style de conversation', ES: 'Estilo de charla' },
    'book.step2': { KO: '날짜와 시간', EN: 'Date & Time', ZH: '日期与时间', JA: '日付と時間', FR: 'Date et heure', ES: 'Fecha y hora' },
    'book.step3': { KO: '파트너 선택', EN: 'Choose Partner', ZH: '选择伙伴', JA: 'パートナー選択', FR: 'Choisir un partenaire', ES: 'Elegir compañero' },
    'book.step4': { KO: '예약 확인', EN: 'Confirm Booking', ZH: '确认预约', JA: '予約確認', FR: 'Confirmer', ES: 'Confirmar reserva' },
    'book.progressFormat': {
      KO: 'STEP {step}/5 · {label}', EN: 'STEP {step}/5 · {label}', ZH: '第{step}/5步 · {label}', JA: 'STEP {step}/5 · {label}', FR: 'ÉTAPE {step}/5 · {label}', ES: 'PASO {step}/5 · {label}'
    },
    'book.languageQuestion': {
      KO: '어떤 언어로 대화할까요?', EN: 'Which language would you like to speak?', ZH: '想用哪种语言对话呢？', JA: 'どの言語で会話しますか？', FR: 'Dans quelle langue souhaitez-vous parler ?', ES: '¿En qué idioma quieres conversar?'
    },
    'book.purposeQuestion': {
      KO: '대화 목적을 알려주세요', EN: "Tell us the purpose of your chat", ZH: '请告诉我们对话目的', JA: '会話の目的を教えてください', FR: "Quel est l'objectif de votre conversation ?", ES: 'Cuéntanos el propósito de tu charla'
    },
    'book.purposeHint': {
      KO: '여러 개를 골라도 좋아요', EN: "You can choose more than one", ZH: '可以选择多个', JA: '複数選んでも大丈夫です', FR: 'Vous pouvez en choisir plusieurs', ES: 'Puedes elegir varios'
    },
    'book.styleQuestion': {
      KO: '어떤 대화 스타일이 좋으세요?', EN: 'What conversation style do you prefer?', ZH: '喜欢哪种对话风格？', JA: 'どんな会話スタイルがいいですか？', FR: 'Quel style de conversation préférez-vous ?', ES: '¿Qué estilo de charla prefieres?'
    },
    'book.styleHint': {
      KO: '고른 스타일에 맞춰 파트너를 매칭해 드려요', EN: "We'll match a partner based on your chosen style", ZH: '将根据您选择的风格匹配伙伴', JA: '選んだスタイルに合わせてパートナーをマッチングします', FR: 'Nous vous associons un partenaire selon ce style', ES: 'Te emparejaremos según el estilo elegido'
    },
    'book.dateQuestion': {
      KO: '언제 만날까요?', EN: 'When would you like to meet?', ZH: '什么时候见面呢？', JA: 'いつ会いましょうか？', FR: 'Quand souhaitez-vous vous rencontrer ?', ES: '¿Cuándo te gustaría reunirte?'
    },
    'book.dateHint': {
      KO: '내일부터 예약할 수 있어요', EN: 'You can book starting tomorrow', ZH: '从明天开始可以预约', JA: '明日から予約できます', FR: 'Réservation possible dès demain', ES: 'Puedes reservar desde mañana'
    },
    'book.slotsLabel': {
      KO: '가능한 시간대예요', EN: 'Available time slots', ZH: '可选时段', JA: '選べる時間帯です', FR: 'Créneaux disponibles', ES: 'Horarios disponibles'
    },
    'book.prevMonthAria': { KO: '이전 달', EN: 'Previous month', ZH: '上个月', JA: '前の月', FR: 'Mois précédent', ES: 'Mes anterior' },
    'book.nextMonthAria': { KO: '다음 달', EN: 'Next month', ZH: '下个月', JA: '次の月', FR: 'Mois suivant', ES: 'Mes siguiente' },
    'book.partnerQuestion': {
      KO: '이 시간에 만날 대화 파트너를 골라주세요', EN: 'Choose a conversation partner for this time', ZH: '请选择这个时间的对话伙伴', JA: 'この時間に会う会話パートナーを選んでください', FR: 'Choisissez un partenaire pour ce créneau', ES: 'Elige un compañero para este horario'
    },
    'book.partnerHintFormat': {
      KO: '{date} {time} · {language} 가능', EN: '{date} {time} · {language} available', ZH: '{date} {time} · 可用{language}', JA: '{date} {time} · {language} 対応可能', FR: '{date} {time} · {language} disponible', ES: '{date} {time} · {language} disponible'
    },
    'book.koreanAvailable': {
      KO: ' · 한국어 가능', EN: ' · Korean available', ZH: ' · 可用韩语', JA: ' · 韓国語対応可能', FR: ' · Coréen disponible', ES: ' · Coreano disponible'
    },
    'book.styleMatchSuffix': {
      KO: ' · 선택한 스타일과 잘 맞아요', EN: ' · Great match for your style', ZH: ' · 与您选择的风格很匹配', JA: ' · 選んだスタイルにぴったり', FR: ' · Correspond bien à votre style', ES: ' · Coincide con tu estilo'
    },
    'book.summaryTitle': {
      KO: '이렇게 예약할게요 🎉', EN: "Here's your booking 🎉", ZH: '将这样为您预约 🎉', JA: 'このように予約します 🎉', FR: 'Voici votre réservation 🎉', ES: 'Así queda tu reserva 🎉'
    },
    'book.policyNote': {
      KO: '수업 요일 및 시간 변경/취소는 수업 시작 1시간 전까지 가능해요. 1시간 이내 취소·노쇼 시 티켓이 차감되며 ‘토닥토닥 리포트’가 발송돼요.',
      EN: 'You can change or cancel the day/time until 1 hour before class. Cancel within 1 hour or no-show: a ticket is deducted and a “Todaktodak Report” is sent.',
      ZH: '开课1小时前可更改/取消星期和时间。开课1小时内取消或未到，将扣除次数并发送“托达克托达克报告”。',
      JA: '授業の曜日・時間の変更/キャンセルは開始1時間前まで可能です。開始1時間以内のキャンセルやノーショー時はチケットが消化され、「トダクトダクレポート」が送られます。',
      FR: 'Changement/annulation du jour et de l’heure jusqu’à 1 h avant. Annulation dans l’heure ou absence : un ticket est débité et un « Todaktodak Report » est envoyé.',
      ES: 'Puedes cambiar/cancelar día y hora hasta 1 hora antes. Si cancelas en esa hora o no asistes, se descuenta un ticket y se envía el “Todaktodak Report”.'
    },
    'book.summaryLanguage': { KO: '언어', EN: 'Language', ZH: '语言', JA: '言語', FR: 'Langue', ES: 'Idioma' },
    'book.summaryPurpose': { KO: '목적', EN: 'Purpose', ZH: '目的', JA: '目的', FR: 'Objectif', ES: 'Propósito' },
    'book.summaryStyle': { KO: '스타일', EN: 'Style', ZH: '风格', JA: 'スタイル', FR: 'Style', ES: 'Estilo' },
    'book.summaryDatetime': { KO: '일시', EN: 'Date/Time', ZH: '日期/时间', JA: '日時', FR: 'Date/heure', ES: 'Fecha/hora' },
    'book.summaryPartner': { KO: '파트너', EN: 'Partner', ZH: '伙伴', JA: 'パートナー', FR: 'Partenaire', ES: 'Compañero' },
    'book.prev': { KO: '이전', EN: 'Back', ZH: '上一步', JA: '前へ', FR: 'Précédent', ES: 'Atrás' },
    'book.next': { KO: '다음', EN: 'Next', ZH: '下一步', JA: '次へ', FR: 'Suivant', ES: 'Siguiente' },
    'book.confirm': {
      KO: '🍰 이 일정으로 대화 예약 확정하기', EN: '🍰 Confirm this booking', ZH: '🍰 确认此预约', JA: '🍰 この予定で予約確定', FR: '🍰 Confirmer cette réservation', ES: '🍰 Confirmar esta reserva'
    },
    'book.confirmToastFormat': {
      KO: '예약이 성공적으로 완료되었습니다! {partner} 파트너와 만나요 💖',
      EN: 'Booking confirmed! See you with {partner} 💖',
      ZH: '预约成功完成！与{partner}伙伴见面吧 💖',
      JA: '予約が完了しました！{partner}パートナーと会いましょう 💖',
      FR: 'Réservation confirmée ! À bientôt avec {partner} 💖',
      ES: '¡Reserva confirmada! Nos vemos con {partner} 💖'
    },
    'book.lang.en': { KO: '영어', EN: 'English', ZH: '英语', JA: '英語', FR: 'Anglais', ES: 'Inglés' },
    'book.lang.es': { KO: '스페인어', EN: 'Spanish', ZH: '西班牙语', JA: 'スペイン語', FR: 'Espagnol', ES: 'Español' },
    'book.lang.fr': { KO: '프랑스어', EN: 'French', ZH: '法语', JA: 'フランス語', FR: 'Français', ES: 'Francés' },
    'book.lang.ja': { KO: '일본어', EN: 'Japanese', ZH: '日语', JA: '日本語', FR: 'Japonais', ES: 'Japonés' },
    'book.lang.zh': { KO: '중국어', EN: 'Chinese', ZH: '中文', JA: '中国語', FR: 'Chinois', ES: 'Chino' },
    'book.lang.vi': { KO: '베트남어', EN: 'Vietnamese', ZH: '越南语', JA: 'ベトナム語', FR: 'Vietnamien', ES: 'Vietnamita' },
    'book.lang.de': { KO: '독일어', EN: 'German', ZH: '德语', JA: 'ドイツ語', FR: 'Allemand', ES: 'Alemán' },
    'book.lang.it': { KO: '이탈리아어', EN: 'Italian', ZH: '意大利语', JA: 'イタリア語', FR: 'Italien', ES: 'Italiano' },
    'book.lang.ru': { KO: '러시아어', EN: 'Russian', ZH: '俄语', JA: 'ロシア語', FR: 'Russe', ES: 'Ruso' },
    'book.lang.ko': { KO: '한국어', EN: 'Korean', ZH: '韩语', JA: '韓国語', FR: 'Coréen', ES: 'Coreano' },
    'book.purpose.travel': { KO: '✈️ 여행/일상', EN: '✈️ Travel/Daily', ZH: '✈️ 旅行/日常', JA: '✈️ 旅行・日常', FR: '✈️ Voyage/Quotidien', ES: '✈️ Viaje/Diario' },
    'book.purpose.opic': { KO: '🎯 오픽/토스', EN: '🎯 OPIc/TOEIC S', ZH: '🎯 OPIc/口语考试', JA: '🎯 OPIc/スピーキング試験', FR: '🎯 OPIc/Examen oral', ES: '🎯 OPIc/Examen oral' },
    'book.purpose.abroad': { KO: '💼 워홀/유학 준비', EN: '💼 Working Holiday/Study Abroad', ZH: '💼 打工度假/留学准备', JA: '💼 ワーホリ・留学準備', FR: '💼 PVT/Études à l\'étranger', ES: '💼 Working Holiday/Estudios' },
    'book.purpose.casual': { KO: '☕ 자유 수다', EN: '☕ Casual Chat', ZH: '☕ 自由聊天', JA: '☕ 自由なおしゃべり', FR: '☕ Discussion libre', ES: '☕ Charla libre' },
    'book.style.slow': {
      KO: '🐢 말을 천천히 들어주고 리액션 잘해주는 파트너', EN: '🐢 A partner who listens slowly with warm reactions', ZH: '🐢 慢慢倾听且反应热情的伙伴', JA: '🐢 ゆっくり聞いて反応してくれるパートナー', FR: '🐢 Un partenaire patient et réactif', ES: '🐢 Un compañero paciente y atento'
    },
    'book.style.fast': {
      KO: '⚡ 자연스럽고 빠른 실전 티키타카', EN: '⚡ Natural, fast back-and-forth practice', ZH: '⚡ 自然快速的实战互动', JA: '⚡ 自然でスピーディーな実践トーク', FR: '⚡ Échanges rapides et naturels', ES: '⚡ Intercambios rápidos y naturales'
    },
    'book.style.correct': {
      KO: '📝 교정과 피드백을 꼼꼼하게 해주는 파트너', EN: '📝 A partner who gives detailed corrections & feedback', ZH: '📝 认真纠正并给予反馈的伙伴', JA: '📝 丁寧に添削・フィードバックするパートナー', FR: '📝 Un partenaire qui corrige en détail', ES: '📝 Un compañero que corrige a detalle'
    },
    'book.style.korean': {
      KO: '🇰🇷 한국어를 할 수 있는 파트너', EN: '🇰🇷 A partner who speaks Korean', ZH: '🇰🇷 会说韩语的伙伴', JA: '🇰🇷 韓国語ができるパートナー', FR: '🇰🇷 Un partenaire qui parle coréen', ES: '🇰🇷 Un compañero que habla coreano'
    },
    'chatPrefs.firstUserTip': {
      KO: '💡 "첫 대화를 위해 DayO가 가장 다정한 옵션을 미리 맞춰두었어요! (언제든 바꿀 수 있어요)"',
      EN: '💡 "DayO pre-set the gentlest options for your first chat! (You can change them anytime)"',
      ZH: '💡 “为了第一次对话，DayO已帮你选好最温柔的选项！（随时可改）”',
      JA: '💡「初めての会話のために、DayOがやさしい設定を用意しました！（いつでも変更OK）」',
      FR: '💡 « DayO a préparé les options les plus douces pour votre 1ʳᵉ conversation ! (modifiable) »',
      ES: '💡 « ¡DayO eligió las opciones más amables para tu primera charla! (puedes cambiarlas) »'
    },
    'chatPrefs.safetyToast': {
      KO: '🤖 AI 실시간 코파일럿 & 스피킹 리포트가 함께합니다.',
      EN: '🤖 AI live copiloting & speaking report are with you.',
      ZH: '🤖 AI实时副驾驶与口语报告已就绪。',
      JA: '🤖 AIリアルタイムコパイロット＆スピーキングレポートが一緒です。',
      FR: '🤖 Le copilote IA et le rapport de speaking vous accompagnent.',
      ES: '🤖 El copiloto de IA y el informe de speaking te acompañan.'
    },
    'chatPrefs.speedLabel': { KO: '말하기 속도', EN: 'Speaking pace', ZH: '语速', JA: '話すスピード', FR: 'Rythme', ES: 'Ritmo' },
    'chatPrefs.styleLabel': { KO: '대화 스타일', EN: 'Chat style', ZH: '对话风格', JA: '会話スタイル', FR: 'Style', ES: 'Estilo' },
    'chatPrefs.requestLabel': { KO: '요청사항', EN: 'Request', ZH: '请求', JA: 'リクエスト', FR: 'Demande', ES: 'Pedido' },
    'chatPrefs.speed.slow': { KO: '🐢 천천히', EN: '🐢 Slow', ZH: '🐢 慢慢说', JA: '🐢 ゆっくり', FR: '🐢 Lentement', ES: '🐢 Despacio' },
    'chatPrefs.speed.native': { KO: '🐰 원어민', EN: '🐰 Native pace', ZH: '🐰 母语语速', JA: '🐰 ネイティブ', FR: '🐰 Natif', ES: '🐰 Nativo' },
    'chatPrefs.style.casual': { KO: '☕️ 편안한 수다', EN: '☕️ Cozy chat', ZH: '☕️ 轻松闲聊', JA: '☕️ リラックス雑談', FR: '☕️ Discussion cosy', ES: '☕️ Charla cómoda' },
    'chatPrefs.style.correct': { KO: '📝 꼼꼼한 교정', EN: '📝 Careful correction', ZH: '📝 细致纠错', JA: '📝 丁寧な矯正', FR: '📝 Correction soignée', ES: '📝 Corrección cuidadosa' },
    'chatPrefs.style.interview': { KO: '🎯 실전 인터뷰', EN: '🎯 Real interview', ZH: '🎯 实战面试', JA: '🎯 実践インタビュー', FR: '🎯 Entretien réel', ES: '🎯 Entrevista real' },
    'chatPrefs.request.praise': { KO: '👏 칭찬 위주로 부탁해요', EN: '👏 Please focus on praise', ZH: '👏 请多夸奖我', JA: '👏 ほめ中心でお願いします', FR: '👏 Plus de compliments SVP', ES: '👏 Más elogios por favor' },
    'chatPrefs.request.gentle': { KO: '🌿 부드럽게 이끌어 주세요', EN: '🌿 Please guide me gently', ZH: '🌿 请温柔引导', JA: '🌿 やさしく導いてください', FR: '🌿 Guidez-moi en douceur', ES: '🌿 Guíame con suavidad' },
    'chatPrefs.request.encourage': { KO: '💪 자신감 붙여 주세요', EN: '💪 Please boost my confidence', ZH: '💪 请帮我建立自信', JA: '💪 自信をつけてください', FR: '💪 Donnez-moi confiance', ES: '💪 Dame confianza' },
    'chatPrefs.requestBadge.praise': { KO: '👏 칭찬 위주', EN: '👏 Praise focus', ZH: '👏 多夸奖', JA: '👏 ほめ中心', FR: '👏 Compliments', ES: '👏 Elogios' },
    'chatPrefs.requestBadge.gentle': { KO: '🌿 부드럽게', EN: '🌿 Gentle', ZH: '🌿 温柔', JA: '🌿 やさしく', FR: '🌿 Doux', ES: '🌿 Suave' },
    'chatPrefs.requestBadge.encourage': { KO: '💪 자신감', EN: '💪 Confidence', ZH: '💪 自信', JA: '💪 自信', FR: '💪 Confiance', ES: '💪 Confianza' },
    'chatPrefs.sheetTitle': { KO: '대화 옵션 바꾸기', EN: 'Change chat options', ZH: '更改对话选项', JA: '会話オプションを変更', FR: 'Modifier les options', ES: 'Cambiar opciones' },
    'chatPrefs.sheetClose': { KO: '닫기', EN: 'Close', ZH: '关闭', JA: '閉じる', FR: 'Fermer', ES: 'Cerrar' },
    'book.comfortTitle': { KO: '대화 중 안심 옵션', EN: 'Comfort options for your chat', ZH: '对话安心选项', JA: '会話のあんしんオプション', FR: 'Options de confort', ES: 'Opciones de comodidad' },


    /* ===== Materials modal chrome (materials.js) ===== */
    'mat.tabArticle': { KO: '📰 예습 자료', EN: '📰 Preview Article', ZH: '📰 预习资料', JA: '📰 予習資料', FR: '📰 Article de préparation', ES: '📰 Material previo' },
    'mat.tabExpressions': { KO: '💬 추천 표현', EN: '💬 Recommended Phrases', ZH: '💬 推荐表达', JA: '💬 おすすめ表現', FR: '💬 Expressions suggérées', ES: '💬 Frases recomendadas' },
    'mat.closeAria': { KO: '자료 닫기', EN: 'Close materials', ZH: '关闭资料', JA: '資料を閉じる', FR: 'Fermer les documents', ES: 'Cerrar materiales' },
    'report.closeAria': { KO: '리포트 닫기', EN: 'Close report', ZH: '关闭报告', JA: 'レポートを閉じる', FR: 'Fermer le rapport', ES: 'Cerrar informe' },

    /* ===== Room studio extras (room.html) ===== */
    'room.micOn': { KO: '🎤 마이크 켜짐', EN: '🎤 Mic On', ZH: '🎤 麦克风开启', JA: '🎤 マイクオン', FR: '🎤 Micro activé', ES: '🎤 Micrófono activado' },
    'room.micOff': { KO: '🎤 마이크 꺼짐', EN: '🎤 Mic Off', ZH: '🎤 麦克风关闭', JA: '🎤 マイクオフ', FR: '🎤 Micro désactivé', ES: '🎤 Micrófono apagado' },
    'room.camOn': { KO: '📹 카메라 켜짐', EN: '📹 Camera On', ZH: '📹 摄像头开启', JA: '📹 カメラオン', FR: '📹 Caméra activée', ES: '📹 Cámara activada' },
    'room.camOff': { KO: '📹 카메라 꺼짐', EN: '📹 Camera Off', ZH: '📹 摄像头关闭', JA: '📹 カメラオフ', FR: '📹 Caméra désactivée', ES: '📹 Cámara apagada' },
    'room.chatLabel': { KO: '채팅', EN: 'Chat', ZH: '聊天', JA: 'チャット', FR: 'Chat', ES: 'Chat' },
    'room.chatHeaderTitle': { KO: '💬 라이브 채팅', EN: '💬 Live Chat', ZH: '💬 实时聊天', JA: '💬 ライブチャット', FR: '💬 Chat en direct', ES: '💬 Chat en vivo' },
    'room.chatCloseAria': { KO: '채팅 닫기', EN: 'Close chat', ZH: '关闭聊天', JA: 'チャットを閉じる', FR: 'Fermer le chat', ES: 'Cerrar chat' },
    'room.chatInputPlaceholder': { KO: '메시지를 입력하세요', EN: 'Type a message', ZH: '请输入消息', JA: 'メッセージを入力してください', FR: 'Écrivez un message', ES: 'Escribe un mensaje' },
    'room.chatSend': { KO: '전송', EN: 'Send', ZH: '发送', JA: '送信', FR: 'Envoyer', ES: 'Enviar' },
    'room.chatReply': { KO: 'Nice! Tell me more ☕', EN: 'Nice! Tell me more ☕', ZH: 'Nice! Tell me more ☕', JA: 'Nice! Tell me more ☕', FR: 'Nice! Tell me more ☕', ES: 'Nice! Tell me more ☕' },
    'room.shareLabel': { KO: '🖥️ 화면 공유 중', EN: '🖥️ Screen sharing', ZH: '🖥️ 屏幕共享中', JA: '🖥️ 画面共有中', FR: '🖥️ Partage d\'écran', ES: '🖥️ Compartiendo pantalla' },
    'room.selfPipLabel': { KO: '나', EN: 'Me', ZH: '我', JA: '自分', FR: 'Moi', ES: 'Yo' },
    'room.selfPlaceholderLabel': { KO: '내 화면', EN: 'My video', ZH: '我的画面', JA: '自分の画面', FR: 'Mon écran', ES: 'Mi pantalla' },
    'room.toastNoMedia': {
      KO: '카메라를 끈 상태로도 대화가 가능해요~ ☕️',
      EN: 'You can still chat with the camera off~ ☕️',
      ZH: '即使关闭摄像头也能继续对话哦~ ☕️',
      JA: 'カメラをオフにしたままでも会話できますよ〜 ☕️',
      FR: 'Vous pouvez discuter même caméra éteinte~ ☕️',
      ES: 'Puedes conversar aunque la cámara esté apagada~ ☕️'
    },
    'room.toastShareStop': { KO: '화면 공유가 종료됐어요', EN: 'Screen sharing has ended', ZH: '屏幕共享已结束', JA: '画面共有が終了しました', FR: 'Le partage d\'écran est terminé', ES: 'El compartir pantalla ha terminado' },
    'room.toastShareStart': { KO: '화면 공유를 시작했어요 🖥️', EN: 'Screen sharing started 🖥️', ZH: '已开始屏幕共享 🖥️', JA: '画面共有を開始しました 🖥️', FR: 'Partage d\'écran démarré 🖥️', ES: 'Compartir pantalla iniciado 🖥️' },
    'room.toastShareCancel': { KO: '화면 공유가 취소되었어요', EN: 'Screen sharing was canceled', ZH: '屏幕共享已取消', JA: '画面共有がキャンセルされました', FR: 'Partage d\'écran annulé', ES: 'Se canceló el compartir pantalla' },
    'room.wordCopiedFormat': { KO: '"{phrase}" 복사했어요 💡', EN: 'Copied "{phrase}" 💡', ZH: '已复制"{phrase}" 💡', JA: '「{phrase}」をコピーしました 💡', FR: '« {phrase} » copié 💡', ES: '"{phrase}" copiado 💡' },
    'room.sentenceOverlayLabel': { KO: '📝 이렇게 말해 보세요', EN: '📝 Try saying it like this', ZH: '📝 试试这样说', JA: '📝 こう言ってみましょう', FR: '📝 Essayez de dire ceci', ES: '📝 Intenta decir esto' },
    'room.sentenceOverlayClose': { KO: '닫기', EN: 'Close', ZH: '关闭', JA: '閉じる', FR: 'Fermer', ES: 'Cerrar' },
    'room.wordSheetBadge': { KO: '💡 단어도움', EN: '💡 Word Help', ZH: '💡 单词帮助', JA: '💡 単語ヘルプ', FR: '💡 Mots', ES: '💡 Palabras' },
    'room.wordSheetTitle': {
      KO: '막히는 한국어 단어나 상황을 입력해 보세요', EN: 'Type the Korean word or situation you\'re stuck on', ZH: '请输入卡壳的韩语单词或情境', JA: '困っている韓国語の単語や状況を入力してください', FR: 'Saisissez le mot ou la situation en coréen qui vous bloque', ES: 'Escribe la palabra o situación en coreano que te cuesta'
    },
    'room.wordSheetCloseAria': { KO: '닫기', EN: 'Close', ZH: '关闭', JA: '閉じる', FR: 'Fermer', ES: 'Cerrar' },
    'room.wordSheetDesc': { KO: '예: 따뜻한 아메리카노', EN: 'e.g. hot americano', ZH: '例：热美式咖啡', JA: '例：温かいアメリカーノ', FR: 'ex. americano chaud', ES: 'ej. americano caliente' },
    'room.wordSheetPlaceholder': { KO: '한국어로 편하게 적어 주세요', EN: 'Feel free to write in Korean', ZH: '请用韩语轻松输入', JA: '韓国語で気軽に書いてください', FR: 'Écrivez librement en coréen', ES: 'Escribe libremente en coreano' },
    'room.wordSheetSubmit': { KO: '추천받기', EN: 'Get suggestions', ZH: '获取推荐', JA: '提案を受け取る', FR: 'Obtenir des suggestions', ES: 'Obtener sugerencias' },
    'room.sentenceSheetBadge': { KO: '📝 문장도움', EN: '📝 Sentence Help', ZH: '📝 句子帮助', JA: '📝 文ヘルプ', FR: '📝 Phrases', ES: '📝 Frases' },
    'room.sentenceSheetTitle': {
      KO: '하고 싶은 말을 모국어로 편하게 써보세요', EN: 'Write what you want to say in your own language', ZH: '请用母语轻松写下想说的话', JA: '言いたいことを母国語で気軽に書いてください', FR: 'Écrivez ce que vous voulez dire dans votre langue', ES: 'Escribe lo que quieres decir en tu idioma'
    },
    'room.sentenceSheetCloseAria': { KO: '닫기', EN: 'Close', ZH: '关闭', JA: '閉じる', FR: 'Fermer', ES: 'Cerrar' },
    'room.sentenceSheetDesc': {
      KO: 'AI가 대화 파트너에게 바로 말할 수 있는 자연스러운 문장으로 바꿔 줄게요.', EN: 'AI will turn it into a natural sentence you can say right to your partner.', ZH: 'AI会将其转换成可以直接对伙伴说的自然句子。', JA: 'AIがパートナーにそのまま話せる自然な文章に変換します。', FR: "L'IA le transformera en phrase naturelle à dire à votre partenaire.", ES: 'La IA lo convertirá en una frase natural para decirle a tu compañero.'
    },
    'room.sentenceSheetPlaceholder': { KO: '예: 오늘 날씨가 좋아서 기분이 좋아요', EN: 'e.g. The weather is nice today so I feel great', ZH: '例：今天天气好，心情也不错', JA: '例：今日は天気が良くて気分がいいです', FR: 'ex. Il fait beau aujourd\'hui, je suis de bonne humeur', ES: 'ej. Hoy hace buen tiempo y estoy de buen humor' },
    'room.sentenceSheetSubmit': { KO: '문장 변환', EN: 'Convert', ZH: '转换句子', JA: '文章変換', FR: 'Convertir', ES: 'Convertir' },
    'room.feedbackTitle': { KO: '오늘 수업은 어떠하셨나요? 🍰', EN: 'How was today\'s session? 🍰', ZH: '今天的课程怎么样？🍰', JA: '今日のレッスンはどうでしたか？🍰', FR: 'Comment était la session d\'aujourd\'hui ? 🍰', ES: '¿Cómo estuvo la sesión de hoy? 🍰' },
    'room.starAria': { KO: '별점', EN: 'Star rating', ZH: '星级评分', JA: '評価', FR: 'Note', ES: 'Calificación' },
    'room.feedbackSectionLabel': {
      KO: '다음 수업엔 대화 파트너가 이렇게 해주면 좋겠어요<br>(다중 선택 가능)',
      EN: 'I\'d love it if my partner did this next time<br>(multiple choices allowed)',
      ZH: '希望下次课程对话伙伴能这样做<br>(可多选)',
      JA: '次のレッスンでは会話パートナーにこうしてほしいです<br>（複数選択可）',
      FR: 'J\'aimerais que mon partenaire fasse ceci la prochaine fois<br>(choix multiples)',
      ES: 'Me gustaría que mi compañero hiciera esto la próxima vez<br>(elige varios)'
    },
    'room.feedbackChip.meet': { KO: '✨ 또 만나고 싶어요', EN: '✨ I want to meet again', ZH: '✨ 想再见面', JA: '✨ また会いたいです', FR: '✨ Je veux le/la revoir', ES: '✨ Quiero verlo/la de nuevo' },
    'room.feedbackChip.slower': { KO: '🐢 말을 조금만 천천히 해주세요', EN: '🐢 Please speak a bit more slowly', ZH: '🐢 请说得再慢一点', JA: '🐢 もう少しゆっくり話してください', FR: '🐢 Parlez un peu plus lentement', ES: '🐢 Habla un poco más lento' },
    'room.feedbackChip.faster': { KO: '⚡ 말을 조금 더 빨리 해주세요', EN: '⚡ Please speak a bit faster', ZH: '⚡ 请说得再快一点', JA: '⚡ もう少し早く話してください', FR: '⚡ Parlez un peu plus vite', ES: '⚡ Habla un poco más rápido' },
    'room.feedbackChip.questions': { KO: '❓ 질문을 더 자주 해주세요', EN: '❓ Please ask more questions', ZH: '❓ 请多提问', JA: '❓ もっと質問してください', FR: '❓ Posez plus de questions', ES: '❓ Haz más preguntas' },
    'room.feedbackChip.levelUp': { KO: '📈 레벨을 조금 올려주세요', EN: '📈 Please raise the level a bit', ZH: '📈 请稍微提高难度', JA: '📈 レベルを少し上げてください', FR: '📈 Augmentez un peu le niveau', ES: '📈 Sube un poco el nivel' },
    'room.feedbackChip.levelDown': { KO: '📉 레벨을 조금 내려주세요', EN: '📉 Please lower the level a bit', ZH: '📉 请稍微降低难度', JA: '📉 レベルを少し下げてください', FR: '📉 Baissez un peu le niveau', ES: '📉 Baja un poco el nivel' },
    'room.feedbackChip.correction': { KO: '📝 문장 교정을 더 많이 해주세요', EN: '📝 Please correct my sentences more', ZH: '📝 请多纠正句子', JA: '📝 文章の添削をもっとしてください', FR: '📝 Corrigez plus mes phrases', ES: '📝 Corrige más mis frases' },
    'room.feedbackSubmit': { KO: '소중한 피드백 보내고 수업 종료하기', EN: 'Send feedback & end session', ZH: '发送宝贵反馈并结束课程', JA: '大切なフィードバックを送って終了する', FR: 'Envoyer le feedback et terminer', ES: 'Enviar feedback y terminar' },
    'room.toastFeedbackSent': {
      KO: '피드백이 전달되었습니다! 오늘도 수고하셨어요 💖', EN: 'Feedback sent! Great work today 💖', ZH: '反馈已送达！今天也辛苦了 💖', JA: 'フィードバックが送信されました！今日もお疲れ様でした 💖', FR: 'Feedback envoyé ! Bravo pour aujourd\'hui 💖', ES: '¡Feedback enviado! Buen trabajo hoy 💖'
    },
    'page.title.index': { KO: 'DayO 돼요 — AI 회화 코파일럿', EN: 'DayO — AI Conversation Copilot', ZH: 'DayO — AI对话副驾驶', JA: 'DayO — AI会話コパイロット', FR: 'DayO — Copilote de conversation IA', ES: 'DayO — Copiloto de conversación con IA' },
    'page.title.room': { KO: 'DayO 돼요 — 화상 회화 스튜디오', EN: 'DayO — Video Conversation Studio', ZH: 'DayO — 视频对话工作室', JA: 'DayO — ビデオ会話スタジオ', FR: 'DayO — Studio de conversation vidéo', ES: 'DayO — Estudio de conversación por video' },
    'page.title.mypage': { KO: 'DayO 마이페이지 — 내 대화 라운지', EN: 'DayO My Page — My Conversation Lounge', ZH: 'DayO 我的页面 — 我的对话休息室', JA: 'DayOマイページ — マイ会話ラウンジ', FR: 'DayO Mon Espace — Mon salon de conversation', ES: 'DayO Mi Página — Mi salón de conversación' },
    'page.title.partner': { KO: 'DayO Partner Studio — 대화 파트너 관리', EN: 'DayO Partner Studio — Conversation Partner Management', ZH: 'DayO Partner Studio — 对话伙伴管理', JA: 'DayO Partner Studio — 会話パートナー管理', FR: 'DayO Partner Studio — Gestion des partenaires de conversation', ES: 'DayO Partner Studio — Gestión de compañeros de conversación' },
    'nav.mainMenuAria': { KO: '주요 메뉴', EN: 'Main menu', ZH: '主菜单', JA: 'メインメニュー', FR: 'Menu principal', ES: 'Menú principal' },
    'nav.mobileMenuAria': { KO: '모바일 메뉴', EN: 'Mobile menu', ZH: '移动菜单', JA: 'モバイルメニュー', FR: 'Menu mobile', ES: 'Menú móvil' },
    'chatbot.panelAria': { KO: 'FAQ 챗봇', EN: 'FAQ chatbot', ZH: 'FAQ聊天机器人', JA: 'FAQチャットボット', FR: 'Chatbot FAQ', ES: 'Chatbot de preguntas frecuentes' },
    'room.chatPanelAria': { KO: '라이브 채팅', EN: 'Live chat', ZH: '实时聊天', JA: 'ライブチャット', FR: 'Chat en direct', ES: 'Chat en vivo' },
    'room.star1': { KO: '1점', EN: '1 star', ZH: '1星', JA: '1点', FR: '1 étoile', ES: '1 estrella' },
    'room.star2': { KO: '2점', EN: '2 stars', ZH: '2星', JA: '2点', FR: '2 étoiles', ES: '2 estrellas' },
    'room.star3': { KO: '3점', EN: '3 stars', ZH: '3星', JA: '3点', FR: '3 étoiles', ES: '3 estrellas' },
    'room.star4': { KO: '4점', EN: '4 stars', ZH: '4星', JA: '4点', FR: '4 étoiles', ES: '4 estrellas' },
    'room.star5': { KO: '5점', EN: '5 stars', ZH: '5星', JA: '5点', FR: '5 étoiles', ES: '5 estrellas' },
    'room.tutorAriaFormat': {
      KO: 'Live · {lang} 대화 파트너', EN: 'Live · {lang} Partner', ZH: 'Live · {lang}伙伴', JA: 'Live · {lang}パートナー', FR: 'Live · Partenaire {lang}', ES: 'Live · Compañero de {lang}'
    },

    /* ===== Partner portal extras (partner.html) ===== */
    'partner.photoModal.title': { KO: '📷 프로필 사진 변경', EN: '📷 Change Profile Photo', ZH: '📷 更换个人资料照片', JA: '📷 プロフィール写真変更', FR: '📷 Changer la photo de profil', ES: '📷 Cambiar foto de perfil' },
    'partner.photoModal.desc': {
      KO: '파스텔 캐릭터 아바타를 고르거나 내 사진을 올려보세요.', EN: 'Choose a pastel character avatar or upload your own photo.', ZH: '选择粉彩角色头像或上传自己的照片。', JA: 'パステルキャラクターアバターを選ぶか、写真をアップロードしてください。', FR: 'Choisissez un avatar pastel ou téléchargez votre photo.', ES: 'Elige un avatar pastel o sube tu propia foto.'
    },
    'partner.photoModal.closeAria': { KO: '닫기', EN: 'Close', ZH: '关闭', JA: '閉じる', FR: 'Fermer', ES: 'Cerrar' },
    'partner.photoModal.tabPhoto': { KO: '📷 실제 얼굴 사진', EN: '📷 Real Photo', ZH: '📷 真实照片', JA: '📷 実際の顔写真', FR: '📷 Vraie photo', ES: '📷 Foto real' },
    'partner.photoModal.tabAvatar': { KO: '🎨 파스텔 캐릭터 아바타', EN: '🎨 Pastel Avatar', ZH: '🎨 粉彩角色头像', JA: '🎨 パステルアバター', FR: '🎨 Avatar pastel', ES: '🎨 Avatar pastel' },
    'partner.photoModal.uploadTitle': { KO: '내 얼굴 사진을 올려보세요', EN: 'Upload your face photo', ZH: '上传我的脸部照片', JA: '自分の顔写真をアップロード', FR: 'Téléchargez votre photo', ES: 'Sube tu foto de cara' },
    'partner.photoModal.uploadHint': {
      KO: 'JPG 또는 PNG 파일을 선택하면 바로 미리보기로 확인할 수 있어요.', EN: 'Choose a JPG or PNG file to see an instant preview.', ZH: '选择JPG或PNG文件即可立即预览。', JA: 'JPGまたはPNGファイルを選ぶと、すぐにプレビューできます。', FR: 'Choisissez un fichier JPG ou PNG pour un aperçu instantané.', ES: 'Elige un archivo JPG o PNG para ver una vista previa al instante.'
    },
    'partner.photoModal.uploadBtn': { KO: '📷 실제 얼굴 사진 업로드', EN: '📷 Upload Real Photo', ZH: '📷 上传真实照片', JA: '📷 実際の顔写真をアップロード', FR: '📷 Télécharger la photo', ES: '📷 Subir foto real' },
    'partner.photoModal.removeBtn': { KO: '🗑️ 사진 지우기', EN: '🗑️ Remove Photo', ZH: '🗑️ 删除照片', JA: '🗑️ 写真を削除', FR: '🗑️ Supprimer la photo', ES: '🗑️ Quitar foto' },
    'partner.photoModal.avatarHint': {
      KO: '사진 대신 파스텔 캐릭터 아바타로 프로필을 꾸밀 수 있어요.', EN: 'You can decorate your profile with a pastel avatar instead of a photo.', ZH: '也可以用粉彩角色头像代替照片装饰资料。', JA: '写真の代わりにパステルアバターでプロフィールを飾れます。', FR: "Vous pouvez décorer votre profil avec un avatar pastel.", ES: 'Puedes decorar tu perfil con un avatar pastel.'
    },
    'partner.photoModal.previewAria': { KO: '업로드한 프로필 사진 미리보기', EN: 'Uploaded profile photo preview', ZH: '已上传的个人资料照片预览', JA: 'アップロードしたプロフィール写真のプレビュー', FR: 'Aperçu de la photo de profil téléchargée', ES: 'Vista previa de la foto de perfil subida' },
    'partner.historyModal.title': { KO: '📜 닉네임 변경 이력', EN: '📜 Nickname History', ZH: '📜 昵称变更记录', JA: '📜 ニックネーム変更履歴', FR: '📜 Historique du pseudo', ES: '📜 Historial de apodos' },
    'partner.historyModal.desc': { KO: '지금까지 사용한 닉네임 기록이에요.', EN: "Here's a record of nicknames you've used.", ZH: '这是您使用过的昵称记录。', JA: 'これまで使用したニックネームの記録です。', FR: 'Voici les pseudos que vous avez utilisés.', ES: 'Aquí están los apodos que has usado.' },
    'partner.historyModal.closeAria': { KO: '닫기', EN: 'Close', ZH: '关闭', JA: '閉じる', FR: 'Fermer', ES: 'Cerrar' },
    'partner.historyModal.current': { KO: ' · 현재 사용 중', EN: ' · Currently in use', ZH: ' · 当前使用中', JA: ' · 現在使用中', FR: ' · Utilisé actuellement', ES: ' · En uso actualmente' },
    'partner.schedule.guideOpen': { KO: '가능', EN: 'Available', ZH: '可预约', JA: '対応可能', FR: 'Disponible', ES: 'Disponible' },
    'partner.schedule.guideClosed': { KO: '불가능', EN: 'Unavailable', ZH: '不可预约', JA: '対応不可', FR: 'Indisponible', ES: 'No disponible' },
    'partner.schedule.timeOpen': { KO: 'Open', EN: 'Open', ZH: 'Open', JA: 'Open', FR: 'Open', ES: 'Open' },
    'partner.schedule.timeClosed': { KO: 'Closed', EN: 'Closed', ZH: 'Closed', JA: 'Closed', FR: 'Closed', ES: 'Closed' },
    'partner.schedule.dayAriaFormat': { KO: '{day}요일 시간 선택', EN: 'Select times for {day}', ZH: '选择{day}的时间', JA: '{day}の時間を選択', FR: 'Choisir les horaires du {day}', ES: 'Elegir horarios para {day}' },
    'partner.schedule.tabsAria': { KO: '요일 선택', EN: 'Select day', ZH: '选择星期', JA: '曜日を選択', FR: 'Choisir le jour', ES: 'Elegir día' },
    'partner.day.mon': { KO: '월', EN: 'Mon', ZH: '一', JA: '月', FR: 'Lu', ES: 'Lu' },
    'partner.day.tue': { KO: '화', EN: 'Tue', ZH: '二', JA: '火', FR: 'Ma', ES: 'Ma' },
    'partner.day.wed': { KO: '수', EN: 'Wed', ZH: '三', JA: '水', FR: 'Me', ES: 'Mi' },
    'partner.day.thu': { KO: '목', EN: 'Thu', ZH: '四', JA: '木', FR: 'Je', ES: 'Ju' },
    'partner.day.fri': { KO: '금', EN: 'Fri', ZH: '五', JA: '金', FR: 'Ve', ES: 'Vi' },
    'partner.day.sat': { KO: '토', EN: 'Sat', ZH: '六', JA: '土', FR: 'Sa', ES: 'Sá' },
    'partner.day.sun': { KO: '일', EN: 'Sun', ZH: '日', JA: '日', FR: 'Di', ES: 'Do' },
    'partner.toast.scheduleSaved': {
      KO: '스케줄이 성공적으로 업데이트되어 대화 예약 달력에 반영되었습니다!', EN: 'Your schedule was updated and now reflects in the booking calendar!', ZH: '日程已成功更新并反映到预约日历中！', JA: 'スケジュールが更新され、予約カレンダーに反映されました！', FR: 'Votre planning a été mis à jour dans le calendrier de réservation !', ES: '¡Tu horario se actualizó y ya aparece en el calendario de reservas!'
    },
    'partner.toast.gcalSynced': {
      KO: '구글 계정과 연동되었습니다! 개인 일정 외 빈 시간대가 대화 예약 달력에 자동 등록됩니다 ⚡', EN: 'Connected to your Google account! Free time slots are auto-added to your booking calendar ⚡', ZH: '已与Google账户连接！空闲时段将自动登记到预约日历中 ⚡', JA: 'Googleアカウントと連携しました！空き時間が予約カレンダーに自動登録されます ⚡', FR: 'Compte Google connecté ! Les créneaux libres sont ajoutés automatiquement ⚡', ES: '¡Cuenta de Google conectada! Los horarios libres se agregan automáticamente ⚡'
    },
    'partner.toast.nicknameChangedFormat': {
      KO: "닉네임이 '{name}'(으)로 변경되었습니다 ✨", EN: "Nickname changed to '{name}' ✨", ZH: "昵称已更改为'{name}' ✨", JA: "ニックネームが「{name}」に変更されました ✨", FR: "Pseudo changé en « {name} » ✨", ES: "Apodo cambiado a '{name}' ✨"
    },
    'partner.toast.photoRemoved': { KO: '사진을 지우고 파스텔 아바타로 되돌렸어요 🎨', EN: 'Removed the photo and reverted to a pastel avatar 🎨', ZH: '已删除照片并恢复为粉彩头像 🎨', JA: '写真を削除してパステルアバターに戻しました 🎨', FR: 'Photo supprimée, retour à un avatar pastel 🎨', ES: 'Foto eliminada, volviendo a un avatar pastel 🎨' },
    'partner.toast.avatarApplied': { KO: '파스텔 아바타가 적용되었습니다 🎨', EN: 'Pastel avatar applied 🎨', ZH: '已应用粉彩头像 🎨', JA: 'パステルアバターが適用されました 🎨', FR: 'Avatar pastel appliqué 🎨', ES: 'Avatar pastel aplicado 🎨' },
    'partner.toast.photoApplied': { KO: '실제 프로필 사진이 미리보기로 적용되었습니다 📷', EN: 'Your real photo was applied as a preview 📷', ZH: '真实资料照片已应用为预览 📷', JA: '実際のプロフィール写真がプレビューに適用されました 📷', FR: 'Votre vraie photo a été appliquée en aperçu 📷', ES: 'Tu foto real se aplicó como vista previa 📷' },
    'partner.profile.avatarAria': { KO: '환하게 미소 짓는 대화 파트너 파스텔 아바타', EN: 'Brightly smiling pastel avatar of a conversation partner', ZH: '灿烂微笑的对话伙伴粉彩头像', JA: '明るく微笑む会話パートナーのパステルアバター', FR: 'Avatar pastel souriant du partenaire de conversation', ES: 'Avatar pastel sonriente del compañero de conversación' },
    'partner.profile.nicknamePlaceholder': { KO: '이름을 입력해 주세요', EN: 'Please enter a name', ZH: '请输入姓名', JA: '名前を入力してください', FR: 'Veuillez entrer un nom', ES: 'Por favor ingresa un nombre' },
    'partner.avatar.peach': { KO: '피치', EN: 'Peach', ZH: '桃色', JA: 'ピーチ', FR: 'Pêche', ES: 'Durazno' },
    'partner.avatar.rose': { KO: '로즈', EN: 'Rose', ZH: '玫瑰', JA: 'ローズ', FR: 'Rose', ES: 'Rosa' },
    'partner.avatar.mint': { KO: '민트', EN: 'Mint', ZH: '薄荷', JA: 'ミント', FR: 'Menthe', ES: 'Menta' },
    'partner.avatar.butter': { KO: '버터', EN: 'Butter', ZH: '奶油', JA: 'バター', FR: 'Beurre', ES: 'Mantequilla' },
    'partner.session1.status': { KO: '● 30분 후 시작', EN: '● Starts in 30 min', ZH: '● 30分钟后开始', JA: '● 30分後に開始', FR: '● Débute dans 30 min', ES: '● Comienza en 30 min' },
    'partner.session1.title': { KO: '20대 K님', EN: 'K, in their 20s', ZH: '20多岁K先生', JA: '20代Kさん', FR: 'K, la vingtaine', ES: 'K, de 20 años' },
    'partner.session1.purpose': { KO: '목적: ✈️ 프랑스 여행 회화', EN: 'Purpose: ✈️ French Travel Conversation', ZH: '目的：✈️ 法语旅行会话', JA: '目的：✈️ フランス旅行会話', FR: 'Objectif : ✈️ Conversation voyage en français', ES: 'Propósito: ✈️ Conversación de viaje en francés' },
    'partner.session1.time': { KO: '오늘 20:00', EN: 'Today 20:00', ZH: '今天 20:00', JA: '今日 20:00', FR: "Aujourd'hui 20:00", ES: 'Hoy 20:00' },
    'partner.origin.fr': { KO: '🇫🇷 프랑스', EN: '🇫🇷 France', ZH: '🇫🇷 法国', JA: '🇫🇷 フランス', FR: '🇫🇷 France', ES: '🇫🇷 Francia' },
    'partner.origin.ca': { KO: '🇨🇦 캐나다', EN: '🇨🇦 Canada', ZH: '🇨🇦 加拿大', JA: '🇨🇦 カナダ', FR: '🇨🇦 Canada', ES: '🇨🇦 Canadá' },
    'partner.origin.be': { KO: '🇧🇪 벨기에', EN: '🇧🇪 Belgium', ZH: '🇧🇪 比利时', JA: '🇧🇪 ベルギー', FR: '🇧🇪 Belgique', ES: '🇧🇪 Bélgica' },
    'partner.origin.us': { KO: '🇺🇸 미국', EN: '🇺🇸 United States', ZH: '🇺🇸 美国', JA: '🇺🇸 アメリカ', FR: '🇺🇸 États-Unis', ES: '🇺🇸 Estados Unidos' },
    'partner.origin.gb': { KO: '🇬🇧 영국', EN: '🇬🇧 United Kingdom', ZH: '🇬🇧 英国', JA: '🇬🇧 イギリス', FR: '🇬🇧 Royaume-Uni', ES: '🇬🇧 Reino Unido' },
    'partner.origin.es': { KO: '🇪🇸 스페인', EN: '🇪🇸 Spain', ZH: '🇪🇸 西班牙', JA: '🇪🇸 スペイン', FR: '🇪🇸 Espagne', ES: '🇪🇸 España' },
    'partner.origin.de': { KO: '🇩🇪 독일', EN: '🇩🇪 Germany', ZH: '🇩🇪 德国', JA: '🇩🇪 ドイツ', FR: '🇩🇪 Allemagne', ES: '🇩🇪 Alemania' },
    'partner.origin.it': { KO: '🇮🇹 이탈리아', EN: '🇮🇹 Italy', ZH: '🇮🇹 意大利', JA: '🇮🇹 イタリア', FR: '🇮🇹 Italie', ES: '🇮🇹 Italia' },
    'partner.origin.jp': { KO: '🇯🇵 일본', EN: '🇯🇵 Japan', ZH: '🇯🇵 日本', JA: '🇯🇵 日本', FR: '🇯🇵 Japon', ES: '🇯🇵 Japón' },
    'partner.origin.cn': { KO: '🇨🇳 중국', EN: '🇨🇳 China', ZH: '🇨🇳 中国', JA: '🇨🇳 中国', FR: '🇨🇳 Chine', ES: '🇨🇳 China' },
    'partner.origin.vn': { KO: '🇻🇳 베트남', EN: '🇻🇳 Vietnam', ZH: '🇻🇳 越南', JA: '🇻🇳 ベトナム', FR: '🇻🇳 Vietnam', ES: '🇻🇳 Vietnam' },
    'partner.origin.ru': { KO: '🇷🇺 러시아', EN: '🇷🇺 Russia', ZH: '🇷🇺 俄罗斯', JA: '🇷🇺 ロシア', FR: '🇷🇺 Russie', ES: '🇷🇺 Rusia' },
    'mypage.status.passBarAria': { KO: '8회 중 4회 사용', EN: '4 of 8 used', ZH: '8次中已用4次', JA: '8回中4回使用', FR: '4 sur 8 utilisées', ES: '4 de 8 usadas' },
    'nav.homeAria': { KO: 'DayO 메인으로 이동', EN: 'Go to DayO home', ZH: '前往DayO首页', JA: 'DayOホームへ移動', FR: 'Aller à l\'accueil DayO', ES: 'Ir al inicio de DayO' },
    'partner.photoModal.tabsAria': { KO: '프로필 타입 선택', EN: 'Select profile type', ZH: '选择资料类型', JA: 'プロフィールタイプを選択', FR: 'Choisir le type de profil', ES: 'Elegir tipo de perfil' },
    'partner.origin.kr': { KO: '🇰🇷 대한민국', EN: '🇰🇷 South Korea', ZH: '🇰🇷 韩国', JA: '🇰🇷 韓国', FR: '🇰🇷 Corée du Sud', ES: '🇰🇷 Corea del Sur' },

    /* ===== My Page extras (mypage.html) ===== */
    'mypage.session1.meta': { KO: '목적: ✈️ 여행/일상 · 스타일: 🐢 천천히 들어주는 파트너', EN: 'Purpose: ✈️ Travel/Daily · Style: 🐢 Patient listener', ZH: '目的：✈️ 旅行/日常 · 风格：🐢 耐心倾听的伙伴', JA: '目的：✈️ 旅行・日常 · スタイル：🐢 じっくり聞いてくれるパートナー', FR: 'Objectif : ✈️ Voyage/Quotidien · Style : 🐢 Écoute patiente', ES: 'Propósito: ✈️ Viaje/Diario · Estilo: 🐢 Escucha paciente' },
    'mypage.session1.time': { KO: '오늘 20:00 · 30분', EN: 'Today 20:00 · 30 min', ZH: '今天 20:00 · 30分钟', JA: '今日 20:00 · 30分', FR: "Aujourd'hui 20:00 · 30 min", ES: 'Hoy 20:00 · 30 min' },
    'mypage.session2.meta': { KO: '목적: 🎯 오픽/토스 · 스타일: 📝 교정을 꼼꼼히 해주는 파트너', EN: 'Purpose: 🎯 OPIc/TOEIC Speaking · Style: 📝 Detailed correction', ZH: '目的：🎯 OPIc/托业口语 · 风格：📝 细致纠错的伙伴', JA: '目的：🎯 OPIc/TOEIC · スタイル：📝 丁寧に直してくれるパートナー', FR: 'Objectif : 🎯 OPIc/TOEIC · Style : 📝 Corrections détaillées', ES: 'Propósito: 🎯 OPIc/TOEIC · Estilo: 📝 Correcciones detalladas' },
    'mypage.session2.time': { KO: '8월 6일 (목) 21:00 · 30분', EN: 'Aug 6 (Thu) 21:00 · 30 min', ZH: '8月6日（周四）21:00 · 30分钟', JA: '8月6日（木）21:00 · 30分', FR: '6 août (jeu) 21:00 · 30 min', ES: '6 de agosto (jue) 21:00 · 30 min' },
    'mypage.session3.meta': { KO: '목적: ☕ 자유 수다 · 스타일: ⚡ 자연스러운 실전 티키타카', EN: 'Purpose: ☕ Free Chat · Style: ⚡ Natural rapid-fire chat', ZH: '目的：☕ 自由聊天 · 风格：⚡ 自然快节奏对话', JA: '目的：☕ 自由な会話 · スタイル：⚡ 自然でスピーディなやり取り', FR: 'Objectif : ☕ Discussion libre · Style : ⚡ Échange naturel et rapide', ES: 'Propósito: ☕ Charla libre · Estilo: ⚡ Intercambio natural y rápido' },
    'mypage.session3.time': { KO: '8월 9일 (일) 11:00 · 30분', EN: 'Aug 9 (Sun) 11:00 · 30 min', ZH: '8月9日（周日）11:00 · 30分钟', JA: '8月9日（日）11:00 · 30分', FR: '9 août (dim) 11:00 · 30 min', ES: '9 de agosto (dom) 11:00 · 30 min' },
    'mypage.library.item1.title': { KO: '이번 주 예습 기사 · 니스 여름 축제', EN: "This week's preview article · Nice Summer Festival", ZH: '本周预习文章 · 尼斯夏日节', JA: '今週の予習記事 · ニース夏祭り', FR: "Article de la semaine · Festival d'été à Nice", ES: 'Artículo de la semana · Festival de verano en Niza' },
    'mypage.library.item1.desc': { KO: 'Camille 파트너와의 여행 회화 전에 3분만 읽어보세요.', EN: 'Take 3 minutes to read before your travel chat with partner Camille.', ZH: '在与Camille伙伴进行旅行会话前，花3分钟阅读。', JA: 'Camilleパートナーとの旅行会話の前に3分だけ読んでみてください。', FR: 'Lisez 3 minutes avant votre conversation voyage avec Camille.', ES: 'Lee 3 minutos antes de tu charla de viaje con Camille.' },
    'mypage.library.item2.title': { KO: '추천 표현 리뷰 · 카페와 주문', EN: 'Recommended expressions review · Café & Ordering', ZH: '推荐表达复习 · 咖啡厅与点单', JA: 'おすすめ表現レビュー · カフェと注文', FR: 'Révision des expressions · Café et commande', ES: 'Repaso de expresiones · Café y pedidos' },
    'mypage.library.item2.desc': { KO: '지난 대화에서 자주 막혔던 표현을 모았어요.', EN: 'Expressions you often got stuck on in past chats.', ZH: '收集了以往对话中常卡壳的表达。', JA: '過去の会話でよく詰まった表現を集めました。', FR: 'Les expressions qui vous ont souvent bloqué.', ES: 'Expresiones con las que a menudo te trababas.' },
    'mypage.library.item3.title': { KO: '오픽 빈출 주제 · 재택근무 이야기', EN: 'Frequent OPIc topic · Working from home', ZH: 'OPIc常见主题 · 居家办公', JA: 'OPIc頻出テーマ · リモートワーク', FR: 'Sujet fréquent OPIc : télétravail', ES: 'Tema frecuente de OPIc: trabajo remoto' },
    'mypage.library.item3.desc': { KO: 'Kate 파트너와의 세션 전 예습 자료예요.', EN: 'Preview material before your session with partner Kate.', ZH: '与Kate伙伴课程前的预习资料。', JA: 'Kateパートナーとのセッション前の予習資料です。', FR: 'Matériel de préparation avant la session avec Kate.', ES: 'Material de preparación antes de la sesión con Kate.' },
    'mypage.library.item4.title': { KO: '지난 대화 복습 노트', EN: 'Past conversation review notes', ZH: '过往对话复习笔记', JA: '過去の会話の復習ノート', FR: 'Notes de révision des conversations passées', ES: 'Notas de repaso de conversaciones pasadas' },
    'mypage.library.item4.desc': { KO: '파트너가 남긴 피드백 표현을 다시 확인해 보세요.', EN: 'Review the feedback expressions your partner left.', ZH: '重新查看伙伴留下的反馈表达。', JA: 'パートナーが残したフィードバック表現を再確認してみましょう。', FR: 'Revoyez les expressions de retour laissées par votre partenaire.', ES: 'Revisa las expresiones de comentarios que dejó tu compañero.' },
    'mypage.history1.meta': { KO: '2026.08.02 (일) 20:00 · 30분 · 주제 ☕ 여행 회화', EN: '2026.08.02 (Sun) 20:00 · 30 min · Topic ☕ Travel Conversation', ZH: '2026.08.02（周日）20:00 · 30分钟 · 主题 ☕ 旅行会话', JA: '2026.08.02（日）20:00 · 30分 · テーマ ☕ 旅行会話', FR: '02.08.2026 (dim) 20:00 · 30 min · Sujet ☕ Conversation voyage', ES: '02.08.2026 (dom) 20:00 · 30 min · Tema ☕ Conversación de viaje' },
    'mypage.history2.meta': { KO: '2026.07.29 (수) 21:00 · 30분 · 주제 🎯 오픽/토스 준비', EN: '2026.07.29 (Wed) 21:00 · 30 min · Topic 🎯 OPIc/TOEIC Prep', ZH: '2026.07.29（周三）21:00 · 30分钟 · 主题 🎯 OPIc/托业准备', JA: '2026.07.29（水）21:00 · 30分 · テーマ 🎯 OPIc/TOEIC対策', FR: '29.07.2026 (mer) 21:00 · 30 min · Sujet 🎯 Préparation OPIc/TOEIC', ES: '29.07.2026 (mié) 21:00 · 30 min · Tema 🎯 Preparación OPIc/TOEIC' },

    /* ===== Materials & Report modal content (materials.js) ===== */
    'mat.report.r0802.date': { KO: '2026.08.02 (일)', EN: '2026.08.02 (Sun)', ZH: '2026.08.02（周日）', JA: '2026.08.02（日）', FR: '02.08.2026 (dim)', ES: '02.08.2026 (dom)' },
    'mat.report.r0802.topic': { KO: '☕ 여행 회화', EN: '☕ Travel Conversation', ZH: '☕ 旅行会话', JA: '☕ 旅行会話', FR: '☕ Conversation voyage', ES: '☕ Conversación de viaje' },
    'mat.report.r0802.feedback': {
      KO: 'Camille 파트너: 문장 구성력이 정말 훌륭하세요! 다음엔 주문 표현을 조금 더 연습해 봐요 💖', EN: "Partner Camille: Your sentence structure is excellent! Let's practice ordering expressions a bit more next time 💖", ZH: 'Camille伙伴：你的句子组织能力真的很棒！下次我们多练习一下点餐表达吧 💖', JA: 'Camilleパートナー：文構成力が本当に素晴らしいですね！次回は注文表現をもう少し練習しましょう 💖', FR: 'Partenaire Camille : Votre construction de phrases est excellente ! La prochaine fois, pratiquons un peu plus les expressions de commande 💖', ES: 'Compañera Camille: ¡Tu estructura de oraciones es excelente! La próxima vez practiquemos un poco más las expresiones para pedir 💖'
    },
    'mat.report.r0729.date': { KO: '2026.07.29 (수)', EN: '2026.07.29 (Wed)', ZH: '2026.07.29（周三）', JA: '2026.07.29（水）', FR: '29.07.2026 (mer)', ES: '29.07.2026 (mié)' },
    'mat.report.r0729.topic': { KO: '🎯 오픽/토스 준비', EN: '🎯 OPIc/TOEIC Prep', ZH: '🎯 OPIc/托业准备', JA: '🎯 OPIc/TOEIC対策', FR: '🎯 Préparation OPIc/TOEIC', ES: '🎯 Preparación OPIc/TOEIC' },
    'mat.report.r0729.feedback': {
      KO: 'Kate 파트너: 답변을 두 문장으로 늘리는 연습이 잘 되고 있어요! 접속 표현을 조금만 더 써보면 완벽해요 ✨', EN: "Partner Kate: You're doing great extending answers to two sentences! Use a few more connecting expressions and it'll be perfect ✨", ZH: 'Kate伙伴：把回答扩展成两句话的练习做得很好！再多用一些连接表达就完美了 ✨', JA: 'Kateパートナー：答えを2文に伸ばす練習がよくできていますね！接続表現をもう少し使えば完璧です ✨', FR: 'Partenaire Kate : Vous progressez bien en étendant vos réponses à deux phrases ! Utilisez un peu plus de connecteurs et ce sera parfait ✨', ES: 'Compañera Kate: ¡Lo estás haciendo muy bien extendiendo las respuestas a dos oraciones! Usa un poco más de conectores y será perfecto ✨'
    },
    'mat.durationFormat': { KO: '{min}분 대화', EN: '{min} min chat', ZH: '{min}分钟对话', JA: '{min}分の会話', FR: '{min} min de conversation', ES: '{min} min de conversación' },

    'mat.item.frtravel.badge': { KO: '🇫🇷 프랑스어 · 여행 회화', EN: '🇫🇷 French · Travel Conversation', ZH: '🇫🇷 法语 · 旅行会话', JA: '🇫🇷 フランス語 · 旅行会話', FR: '🇫🇷 Français · Conversation voyage', ES: '🇫🇷 Francés · Conversación de viaje' },
    'mat.item.frtravel.title': { KO: '니스 여행에서 바로 쓰는 대화 준비', EN: 'Ready-to-use conversation prep for a trip to Nice', ZH: '尼斯旅行中即可使用的对话准备', JA: 'ニース旅行でそのまま使える会話準備', FR: 'Préparation de conversation pour un voyage à Nice', ES: 'Preparación de conversación para un viaje a Niza' },
    'mat.item.frtravel.headline': { KO: '남프랑스 니스, 여름 축제로 붐비는 해변 도시', EN: 'Nice, Southern France — a beach city buzzing with summer festivals', ZH: '南法尼斯，夏日节日熙攘的海滨城市', JA: '南フランスのニース、夏祭りで賑わうビーチシティ', FR: 'Nice, dans le sud de la France — une ville balnéaire animée par les festivals d\'été', ES: 'Niza, en el sur de Francia — una ciudad costera animada por festivales de verano' },
    'mat.item.frtravel.source': { KO: 'DayO 큐레이션 · 3분 예습', EN: 'Curated by DayO · 3-min preview', ZH: 'DayO精选 · 3分钟预习', JA: 'DayOキュレーション · 3分予習', FR: 'Sélection DayO · Aperçu de 3 min', ES: 'Curaduría de DayO · Vista previa de 3 min' },
    'mat.item.frtravel.summary': { KO: '대화 파트너와 만나기 전에 한 번 읽어두면 좋은 배경 지식이에요. 모르는 단어는 표시해 두었다가 대화 중에 물어보세요.', EN: "Good background to read before meeting your partner. Mark any unfamiliar words and ask about them during the chat.", ZH: '在与对话伙伴见面前先读一读会很有帮助。遇到不懂的单词可以标记下来，在对话中提问。', JA: '対話パートナーに会う前に読んでおくと良い背景知識です。分からない単語はチェックしておいて会話中に聞いてみましょう。', FR: "Bon contexte à lire avant de rencontrer votre partenaire. Notez les mots inconnus et posez la question pendant la conversation.", ES: 'Buen contexto para leer antes de conocer a tu compañero. Marca las palabras que no conozcas y pregúntalas durante la charla.' },
    'mat.item.frtravel.points': {
      KO: ['니스의 해변 산책로 프롬나드 데 장글레는 여름마다 야외 공연장으로 변신합니다.', '7월 재즈 페스티벌 기간에는 숙소 예약이 평소보다 두 배 이상 몰립니다.', '현지 카페는 테라스 자리와 실내 자리의 가격이 다를 수 있어 주문 전에 확인이 필요합니다.'],
      EN: ["Nice's beachfront Promenade des Anglais turns into an open-air stage every summer.", 'During the July jazz festival, lodging bookings more than double compared to usual.', 'Local cafés may charge different prices for terrace vs. indoor seats, so check before ordering.'],
      ZH: ['尼斯的海滨步道天使湾大道每年夏天都会变成露天演出场地。', '7月爵士音乐节期间，住宿预订量会比平时多一倍以上。', '当地咖啡馆露台座和室内座价格可能不同，点单前需确认。'],
      JA: ['ニースの海岸沿いプロムナード・デ・ザングレは夏になると野外ステージに変わります。', '7月のジャズフェスティバル期間中は宿泊予約が通常の2倍以上に増えます。', '地元カフェではテラス席と室内席の値段が違うことがあるので、注文前に確認が必要です。'],
      FR: ["La Promenade des Anglais à Nice se transforme en scène en plein air chaque été.", 'Pendant le festival de jazz de juillet, les réservations d\'hébergement doublent par rapport à d\'habitude.', 'Les cafés locaux peuvent facturer différemment la terrasse et l\'intérieur, vérifiez avant de commander.'],
      ES: ['El paseo marítimo Promenade des Anglais de Niza se convierte en un escenario al aire libre cada verano.', 'Durante el festival de jazz de julio, las reservas de alojamiento se duplican respecto a lo habitual.', 'Los cafés locales pueden cobrar precios distintos en la terraza y el interior, revisa antes de pedir.']
    },
    'mat.item.frtravel.meanings': {
      KO: ['커피 한 잔 주세요.', '테라스 자리는 얼마인가요?', '추천해 주실 만한 게 있나요?', '조금만 더 천천히 말씀해 주시겠어요?', '이건 프랑스어로 뭐라고 하나요?'],
      EN: ["I'd like a coffee, please.", 'How much is the terrace seat?', 'Do you have a recommendation?', 'Could you speak a little more slowly?', 'How do you say this in French?'],
      ZH: ['请给我一杯咖啡。', '露台座位多少钱？', '有什么推荐的吗？', '能请您说得慢一点吗？', '这个用法语怎么说？'],
      JA: ['コーヒーを一杯お願いします。', 'テラス席はいくらですか？', 'おすすめはありますか？', 'もう少しゆっくり話していただけますか？', 'これはフランス語で何と言いますか？'],
      FR: ['Je voudrais un café, s\'il vous plaît.', 'C\'est combien, la terrasse ?', 'Vous avez une recommandation ?', 'Pourriez-vous parler un peu plus lentement ?', 'Comment on dit ça en français ?'],
      ES: ['Quisiera un café, por favor.', '¿Cuánto cuesta la terraza?', '¿Tiene alguna recomendación?', '¿Podría hablar un poco más despacio?', '¿Cómo se dice esto en francés?']
    },

    'mat.item.enopic.badge': { KO: '🇺🇸 영어 · 오픽/토스', EN: '🇺🇸 English · OPIc/TOEIC', ZH: '🇺🇸 英语 · OPIc/托业', JA: '🇺🇸 英語 · OPIc/TOEIC', FR: '🇺🇸 Anglais · OPIc/TOEIC', ES: '🇺🇸 Inglés · OPIc/TOEIC' },
    'mat.item.enopic.title': { KO: '오픽 인터뷰 빈출 주제 예습', EN: 'Preview: Frequent OPIc interview topic', ZH: 'OPIc面试常见主题预习', JA: 'OPICインタビュー頻出テーマ予習', FR: "Aperçu : sujet fréquent de l'entretien OPIc", ES: 'Vista previa: tema frecuente de la entrevista OPIc' },
    'mat.item.enopic.headline': { KO: '재택근무 이후 달라진 사무실 풍경', EN: 'How the office has changed since remote work', ZH: '居家办公之后不同的办公室景象', JA: 'リモートワーク以降変わったオフィスの風景', FR: 'Comment le bureau a changé depuis le télétravail', ES: 'Cómo ha cambiado la oficina desde el trabajo remoto' },
    'mat.item.enopic.source': { KO: 'DayO 큐레이션 · 4분 예습', EN: 'Curated by DayO · 4-min preview', ZH: 'DayO精选 · 4分钟预习', JA: 'DayOキュレーション · 4分予習', FR: 'Sélection DayO · Aperçu de 4 min', ES: 'Curaduría de DayO · Vista previa de 4 min' },
    'mat.item.enopic.summary': { KO: '오픽에서 자주 나오는 "일과 일상" 주제예요. 내 경험과 연결해서 두세 문장으로 말해보는 연습을 해보세요.', EN: 'A common OPIc "work and daily life" topic. Practice connecting it to your own experience in two or three sentences.', ZH: '这是OPIc中常见的"工作与日常"主题。请练习结合自身经历用两三句话来表达。', JA: 'OPICでよく出る「仕事と日常」テーマです。自分の経験に結びつけて2〜3文で話す練習をしてみましょう。', FR: 'Un sujet fréquent à l\'OPIc : « travail et vie quotidienne ». Entraînez-vous à le relier à votre expérience en deux ou trois phrases.', ES: 'Un tema frecuente de OPIc: "trabajo y vida diaria". Practica conectarlo con tu propia experiencia en dos o tres oraciones.' },
    'mat.item.enopic.points': {
      KO: ['많은 회사가 주 2~3일만 출근하는 하이브리드 방식을 유지하고 있습니다.', '집중 업무 공간보다 협업과 회의를 위한 라운지형 공간이 늘어나는 추세입니다.', '통근 시간이 줄면서 아침 시간을 학습이나 운동에 쓰는 사람이 많아졌습니다.'],
      EN: ['Many companies now keep a hybrid model with only 2-3 office days a week.', 'Lounge-style spaces for collaboration and meetings are replacing focused work areas.', 'With shorter commutes, more people spend mornings on learning or exercise.'],
      ZH: ['许多公司现在只需每周到岗2-3天，实行混合办公模式。', '用于协作和会议的休闲式空间正逐渐取代专注办公区。', '通勤时间减少后，越来越多人把早晨用于学习或运动。'],
      JA: ['多くの企業が週2〜3日だけ出社するハイブリッド方式を維持しています。', '集中作業スペースよりも、協業や会議のためのラウンジ型スペースが増える傾向にあります。', '通勤時間が減り、朝の時間を学習や運動に使う人が増えました。'],
      FR: ['De nombreuses entreprises maintiennent un modèle hybride avec seulement 2 à 3 jours au bureau par semaine.', 'Les espaces de type salon pour la collaboration remplacent les espaces de travail concentré.', 'Avec des trajets plus courts, plus de gens consacrent leurs matinées à l\'apprentissage ou au sport.'],
      ES: ['Muchas empresas mantienen un modelo híbrido con solo 2-3 días de oficina por semana.', 'Los espacios tipo lounge para colaboración están reemplazando las áreas de trabajo enfocado.', 'Con trayectos más cortos, más personas dedican las mañanas a aprender o hacer ejercicio.']
    },
    'mat.item.enopic.meanings': {
      KO: ['보통 일주일에 이틀은 재택으로 일해요.', '가장 마음에 드는 점은 유연함이에요.', '익숙해지는 데 시간이 좀 걸렸어요.', '예전과 비교하면 아침이 훨씬 여유로워요.'],
      EN: ['I usually work from home twice a week.', 'What I like most about it is the flexibility.', 'It took me a while to get used to it.', 'Compared to before, my mornings are much calmer.'],
      ZH: ['我通常一周有两天在家办公。', '我最喜欢的是它的灵活性。', '我花了一些时间才习惯。', '和以前相比，我的早晨要悠闲得多。'],
      JA: ['普段は週に2日は在宅で仕事をしています。', '一番気に入っているのは柔軟さです。', '慣れるまで少し時間がかかりました。', '以前と比べて、朝がずっと余裕があります。'],
      FR: ['Je travaille généralement depuis chez moi deux fois par semaine.', 'Ce que j\'aime le plus, c\'est la flexibilité.', 'Il m\'a fallu un moment pour m\'y habituer.', 'Comparé à avant, mes matinées sont beaucoup plus calmes.'],
      ES: ['Normalmente trabajo desde casa dos veces por semana.', 'Lo que más me gusta es la flexibilidad.', 'Me tomó un tiempo acostumbrarme.', 'Comparado con antes, mis mañanas son mucho más tranquilas.']
    },

    'mat.item.kodaily.badge': { KO: '🇰🇷 한국어 · 일상 수다', EN: '🇰🇷 Korean · Daily Chat', ZH: '🇰🇷 韩语 · 日常闲聊', JA: '🇰🇷 韓国語 · 日常会話', FR: '🇰🇷 Coréen · Discussion quotidienne', ES: '🇰🇷 Coreano · Charla diaria' },
    'mat.item.kodaily.title': { KO: '한국어 대화 파트너와의 첫 수다 준비', EN: 'Preparing for your first chat with a Korean conversation partner', ZH: '与韩语对话伙伴的初次闲聊准备', JA: '韓国語会話パートナーとの初めての会話準備', FR: 'Préparation pour votre première discussion avec un partenaire coréen', ES: 'Preparación para tu primera charla con un compañero de conversación en coreano' },
    'mat.item.kodaily.headline': { KO: '요즘 서울에서 인기 있는 동네 카페 산책', EN: 'A stroll through Seoul\'s trendy neighborhood cafés', ZH: '近来首尔热门的街区咖啡馆漫步', JA: '最近ソウルで人気の街カフェ散歩', FR: 'Une balade dans les cafés de quartier tendance de Séoul', ES: 'Un paseo por los cafés de barrio de moda en Seúl' },
    'mat.item.kodaily.source': { KO: 'DayO 큐레이션 · 3분 예습', EN: 'Curated by DayO · 3-min preview', ZH: 'DayO精选 · 3分钟预习', JA: 'DayOキュレーション · 3分予習', FR: 'Sélection DayO · Aperçu de 3 min', ES: 'Curaduría de DayO · Vista previa de 3 min' },
    'mat.item.kodaily.summary': { KO: '가볍게 읽고 대화 소재로 활용해 보세요. 발음이 어려운 표현은 대화 중에 파트너에게 물어봐도 좋아요.', EN: 'A light read you can use as chat material. Feel free to ask your partner about tricky pronunciations during the chat.', ZH: '轻松读一读，作为聊天素材吧。发音较难的表达也可以在对话中向伙伴请教。', JA: '軽く読んで会話のネタにしてみましょう。発音が難しい表現は会話中にパートナーに聞いてみてもいいです。', FR: 'Une lecture légère à utiliser comme sujet de conversation. N\'hésitez pas à demander à votre partenaire pour les prononciations difficiles.', ES: 'Una lectura ligera que puedes usar como tema de charla. No dudes en preguntarle a tu compañero sobre pronunciaciones difíciles.' },
    'mat.item.kodaily.points': {
      KO: ['성수동과 연남동은 오래된 주택을 고친 작은 카페가 많은 동네입니다.', '주말 오전에는 대기가 길어 평일 낮 시간대를 추천하는 사람이 많습니다.', '요즘은 디저트 한 가지만 전문으로 하는 작은 가게가 인기를 얻고 있습니다.'],
      EN: ['Seongsu-dong and Yeonnam-dong are neighborhoods full of small cafés renovated from old houses.', 'Weekend mornings have long waits, so many recommend weekday afternoons instead.', 'Small shops specializing in just one dessert are becoming popular these days.'],
      ZH: ['圣水洞和延南洞是许多由老房子改造成的小咖啡馆聚集的街区。', '周末上午排队较长，很多人推荐平日的白天时段。', '最近专门只做一种甜点的小店越来越受欢迎。'],
      JA: ['聖水洞と延南洞は、古い住宅を改装した小さなカフェが多い地域です。', '週末の午前は待ち時間が長いため、平日の昼間を勧める人が多いです。', '最近はデザート一品だけを専門にする小さなお店が人気を集めています。'],
      FR: ['Seongsu-dong et Yeonnam-dong sont des quartiers pleins de petits cafés aménagés dans de vieilles maisons.', 'Les matinées de week-end ont de longues attentes, donc beaucoup recommandent les après-midis en semaine.', 'Les petites boutiques spécialisées dans un seul dessert deviennent populaires ces jours-ci.'],
      ES: ['Seongsu-dong y Yeonnam-dong son barrios llenos de pequeñas cafeterías renovadas a partir de casas antiguas.', 'Las mañanas de fin de semana tienen largas esperas, por lo que muchos recomiendan las tardes de semana.', 'Las pequeñas tiendas especializadas en un solo postre se están volviendo populares últimamente.']
    },
    'mat.item.kodaily.meanings': {
      KO: ['안부를 묻는 가장 편한 표현이에요.', '장소를 추천받을 때 쓰는 표현이에요.', '속도 조절을 부탁할 때 쓰는 표현이에요.', '모르는 단어를 물어볼 때 쓰는 표현이에요.'],
      EN: ['The easiest way to ask how someone is doing.', 'An expression used when asking for a place recommendation.', 'An expression used to ask someone to slow down.', 'An expression used to ask about an unfamiliar word.'],
      ZH: ['这是问候近况最简便的表达。', '这是请求推荐地点时使用的表达。', '这是请求对方放慢速度时使用的表达。', '这是询问不懂单词时使用的表达。'],
      JA: ['近況を尋ねる最も気楽な表現です。', '場所をおすすめしてもらう時に使う表現です。', 'スピードを調整してほしい時に使う表現です。', '知らない単語を聞く時に使う表現です。'],
      FR: ['La façon la plus simple de demander comment quelqu\'un va.', 'Une expression utilisée pour demander une recommandation de lieu.', 'Une expression utilisée pour demander de parler plus lentement.', 'Une expression utilisée pour demander un mot inconnu.'],
      ES: ['La forma más sencilla de preguntar cómo está alguien.', 'Una expresión usada para pedir una recomendación de lugar.', 'Una expresión usada para pedirle a alguien que hable más despacio.', 'Una expresión usada para preguntar sobre una palabra desconocida.']
    }
  };

  var currentLang = 'KO';

  var CSS = [
    '.i18n-wrap{position:relative;display:inline-flex;}',
    '.i18n-btn{display:inline-flex;align-items:center;justify-content:center;gap:.35rem;padding:.5rem .75rem;',
    'border:1px solid var(--coral-pale,#FFE8E3);border-radius:999px;background:var(--cream,#FFF8F5);',
    'color:var(--text,#594842);font-family:inherit;font-size:.78rem;font-weight:700;cursor:pointer;',
    'white-space:nowrap;transition:transform .2s,border-color .2s,background .2s;}',
    '.i18n-btn:hover{transform:translateY(-1px);border-color:var(--coral,#FF6B57);}',
    '.i18n-btn .i18n-flag{font-size:1rem;line-height:1;}',
    '.i18n-btn--icon{width:42px;height:42px;padding:0;border-radius:14px;}',
    '.i18n-btn--icon .i18n-flag{font-size:1.15rem;}',
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

  function tf(key, vars, lang) {
    var text = t(key, lang);
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (match, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match;
    });
  }

  function langName(id, lang) {
    var entry = LANG_NAMES[id];
    if (!entry) return id;
    var code = lang || currentLang;
    return entry[code] || entry.EN || id;
  }

  function langNameWithFlag(id, lang) {
    var entry = LANG_NAMES[id];
    if (!entry) return id;
    return entry.flag + ' ' + langName(id, lang);
  }

  function langFlag(id) {
    var entry = LANG_NAMES[id];
    return entry ? entry.flag : '';
  }

  function weekdayNames(lang) {
    return WEEKDAY_NAMES[lang || currentLang] || WEEKDAY_NAMES.EN;
  }

  function monthTitle(year, month, lang) {
    return formatMonthTitle(year, month, lang || currentLang);
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
      var attr = node.getAttribute('data-i18n-attr');
      if (attr) {
        node.setAttribute(attr, text);
      } else if (node.getAttribute('data-i18n-html') === 'true') {
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
      if (btn.classList.contains('i18n-btn--icon')) {
        if (flag) flag.textContent = '🌐';
        return;
      }
      if (flag) flag.textContent = meta.flag;
      if (label) label.textContent = meta.label;
    });
  }

  function closeAllMenus() {
    Array.prototype.forEach.call(document.querySelectorAll('.i18n-wrap.is-open'), function (wrap) {
      wrap.classList.remove('is-open');
    });
  }

  function buildSwitcher(variant) {
    var isIcon = variant === 'icon';
    var options = SUPPORTED.map(function (code) {
      var meta = LANG_META[code];
      return '<button class="i18n-opt" type="button" role="option" data-lang="' + code + '">' +
        '<span aria-hidden="true">' + meta.flag + '</span>' + meta.label + '</button>';
    }).join('');

    var trigger = isIcon
      ? '<button class="i18n-btn i18n-btn--icon" type="button" aria-haspopup="listbox" aria-label="' + t('lang.select') + '">' +
        '<span class="i18n-flag" aria-hidden="true">🌐</span>' +
        '</button>'
      : '<button class="i18n-btn" type="button" aria-haspopup="listbox" aria-label="' + t('lang.select') + '">' +
        '<span class="i18n-flag" aria-hidden="true">' + LANG_META[currentLang].flag + '</span>' +
        '<span class="i18n-label">' + LANG_META[currentLang].label + '</span>' +
        '</button>';

    return '<div class="i18n-wrap">' + trigger +
      '<div class="i18n-menu" role="listbox">' + options + '</div>' +
      '</div>';
  }

  function mountSwitchers() {
    var slots = document.querySelectorAll('[data-i18n-lang]');
    Array.prototype.forEach.call(slots, function (slot) {
      slot.innerHTML = buildSwitcher(slot.getAttribute('data-i18n-lang'));
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

    window.DayOI18n = {
      t: t, tf: tf, getLang: getLang, setLang: setLang, apply: apply, updatePage: apply,
      langName: langName, langNameWithFlag: langNameWithFlag, langFlag: langFlag,
      weekdayNames: weekdayNames, monthTitle: monthTitle
    };

    mountSwitchers();
    apply();
    document.dispatchEvent(new CustomEvent('dayo:langchange', { detail: { lang: currentLang } }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
