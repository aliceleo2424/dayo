# DayO 스토리 장면 초안 v1 (영어 + 한국어 번역)

상태: **v2 확정 (2026-10-17, Owner).** 아직 코드에 넣지 않았습니다.

## 공통 구조

- 관심사 12개 × 장면 2개 = 24개 장면
- 배경은 모두 한국에서의 일상이고, 등장하는 친구는 한국에 사는 외국인입니다.
- 진행 순서
  1. 장면 소개 (1~2문장)
  2. 친구의 말 → 내 대답 고르기 (3개 중 1개)
  3. 친구의 말 → 내 대답 고르기 (3개 중 1개)
  4. 마무리 문장
  5. 내 한 줄 (건너뛰기 가능)
- **정답은 없습니다.** 모든 선택지가 자연스러운 대답이고, 점수도 없습니다. 선택지 하나는 장난스러운 대답으로 넣었습니다.
- 마무리 문장은 무엇을 골랐든 똑같이 이어지도록 썼습니다. 그래서 분기 조합이 생기지 않습니다.
- 영어 수준은 쉬운 일상 표현(A2~B1)입니다.
- 번역 규칙
  - 인물 이름은 번역에서도 영어 그대로 씁니다(예: Ava).
  - 서술은 해요체를 쓰고, 학습자는 "당신"이라고 부릅니다.
  - 친구의 대사는 친구끼리 하는 말이라 반말로 옮겼습니다.
- 이미지 파일: `public/images/stories/{장면 ID}.webp` (예: `drama-01.webp`, `food-cafe-01.webp`). 장면 ID에는 영문 소문자·숫자·하이픈만 씁니다(밑줄 불가, DB 규칙).

---

## 1. 드라마 `drama`

### drama-01 · 정주행 추천
**장면**: Your friend Ava is on your sofa, scrolling through a streaming app for twenty minutes.
Ava가 당신 집 소파에서 20분째 OTT 앱만 넘기고 있어요.

**Ava**: "I want to start a new K-drama tonight. Any ideas?" / "오늘 밤 새 K-드라마 시작하고 싶어. 추천해 줄래?"
- A. "Try a romantic comedy. It's easy to watch." / "로맨틱 코미디 봐. 편하게 볼 수 있어."
- B. "A thriller. You'll never sleep again." / "스릴러. 다시는 잠 못 잘 거야."
- C. "Anything. Just stop scrolling, please!" / "아무거나. 제발 그만 넘겨!"

**Ava**: "How many episodes should we watch?" / "몇 화까지 볼까?"
- A. "Just one. We have work tomorrow." / "딱 한 화만. 내일 출근해야 하잖아."
- B. "Just one." (Narrator: It was not just one.) / "딱 한 화만." (내레이션: 한 화로 끝나지 않았다.)
- C. "Until the snacks run out." / "간식 떨어질 때까지."

**마무리**: At 3 a.m., you both say, "Okay, really the last one."
새벽 3시, 둘이 동시에 말해요. "진짜 이게 마지막이야."

**내 한 줄**: What drama would you show a friend first? / 친구에게 제일 먼저 보여주고 싶은 드라마는?

### drama-02 · 촬영지 발견
**장면**: Walking in Seoul, you and your friend Ava find a filming spot from a famous drama.
서울을 걷다가 당신과 Ava가 유명 드라마 촬영지를 발견해요.

**Ava**: "Wait, isn't this from that drama?" / "잠깐, 여기 그 드라마에 나온 곳 아니야?"
- A. "Yes! The main couple met right here." / "맞아! 주인공 둘이 바로 여기서 만났어."
- B. "I think so. Photo time!" / "그런 것 같아. 사진 타임!"
- C. "It's just a bus stop, Ava." / "Ava, 그냥 버스 정류장이야."

**Ava**: "Do you want to copy the famous scene?" / "그 유명한 장면 따라 해 볼래?"
- A. "Only if you play the main character." / "네가 주인공 하면."
- B. "Sure, but no running in the rain!" / "좋아, 대신 빗속 달리기는 빼고!"
- C. "People are watching us…" / "사람들이 쳐다보잖아…"

**마무리**: A grandmother passing by claps for you. Best review ever.
지나가던 할머니가 박수를 쳐 주세요. 최고의 리뷰예요.

**내 한 줄**: Which drama scene would you like to live for a day? / 하루 동안 살아보고 싶은 드라마 장면은?

---

## 2. 영화 `movies`

### movies-01 · 영화관 좌석
**장면**: You and your friend Ava are buying movie tickets at the kiosk.
당신과 Ava가 키오스크에서 영화표를 사고 있어요.

**Ava**: "Where should we sit?" / "어디 앉을까?"
- A. "In the middle. Best sound." / "가운데. 소리가 제일 좋아."
- B. "In the back. Nobody can see me cry." / "뒤쪽. 내가 우는 걸 아무도 못 보게."
- C. "Near the aisle, for snack emergencies." / "통로 쪽. 간식 비상사태 대비."

**Ava**: "Popcorn: sweet or salty?" / "팝콘은 달콤한 거, 짭짤한 거?"
- A. "Sweet, of course." / "당연히 달콤한 거."
- B. "Salty, always." / "무조건 짭짤한 거."
- C. "Half and half. I'm not choosing." / "반반. 난 못 골라."

**마무리**: The popcorn is gone before the ads even finish.
광고가 끝나기도 전에 팝콘이 다 사라졌어요.

**내 한 줄**: What's your perfect movie-night snack? / 영화 볼 때 최고의 간식은?

### movies-02 · 엔딩 이후
**장면**: The movie just ended. You and your friend Ava walk out of the theater.
영화가 막 끝났어요. 당신과 Ava가 영화관을 나서요.

**Ava**: "So, what did you think?" / "어땠어?"
- A. "I loved it. The ending surprised me." / "너무 좋았어. 결말에 놀랐어."
- B. "It was okay, but a bit long." / "괜찮았는데 좀 길었어."
- C. "Honestly? I slept through the middle." / "솔직히? 중간에 잤어."

**Ava**: "Who was your favorite character?" / "제일 좋았던 캐릭터는?"
- A. "The quiet side character." / "조용한 조연."
- B. "The villain. He had a point." / "악역. 걔 말도 일리가 있었어."
- C. "The main character's dog!" / "주인공네 강아지!"

**마무리**: You argue about the ending all the way to the subway — and agree on nothing.
지하철역까지 결말을 두고 논쟁했지만, 합의한 건 하나도 없어요.

**내 한 줄**: Which movie would you watch again tonight? / 오늘 밤 다시 보고 싶은 영화는?

---

## 3. 유튜브 `youtube`

### youtube-01 · 알고리즘 공유
**장면**: Your friend Ava shows you a video on her phone, already laughing before it starts.
Ava가 영상이 시작하기도 전에 웃으면서 휴대폰을 내밀어요.

**Ava**: "This channel is my favorite right now." / "요즘 제일 좋아하는 채널이야."
- A. "Oh, I watch it too!" / "어, 나도 그거 봐!"
- B. "What kind of videos do they make?" / "어떤 영상 올리는 채널이야?"
- C. "Is it another cat video?" / "또 고양이 영상이야?"

**Ava**: "What do you usually watch on YouTube?" / "너는 유튜브에서 주로 뭐 봐?"
- A. "Cooking videos. I never cook, though." / "요리 영상. 요리는 안 하지만."
- B. "Travel vlogs." / "여행 브이로그."
- C. "Videos of people cleaning. Don't judge me." / "남이 청소하는 영상. 판단하지 마."

**마무리**: One hour later, your algorithm has completely changed.
한 시간 뒤, 당신의 알고리즘이 완전히 바뀌었어요.

**내 한 줄**: What video would you recommend to a new friend? / 새 친구에게 추천하고 싶은 영상은?

### youtube-02 · 브이로그 촬영
**장면**: Your friend Ava wants to film a vlog at a market in Seoul.
Ava가 서울 시장에서 브이로그를 찍고 싶어 해요.

**Ava**: "Can you help me film?" / "촬영 좀 도와줄래?"
- A. "Sure. I'll hold the camera." / "그럼. 내가 카메라 들게."
- B. "Only if I'm not in the video!" / "나는 안 나오는 조건으로!"
- C. "Only if I get half of your subscribers." / "구독자 절반 나 주면."

**Ava**: "What should we show first?" / "뭐부터 찍을까?"
- A. "The street food." / "길거리 음식."
- B. "The friendly shop owners." / "친절한 사장님들."
- C. "You eating something very spicy." / "네가 엄청 매운 거 먹는 장면."

**마무리**: The video gets 12 views. Eleven are from Ava's mom.
영상 조회수는 12회. 그중 11회는 Ava의 엄마예요.

**내 한 줄**: If you made a vlog, what would it be about? / 브이로그를 찍는다면 어떤 내용일까?

---

## 4. 음악 `music`

### music-01 · 노래방
**장면**: You and your friends are at a noraebang in Hongdae.
당신은 친구들과 홍대 노래방에 왔어요.

**Ava**: "You choose the first song!" / "첫 곡은 네가 골라!"
- A. "Let's start with a K-pop hit." / "케이팝 히트곡으로 시작하자."
- B. "An old pop song everyone knows." / "다들 아는 옛날 팝송."
- C. "A sad ballad. Let's ruin the mood." / "슬픈 발라드. 분위기 망쳐 보자."

**Ava**: "Are you going to dance too?" / "춤도 출 거야?"
- A. "Maybe just a little." / "조금만."
- B. "Of course! Watch me." / "당연하지! 잘 봐."
- C. "No. I'm the tambourine person." / "아니. 나는 탬버린 담당이야."

**마무리**: The machine gives you 100 points. Nobody knows why.
노래방 기계가 100점을 줬어요. 이유는 아무도 몰라요.

**내 한 줄**: What's your go-to noraebang song? / 노래방 필살기 노래는?

### music-02 · 플레이리스트 교환
**장면**: On a long bus ride, your friend Ava offers you one of her earphones.
긴 버스 여행 중에 Ava가 당신에게 이어폰 한쪽을 건네요.

**Ava**: "Want to listen to my playlist?" / "내 플레이리스트 들어볼래?"
- A. "Yes, please!" / "응, 좋아!"
- B. "Only if I can choose the next song." / "다음 곡은 내가 고르는 조건으로."
- C. "Please tell me it's not all sad songs." / "제발 다 슬픈 노래는 아니라고 해 줘."

**Ava**: "When do you listen to music the most?" / "음악은 주로 언제 들어?"
- A. "On my way to work." / "출근길에."
- B. "When I can't sleep." / "잠이 안 올 때."
- C. "In the shower. I'm a star there." / "샤워할 때. 거기선 내가 스타야."

**마무리**: Ava's playlist goes from jazz to heavy metal to a baby shark remix.
Ava의 플레이리스트는 재즈에서 헤비메탈, 그리고 상어가족 리믹스로 이어져요.

**내 한 줄**: Which song always makes you feel better? / 들으면 늘 기분이 좋아지는 노래는?

---

## 5. 여행 `travel`

### travel-01 · 주말 여행 계획
**장면**: You and your friend Ava are planning a weekend trip in Korea.
당신과 Ava가 한국 안에서 주말 여행을 계획하고 있어요.

**Ava**: "Where should we go this weekend?" / "이번 주말에 어디 갈까?"
- A. "Busan. I want to see the sea." / "부산. 바다 보고 싶어."
- B. "Gangneung, for coffee and the beach." / "강릉. 커피랑 바다."
- C. "Jeonju. I want to eat everything." / "전주. 다 먹어 버릴 거야."

**Ava**: "How should we get there?" / "어떻게 갈까?"
- A. "By KTX. It's fast." / "KTX. 빠르니까."
- B. "By bus. It's cheaper." / "버스. 더 싸니까."
- C. "Let's decide after we book the restaurants." / "맛집 예약부터 하고 정하자."

**마무리**: The plan has three restaurants, two cafés, and zero tourist sights.
계획표에는 식당 세 곳, 카페 두 곳, 관광지는 0곳이에요.

**내 한 줄**: Where in Korea do you want to visit next? / 다음에 가보고 싶은 한국 여행지는?

### travel-02 · 길을 잃다
**장면**: On a trip, you and your friend Ava take a wrong turn in a small town.
여행 중에 당신과 Ava가 작은 마을에서 길을 잘못 들었어요.

**Ava**: "I think we're lost." / "우리 길 잃은 것 같아."
- A. "Let's ask someone for directions." / "누구한테 길 물어보자."
- B. "No problem. Let's check the map app." / "괜찮아. 지도 앱 보자."
- C. "We're not lost. We're exploring." / "길 잃은 거 아니야. 탐험 중이야."

**Ava**: "Oh, look, a little café." / "어, 저기 작은 카페 있다."
- A. "Perfect. Let's take a break." / "딱이다. 좀 쉬자."
- B. "Let's ask the owner for tips." / "사장님한테 추천 좀 받자."
- C. "See? I planned this." / "봐, 내가 다 계획한 거야."

**마무리**: The café owner gives you free cookies and better directions than the app.
카페 사장님이 쿠키도 공짜로 주고, 지도 앱보다 정확하게 길도 알려 줘요.

**내 한 줄**: What's your best "happy accident" while traveling? / 여행 중 뜻밖에 좋았던 순간은?

---

## 6. 음식·카페 `food_cafe`

### food-cafe-01 · 카페 주문
**장면**: You and your friend Ava walk into a cozy café in Seongsu.
당신과 Ava가 성수동의 아늑한 카페에 들어가요.

**Ava**: "What are you getting?" / "뭐 마실 거야?"
- A. "An iced Americano, as always." / "늘 그렇듯 아이스 아메리카노."
- B. "Something sweet, like a latte." / "라떼처럼 달달한 거."
- C. "Whatever has the prettiest cup." / "컵이 제일 예쁜 걸로."

**Ava**: "Should we share a dessert?" / "디저트 하나 나눠 먹을까?"
- A. "Yes, the cake looks great." / "응, 케이크 맛있어 보여."
- B. "Let's get two. I don't share cake." / "두 개 시키자. 케이크는 안 나눠."
- C. "Just a drink. I'm on a diet. Starting tomorrow." / "음료만. 다이어트 중이거든. 내일부터."

**마무리**: You take thirty photos of the cake before the first bite.
첫 입을 먹기 전에 케이크 사진만 서른 장을 찍어요.

**내 한 줄**: Describe your perfect café in one sentence. / 나만의 완벽한 카페를 한 문장으로 표현하면?

### food-cafe-02 · 처음 먹는 한식
**장면**: Your friend Ava is trying Korean food for the first time at a small restaurant.
Ava가 작은 식당에서 처음으로 한식을 먹어 봐요.

**Ava**: "What should I order?" / "뭐 시켜야 해?"
- A. "Bibimbap. It's a safe choice." / "비빔밥. 실패 없는 메뉴야."
- B. "Kimchi stew, if you're brave." / "용감하다면 김치찌개."
- C. "Everything. We're sharing." / "전부 다. 나눠 먹자."

**Ava**: "Wow, why are there so many side dishes?" / "와, 반찬이 왜 이렇게 많아?"
- A. "They're free, and you can get more!" / "무료고, 더 달라고 할 수도 있어!"
- B. "It's Korean style. Try them all." / "한국식이야. 다 먹어 봐."
- C. "Careful. That green one is a trap." / "조심해. 저 초록색은 함정이야."

**마무리**: Ava drinks three glasses of water, then asks for more kimchi.
Ava가 물을 세 잔 마시더니, 김치를 더 달라고 해요.

**내 한 줄**: What Korean food would you recommend to a first-timer? / 처음 먹는 사람에게 추천할 한식은?

---

## 7. 운동 `exercise`

### exercise-01 · 한강 러닝
**장면**: Early in the morning, you meet your friend Ava by the Han River to go running.
이른 아침, 당신은 한강에서 Ava를 만나 함께 달려요.

**Ava**: "How far do you want to run?" / "얼마나 달릴까?"
- A. "Just 3 kilometers today." / "오늘은 3킬로만."
- B. "Let's try 5 kilometers!" / "5킬로 도전!"
- C. "To the convenience store. It's 200 meters." / "편의점까지. 200미터야."

**Ava**: "What should we do after?" / "끝나고 뭐 할까?"
- A. "Get coffee." / "커피 마시자."
- B. "Eat ramyeon by the river!" / "한강에서 라면 먹자!"
- C. "Go home and sleep again." / "집에 가서 다시 자기."

**마무리**: You burn 200 calories and eat 600 calories of ramyeon. Perfect balance.
200칼로리를 태우고 라면으로 600칼로리를 먹어요. 완벽한 균형이에요.

**내 한 줄**: What's your favorite way to move your body? / 가장 좋아하는 몸 움직이는 방법은?

### exercise-02 · 등산 정상
**장면**: You and your friend Ava are hiking Bukhansan on a clear autumn day.
맑은 가을날, 당신과 Ava가 북한산을 오르고 있어요.

**Ava**: "I'm so tired. How much farther?" / "너무 힘들어. 얼마나 남았어?"
- A. "Almost there. You can do it!" / "거의 다 왔어. 할 수 있어!"
- B. "Let's rest for five minutes." / "5분만 쉬자."
- C. "Ten more minutes." (It was one more hour.) / "10분만 더." (사실 한 시간 더였다.)

**Ava**: "Wow, look at the view!" / "와, 경치 좀 봐!"
- A. "It was worth it." / "올라온 보람이 있다."
- B. "Let's take a photo together." / "같이 사진 찍자."
- C. "I can't look. I can't feel my legs." / "못 보겠어. 다리에 감각이 없어."

**마무리**: At the top, a 70-year-old hiker passes you both, not even sweating.
정상에서, 70대 등산객이 땀 한 방울 없이 두 사람을 앞질러 가요.

**내 한 줄**: What do you think about when you finish a hard workout? / 힘든 운동을 끝냈을 때 드는 생각은?

---

## 8. 게임 `games`

### games-01 · PC방 첫 방문
**장면**: Your friend Ava takes you to a PC bang for the first time.
Ava가 당신을 처음으로 PC방에 데려가요.

**Ava**: "What game do you want to play?" / "무슨 게임 할래?"
- A. "Something easy, please. I'm new." / "쉬운 걸로. 나 처음이야."
- B. "A team game. Let's play together." / "팀 게임. 같이 하자."
- C. "Whatever game I can win." / "내가 이길 수 있는 거."

**Ava**: "Do you want to order food here?" / "여기서 음식 시킬래?"
- A. "You can order food here? Amazing!" / "여기서 음식도 시켜? 대박!"
- B. "Just a drink for now." / "일단 음료만."
- C. "After we win this game!" / "이번 판 이기고 나서!"

**마무리**: You lose ten games in a row, but the ramyeon is a total win.
열 판 연속으로 졌지만, 라면만큼은 완벽한 승리예요.

**내 한 줄**: What game could you play forever? / 끝없이 할 수 있는 게임은?

### games-02 · 보드게임 카페
**장면**: You and your friends are at a board game café on a rainy Saturday.
비 오는 토요일, 당신은 친구들과 보드게임 카페에 왔어요.

**Ava**: "Which game should we try?" / "무슨 게임 해볼까?"
- A. "Something simple to start." / "처음엔 간단한 거."
- B. "A strategy game. I like thinking." / "전략 게임. 머리 쓰는 거 좋아."
- C. "One that won't end our friendship." / "우리 우정이 안 깨지는 걸로."

**Ava**: "Oh no, I'm losing again!" / "아 또 지고 있어!"
- A. "Don't worry, it's just for fun." / "괜찮아, 재미로 하는 거잖아."
- B. "Let's team up next round." / "다음 판은 같이 팀하자."
- C. "I'm sorry. I'm not sorry." / "미안해. 사실 안 미안해."

**마무리**: Ava asks for "one more game" seven times.
Ava가 "한 판만 더"를 일곱 번 외쳐요.

**내 한 줄**: Are you a winner or a fun-maker in games? / 게임에서 나는 승부사? 분위기 메이커?

---

## 9. 패션·뷰티 `fashion_beauty`

### fashion-beauty-01 · 쇼핑 고민
**장면**: You and your friend Ava are shopping for clothes in Myeongdong.
당신과 Ava가 명동에서 옷 쇼핑을 하고 있어요.

**Ava**: "Which one looks better on me?" / "어느 게 나한테 더 잘 어울려?"
- A. "The blue one. It's your color." / "파란색. 네 색이야."
- B. "Both look great. Get both!" / "둘 다 예뻐. 둘 다 사!"
- C. "They look exactly the same, Ava." / "Ava, 둘이 완전 똑같아."

**Ava**: "What's your style?" / "너는 어떤 스타일이야?"
- A. "Simple and comfortable." / "심플하고 편한 스타일."
- B. "Bright colors, always." / "무조건 밝은 색."
- C. "Whatever is clean that morning." / "그날 아침에 깨끗한 거."

**마무리**: You came for one T-shirt and leave with four bags.
티셔츠 한 장 사러 왔다가 쇼핑백 네 개를 들고 나와요.

**내 한 줄**: What item do you wear the most? / 가장 자주 입는 아이템은?

### fashion-beauty-02 · 화장품 매장
**장면**: Your friend Ava needs help choosing skincare at a beauty store.
Ava가 뷰티 매장에서 스킨케어 고르는 걸 도와달래요.

**Ava**: "There are too many products. Help!" / "제품이 너무 많아. 도와줘!"
- A. "Let's start with sunscreen." / "선크림부터 보자."
- B. "Try the samples first." / "먼저 샘플 써 봐."
- C. "Just buy whatever is on sale." / "그냥 세일하는 거 사."

**Ava**: "Do you have a favorite product?" / "좋아하는 제품 있어?"
- A. "This face mask. It's my secret." / "이 마스크팩. 내 비밀템이야."
- B. "Just a simple lip balm." / "그냥 립밤 하나."
- C. "Sleep. Sleep is my skincare." / "잠. 잠이 내 스킨케어야."

**마무리**: Ava finds her new favorite — and somehow, you buy more than she does.
Ava는 새 최애템을 찾았고, 어쩐 일인지 당신이 더 많이 샀어요.

**내 한 줄**: What's one thing you can't live without in your bag? / 가방에 꼭 있어야 하는 한 가지는?

---

## 10. 반려동물 `pets`

### pets-01 · 강아지 산책
**장면**: Your friend Ava asks you to walk her dog, Bori, in the park.
Ava가 당신에게 강아지 Bori 산책을 부탁해요.

**Ava**: "Bori loves to run. Are you ready?" / "Bori는 뛰는 걸 좋아해. 준비됐어?"
- A. "Ready! Let's go, Bori!" / "준비 완료! 가자, Bori!"
- B. "Maybe a slow walk first." / "일단 천천히 걷자."
- C. "Who is walking who here?" / "지금 누가 누굴 산책시키는 거야?"

**Ava**: "Look, Bori made a new friend!" / "봐, Bori가 새 친구를 사귀었어!"
- A. "So cute! Let's take a photo." / "너무 귀여워! 사진 찍자."
- B. "Let's say hi to the owner." / "주인분께 인사하자."
- C. "Bori is more social than me." / "Bori가 나보다 사교성이 좋네."

**마무리**: Bori comes home happy. You come home with mud on your shoes.
Bori는 신나서 돌아오고, 당신은 신발에 진흙을 묻히고 돌아와요.

**내 한 줄**: If you had a pet, what name would you give it? / 반려동물이 있다면 어떤 이름을 지어줄래?

### pets-02 · 고양이 카페
**장면**: You and your friend Ava visit a cat café on a lazy afternoon.
나른한 오후, 당신과 Ava가 고양이 카페에 가요.

**Ava**: "That cat won't come to me!" / "저 고양이가 나한테 안 와!"
- A. "Be patient. Sit quietly." / "기다려 봐. 조용히 앉아 있어."
- B. "Try the toy." / "장난감을 써 봐."
- C. "Cats choose you, not the other way!" / "고양이가 고르는 거야, 반대가 아니고!"

**Ava**: "Are you a cat person or a dog person?" / "너는 고양이파야, 강아지파야?"
- A. "Cat person, for sure." / "확실히 고양이파."
- B. "Dog person. Don't tell the cats." / "강아지파. 고양이들한테는 비밀이야."
- C. "I love both!" / "둘 다 좋아!"

**마무리**: The cat ignores Ava for an hour, then falls asleep on your lap.
고양이는 한 시간 내내 Ava를 무시하더니, 당신 무릎에서 잠들어요.

**내 한 줄**: What animal is most like you? / 나랑 가장 닮은 동물은?

---

## 11. 책·웹툰 `books_webtoon`

### books-webtoon-01 · 웹툰 추천
**장면**: On the subway, your friend Ava is reading a webtoon and laughing out loud.
지하철에서 Ava가 웹툰을 보며 소리 내어 웃고 있어요.

**Ava**: "You have to read this webtoon!" / "이 웹툰 꼭 봐야 해!"
- A. "What's it about?" / "무슨 내용이야?"
- B. "Is it funny or sad?" / "웃긴 거야, 슬픈 거야?"
- C. "Please read more quietly." / "제발 좀 조용히 읽어."

**Ava**: "Do you read webtoons or books more?" / "웹툰이랑 책 중에 뭘 더 많이 봐?"
- A. "Webtoons, on my phone." / "휴대폰으로 웹툰."
- B. "Books, before bed." / "자기 전에 책."
- C. "Books… that I buy and never open." / "책… 사 놓고 안 펴 보는 거."

**마무리**: The story is so good that you both miss your stop. Twice.
이야기가 너무 재밌어서 둘 다 내릴 역을 놓쳐요. 두 번이나요.

**내 한 줄**: What story would you recommend to everyone? / 모두에게 추천하고 싶은 이야기는?

### books-webtoon-02 · 북카페
**장면**: You and your friend Ava spend a quiet afternoon at a book café.
당신과 Ava가 북카페에서 조용한 오후를 보내요.

**Ava**: "What are you reading?" / "뭐 읽고 있어?"
- A. "A mystery novel. I can't stop." / "추리 소설. 멈출 수가 없어."
- B. "An essay book. It's very calm." / "에세이. 마음이 차분해져."
- C. "The same page. For twenty minutes." / "같은 페이지. 20분째."

**Ava**: "Should we start a little book club?" / "우리 작은 북클럽 해볼까?"
- A. "Great idea! Once a month?" / "좋다! 한 달에 한 번?"
- B. "Only if there's cake." / "케이크 있으면."
- C. "Yes. A book club where nobody reads." / "좋아. 아무도 책 안 읽는 북클럽."

**마무리**: Your book club's first rule: snacks are more important than books.
북클럽의 첫 번째 규칙이 정해졌어요. 간식이 책보다 중요하다.

**내 한 줄**: What book changed you a little? / 나를 조금 바꾼 책은?

---

## 12. 일·학교 `work_school`

### work-school-01 · 점심 메뉴
**장면**: It's lunchtime, and your coworker Ava asks you to eat together.
점심시간, 동료 Ava가 같이 밥 먹자고 해요.

**Ava**: "What do you feel like eating?" / "뭐 먹고 싶어?"
- A. "Something warm, like soup." / "국물 같은 따뜻한 거."
- B. "Kimbap. Quick and easy." / "김밥. 빠르고 간단하게."
- C. "Anything. Just not what we ate yesterday." / "아무거나. 어제 먹은 것만 빼고."

**Ava**: "How's your week going?" / "이번 주 어때?"
- A. "Busy, but okay." / "바쁘지만 괜찮아."
- B. "Is it Friday yet?" / "아직 금요일 아니야?"
- C. "Pretty good, actually!" / "사실 꽤 좋아!"

**마무리**: You spend 10 minutes eating and 50 minutes deciding where to eat.
먹는 데 10분, 어디서 먹을지 고르는 데 50분이 걸려요.

**내 한 줄**: What makes a good day at work or school? / 일이나 학교에서 좋은 하루란?

### work-school-02 · 시험 끝
**장면**: You and your classmate Ava just finished a big exam.
당신과 반 친구 Ava가 큰 시험을 막 끝냈어요.

**Ava**: "It's finally over! How did it go?" / "드디어 끝났다! 어땠어?"
- A. "Better than I thought." / "생각보다 괜찮았어."
- B. "I don't want to talk about it!" / "말하고 싶지 않아!"
- C. "I wrote my name correctly. That's a start." / "이름은 제대로 썼어. 그게 시작이지."

**Ava**: "Let's celebrate. What should we do?" / "축하하자. 뭐 할까?"
- A. "Eat chicken and drink cola!" / "치킨에 콜라!"
- B. "Sleep for twelve hours." / "12시간 자기."
- C. "Go to karaoke and scream!" / "노래방 가서 소리 지르기!"

**마무리**: You promise to study earlier next time. You both know that's a lie.
다음엔 미리 공부하자고 약속해요. 둘 다 그게 거짓말인 걸 알아요.

**내 한 줄**: How do you reward yourself after a hard day? / 힘든 하루 끝에 나에게 주는 보상은?
