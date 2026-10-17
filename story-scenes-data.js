/* DayO post-session story scenes v1 (English + Korean). Source: docs/STORY_SCENES_DRAFT.md (owner-confirmed 2026-10-17). */
(function () {
  'use strict';
  window.DayOStoryScenes = [
    {
      "id": "drama-01",
      "interest": "drama",
      "version": 1,
      "title": "정주행 추천",
      "steps": [
        {
          "speaker": "Emma",
          "line": {
            "en": "I want to start a new K-drama tonight. Any ideas?",
            "ko": "오늘 밤 새 K-드라마 시작하고 싶어. 추천해 줄래?"
          },
          "options": [
            {
              "id": "a",
              "en": "Try a romantic comedy. It's easy to watch.",
              "ko": "로맨틱 코미디 봐. 편하게 볼 수 있어."
            },
            {
              "id": "b",
              "en": "A thriller. You'll never sleep again.",
              "ko": "스릴러. 다시는 잠 못 잘 거야."
            },
            {
              "id": "c",
              "en": "Anything. Just stop scrolling, please!",
              "ko": "아무거나. 제발 그만 넘겨!"
            }
          ]
        },
        {
          "speaker": "Emma",
          "line": {
            "en": "How many episodes should we watch?",
            "ko": "몇 화까지 볼까?"
          },
          "options": [
            {
              "id": "a",
              "en": "Just one. We have work tomorrow.",
              "ko": "딱 한 화만. 내일 출근해야 하잖아."
            },
            {
              "id": "b",
              "en": "Just one. (Narrator: It was not just one.)",
              "ko": "딱 한 화만. (내레이션: 한 화로 끝나지 않았다.)"
            },
            {
              "id": "c",
              "en": "Until the snacks run out.",
              "ko": "간식 떨어질 때까지."
            }
          ]
        }
      ],
      "intro": {
        "en": "Your friend Emma is on your sofa, scrolling through a streaming app for twenty minutes.",
        "ko": "Emma가 당신 집 소파에서 20분째 OTT 앱만 넘기고 있어요."
      },
      "ending": {
        "en": "At 3 a.m., you both say, \"Okay, really the last one.\"",
        "ko": "새벽 3시, 둘이 동시에 말해요. \"진짜 이게 마지막이야.\""
      },
      "myLinePrompt": {
        "en": "What drama would you show a friend first?",
        "ko": "친구에게 제일 먼저 보여주고 싶은 드라마는?"
      }
    },
    {
      "id": "drama-02",
      "interest": "drama",
      "version": 1,
      "title": "촬영지 발견",
      "steps": [
        {
          "speaker": "Lucas",
          "line": {
            "en": "Wait, isn't this from that drama?",
            "ko": "잠깐, 여기 그 드라마에 나온 곳 아니야?"
          },
          "options": [
            {
              "id": "a",
              "en": "Yes! The main couple met right here.",
              "ko": "맞아! 주인공 둘이 바로 여기서 만났어."
            },
            {
              "id": "b",
              "en": "I think so. Photo time!",
              "ko": "그런 것 같아. 사진 타임!"
            },
            {
              "id": "c",
              "en": "It's just a bus stop, Lucas.",
              "ko": "Lucas, 그냥 버스 정류장이야."
            }
          ]
        },
        {
          "speaker": "Lucas",
          "line": {
            "en": "Do you want to copy the famous scene?",
            "ko": "그 유명한 장면 따라 해 볼래?"
          },
          "options": [
            {
              "id": "a",
              "en": "Only if you play the main character.",
              "ko": "네가 주인공 하면."
            },
            {
              "id": "b",
              "en": "Sure, but no running in the rain!",
              "ko": "좋아, 대신 빗속 달리기는 빼고!"
            },
            {
              "id": "c",
              "en": "People are watching us…",
              "ko": "사람들이 쳐다보잖아…"
            }
          ]
        }
      ],
      "intro": {
        "en": "Walking in Seoul, you and your friend Lucas find a filming spot from a famous drama.",
        "ko": "서울을 걷다가 당신과 Lucas가 유명 드라마 촬영지를 발견해요."
      },
      "ending": {
        "en": "A grandmother passing by claps for you. Best review ever.",
        "ko": "지나가던 할머니가 박수를 쳐 주세요. 최고의 리뷰예요."
      },
      "myLinePrompt": {
        "en": "Which drama scene would you like to live for a day?",
        "ko": "하루 동안 살아보고 싶은 드라마 장면은?"
      }
    },
    {
      "id": "movies-01",
      "interest": "movies",
      "version": 1,
      "title": "영화관 좌석",
      "steps": [
        {
          "speaker": "Sofia",
          "line": {
            "en": "Where should we sit?",
            "ko": "어디 앉을까?"
          },
          "options": [
            {
              "id": "a",
              "en": "In the middle. Best sound.",
              "ko": "가운데. 소리가 제일 좋아."
            },
            {
              "id": "b",
              "en": "In the back. Nobody can see me cry.",
              "ko": "뒤쪽. 내가 우는 걸 아무도 못 보게."
            },
            {
              "id": "c",
              "en": "Near the aisle, for snack emergencies.",
              "ko": "통로 쪽. 간식 비상사태 대비."
            }
          ]
        },
        {
          "speaker": "Sofia",
          "line": {
            "en": "Popcorn: sweet or salty?",
            "ko": "팝콘은 달콤한 거, 짭짤한 거?"
          },
          "options": [
            {
              "id": "a",
              "en": "Sweet, of course.",
              "ko": "당연히 달콤한 거."
            },
            {
              "id": "b",
              "en": "Salty, always.",
              "ko": "무조건 짭짤한 거."
            },
            {
              "id": "c",
              "en": "Half and half. I'm not choosing.",
              "ko": "반반. 난 못 골라."
            }
          ]
        }
      ],
      "intro": {
        "en": "You and your friend Sofia are buying movie tickets at the kiosk.",
        "ko": "당신과 Sofia가 키오스크에서 영화표를 사고 있어요."
      },
      "ending": {
        "en": "The popcorn is gone before the ads even finish.",
        "ko": "광고가 끝나기도 전에 팝콘이 다 사라졌어요."
      },
      "myLinePrompt": {
        "en": "What's your perfect movie-night snack?",
        "ko": "영화 볼 때 최고의 간식은?"
      }
    },
    {
      "id": "movies-02",
      "interest": "movies",
      "version": 1,
      "title": "엔딩 이후",
      "steps": [
        {
          "speaker": "Daniel",
          "line": {
            "en": "So, what did you think?",
            "ko": "어땠어?"
          },
          "options": [
            {
              "id": "a",
              "en": "I loved it. The ending surprised me.",
              "ko": "너무 좋았어. 결말에 놀랐어."
            },
            {
              "id": "b",
              "en": "It was okay, but a bit long.",
              "ko": "괜찮았는데 좀 길었어."
            },
            {
              "id": "c",
              "en": "Honestly? I slept through the middle.",
              "ko": "솔직히? 중간에 잤어."
            }
          ]
        },
        {
          "speaker": "Daniel",
          "line": {
            "en": "Who was your favorite character?",
            "ko": "제일 좋았던 캐릭터는?"
          },
          "options": [
            {
              "id": "a",
              "en": "The quiet side character.",
              "ko": "조용한 조연."
            },
            {
              "id": "b",
              "en": "The villain. He had a point.",
              "ko": "악역. 걔 말도 일리가 있었어."
            },
            {
              "id": "c",
              "en": "The main character's dog!",
              "ko": "주인공네 강아지!"
            }
          ]
        }
      ],
      "intro": {
        "en": "The movie just ended. You and your friend Daniel walk out of the theater.",
        "ko": "영화가 막 끝났어요. 당신과 Daniel이 영화관을 나서요."
      },
      "ending": {
        "en": "You argue about the ending all the way to the subway — and agree on nothing.",
        "ko": "지하철역까지 결말을 두고 논쟁했지만, 합의한 건 하나도 없어요."
      },
      "myLinePrompt": {
        "en": "Which movie would you watch again tonight?",
        "ko": "오늘 밤 다시 보고 싶은 영화는?"
      }
    },
    {
      "id": "youtube-01",
      "interest": "youtube",
      "version": 1,
      "title": "알고리즘 공유",
      "steps": [
        {
          "speaker": "Hana",
          "line": {
            "en": "This channel is my favorite right now.",
            "ko": "요즘 제일 좋아하는 채널이야."
          },
          "options": [
            {
              "id": "a",
              "en": "Oh, I watch it too!",
              "ko": "어, 나도 그거 봐!"
            },
            {
              "id": "b",
              "en": "What kind of videos do they make?",
              "ko": "어떤 영상 올리는 채널이야?"
            },
            {
              "id": "c",
              "en": "Is it another cat video?",
              "ko": "또 고양이 영상이야?"
            }
          ]
        },
        {
          "speaker": "Hana",
          "line": {
            "en": "What do you usually watch on YouTube?",
            "ko": "너는 유튜브에서 주로 뭐 봐?"
          },
          "options": [
            {
              "id": "a",
              "en": "Cooking videos. I never cook, though.",
              "ko": "요리 영상. 요리는 안 하지만."
            },
            {
              "id": "b",
              "en": "Travel vlogs.",
              "ko": "여행 브이로그."
            },
            {
              "id": "c",
              "en": "Videos of people cleaning. Don't judge me.",
              "ko": "남이 청소하는 영상. 판단하지 마."
            }
          ]
        }
      ],
      "intro": {
        "en": "Your friend Hana shows you a video on her phone, already laughing before it starts.",
        "ko": "Hana가 영상이 시작하기도 전에 웃으면서 휴대폰을 내밀어요."
      },
      "ending": {
        "en": "One hour later, your algorithm has completely changed.",
        "ko": "한 시간 뒤, 당신의 알고리즘이 완전히 바뀌었어요."
      },
      "myLinePrompt": {
        "en": "What video would you recommend to a new friend?",
        "ko": "새 친구에게 추천하고 싶은 영상은?"
      }
    },
    {
      "id": "youtube-02",
      "interest": "youtube",
      "version": 1,
      "title": "브이로그 촬영",
      "steps": [
        {
          "speaker": "Leo",
          "line": {
            "en": "Can you help me film?",
            "ko": "촬영 좀 도와줄래?"
          },
          "options": [
            {
              "id": "a",
              "en": "Sure. I'll hold the camera.",
              "ko": "그럼. 내가 카메라 들게."
            },
            {
              "id": "b",
              "en": "Only if I'm not in the video!",
              "ko": "나는 안 나오는 조건으로!"
            },
            {
              "id": "c",
              "en": "Only if I get half of your subscribers.",
              "ko": "구독자 절반 나 주면."
            }
          ]
        },
        {
          "speaker": "Leo",
          "line": {
            "en": "What should we show first?",
            "ko": "뭐부터 찍을까?"
          },
          "options": [
            {
              "id": "a",
              "en": "The street food.",
              "ko": "길거리 음식."
            },
            {
              "id": "b",
              "en": "The friendly shop owners.",
              "ko": "친절한 사장님들."
            },
            {
              "id": "c",
              "en": "You eating something very spicy.",
              "ko": "네가 엄청 매운 거 먹는 장면."
            }
          ]
        }
      ],
      "intro": {
        "en": "Your friend Leo wants to film a vlog at a market in Seoul.",
        "ko": "Leo가 서울 시장에서 브이로그를 찍고 싶어 해요."
      },
      "ending": {
        "en": "The video gets 12 views. Eleven are from Leo's mom.",
        "ko": "영상 조회수는 12회. 그중 11회는 Leo의 엄마예요."
      },
      "myLinePrompt": {
        "en": "If you made a vlog, what would it be about?",
        "ko": "브이로그를 찍는다면 어떤 내용일까?"
      }
    },
    {
      "id": "music-01",
      "interest": "music",
      "version": 1,
      "title": "노래방",
      "steps": [
        {
          "speaker": "Chris",
          "line": {
            "en": "You choose the first song!",
            "ko": "첫 곡은 네가 골라!"
          },
          "options": [
            {
              "id": "a",
              "en": "Let's start with a K-pop hit.",
              "ko": "케이팝 히트곡으로 시작하자."
            },
            {
              "id": "b",
              "en": "An old pop song everyone knows.",
              "ko": "다들 아는 옛날 팝송."
            },
            {
              "id": "c",
              "en": "A sad ballad. Let's ruin the mood.",
              "ko": "슬픈 발라드. 분위기 망쳐 보자."
            }
          ]
        },
        {
          "speaker": "Chris",
          "line": {
            "en": "Are you going to dance too?",
            "ko": "춤도 출 거야?"
          },
          "options": [
            {
              "id": "a",
              "en": "Maybe just a little.",
              "ko": "조금만."
            },
            {
              "id": "b",
              "en": "Of course! Watch me.",
              "ko": "당연하지! 잘 봐."
            },
            {
              "id": "c",
              "en": "No. I'm the tambourine person.",
              "ko": "아니. 나는 탬버린 담당이야."
            }
          ]
        }
      ],
      "intro": {
        "en": "You and your friends are at a noraebang in Hongdae.",
        "ko": "당신은 친구들과 홍대 노래방에 왔어요."
      },
      "ending": {
        "en": "The machine gives you 100 points. Nobody knows why.",
        "ko": "노래방 기계가 100점을 줬어요. 이유는 아무도 몰라요."
      },
      "myLinePrompt": {
        "en": "What's your go-to noraebang song?",
        "ko": "노래방 필살기 노래는?"
      }
    },
    {
      "id": "music-02",
      "interest": "music",
      "version": 1,
      "title": "플레이리스트 교환",
      "steps": [
        {
          "speaker": "Mia",
          "line": {
            "en": "Want to listen to my playlist?",
            "ko": "내 플레이리스트 들어볼래?"
          },
          "options": [
            {
              "id": "a",
              "en": "Yes, please!",
              "ko": "응, 좋아!"
            },
            {
              "id": "b",
              "en": "Only if I can choose the next song.",
              "ko": "다음 곡은 내가 고르는 조건으로."
            },
            {
              "id": "c",
              "en": "Please tell me it's not all sad songs.",
              "ko": "제발 다 슬픈 노래는 아니라고 해 줘."
            }
          ]
        },
        {
          "speaker": "Mia",
          "line": {
            "en": "When do you listen to music the most?",
            "ko": "음악은 주로 언제 들어?"
          },
          "options": [
            {
              "id": "a",
              "en": "On my way to work.",
              "ko": "출근길에."
            },
            {
              "id": "b",
              "en": "When I can't sleep.",
              "ko": "잠이 안 올 때."
            },
            {
              "id": "c",
              "en": "In the shower. I'm a star there.",
              "ko": "샤워할 때. 거기선 내가 스타야."
            }
          ]
        }
      ],
      "intro": {
        "en": "On a long bus ride, your friend Mia offers you one of her earphones.",
        "ko": "긴 버스 여행 중에 Mia가 당신에게 이어폰 한쪽을 건네요."
      },
      "ending": {
        "en": "Mia's playlist goes from jazz to heavy metal to a baby shark remix.",
        "ko": "Mia의 플레이리스트는 재즈에서 헤비메탈, 그리고 상어가족 리믹스로 이어져요."
      },
      "myLinePrompt": {
        "en": "Which song always makes you feel better?",
        "ko": "들으면 늘 기분이 좋아지는 노래는?"
      }
    },
    {
      "id": "travel-01",
      "interest": "travel",
      "version": 1,
      "title": "주말 여행 계획",
      "steps": [
        {
          "speaker": "Noah",
          "line": {
            "en": "Where should we go this weekend?",
            "ko": "이번 주말에 어디 갈까?"
          },
          "options": [
            {
              "id": "a",
              "en": "Busan. I want to see the sea.",
              "ko": "부산. 바다 보고 싶어."
            },
            {
              "id": "b",
              "en": "Gangneung, for coffee and the beach.",
              "ko": "강릉. 커피랑 바다."
            },
            {
              "id": "c",
              "en": "Jeonju. I want to eat everything.",
              "ko": "전주. 다 먹어 버릴 거야."
            }
          ]
        },
        {
          "speaker": "Noah",
          "line": {
            "en": "How should we get there?",
            "ko": "어떻게 갈까?"
          },
          "options": [
            {
              "id": "a",
              "en": "By KTX. It's fast.",
              "ko": "KTX. 빠르니까."
            },
            {
              "id": "b",
              "en": "By bus. It's cheaper.",
              "ko": "버스. 더 싸니까."
            },
            {
              "id": "c",
              "en": "Let's decide after we book the restaurants.",
              "ko": "맛집 예약부터 하고 정하자."
            }
          ]
        }
      ],
      "intro": {
        "en": "You and your friend Noah are planning a weekend trip in Korea.",
        "ko": "당신과 Noah가 한국 안에서 주말 여행을 계획하고 있어요."
      },
      "ending": {
        "en": "The plan has three restaurants, two cafés, and zero tourist sights.",
        "ko": "계획표에는 식당 세 곳, 카페 두 곳, 관광지는 0곳이에요."
      },
      "myLinePrompt": {
        "en": "Where in Korea do you want to visit next?",
        "ko": "다음에 가보고 싶은 한국 여행지는?"
      }
    },
    {
      "id": "travel-02",
      "interest": "travel",
      "version": 1,
      "title": "길을 잃다",
      "steps": [
        {
          "speaker": "Ava",
          "line": {
            "en": "I think we're lost.",
            "ko": "우리 길 잃은 것 같아."
          },
          "options": [
            {
              "id": "a",
              "en": "Let's ask someone for directions.",
              "ko": "누구한테 길 물어보자."
            },
            {
              "id": "b",
              "en": "No problem. Let's check the map app.",
              "ko": "괜찮아. 지도 앱 보자."
            },
            {
              "id": "c",
              "en": "We're not lost. We're exploring.",
              "ko": "길 잃은 거 아니야. 탐험 중이야."
            }
          ]
        },
        {
          "speaker": "Ava",
          "line": {
            "en": "Oh, look, a little café.",
            "ko": "어, 저기 작은 카페 있다."
          },
          "options": [
            {
              "id": "a",
              "en": "Perfect. Let's take a break.",
              "ko": "딱이다. 좀 쉬자."
            },
            {
              "id": "b",
              "en": "Let's ask the owner for tips.",
              "ko": "사장님한테 추천 좀 받자."
            },
            {
              "id": "c",
              "en": "See? I planned this.",
              "ko": "봐, 내가 다 계획한 거야."
            }
          ]
        }
      ],
      "intro": {
        "en": "On a trip, you and your friend Ava take a wrong turn in a small town.",
        "ko": "여행 중에 당신과 Ava가 작은 마을에서 길을 잘못 들었어요."
      },
      "ending": {
        "en": "The café owner gives you free cookies and better directions than the app.",
        "ko": "카페 사장님이 쿠키도 공짜로 주고, 지도 앱보다 정확하게 길도 알려 줘요."
      },
      "myLinePrompt": {
        "en": "What's your best \"happy accident\" while traveling?",
        "ko": "여행 중 뜻밖에 좋았던 순간은?"
      }
    },
    {
      "id": "food-cafe-01",
      "interest": "food_cafe",
      "version": 1,
      "title": "카페 주문",
      "steps": [
        {
          "speaker": "Olivia",
          "line": {
            "en": "What are you getting?",
            "ko": "뭐 마실 거야?"
          },
          "options": [
            {
              "id": "a",
              "en": "An iced Americano, as always.",
              "ko": "늘 그렇듯 아이스 아메리카노."
            },
            {
              "id": "b",
              "en": "Something sweet, like a latte.",
              "ko": "라떼처럼 달달한 거."
            },
            {
              "id": "c",
              "en": "Whatever has the prettiest cup.",
              "ko": "컵이 제일 예쁜 걸로."
            }
          ]
        },
        {
          "speaker": "Olivia",
          "line": {
            "en": "Should we share a dessert?",
            "ko": "디저트 하나 나눠 먹을까?"
          },
          "options": [
            {
              "id": "a",
              "en": "Yes, the cake looks great.",
              "ko": "응, 케이크 맛있어 보여."
            },
            {
              "id": "b",
              "en": "Let's get two. I don't share cake.",
              "ko": "두 개 시키자. 케이크는 안 나눠."
            },
            {
              "id": "c",
              "en": "Just a drink. I'm on a diet. Starting tomorrow.",
              "ko": "음료만. 다이어트 중이거든. 내일부터."
            }
          ]
        }
      ],
      "intro": {
        "en": "You and your friend Olivia walk into a cozy café in Seongsu.",
        "ko": "당신과 Olivia가 성수동의 아늑한 카페에 들어가요."
      },
      "ending": {
        "en": "You take thirty photos of the cake before the first bite.",
        "ko": "첫 입을 먹기 전에 케이크 사진만 서른 장을 찍어요."
      },
      "myLinePrompt": {
        "en": "Describe your perfect café in one sentence.",
        "ko": "나만의 완벽한 카페를 한 문장으로 표현하면?"
      }
    },
    {
      "id": "food-cafe-02",
      "interest": "food_cafe",
      "version": 1,
      "title": "처음 먹는 한식",
      "steps": [
        {
          "speaker": "Ethan",
          "line": {
            "en": "What should I order?",
            "ko": "뭐 시켜야 해?"
          },
          "options": [
            {
              "id": "a",
              "en": "Bibimbap. It's a safe choice.",
              "ko": "비빔밥. 실패 없는 메뉴야."
            },
            {
              "id": "b",
              "en": "Kimchi stew, if you're brave.",
              "ko": "용감하다면 김치찌개."
            },
            {
              "id": "c",
              "en": "Everything. We're sharing.",
              "ko": "전부 다. 나눠 먹자."
            }
          ]
        },
        {
          "speaker": "Ethan",
          "line": {
            "en": "Wow, why are there so many side dishes?",
            "ko": "와, 반찬이 왜 이렇게 많아?"
          },
          "options": [
            {
              "id": "a",
              "en": "They're free, and you can get more!",
              "ko": "무료고, 더 달라고 할 수도 있어!"
            },
            {
              "id": "b",
              "en": "It's Korean style. Try them all.",
              "ko": "한국식이야. 다 먹어 봐."
            },
            {
              "id": "c",
              "en": "Careful. That green one is a trap.",
              "ko": "조심해. 저 초록색은 함정이야."
            }
          ]
        }
      ],
      "intro": {
        "en": "Your friend Ethan is trying Korean food for the first time at a small restaurant.",
        "ko": "Ethan이 작은 식당에서 처음으로 한식을 먹어 봐요."
      },
      "ending": {
        "en": "Ethan drinks three glasses of water, then asks for more kimchi.",
        "ko": "Ethan이 물을 세 잔 마시더니, 김치를 더 달라고 해요."
      },
      "myLinePrompt": {
        "en": "What Korean food would you recommend to a first-timer?",
        "ko": "처음 먹는 사람에게 추천할 한식은?"
      }
    },
    {
      "id": "exercise-01",
      "interest": "exercise",
      "version": 1,
      "title": "한강 러닝",
      "steps": [
        {
          "speaker": "Jake",
          "line": {
            "en": "How far do you want to run?",
            "ko": "얼마나 달릴까?"
          },
          "options": [
            {
              "id": "a",
              "en": "Just 3 kilometers today.",
              "ko": "오늘은 3킬로만."
            },
            {
              "id": "b",
              "en": "Let's try 5 kilometers!",
              "ko": "5킬로 도전!"
            },
            {
              "id": "c",
              "en": "To the convenience store. It's 200 meters.",
              "ko": "편의점까지. 200미터야."
            }
          ]
        },
        {
          "speaker": "Jake",
          "line": {
            "en": "What should we do after?",
            "ko": "끝나고 뭐 할까?"
          },
          "options": [
            {
              "id": "a",
              "en": "Get coffee.",
              "ko": "커피 마시자."
            },
            {
              "id": "b",
              "en": "Eat ramyeon by the river!",
              "ko": "한강에서 라면 먹자!"
            },
            {
              "id": "c",
              "en": "Go home and sleep again.",
              "ko": "집에 가서 다시 자기."
            }
          ]
        }
      ],
      "intro": {
        "en": "Early in the morning, you meet your friend Jake by the Han River to go running.",
        "ko": "이른 아침, 당신은 한강에서 Jake를 만나 함께 달려요."
      },
      "ending": {
        "en": "You burn 200 calories and eat 600 calories of ramyeon. Perfect balance.",
        "ko": "200칼로리를 태우고 라면으로 600칼로리를 먹어요. 완벽한 균형이에요."
      },
      "myLinePrompt": {
        "en": "What's your favorite way to move your body?",
        "ko": "가장 좋아하는 몸 움직이는 방법은?"
      }
    },
    {
      "id": "exercise-02",
      "interest": "exercise",
      "version": 1,
      "title": "등산 정상",
      "steps": [
        {
          "speaker": "Grace",
          "line": {
            "en": "I'm so tired. How much farther?",
            "ko": "너무 힘들어. 얼마나 남았어?"
          },
          "options": [
            {
              "id": "a",
              "en": "Almost there. You can do it!",
              "ko": "거의 다 왔어. 할 수 있어!"
            },
            {
              "id": "b",
              "en": "Let's rest for five minutes.",
              "ko": "5분만 쉬자."
            },
            {
              "id": "c",
              "en": "Ten more minutes. (It was one more hour.)",
              "ko": "10분만 더. (사실 한 시간 더였다.)"
            }
          ]
        },
        {
          "speaker": "Grace",
          "line": {
            "en": "Wow, look at the view!",
            "ko": "와, 경치 좀 봐!"
          },
          "options": [
            {
              "id": "a",
              "en": "It was worth it.",
              "ko": "올라온 보람이 있다."
            },
            {
              "id": "b",
              "en": "Let's take a photo together.",
              "ko": "같이 사진 찍자."
            },
            {
              "id": "c",
              "en": "I can't look. I can't feel my legs.",
              "ko": "못 보겠어. 다리에 감각이 없어."
            }
          ]
        }
      ],
      "intro": {
        "en": "You and your friend Grace are hiking Bukhansan on a clear autumn day.",
        "ko": "맑은 가을날, 당신과 Grace가 북한산을 오르고 있어요."
      },
      "ending": {
        "en": "At the top, a 70-year-old hiker passes you both, not even sweating.",
        "ko": "정상에서, 70대 등산객이 땀 한 방울 없이 두 사람을 앞질러 가요."
      },
      "myLinePrompt": {
        "en": "What do you think about when you finish a hard workout?",
        "ko": "힘든 운동을 끝냈을 때 드는 생각은?"
      }
    },
    {
      "id": "games-01",
      "interest": "games",
      "version": 1,
      "title": "PC방 첫 방문",
      "steps": [
        {
          "speaker": "Ryan",
          "line": {
            "en": "What game do you want to play?",
            "ko": "무슨 게임 할래?"
          },
          "options": [
            {
              "id": "a",
              "en": "Something easy, please. I'm new.",
              "ko": "쉬운 걸로. 나 처음이야."
            },
            {
              "id": "b",
              "en": "A team game. Let's play together.",
              "ko": "팀 게임. 같이 하자."
            },
            {
              "id": "c",
              "en": "Whatever game I can win.",
              "ko": "내가 이길 수 있는 거."
            }
          ]
        },
        {
          "speaker": "Ryan",
          "line": {
            "en": "Do you want to order food here?",
            "ko": "여기서 음식 시킬래?"
          },
          "options": [
            {
              "id": "a",
              "en": "You can order food here? Amazing!",
              "ko": "여기서 음식도 시켜? 대박!"
            },
            {
              "id": "b",
              "en": "Just a drink for now.",
              "ko": "일단 음료만."
            },
            {
              "id": "c",
              "en": "After we win this game!",
              "ko": "이번 판 이기고 나서!"
            }
          ]
        }
      ],
      "intro": {
        "en": "Your friend Ryan takes you to a PC bang for the first time.",
        "ko": "Ryan이 당신을 처음으로 PC방에 데려가요."
      },
      "ending": {
        "en": "You lose ten games in a row, but the ramyeon is a total win.",
        "ko": "열 판 연속으로 졌지만, 라면만큼은 완벽한 승리예요."
      },
      "myLinePrompt": {
        "en": "What game could you play forever?",
        "ko": "끝없이 할 수 있는 게임은?"
      }
    },
    {
      "id": "games-02",
      "interest": "games",
      "version": 1,
      "title": "보드게임 카페",
      "steps": [
        {
          "speaker": "Nina",
          "line": {
            "en": "Which game should we try?",
            "ko": "무슨 게임 해볼까?"
          },
          "options": [
            {
              "id": "a",
              "en": "Something simple to start.",
              "ko": "처음엔 간단한 거."
            },
            {
              "id": "b",
              "en": "A strategy game. I like thinking.",
              "ko": "전략 게임. 머리 쓰는 거 좋아."
            },
            {
              "id": "c",
              "en": "One that won't end our friendship.",
              "ko": "우리 우정이 안 깨지는 걸로."
            }
          ]
        },
        {
          "speaker": "Nina",
          "line": {
            "en": "Oh no, I'm losing again!",
            "ko": "아 또 지고 있어!"
          },
          "options": [
            {
              "id": "a",
              "en": "Don't worry, it's just for fun.",
              "ko": "괜찮아, 재미로 하는 거잖아."
            },
            {
              "id": "b",
              "en": "Let's team up next round.",
              "ko": "다음 판은 같이 팀하자."
            },
            {
              "id": "c",
              "en": "I'm sorry. I'm not sorry.",
              "ko": "미안해. 사실 안 미안해."
            }
          ]
        }
      ],
      "intro": {
        "en": "You and your friends are at a board game café on a rainy Saturday.",
        "ko": "비 오는 토요일, 당신은 친구들과 보드게임 카페에 왔어요."
      },
      "ending": {
        "en": "Nina asks for \"one more game\" seven times.",
        "ko": "Nina가 \"한 판만 더\"를 일곱 번 외쳐요."
      },
      "myLinePrompt": {
        "en": "Are you a winner or a fun-maker in games?",
        "ko": "게임에서 나는 승부사? 분위기 메이커?"
      }
    },
    {
      "id": "fashion-beauty-01",
      "interest": "fashion_beauty",
      "version": 1,
      "title": "쇼핑 고민",
      "steps": [
        {
          "speaker": "Chloe",
          "line": {
            "en": "Which one looks better on me?",
            "ko": "어느 게 나한테 더 잘 어울려?"
          },
          "options": [
            {
              "id": "a",
              "en": "The blue one. It's your color.",
              "ko": "파란색. 네 색이야."
            },
            {
              "id": "b",
              "en": "Both look great. Get both!",
              "ko": "둘 다 예뻐. 둘 다 사!"
            },
            {
              "id": "c",
              "en": "They look exactly the same, Chloe.",
              "ko": "Chloe, 둘이 완전 똑같아."
            }
          ]
        },
        {
          "speaker": "Chloe",
          "line": {
            "en": "What's your style?",
            "ko": "너는 어떤 스타일이야?"
          },
          "options": [
            {
              "id": "a",
              "en": "Simple and comfortable.",
              "ko": "심플하고 편한 스타일."
            },
            {
              "id": "b",
              "en": "Bright colors, always.",
              "ko": "무조건 밝은 색."
            },
            {
              "id": "c",
              "en": "Whatever is clean that morning.",
              "ko": "그날 아침에 깨끗한 거."
            }
          ]
        }
      ],
      "intro": {
        "en": "You and your friend Chloe are shopping for clothes in Myeongdong.",
        "ko": "당신과 Chloe가 명동에서 옷 쇼핑을 하고 있어요."
      },
      "ending": {
        "en": "You came for one T-shirt and leave with four bags.",
        "ko": "티셔츠 한 장 사러 왔다가 쇼핑백 네 개를 들고 나와요."
      },
      "myLinePrompt": {
        "en": "What item do you wear the most?",
        "ko": "가장 자주 입는 아이템은?"
      }
    },
    {
      "id": "fashion-beauty-02",
      "interest": "fashion_beauty",
      "version": 1,
      "title": "화장품 매장",
      "steps": [
        {
          "speaker": "Isabel",
          "line": {
            "en": "There are too many products. Help!",
            "ko": "제품이 너무 많아. 도와줘!"
          },
          "options": [
            {
              "id": "a",
              "en": "Let's start with sunscreen.",
              "ko": "선크림부터 보자."
            },
            {
              "id": "b",
              "en": "Try the samples first.",
              "ko": "먼저 샘플 써 봐."
            },
            {
              "id": "c",
              "en": "Just buy whatever is on sale.",
              "ko": "그냥 세일하는 거 사."
            }
          ]
        },
        {
          "speaker": "Isabel",
          "line": {
            "en": "Do you have a favorite product?",
            "ko": "좋아하는 제품 있어?"
          },
          "options": [
            {
              "id": "a",
              "en": "This face mask. It's my secret.",
              "ko": "이 마스크팩. 내 비밀템이야."
            },
            {
              "id": "b",
              "en": "Just a simple lip balm.",
              "ko": "그냥 립밤 하나."
            },
            {
              "id": "c",
              "en": "Sleep. Sleep is my skincare.",
              "ko": "잠. 잠이 내 스킨케어야."
            }
          ]
        }
      ],
      "intro": {
        "en": "Your friend Isabel needs help choosing skincare at a beauty store.",
        "ko": "Isabel이 뷰티 매장에서 스킨케어 고르는 걸 도와달래요."
      },
      "ending": {
        "en": "Isabel finds her new favorite — and somehow, you buy more than she does.",
        "ko": "Isabel은 새 최애템을 찾았고, 어쩐 일인지 당신이 더 많이 샀어요."
      },
      "myLinePrompt": {
        "en": "What's one thing you can't live without in your bag?",
        "ko": "가방에 꼭 있어야 하는 한 가지는?"
      }
    },
    {
      "id": "pets-01",
      "interest": "pets",
      "version": 1,
      "title": "강아지 산책",
      "steps": [
        {
          "speaker": "Tom",
          "line": {
            "en": "Bori loves to run. Are you ready?",
            "ko": "Bori는 뛰는 걸 좋아해. 준비됐어?"
          },
          "options": [
            {
              "id": "a",
              "en": "Ready! Let's go, Bori!",
              "ko": "준비 완료! 가자, Bori!"
            },
            {
              "id": "b",
              "en": "Maybe a slow walk first.",
              "ko": "일단 천천히 걷자."
            },
            {
              "id": "c",
              "en": "Who is walking who here?",
              "ko": "지금 누가 누굴 산책시키는 거야?"
            }
          ]
        },
        {
          "speaker": "Tom",
          "line": {
            "en": "Look, Bori made a new friend!",
            "ko": "봐, Bori가 새 친구를 사귀었어!"
          },
          "options": [
            {
              "id": "a",
              "en": "So cute! Let's take a photo.",
              "ko": "너무 귀여워! 사진 찍자."
            },
            {
              "id": "b",
              "en": "Let's say hi to the owner.",
              "ko": "주인분께 인사하자."
            },
            {
              "id": "c",
              "en": "Bori is more social than me.",
              "ko": "Bori가 나보다 사교성이 좋네."
            }
          ]
        }
      ],
      "intro": {
        "en": "Your friend Tom asks you to walk his dog, Bori, in the park.",
        "ko": "Tom이 당신에게 강아지 Bori 산책을 부탁해요."
      },
      "ending": {
        "en": "Bori comes home happy. You come home with mud on your shoes.",
        "ko": "Bori는 신나서 돌아오고, 당신은 신발에 진흙을 묻히고 돌아와요."
      },
      "myLinePrompt": {
        "en": "If you had a pet, what name would you give it?",
        "ko": "반려동물이 있다면 어떤 이름을 지어줄래?"
      }
    },
    {
      "id": "pets-02",
      "interest": "pets",
      "version": 1,
      "title": "고양이 카페",
      "steps": [
        {
          "speaker": "Lily",
          "line": {
            "en": "That cat won't come to me!",
            "ko": "저 고양이가 나한테 안 와!"
          },
          "options": [
            {
              "id": "a",
              "en": "Be patient. Sit quietly.",
              "ko": "기다려 봐. 조용히 앉아 있어."
            },
            {
              "id": "b",
              "en": "Try the toy.",
              "ko": "장난감을 써 봐."
            },
            {
              "id": "c",
              "en": "Cats choose you, not the other way!",
              "ko": "고양이가 고르는 거야, 반대가 아니고!"
            }
          ]
        },
        {
          "speaker": "Lily",
          "line": {
            "en": "Are you a cat person or a dog person?",
            "ko": "너는 고양이파야, 강아지파야?"
          },
          "options": [
            {
              "id": "a",
              "en": "Cat person, for sure.",
              "ko": "확실히 고양이파."
            },
            {
              "id": "b",
              "en": "Dog person. Don't tell the cats.",
              "ko": "강아지파. 고양이들한테는 비밀이야."
            },
            {
              "id": "c",
              "en": "I love both!",
              "ko": "둘 다 좋아!"
            }
          ]
        }
      ],
      "intro": {
        "en": "You and your friend Lily visit a cat café on a lazy afternoon.",
        "ko": "나른한 오후, 당신과 Lily가 고양이 카페에 가요."
      },
      "ending": {
        "en": "The cat ignores Lily for an hour, then falls asleep on your lap.",
        "ko": "고양이는 한 시간 내내 Lily를 무시하더니, 당신 무릎에서 잠들어요."
      },
      "myLinePrompt": {
        "en": "What animal is most like you?",
        "ko": "나랑 가장 닮은 동물은?"
      }
    },
    {
      "id": "books-webtoon-01",
      "interest": "books_webtoon",
      "version": 1,
      "title": "웹툰 추천",
      "steps": [
        {
          "speaker": "Max",
          "line": {
            "en": "You have to read this webtoon!",
            "ko": "이 웹툰 꼭 봐야 해!"
          },
          "options": [
            {
              "id": "a",
              "en": "What's it about?",
              "ko": "무슨 내용이야?"
            },
            {
              "id": "b",
              "en": "Is it funny or sad?",
              "ko": "웃긴 거야, 슬픈 거야?"
            },
            {
              "id": "c",
              "en": "Please read more quietly.",
              "ko": "제발 좀 조용히 읽어."
            }
          ]
        },
        {
          "speaker": "Max",
          "line": {
            "en": "Do you read webtoons or books more?",
            "ko": "웹툰이랑 책 중에 뭘 더 많이 봐?"
          },
          "options": [
            {
              "id": "a",
              "en": "Webtoons, on my phone.",
              "ko": "휴대폰으로 웹툰."
            },
            {
              "id": "b",
              "en": "Books, before bed.",
              "ko": "자기 전에 책."
            },
            {
              "id": "c",
              "en": "Books… that I buy and never open.",
              "ko": "책… 사 놓고 안 펴 보는 거."
            }
          ]
        }
      ],
      "intro": {
        "en": "On the subway, your friend Max is reading a webtoon and laughing out loud.",
        "ko": "지하철에서 Max가 웹툰을 보며 소리 내어 웃고 있어요."
      },
      "ending": {
        "en": "The story is so good that you both miss your stop. Twice.",
        "ko": "이야기가 너무 재밌어서 둘 다 내릴 역을 놓쳐요. 두 번이나요."
      },
      "myLinePrompt": {
        "en": "What story would you recommend to everyone?",
        "ko": "모두에게 추천하고 싶은 이야기는?"
      }
    },
    {
      "id": "books-webtoon-02",
      "interest": "books_webtoon",
      "version": 1,
      "title": "북카페",
      "steps": [
        {
          "speaker": "Zoe",
          "line": {
            "en": "What are you reading?",
            "ko": "뭐 읽고 있어?"
          },
          "options": [
            {
              "id": "a",
              "en": "A mystery novel. I can't stop.",
              "ko": "추리 소설. 멈출 수가 없어."
            },
            {
              "id": "b",
              "en": "An essay book. It's very calm.",
              "ko": "에세이. 마음이 차분해져."
            },
            {
              "id": "c",
              "en": "The same page. For twenty minutes.",
              "ko": "같은 페이지. 20분째."
            }
          ]
        },
        {
          "speaker": "Zoe",
          "line": {
            "en": "Should we start a little book club?",
            "ko": "우리 작은 북클럽 해볼까?"
          },
          "options": [
            {
              "id": "a",
              "en": "Great idea! Once a month?",
              "ko": "좋다! 한 달에 한 번?"
            },
            {
              "id": "b",
              "en": "Only if there's cake.",
              "ko": "케이크 있으면."
            },
            {
              "id": "c",
              "en": "Yes. A book club where nobody reads.",
              "ko": "좋아. 아무도 책 안 읽는 북클럽."
            }
          ]
        }
      ],
      "intro": {
        "en": "You and your friend Zoe spend a quiet afternoon at a book café.",
        "ko": "당신과 Zoe가 북카페에서 조용한 오후를 보내요."
      },
      "ending": {
        "en": "Your book club's first rule: snacks are more important than books.",
        "ko": "북클럽의 첫 번째 규칙이 정해졌어요. 간식이 책보다 중요하다."
      },
      "myLinePrompt": {
        "en": "What book changed you a little?",
        "ko": "나를 조금 바꾼 책은?"
      }
    },
    {
      "id": "work-school-01",
      "interest": "work_school",
      "version": 1,
      "title": "점심 메뉴",
      "steps": [
        {
          "speaker": "Ben",
          "line": {
            "en": "What do you feel like eating?",
            "ko": "뭐 먹고 싶어?"
          },
          "options": [
            {
              "id": "a",
              "en": "Something warm, like soup.",
              "ko": "국물 같은 따뜻한 거."
            },
            {
              "id": "b",
              "en": "Kimbap. Quick and easy.",
              "ko": "김밥. 빠르고 간단하게."
            },
            {
              "id": "c",
              "en": "Anything. Just not what we ate yesterday.",
              "ko": "아무거나. 어제 먹은 것만 빼고."
            }
          ]
        },
        {
          "speaker": "Ben",
          "line": {
            "en": "How's your week going?",
            "ko": "이번 주 어때?"
          },
          "options": [
            {
              "id": "a",
              "en": "Busy, but okay.",
              "ko": "바쁘지만 괜찮아."
            },
            {
              "id": "b",
              "en": "Is it Friday yet?",
              "ko": "아직 금요일 아니야?"
            },
            {
              "id": "c",
              "en": "Pretty good, actually!",
              "ko": "사실 꽤 좋아!"
            }
          ]
        }
      ],
      "intro": {
        "en": "It's lunchtime, and your coworker Ben asks you to eat together.",
        "ko": "점심시간, 동료 Ben이 같이 밥 먹자고 해요."
      },
      "ending": {
        "en": "You spend 10 minutes eating and 50 minutes deciding where to eat.",
        "ko": "먹는 데 10분, 어디서 먹을지 고르는 데 50분이 걸려요."
      },
      "myLinePrompt": {
        "en": "What makes a good day at work or school?",
        "ko": "일이나 학교에서 좋은 하루란?"
      }
    },
    {
      "id": "work-school-02",
      "interest": "work_school",
      "version": 1,
      "title": "시험 끝",
      "steps": [
        {
          "speaker": "Julia",
          "line": {
            "en": "It's finally over! How did it go?",
            "ko": "드디어 끝났다! 어땠어?"
          },
          "options": [
            {
              "id": "a",
              "en": "Better than I thought.",
              "ko": "생각보다 괜찮았어."
            },
            {
              "id": "b",
              "en": "I don't want to talk about it!",
              "ko": "말하고 싶지 않아!"
            },
            {
              "id": "c",
              "en": "I wrote my name correctly. That's a start.",
              "ko": "이름은 제대로 썼어. 그게 시작이지."
            }
          ]
        },
        {
          "speaker": "Julia",
          "line": {
            "en": "Let's celebrate. What should we do?",
            "ko": "축하하자. 뭐 할까?"
          },
          "options": [
            {
              "id": "a",
              "en": "Eat chicken and drink cola!",
              "ko": "치킨에 콜라!"
            },
            {
              "id": "b",
              "en": "Sleep for twelve hours.",
              "ko": "12시간 자기."
            },
            {
              "id": "c",
              "en": "Go to karaoke and scream!",
              "ko": "노래방 가서 소리 지르기!"
            }
          ]
        }
      ],
      "intro": {
        "en": "You and your classmate Julia just finished a big exam.",
        "ko": "당신과 반 친구 Julia가 큰 시험을 막 끝냈어요."
      },
      "ending": {
        "en": "You promise to study earlier next time. You both know that's a lie.",
        "ko": "다음엔 미리 공부하자고 약속해요. 둘 다 그게 거짓말인 걸 알아요."
      },
      "myLinePrompt": {
        "en": "How do you reward yourself after a hard day?",
        "ko": "힘든 하루 끝에 나에게 주는 보상은?"
      }
    }
  ];
})();
