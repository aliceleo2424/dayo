(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DayOCheatSheets = api;
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this, function () {
  var LANGS = {
    en: { flag: '🇺🇸', name: '영어', label: 'English' },
    fr: { flag: '🇫🇷', name: '프랑스어', label: 'Français' },
    ja: { flag: '🇯🇵', name: '일본어', label: '日本語' },
    es: { flag: '🇪🇸', name: '스페인어', label: 'Español' },
    zh: { flag: '🇨🇳', name: '중국어', label: '中文' },
    ko: { flag: '🇰🇷', name: '한국어', label: '한국어' }
  };

  var LEVELS = {
    intro: { id: 'intro', name: '입문' },
    basic: { id: 'basic', name: '기초' },
    challenge: { id: 'challenge', name: '도전' }
  };

  var TITLES = {
    en: '원어민 앞 7초 침묵 탈출 만능 표현 20선',
    fr: '파리 여행 필수 서바이벌 회화 표현집',
    ja: '현지 식당/카페에서 바로 쓰는 일본어 회화 치트키',
    es: '바르셀로나 타파스 바 소통 가이드',
    zh: '현지 찻집/식당에서 바로 쓰는 중국어 회화 치트키',
    ko: '카페·식당에서 바로 쓰는 한국어 회화 치트키'
  };

  function p(scene, phrase, meaning, tip) {
    return { scene: scene, phrase: phrase, meaning: meaning, tip: tip };
  }

  var DATA = {
    en: {
      intro: [
        p('cafe', 'Can I get a latte, please?', '라떼 하나 주세요.', '캔 아이 겟 어 라떼, 플리즈. 카페에선 have보다 get이 더 자주 들려요.'),
        p('cafe', 'For here or to go?', '여기서 드실래요, 가져가실래요?', '포 히어 올 투 고? 직원이 먼저 물어보면 “For here, please.”로 받아치면 돼요.'),
        p('restaurant', 'A table for two, please.', '두 명 자리 부탁드려요.', '어 테이블 포 투, 플리즈. 입장하자마자 이 한 줄이면 충분해요.'),
        p('restaurant', 'The menu, please.', '메뉴판 주세요.', '더 메뉴, 플리즈. Could I see the menu?보다 짧고 잘 통해요.'),
        p('street', 'Excuse me, where’s the station?', '실례합니다, 역이 어디예요?', '익스큐즈 미, 웨어즈 더 스테이션? where is보다 where’s가 입에 붙어요.'),
        p('street', 'Is it far from here?', '여기서 멀어요?', '이즈 잇 파 프롬 히어? 거리 감을 물을 때 만능이에요.'),
        p('hotel', 'Hi, I have a reservation.', '안녕하세요, 예약했어요.', '하이, 아이 해브 어 레저베이션. 프론트 첫마디로 딱이에요.'),
        p('hotel', 'Under the name Kim.', '김으로 되어 있어요.', '언더 더 네임 킴. 이름을 바로 얹어 주면 체크인이 빨라요.'),
        p('cafe', 'I’ll need a minute.', '조금만 볼게요.', '아일 니드 어 미닛. 메뉴를 고르는 중일 때 부드럽게 시간을 벌어요.'),
        p('restaurant', 'That’s all, thanks.', '이걸로 충분해요, 감사합니다.', '댓츠 올, 땡스. 주문을 끝낼 때 가볍고 자연스러워요.')
      ],
      basic: [
        p('cafe', 'Can I get an iced Americano, please?', '아이스 아메리카노 주세요.', '캔 아이 겟 언 아이스드 아메리카노. iced는 아이스드에 가깝게 이어서 말해요.'),
        p('cafe', 'Could I have that with oat milk?', '오트밀크로 바꿔 주실 수 있나요?', '윗 오트 밀크. 요즘 카페에서 제일 자주 쓰는 옵션 한 줄이에요.'),
        p('restaurant', 'Hi — a table for two, please.', '안녕하세요, 두 명이요.', '하이, 어 테이블 포 투. Hi를 붙이면 입구에서 더 부드러워요.'),
        p('restaurant', 'Could we see the menu, please?', '메뉴판 볼 수 있을까요?', '쿠드 위 씨 더 메뉴. we를 쓰면 같이 온 느낌이 나요.'),
        p('street', 'Sorry to bother you — how do I get to the station?', '잠깐 여쭤볼게요, 역은 어떻게 가요?', '하우 두 아이 겟 투~. 길을 물을 때 where is보다 한 단계 자연스러워요.'),
        p('street', 'Is this the right way to the subway?', '이쪽으로 가면 지하철 맞아요?', '이즈 디스 더 라이트 웨이. 방향만 확인하고 싶을 때 좋아요.'),
        p('hotel', "Hi, I've got a reservation under Kim.", '안녕하세요, 김으로 예약했어요.', '아이브 갓 어 레저베이션 언더 킴. have보다 I’ve got이 말에 더 잘 붙어요.'),
        p('hotel', 'What time is checkout?', '체크아웃이 몇 시예요?', '왓 타임 이즈 체크아웃? 프론트에서 바로 통하는 한 줄이에요.'),
        p('cafe', 'I’ll take a moment to decide, thanks.', '아직 고르는 중이에요, 감사합니다.', '테이크 어 모먼트 투 디사이드. 바리스타가 기다릴 때 만능이에요.'),
        p('restaurant', 'Could we have the check, please?', '계산해 주실 수 있을까요?', '더 체크. bill보다 check가 미국에서 더 자주 들려요.')
      ],
      challenge: [
        p('cafe', 'I’ll grab a flat white — extra shot if that’s okay.', '플랫화이트에 샷 추가해도 될까요?', '그랩 어 플랫 화이트. grab은 카페에서 주문할 때 가볍게 쓰는 말이에요.'),
        p('cafe', 'Do you have any dairy-free options?', '유제품 없는 선택지도 있나요?', '데어리-프리 옵션즈. 알레르기·취향을 물을 때 세련돼요.'),
        p('restaurant', 'We haven’t decided yet — could you give us a minute?', '아직 못 정했어요. 잠시만요.', '위 해븐트 디사이디드 옛. 서버가 너무 빨리 올 때 딱이에요.'),
        p('restaurant', 'What would you recommend that’s not too heavy?', '너무 무겁지 않은 걸로 추천해 주실래요?', '낫 투 헤비. 메뉴가 많을 때 대화를 여는 질문이에요.'),
        p('street', 'I’m a bit turned around — is the station this way or that way?', '길을 좀 헤맸어요. 역이 이쪽이에요, 저쪽이에요?', '턴드 어라운드. lost보다 덜 과장되고 자연스러워요.'),
        p('street', 'Roughly how many minutes on foot?', '걸어서 대략 몇 분이에요?', '러플리 하우 메니 미닛츠 온 풋. 거리를 감을 때 좋아요.'),
        p('hotel', 'Hi there — booking under Kim, two nights.', '안녕하세요, 김으로 이틀 예약했어요.', '부킹 언더 킴, 투 나이츠. 예약 확인을 한 호흡에 끝내는 말이에요.'),
        p('hotel', 'Is there any chance of an early check-in?', '얼리 체크인 가능할까요?', '에니 찬스 오브 언 얼리 체크인. 부탁을 부드럽게 여는 패턴이에요.'),
        p('cafe', 'Could I get that to go, and extra napkins?', '포장이요, 냅킨 조금 더 주실 수 있나요?', '투 고, 엑스트라 냅킨즈. 나갈 때 한 번에 부탁하면 편해요.'),
        p('restaurant', 'This was lovely, thank you — we’ll take the check whenever.', '정말 좋았어요. 계산은 편할 때 부탁드려요.', '웰 테이크 더 체크 웬에버. 서두르지 않는 계산 부탁이에요.')
      ]
    },
    fr: {
      intro: [
        p('cafe', 'Bonjour !', '안녕하세요!', '봉주르. 카페 문을 열면 이 한 마디가 먼저예요.'),
        p('cafe', 'Un café, s’il vous plaît.', '커피 하나 주세요.', '앙 카페, 실 부 플레. s’il vous plaît는 시-부-플레로 붙여 말해요.'),
        p('restaurant', 'Une table pour deux, s’il vous plaît.', '두 명 자리 부탁드려요.', '윈 타블 푸르 퇴. pour deux는 푸르 퇴에 가깝게.'),
        p('restaurant', 'La carte, s’il vous plaît.', '메뉴판 주세요.', '라 카르트. 프랑스에선 menu가 아니라 carte예요.'),
        p('street', 'Excusez-moi.', '실례합니다.', '엑스큐제-므아. 길을 물을 때 첫마디예요.'),
        p('street', 'C’est par où, la station ?', '역은 어느 쪽이에요?', '세 파 루, 라 스타시옹? 길에서 제일 자주 들려요.'),
        p('hotel', 'Bonjour, je viens m’enregistrer.', '안녕하세요, 체크인하러 왔어요.', '주 비앙 멍레지스트레. 프론트 첫마디로 자연스러워요.'),
        p('hotel', 'Au nom de Kim.', '김 이름으로요.', '오 농 드 킴. 예약 이름을 바로 얹어 주세요.'),
        p('cafe', 'Je n’ai pas encore choisi.', '아직 고르는 중이에요.', '주 네 파 장코르 슈아지. 시간을 벌 때 만능이에요.'),
        p('restaurant', 'L’addition, s’il vous plaît.', '계산 부탁드려요.', '라디시옹. 식당 계산은 bill이 아니라 addition이에요.')
      ],
      basic: [
        p('cafe', 'Je vais prendre un café, s’il vous plaît.', '커피로 할게요.', '주 베 프랑드르 앙 카페. Je vais prendre가 주문할 때 입에 제일 붙어요.'),
        p('cafe', 'Un croissant aussi, s’il vous plaît.', '크루아상도 주세요.', '앙 크루아상 오시. aussi는 오시, 문장 뒤에 가볍게.'),
        p('restaurant', 'On est deux. Vous avez une table ?', '두 명인데요, 자리 있나요?', '온 네 퇴. on은 우리, 식당에서 아주 자주 써요.'),
        p('restaurant', 'Qu’est-ce que vous recommandez ?', '뭐가 맛있어요?', '케스-크 부 르코망데? 메뉴가 어려울 때 대화를 열어요.'),
        p('street', 'Excusez-moi, pour aller à la station de métro ?', '지하철역은 어떻게 가요?', '푸르 알레 아 라 스타시옹 드 메트로. 길찾기 핵심 패턴이에요.'),
        p('street', 'C’est loin à pied ?', '걸어서 멀어요?', '세 루앙 아 피에. 거리 감을 물을 때 짧고 좋아요.'),
        p('hotel', 'J’ai une réservation au nom de Kim.', '김으로 예약했어요.', '제이 윈 레제르바시옹 오 농 드 킴.'),
        p('hotel', 'À quelle heure est le check-out ?', '체크아웃이 몇 시예요?', '아 켈 외르 에 르 체크아웃.'),
        p('cafe', 'Un instant, s’il vous plaît.', '잠시만요.', '앙 앵스탕. 고르는 중일 때 부드럽게 막아 줘요.'),
        p('restaurant', 'C’était très bon, merci.', '정말 맛있었어요, 감사합니다.', '세테 트레 봉. 자리에서 일어설 때 한 줄이면 충분해요.')
      ],
      challenge: [
        p('cafe', 'Je vais prendre un café allongé, pas trop serré.', '아메리카노처럼 연한 커피로 주세요.', '카페 알롱제. 파리에서 진하지 않은 커피를 고를 때 잘 통해요.'),
        p('cafe', 'Je peux m’installer à la terrasse ?', '테라스에 앉아도 될까요?', '앵스탈레 아 라 테라스. 자리를 물을 때 세련돼요.'),
        p('restaurant', 'On n’a pas encore choisi — vous pouvez revenir ?', '아직 못 정했어요, 다시 와 주실래요?', '온 나 파 장코르 슈아지. 서버를 부드럽게 돌려보내는 말이에요.'),
        p('restaurant', 'Vous avez un plat un peu plus léger ?', '조금 더 가벼운 메뉴 있나요?', '앵 플레 위 프 플러 레제. 추천을 열어 주는 질문이에요.'),
        p('street', 'Je suis un peu perdu — la station, c’est par ici ?', '길을 좀 잃었어요. 역이 이쪽 맞아요?', '앵 프 페르뒤. perdu는 페르뒤, 과장하지 않고 말해요.'),
        p('street', 'Ça fait combien de minutes à pied ?', '걸어서 몇 분쯤이에요?', '사 페 콩비앙 드 미뉸트 아 피에.'),
        p('hotel', 'Bonjour, réservation au nom de Kim, deux nuits.', '안녕하세요, 김으로 이틀 예약했어요.', '퇴 뉘. nuit는 뉘, 숙박 밤 수예요.'),
        p('hotel', 'Ce serait possible de déposer les bagages ?', '짐만 맡겨도 될까요?', '데포제 레 바가주. 체크인 전에도 잘 통하는 부탁이에요.'),
        p('cafe', 'À emporter, s’il vous plaît — et un sucre à part.', '포장이요, 설탕은 따로 주세요.', '아 앙포르테. 가져갈 때 이 표현이 to go 역할이에요.'),
        p('restaurant', 'L’addition quand vous voulez — merci encore.', '편하실 때 계산 부탁드려요.', '캉 부 불레. 서두르지 않는 계산 부탁이에요.')
      ]
    },
    ja: {
      intro: [
        p('cafe', 'すみません。', '저기요 / 실례합니다.', '스미마셍. 카페·길 어디서든 말 걸 때 첫마디예요.'),
        p('cafe', '抹茶ラテをください。', '말차 라떼 주세요.', '맛차 라테 오 쿠다사이. 킷사텐·카페에서 바로 통해요.'),
        p('restaurant', '2名です。', '두 명이요.', '니메이 데스. 입장하자마자 인원만 말하면 자리가 열려요.'),
        p('restaurant', 'メニューをお願いします。', '메뉴판 부탁드려요.', '메뉴 오 오네가이시마스. ください보다 한결 다정해요.'),
        p('street', '駅はどっちですか？', '역이 어느 쪽이에요?', '에키 와 돗치 데스카. どこ보다 골목에서 더 자주 들려요.'),
        p('street', 'この道で大丈夫ですか？', '이 길로 가면 되나요?', '코노 미치 데 다이죠부 데스카.'),
        p('hotel', 'チェックインをお願いします。', '체크인 부탁드려요.', '첵쿠인 오 오네가이시마스.'),
        p('hotel', 'キムで予約してます。', '김으로 예약했어요.', '키무 데 요야쿠 시테마스. してます가 구어체예요.'),
        p('cafe', 'まだ決めてないんですけど…', '아직 고르는 중인데요…', '마다 키메테나이 은 데스 케도. 말끝을 내리면 더 부드러워요.'),
        p('restaurant', 'お会計お願いします。', '계산 부탁드려요.', '오카이케이 오 오네가이시마스.')
      ],
      basic: [
        p('cafe', 'すみません、抹茶ラテひとつください。', '저기요, 말차 라떼 하나 주세요.', '히토츠 쿠다사이. 숫자를 붙이면 주문이 분명해져요.'),
        p('cafe', 'ホットでお願いします。', '따뜻한 걸로 주세요.', '홋토 데 오네가이시마스. 아이스의 반대, 카페 만능이에요.'),
        p('restaurant', '2名なんですけど、空いてますか？', '두 명인데, 자리 있나요?', '아이테마스카. 空いてます가 “자리 있어요?”예요.'),
        p('restaurant', 'おすすめは何ですか？', '뭐가 맛있어요?', '오스스메 와 난 데스카. 메뉴가 어려울 때 대화를 열어요.'),
        p('street', 'すみません、駅までの行き方教えてもらえますか？', '역까지 가는 길 알려 주실래요?', '이키카타 오시에테 모라에마스카. 부탁을 부드럽게 여는 말이에요.'),
        p('street', '歩いて何分くらいですか？', '걸어서 몇 분쯤이에요?', '아루이테 난푼 쿠라이 데스카.'),
        p('hotel', 'キムで予約してます。チェックインお願いします。', '김으로 예약했어요. 체크인 부탁드려요.', '한 호흡에 이름과 목적을 같이 말하면 프론트가 빨라요.'),
        p('hotel', '荷物、預かってもらえますか？', '짐 맡아 주실 수 있나요?', '니모츠, 아즈캇테 모라에마스카.'),
        p('cafe', 'ちょっと待ってください。', '잠시만요.', 'チョット 맛테 쿠다사이. 고르는 중일 때 현장에서 제일 자주 들려요.'),
        p('restaurant', 'おいしかったです、ありがとうございました。', '맛있었어요, 감사합니다.', '오이시캇타 데스. 자리에서 일어날 때 한 줄이면 충분해요.')
      ],
      challenge: [
        p('cafe', '抹茶ラテ、少なめの甘さでお願いします。', '말차 라떼, 덜 달게 주세요.', '스쿠나메 노 아마사. 당도를 조절할 때 세련돼요.'),
        p('cafe', 'テイクアウトで。袋、小さめで大丈夫です。', '포장이요. 봉지는 작은 걸로요.', '테이쿠아우토. 가져갈 때 이 한 줄이면 끝나요.'),
        p('restaurant', 'まだ決めてないので、少し時間もらえますか？', '아직 못 정해서, 조금만 시간 주실 수 있나요?', '스코시 지칸 모라에마스카. 서버를 부드럽게 돌려보내요.'),
        p('restaurant', 'あまり辛くない料理、ありますか？', '너무 맵지 않은 요리 있나요?', '아마리 츠요쿠나이…가 아니라 辛くない. 취향을 여는 질문이에요.'),
        p('street', 'すみません、ちょっと迷っちゃって。駅、こっちですか？', '길을 좀 헤맸어요. 역이 이쪽이에요?', '마ヨ챠тте. 헤맸다를 가볍게 말하는 구어체예요.'),
        p('street', '一番近い駅、どっち方向ですか？', '제일 가까운 역이 어느 방향이에요?', '이치방 치지카이 에키.'),
        p('hotel', 'キムで2泊予約してます。早めのチェックインって可能ですか？', '김으로 이틀 예약했어요. 얼리 체크인 될까요?', '하야메 노 첵쿠인. 부탁 앞에 予約를 먼저 두면 잘 열려요.'),
        p('hotel', '朝、何時から朝食出ますか？', '아침 식사는 몇 시부터예요?', '아사, 난지 카라 쵸쇼쿠 데마스카.'),
        p('cafe', 'これ、持ち帰りできる？あ、できますか？', '이거 포장되나요?', '데키마스카로 고치면 바로 공손해져요. 카페에서 자주 쓰는 패턴이에요.'),
        p('restaurant', 'お会計、まとめてお願いします。', '계산 한 번에 부탁드려요.', '마토메테. 더치페이가 아닐 때 이 한 줄이면 돼요.')
      ]
    },
    es: {
      intro: [
        p('cafe', 'Hola, ¿qué hay?', '안녕하세요, 뭐 있어요?', '올라, 케 아이. 테라스에서 가볍게 여는 인사+질문이에요.'),
        p('cafe', 'Un café con leche, por favor.', '밀크커피 주세요.', '운 카페 콘 레체, 포르 파보르.'),
        p('restaurant', '¿Hay mesa para dos?', '두 명 자리 있나요?', '아이 메사 파라 도스.'),
        p('restaurant', 'La carta, por favor.', '메뉴판 주세요.', '라 카르타. menú보다 carta가 식당에서 더 자주 써요.'),
        p('street', 'Perdona.', '실례해요.', '페르도나. 스페인에선 Perdón보다 행인에게 더 자주 들려요.'),
        p('street', '¿Dónde está el metro?', '지하철이 어디예요?', '돈데 에스타 엘 메트로.'),
        p('hotel', 'Hola, vengo a hacer el check-in.', '안녕하세요, 체크인하러 왔어요.', '벵고 아 아세르 엘 체킨.'),
        p('hotel', 'A nombre de Kim.', '김 이름으로요.', '아 놈브레 데 킴.'),
        p('cafe', 'Un segundo, que aún miro.', '잠깐만요, 아직 보는 중이에요.', '운 세군도, 케 아운 미로.'),
        p('restaurant', 'La cuenta, por favor.', '계산 부탁드려요.', '라 쿠엔타, 포르 파보르.')
      ],
      basic: [
        p('cafe', 'Para tomar aquí, un café con leche.', '여기서 마실게요, 카페콘레체요.', '파라 토마르 아키. 테라스인지 가져가는지 먼저 말해요.'),
        p('cafe', '¿Me pones un cortado, porfa?', '코르타도 하나 주시겠어요?', '메 포네스… 포르파. 바에서 아주 구어체예요.'),
        p('restaurant', 'Somos dos. ¿Tenéis mesa en la terraza?', '두 명이요. 테라스 자리 있나요?', '테네이스. 스페인에선 2인칭 복수 tenéis가 자주 들려요.'),
        p('restaurant', '¿Qué nos recomiendas para picar?', '뭐 집어먹기 좋아요?', '피카르. 타파스 바에서 “조금 먹다”예요.'),
        p('street', 'Perdona, ¿el metro está cerca?', '지하철 가까워요?', '엘 메트로 에스타 세르카.'),
        p('street', '¿Cómo se va a la estación?', '역은 어떻게 가요?', '코모 세 바 아 라 에스타시온.'),
        p('hotel', 'Tengo una reserva a nombre de Kim.', '김으로 예약했어요.', '텡고 우나 레세르바 아 놈브레 데 킴.'),
        p('hotel', '¿A qué hora es el check-out?', '체크아웃이 몇 시예요?', '아 케 오라 에스 엘 체카웃.'),
        p('cafe', 'Todavía estoy mirando, un momento.', '아직 보는 중이에요, 잠시만요.', '토다비아 에스토이 미란도.'),
        p('restaurant', 'Estaba muy bueno, gracias.', '정말 맛있었어요, 감사합니다.', '에스타바 무이 부에노.')
      ],
      challenge: [
        p('cafe', 'Un café con leche, poco dulce, para tomar fuera.', '덜 달게, 테라스에서 마실게요.', '파라 토마르 후에라. 야외 테라스일 때 잘 맞아요.'),
        p('cafe', '¿Me lo puedes hacer para llevar?', '포장해 주실 수 있나요?', '파라 예바르. to go 역할이에요.'),
        p('restaurant', 'Aún no hemos decidido — ¿nos das un minuto?', '아직 못 정했어요, 1분만 주실래요?', '노스 다스 운 미누토. 타파스 바에서 서버를 돌려보내요.'),
        p('restaurant', 'Algo para compartir que no pique mucho, ¿hay?', '너무 맵지 않게 나눠 먹을 거 있나요?', '케 노 피케 무초. 매운맛 조절 + 공유 메뉴예요.'),
        p('street', 'Perdona, me he perdido un poco. ¿El Gotico es por aquí?', '길을 좀 헤맸어요. 고틱 지구가 이쪽이에요?', '메 에 페르디도 운 포코.'),
        p('street', '¿A cuántos minutos andando?', '걸어서 몇 분이에요?', '아 쿠안토스 미누토스 안단도.'),
        p('hotel', 'Hola, reserva a nombre de Kim, dos noches.', '안녕하세요, 김으로 이틀 예약했어요.', '도스 노체스.'),
        p('hotel', '¿Hay alguna posibilidad de dejar el equipaje?', '짐만 맡겨도 될까요?', '데하르 엘 에키파헤.'),
        p('cafe', 'La cuenta cuando puedas — sin prisa.', '급하지 않으니, 편할 때 계산해 주세요.', '신 프리사. 카페에서 여유 있는 계산 부탁이에요.'),
        p('restaurant', 'Para picar, una ración para compartir, gracias.', '나눠 먹을 라시온 하나로 주세요.', '우나 라시온 파라 콤파르티르. 타파스 바 핵심 한 줄이에요.')
      ]
    },
    zh: {
      intro: [
        p('cafe', '你好。', '안녕하세요.', '니하오. 찻집 문을 열면 먼저 이 인사예요.'),
        p('cafe', '来一杯茶，谢谢。', '차 한 잔 주세요.', '라이 이베이 차, 셰셰. 我要보다 来一杯이 더 구어체예요.'),
        p('restaurant', '有两位的位子吗？', '두 명 자리 있나요?', '요우 량웨이 더 리쯔 마.'),
        p('restaurant', '请给我菜单。', '메뉴판 주세요.', '칭 게이워 차이단.'),
        p('street', '请问。', '저기요, 여쭤볼게요.', '칭원. 길을 물을 때 첫마디예요.'),
        p('street', '地铁站在哪里？', '지하철역이 어디예요?', '디톄잔 짜이 나리.'),
        p('hotel', '你好，我要办理入住。', '안녕하세요, 체크인하러 왔어요.', '워 야오 반리 루주.'),
        p('hotel', '我姓金，有预订。', '성은 김이고, 예약했어요.', '워 싱 진, 요우 위딩. ~의 이름 아래보다 이 말이 자연스러워요.'),
        p('cafe', '请稍等，我看一下。', '잠시만요, 조금만 볼게요.', '칭 샤오덩, 워 칸 이샤.'),
        p('restaurant', '买单，谢谢。', '계산할게요.', '마이단, 셰셰.')
      ],
      basic: [
        p('cafe', '来一杯热茶，少糖。', '따뜻한 차, 덜 달게 주세요.', '러차, 샤오탕. 당도 조절이 바로 붙어요.'),
        p('cafe', '可以坐这里吗？', '여기 앉아도 될까요?', '커이 쭤 저르 마.'),
        p('restaurant', '两个人，有位子吗？', '두 명인데 자리 있나요?', '량거 런, 요우 리쯔 마.'),
        p('restaurant', '有什么推荐的吗？', '뭐가 맛있어요?', '요우 션머 투이젠 더 마.'),
        p('street', '请问，去地铁站怎么走？', '지하철역은 어떻게 가요?', '취 디톄잔 쩜머 쩌우.'),
        p('street', '走路远不远？', '걸어서 멀어요?', '쩌우루 위안 부 위안.'),
        p('hotel', '你好，我姓金，有预订。办理入住。', '김으로 예약했어요. 체크인할게요.', '이름과 목적을 한 호흡에 말해요.'),
        p('hotel', '退房是几点？', '체크아웃이 몇 시예요?', '투이팡 스 지디엔.'),
        p('cafe', '我再看看，谢谢。', '조금만 더 볼게요.', '워 짜이 칸칸, 셰셰.'),
        p('restaurant', '很好吃，谢谢。', '맛있었어요, 감사합니다.', '헨 하오츠, 셰셰.')
      ],
      challenge: [
        p('cafe', '来一杯茶，不要太烫，打包。', '너무 뜨겁지 않게, 포장해 주세요.', '부야오 타이 탕, 다바오.'),
        p('cafe', '有没有无糖的？', '무설탕 있나요?', '요우메이요우 우탕 더.'),
        p('restaurant', '我们还没想好，你先忙？', '아직 못 정했어요, 먼저 가세요.', '워먼 하이 메이 샹하오. 서버를 부드럽게 돌려보내요.'),
        p('restaurant', '有不太辣的菜吗？', '너무 맵지 않은 거 있나요?', '부 타이 라 더 차이.'),
        p('street', '不好意思，我有点迷路了。地铁站往哪边？', '길을 좀 잃었어요. 지하철역이 어느 쪽이에요?', '워 요우디엔 미루 러.'),
        p('street', '走路大概几分钟？', '걸어서 대략 몇 분이에요?', '다가이 지 펀중.'),
        p('hotel', '预订在金，住两晚。能早点入住吗？', '김으로 이틀이요. 얼리 체크인 될까요?', '주 량완. 能早点入住吗가 얼리 체크인이에요.'),
        p('hotel', '行李可以先放这里吗？', '짐 먼저 맡겨도 될까요?', '싱리 커이 시엔 팡 저리 마.'),
        p('cafe', '买单的时候再说，不着急。', '계산은 급하지 않아요.', '부 자오지. 여유 있는 카페 톤이에요.'),
        p('restaurant', '一起结账，谢谢。', '한 번에 계산할게요.', '이치 제장, 셰셰.')
      ]
    },
    ko: {
      intro: [
        p('cafe', '안녕하세요.', '카페에 들어서면 먼저 하는 인사예요.', '아-녕-하-세-요. 끝소리를 너무 올리지 않아도 돼요.'),
        p('cafe', '아메리카노 한 잔 주세요.', '가장 흔한 카페 주문이에요.', '주-세-요. 메뉴 + 주세요면 충분해요.'),
        p('restaurant', '두 명이요. 자리 있나요?', '고깃집·식당 입구에서 바로 통하는 말이에요.', '두 명-이요. 인원을 먼저 말해요.'),
        p('restaurant', '메뉴판 주세요.', '자리에 앉자마자 쓰는 부탁이에요.', '메뉴판 주-세-요.'),
        p('street', '실례합니다.', '길에서 처음 말을 걸 때 첫마디예요.', '실-레-합-니-다. 저기요보다 한결 공손해요.'),
        p('street', '지하철역이 어느 쪽이에요?', '골목에서 방향을 물을 때 좋아요.', '어느 쪽이 어디보다 골목에 잘 맞아요.'),
        p('hotel', '예약했는데요.', '한옥 스테이·호텔 프론트 첫마디예요.', '예-약-했-는-데-요. 말끝을 내리면 부드러워요.'),
        p('hotel', '김으로 예약했어요.', '이름을 바로 얹어 주면 체크인이 빨라요.', '김-으-로.'),
        p('cafe', '잠시만요, 조금만 볼게요.', '메뉴를 고르는 중일 때 만능이에요.', '잠-시-만-요.'),
        p('restaurant', '계산이요.', '식사 후 계산을 부를 때 짧고 자연스러워요.', '계-산-이-요.')
      ],
      basic: [
        p('cafe', '아이스 아메리카노 하나요.', '주세요 없이도 카페에서 잘 통해요.', '하-나-요. 숫자를 문장 끝에 두면 주문이 돼요.'),
        p('cafe', '덜 달게 해주세요.', '당도를 조절할 때 바로 쓰는 말이에요.', '덜 달-게.'),
        p('restaurant', '두 명이요. 안에 자리 있나요?', '테라스/안을 나눠 물을 때 좋아요.', '안-에 자-리.'),
        p('restaurant', '뭐가 제일 맛있어요?', '메뉴가 많을 때 대화를 여는 질문이에요.', '제일 마-시-써-요?가 아니라 맛-있-어-요.'),
        p('street', '실례합니다, 역까지 어떻게 가요?', '길찾기 핵심 한 줄이에요.', '어-떻-게 가-요.'),
        p('street', '걸어서 멀어요?', '거리 감을 빠르게 확인할 때 좋아요.', '걸-어-서 멀-어-요.'),
        p('hotel', '한옥으로 예약했는데요.', '한옥 스테이 프론트에서 바로 통해요.', '한-옥-으-로.'),
        p('hotel', '체크아웃이 몇 시예요?', '프론트에서 자주 묻는 한 줄이에요.', '몇 시-예-요.'),
        p('cafe', '아직 고르는 중이에요.', '바리스타가 기다릴 때 부드럽게 막아 줘요.', '고-르-는 중-이-에-요.'),
        p('restaurant', '맛있게 잘 먹었습니다.', '자리에서 일어날 때 자연스러운 인사예요.', '잘 머-거-씀-니-다.')
      ],
      challenge: [
        p('cafe', '아이스 아메리카노 덜 달게, 포장해 주세요.', '옵션을 한 호흡에 얹는 주문이에요.', '덜 달-게, 포-장-해 주-세-요.'),
        p('cafe', '창가 자리 있어도 될까요?', '자리를 정중하게 물을 때 세련돼요.', '돼-요?보다 될-까-요가 부탁에 맞아요.'),
        p('restaurant', '아직 못 정해서, 조금만 시간 주실 수 있나요?', '서버를 부드럽게 돌려보내는 말이에요.', '주-실 수 있-나-요.'),
        p('restaurant', '너무 맵지 않은 걸로 추천해 주실래요?', '취향을 열고 추천을 부탁하는 한 줄이에요.', '주-실-래-요.'),
        p('street', '길을 좀 헤맸어요. 지하철역이 이쪽 맞아요?', '헤맸다를 가볍게 말하는 구어체예요.', '헤-맸-어-요.'),
        p('street', '걸어서 몇 분쯤 걸려요?', '대략적인 시간을 물을 때 자연스러워요.', '몇 분-쯤.'),
        p('hotel', '김으로 이틀 예약했어요. 얼리 체크인 될까요?', '예약 확인과 부탁을 한 번에 끝내는 말이에요.', '될-까-요.'),
        p('hotel', '짐만 먼저 맡겨도 될까요?', '체크인 전에 자주 쓰는 부탁이에요.', '맡-겨-도 될-까-요.'),
        p('cafe', '계산은 급하지 않아요. 편할 때 해주세요.', '여유 있는 카페 톤이에요.', '편-할 때.'),
        p('restaurant', '한 번에 계산해 주세요.', '더치페이가 아닐 때 쓰는 한 줄이에요.', '한 번-에 계-산.')
      ]
    }
  };

  function normalizeLang(raw) {
    var v = String(raw || '').toLowerCase().trim();
    if (v === 'jp' || v === 'japanese') return 'ja';
    if (v === 'cn' || v === 'chinese') return 'zh';
    if (v === 'kr' || v === 'korean') return 'ko';
    if (v === 'us' || v === 'uk' || v === 'english') return 'en';
    if (v === 'spanish' || v === 'sp') return 'es';
    if (v === 'french') return 'fr';
    if (LANGS[v]) return v;
    return 'en';
  }

  function normalizeLevel(raw) {
    var v = String(raw || '').toLowerCase().trim();
    if (['intro', 'starter', 'beginner', 'seed', '입문', 'easy'].indexOf(v) >= 0) return 'intro';
    if (['challenge', 'brave', 'hard', 'advanced', '도전'].indexOf(v) >= 0) return 'challenge';
    return 'basic';
  }

  function getPhrases(lang, level) {
    var L = normalizeLang(lang);
    var V = normalizeLevel(level);
    var pack = DATA[L] || DATA.en;
    return pack[V] || pack.basic || [];
  }

  function meta(lang, level) {
    var L = normalizeLang(lang);
    var V = normalizeLevel(level);
    return {
      lang: L,
      level: V,
      flag: LANGS[L].flag,
      name: LANGS[L].name,
      label: LANGS[L].label,
      levelName: LEVELS[V].name,
      title: TITLES[L] || TITLES.en,
      coupon: 'WELCOME_9900'
    };
  }

  return {
    LANGS: LANGS,
    LEVELS: LEVELS,
    TITLES: TITLES,
    DATA: DATA,
    COUPON: 'WELCOME_9900',
    normalizeLang: normalizeLang,
    normalizeLevel: normalizeLevel,
    getPhrases: getPhrases,
    meta: meta
  };
});
