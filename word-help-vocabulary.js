/* DayO Talk Card vocabulary: [target text, meaning, reading aid, example]. No network or language fallback. */
(function (root) {
  'use strict';
  var pools = {
    "en": {
      "food": [
        ["flavor","맛","플레이버","I like this flavor."],
        ["fresh","신선한","프레시","This fruit tastes fresh."],
        ["crispy","바삭한","크리스피","I like crispy snacks."],
        ["savory","풍미 있는","세이버리","I like savory food."],
        ["spicy","매운","스파이시","I enjoy spicy food."],
        ["sweet","달콤한","스위트","This dessert is sweet."],
        ["a snack","간식","어 스낵","I brought a snack."],
        ["a portion","1인분","어 포션","One portion is enough for me."],
        ["ingredients","재료","인그리디언츠","These ingredients are fresh."],
        ["recommend","추천하다","레커멘드","What dish do you recommend?"],
        ["order","주문하다","오더","I want to order this dish."],
        ["homemade","집에서 만든","홈메이드","I enjoy homemade food."]
      ],
      "daily": [
        ["take a walk","산책하다","테이크 어 워크","I take a walk after dinner."],
        ["commute","통근하다","커뮤트","I commute by subway."],
        ["relax","쉬다","릴랙스","I relax at home."],
        ["a routine","일상 습관","어 루틴","A routine helps me start my day."],
        ["usually","보통","유주얼리","I usually wake up early."],
        ["sometimes","가끔","섬타임즈","I sometimes cook at home."],
        ["free time","여가 시간","프리 타임","I read in my free time."],
        ["busy","바쁜","비지","I am busy today."],
        ["nearby","근처의","니어바이","There is a park nearby."],
        ["meet friends","친구를 만나다","미트 프렌즈","I meet friends on weekends."],
        ["in the morning","아침에","인 더 모닝","I drink tea in the morning."],
        ["after work","퇴근 후에","애프터 워크","I exercise after work."]
      ],
      "taste": [
        ["prefer","더 좋아하다","프리퍼","I prefer quiet places."],
        ["my favorite","내가 가장 좋아하는","마이 페이버릿","This is my favorite song."],
        ["comfortable","편안한","컴퍼터블","This chair is comfortable."],
        ["quiet","조용한","콰이어트","I like quiet cafes."],
        ["lively","활기찬","라이블리","This neighborhood is lively."],
        ["try something new","새로운 것을 해 보다","트라이 섬씽 뉴","I want to try something new."],
        ["similar","비슷한","시밀러","Our tastes are similar."],
        ["different","다른","디퍼런트","We like different music."],
        ["depends on my mood","기분에 따라 다르다","디펜즈 온 마이 무드","It depends on my mood."],
        ["choose","고르다","추즈","I choose places with good music."],
        ["enjoy","즐기다","인조이","I enjoy watching movies."],
        ["not really my thing","내 취향은 아니다","낫 리얼리 마이 씽","Camping is not really my thing."]
      ],
      "korea-life": [
        ["public transport","대중교통","퍼블릭 트랜스포트","I use public transport every day."],
        ["a neighborhood","동네","어 네이버후드","This is a quiet neighborhood."],
        ["convenient","편리한","컨비니언트","The subway is convenient."],
        ["get used to","익숙해지다","겟 유스트 투","I want to get used to life here."],
        ["a convenience store","편의점","어 컨비니언스 스토어","There is a convenience store nearby."],
        ["recycling","분리배출","리사이클링","I am learning about recycling here."],
        ["delivery","배달","딜리버리","I often order food for delivery."],
        ["a local market","동네 시장","어 로컬 마켓","I visit a local market on weekends."],
        ["a subway station","지하철역","어 서브웨이 스테이션","There is a subway station nearby."],
        ["a payment card","결제 카드","어 페이먼트 카드","I use a payment card on the bus."],
        ["ask for help","도움을 요청하다","애스크 포 헬프","I ask for help when I need it."],
        ["daily life","일상생활","데일리 라이프","I enjoy daily life in Korea."]
      ],
      "korea-trip": [
        ["a destination","여행지","어 데스티네이션","Busan is a popular destination."],
        ["scenery","경치","시너리","The scenery is beautiful."],
        ["a train","기차","어 트레인","I took a train to Busan."],
        ["a beach","해변","어 비치","I want to visit a beach."],
        ["a mountain","산","어 마운틴","There is a mountain near the city."],
        ["a local specialty","지역 특산물","어 로컬 스페셜티","This dish is a local specialty."],
        ["a day trip","당일 여행","어 데이 트립","I want to take a day trip."],
        ["a place to stay","숙소","어 플레이스 투 스테이","I found a place to stay."],
        ["crowded","붐비는","크라우디드","The beach was crowded."],
        ["peaceful","평화로운","피스풀","The village felt peaceful."],
        ["take photos","사진을 찍다","테이크 포토즈","I like to take photos when I travel."],
        ["visit again","다시 방문하다","비짓 어겐","I want to visit again."]
      ],
      "world-trip": [
        ["a passport","여권","어 패스포트","I always check my passport before a trip."],
        ["a flight","항공편","어 플라이트","I booked a flight to Paris."],
        ["a destination","여행지","어 데스티네이션","What is your favorite destination?"],
        ["a memorable trip","기억에 남는 여행","어 메머러블 트립","It was a memorable trip."],
        ["local food","현지 음식","로컬 푸드","I enjoy trying local food."],
        ["a travel plan","여행 계획","어 트래블 플랜","I have a travel plan for next month."],
        ["a budget","예산","어 버짓","I set a budget before traveling."],
        ["a souvenir","기념품","어 수버니어","I bought a souvenir for a friend."],
        ["explore","둘러보다","익스플로어","I want to explore the old town."],
        ["book a hotel","호텔을 예약하다","북 어 호텔","I need to book a hotel."],
        ["travel together","함께 여행하다","트래블 투게더","We want to travel together."],
        ["a long journey","긴 여행","어 롱 저니","It was a long journey."]
      ],
      "culture": [
        ["a tradition","전통","어 트러디션","Sharing food is a tradition in my family."],
        ["a festival","축제","어 페스티벌","I went to a festival last weekend."],
        ["a holiday","명절 또는 휴일","어 홀리데이","What do you do on a holiday?"],
        ["a custom","관습","어 커스텀","This is a local custom."],
        ["greet someone","인사하다","그리트 섬원","How do you greet someone in your country?"],
        ["celebrate","기념하다","셀러브레이트","We celebrate with our family."],
        ["a difference","차이","어 디퍼런스","I noticed a difference in greetings."],
        ["something in common","공통점","섬씽 인 커먼","We have something in common."],
        ["respect","존중하다","리스펙트","I respect different traditions."],
        ["surprising","놀라운","서프라이징","That custom was surprising to me."],
        ["learn about","알아보다","런 어바웃","I want to learn about your culture."],
        ["share a story","이야기를 나누다","셰어 어 스토리","Can you share a story about your hometown?"]
      ]
    },
    "ko": {
      "food": [
        ["맛","flavor / taste","mat","이 음식은 맛이 좋아요."],
        ["신선하다","fresh","sin-seon-ha-da","이 채소는 신선해요."],
        ["바삭하다","crispy","ba-sak-ha-da","이 과자는 바삭해요."],
        ["고소하다","nutty / savory","go-so-ha-da","이 음식은 고소해요."],
        ["맵다","spicy","maep-da","이 음식은 조금 매워요."],
        ["달다","sweet","dal-da","이 과일은 달아요."],
        ["간식","snack","gan-sik","간식으로 과일을 먹어요."],
        ["일인분","one serving","il-in-bun","일인분만 주문할게요."],
        ["재료","ingredients","jae-ryo","이 요리의 재료가 궁금해요."],
        ["추천하다","recommend","chu-cheon-ha-da","어떤 음식을 추천하세요?"],
        ["주문하다","order","ju-mun-ha-da","이 음식을 주문하고 싶어요."],
        ["집에서 만들다","make at home","jib-e-seo man-deul-da","저는 집에서 음식을 만들어요."]
      ],
      "daily": [
        ["산책하다","take a walk","san-chaek-ha-da","저녁에 산책해요."],
        ["출근하다","go to work","chul-geun-ha-da","아침에 출근해요."],
        ["쉬다","rest / relax","swi-da","주말에는 집에서 쉬어요."],
        ["일상","daily life","il-sang","제 일상은 단순해요."],
        ["보통","usually","bo-tong","보통 아침에 운동해요."],
        ["가끔","sometimes","ga-kkeum","가끔 친구와 요리해요."],
        ["여가 시간","free time","yeo-ga si-gan","여가 시간에 책을 읽어요."],
        ["바쁘다","busy","ba-ppeu-da","오늘은 조금 바빠요."],
        ["근처","nearby","geun-cheo","집 근처에 공원이 있어요."],
        ["친구를 만나다","meet friends","chin-gu-reul man-na-da","주말에 친구를 만나요."],
        ["아침에","in the morning","a-chim-e","아침에 차를 마셔요."],
        ["퇴근 후에","after work","toe-geun hu-e","퇴근 후에 운동해요."]
      ],
      "taste": [
        ["더 좋아하다","prefer","deo jo-a-ha-da","저는 차를 더 좋아해요."],
        ["가장 좋아하다","like best","ga-jang jo-a-ha-da","저는 봄을 가장 좋아해요."],
        ["편안하다","comfortable","pyeon-an-ha-da","이 의자는 편안해요."],
        ["조용하다","quiet","jo-yong-ha-da","이 카페는 조용해요."],
        ["활기차다","lively","hwal-gi-cha-da","이 동네는 활기차요."],
        ["새롭게 해 보다","try something new","sae-rop-ge hae bo-da","새롭게 해 보고 싶은 일이 있어요."],
        ["비슷하다","similar","bi-seut-ha-da","우리 취향은 비슷해요."],
        ["다르다","different","da-reu-da","우리는 좋아하는 음악이 달라요."],
        ["기분에 따라 다르다","depends on my mood","gi-bun-e tta-ra da-reu-da","좋아하는 음악은 기분에 따라 달라요."],
        ["고르다","choose","go-reu-da","저는 조용한 곳을 골라요."],
        ["즐기다","enjoy","jeul-gi-da","저는 영화를 즐겨요."],
        ["내 취향은 아니다","not my thing","nae chwi-hyang-eun a-ni-da","캠핑은 제 취향은 아니에요."]
      ],
      "korea-life": [
        ["대중교통","public transport","dae-jung-gyo-tong","저는 대중교통을 이용해요."],
        ["동네","neighborhood","dong-ne","우리 동네는 조용해요."],
        ["편리하다","convenient","pyeon-ri-ha-da","지하철이 편리해요."],
        ["익숙해지다","get used to","ik-suk-hae-ji-da","한국 생활에 익숙해지고 있어요."],
        ["편의점","convenience store","pyeon-ui-jeom","집 근처에 편의점이 있어요."],
        ["분리배출","sorting recycling","bun-ri-bae-chul","분리배출 방법을 배우고 있어요."],
        ["배달","delivery","bae-dal","가끔 음식을 배달로 주문해요."],
        ["시장","market","si-jang","주말에 시장에 가요."],
        ["지하철역","subway station","ji-ha-cheol-yeok","집 근처에 지하철역이 있어요."],
        ["카드로 결제하다","pay by card","ka-deu-ro gyeol-je-ha-da","카드로 결제할게요."],
        ["도움을 요청하다","ask for help","do-um-eul yo-cheong-ha-da","필요할 때 도움을 요청해요."],
        ["생활","daily life","saeng-hwal","한국 생활이 재미있어요."]
      ],
      "korea-trip": [
        ["여행지","travel destination","yeo-haeng-ji","가 보고 싶은 여행지가 있어요."],
        ["경치","scenery","gyeong-chi","경치가 정말 아름다워요."],
        ["기차","train","gi-cha","기차로 부산에 갔어요."],
        ["해변","beach","hae-byeon","해변을 걷고 싶어요."],
        ["산","mountain","san","도시 근처에 산이 있어요."],
        ["특산물","local specialty","teuk-san-mul","이 지역의 특산물이 궁금해요."],
        ["당일 여행","day trip","dang-il yeo-haeng","당일 여행을 가고 싶어요."],
        ["숙소","place to stay","suk-so","조용한 숙소를 찾았어요."],
        ["붐비다","crowded","bum-bi-da","해변이 많이 붐볐어요."],
        ["평화롭다","peaceful","pyeong-hwa-rop-da","이 마을은 평화로워요."],
        ["사진을 찍다","take photos","sa-jin-eul jjik-da","여행할 때 사진을 찍어요."],
        ["다시 방문하다","visit again","da-si bang-mun-ha-da","이곳을 다시 방문하고 싶어요."]
      ],
      "world-trip": [
        ["여권","passport","yeo-gwon","여행 전에 여권을 확인해요."],
        ["항공편","flight","hang-gong-pyeon","파리행 항공편을 예약했어요."],
        ["여행지","travel destination","yeo-haeng-ji","가장 좋아하는 여행지가 어디예요?"],
        ["기억에 남다","memorable","gi-eok-e nam-da","그 여행이 기억에 남아요."],
        ["현지 음식","local food","hyeon-ji eum-sik","현지 음식을 먹어 보고 싶어요."],
        ["여행 계획","travel plan","yeo-haeng gye-hoek","다음 달 여행 계획이 있어요."],
        ["예산","budget","ye-san","여행 전에 예산을 정해요."],
        ["기념품","souvenir","gi-nyeom-pum","친구에게 줄 기념품을 샀어요."],
        ["둘러보다","explore / look around","dul-leo-bo-da","오래된 동네를 둘러보고 싶어요."],
        ["호텔을 예약하다","book a hotel","ho-tel-eul ye-yak-ha-da","호텔을 예약해야 해요."],
        ["함께 여행하다","travel together","ham-kke yeo-haeng-ha-da","친구와 함께 여행하고 싶어요."],
        ["긴 여행","long journey","gin yeo-haeng","긴 여행을 다녀왔어요."]
      ],
      "culture": [
        ["전통","tradition","jeon-tong","우리 가족에게는 특별한 전통이 있어요."],
        ["축제","festival","chuk-je","지난주에 축제에 갔어요."],
        ["명절","traditional holiday","myeong-jeol","명절에 가족을 만나요."],
        ["관습","custom","gwan-seup","이것은 이 지역의 관습이에요."],
        ["인사하다","greet someone","in-sa-ha-da","처음 만나면 어떻게 인사해요?"],
        ["기념하다","celebrate","gi-nyeom-ha-da","가족과 함께 기념해요."],
        ["차이","difference","cha-i","인사 방법에 차이가 있어요."],
        ["공통점","something in common","gong-tong-jeom","우리에게는 공통점이 많아요."],
        ["존중하다","respect","jon-jung-ha-da","저는 다른 문화를 존중해요."],
        ["놀랍다","surprising","nol-rap-da","그 이야기는 정말 놀라워요."],
        ["알아보다","learn about","a-ra-bo-da","다른 문화를 알아보고 싶어요."],
        ["이야기를 나누다","share a story","i-ya-gi-reul na-nu-da","고향에 대해 이야기를 나누고 싶어요."]
      ]
    }
  };
  var specific = {
    "en": {
      "food-003": [
        ["iced coffee","아이스 커피","아이스 커피","I like iced coffee."],
        ["hot tea","따뜻한 차","핫 티","I prefer hot tea."]
      ],
      "korea-life-001": [
        ["transfer","환승하다","트랜스퍼","I transfer to the subway here."],
        ["a bus stop","버스 정류장","어 버스 스탑","There is a bus stop nearby."]
      ]
    },
    "ko": {
      "food-003": [
        ["아이스 커피","iced coffee","a-i-seu keo-pi","저는 아이스 커피를 좋아해요."],
        ["따뜻한 차","hot tea","tta-tteut-han cha","저는 따뜻한 차를 마셔요."]
      ],
      "korea-life-001": [
        ["환승하다","transfer","hwan-seung-ha-da","여기에서 지하철로 환승해요."],
        ["버스 정류장","bus stop","beo-seu jeong-ryu-jang","근처에 버스 정류장이 있어요."]
      ]
    }
  };
  function sets(card, language) {
    if (!card || !pools[language] || !pools[language][card.category]) return [];
    var seen = {};
    var rows = ((specific[language] || {})[card.id] || []).concat(pools[language][card.category]).filter(function (row) {
      var key = row[0].trim().toLowerCase();
      if (!key || seen[key]) return false;
      seen[key] = true; return true;
    }).map(function (row) { return { text: row[0], meaning: row[1], pronunciation: row[2], example: row[3], language: language }; });
    if (rows.length < 4) return [];
    // Advance by four through the circular pool. Repeating a start completes the cycle.
    var result = [], start = 0;
    do {
      var group = [];
      for (var i = 0; i < 4; i++) group.push(rows[(start + i) % rows.length]);
      result.push(group); start = (start + 4) % rows.length;
    } while (start !== 0);
    return result;
  }
  root.DayOWordVocabulary = { sets: sets, supportedLanguages: ['en', 'ko'] };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.DayOWordVocabulary;
})(typeof window !== 'undefined' ? window : globalThis);
