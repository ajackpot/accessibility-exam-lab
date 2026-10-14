/** Independently reviewed regular.1 display-only equivalences.
 * Exact authored source matching, including unchanged future carry-forward; no rewriting of bank, snapshots, keys or exports.
 * Each retained paragraph is one complete original field, never generated text. */
export const REVIEWED_OPTION_EXPLANATIONS = [
  {
    "sourceBankVersion": "2026.10.02-regular.1",
    "bankSchemaVersion": 3,
    "originalQuestion": {
      "questionId": "r001-internet-html-w01",
      "revision": 1,
      "templateId": "r001-internet-html-t-w01",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s2",
      "topicIds": [
        "r001-internet-html-topic-http-roles"
      ],
      "stem": "브라우저가 웹 페이지를 요청하고 웹 서버 프로그램이 그 요청에 응답하는 연결에서, HTTP 클라이언트와 서버의 역할을 바르게 설명한 것을 고르시오.",
      "notes": [],
      "explanation": "HTTP의 클라이언트와 서버는 해당 연결에서 수행하는 역할이다. 이 연결에서는 브라우저가 요청을 보내는 클라이언트, 웹 서버 프로그램이 응답하는 서버이다.",
      "sourceRefs": [
        "r001-internet-html-src01",
        "r001-internet-html-src26"
      ],
      "verificationStatus": "published",
      "testOnly": false,
      "contentStage": "regular",
      "standardVersion": "RFC 9110 (2022)",
      "difficulty": "기초",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "reviewNote": "자체 제작 비공식 일반 학습 문항. round-001 검토 1회차에서 독립 풀이·1차 출처·단일 정답/반례·문안/접근성·자동 구조 검사를 통과했다. 공개 판정과 근거: docs/rounds/round-001.json (r001-internet-html-w01, 개정 1)."
    },
    "correctOptionIds": [
      "r001-internet-html-w01-o01"
    ],
    "options": [
      {
        "original": {
          "optionId": "r001-internet-html-w01-o05",
          "revision": 1,
          "content": "프로그램의 역할은 요청과 응답이 아니라 컴퓨터의 크기로 정한다.",
          "explanation": "HTTP의 클라이언트와 서버는 하드웨어 크기 분류가 아닌 프로그램의 역할이다.",
          "memberQuestionIds": [
            "r001-internet-html-w01"
          ],
          "contextExplanation": "컴퓨터 크기는 제시된 HTTP 연결의 요청·응답 역할을 결정하는 기준이 아니다.",
          "role": "distractor"
        },
        "displayField": "explanation",
        "reviewReason": "두 필드는 모두 컴퓨터 크기로 HTTP의 요청·응답 역할을 정할 수 없다고 설명한다. 기본 해설은 역할 구분의 기준까지 명시한다."
      }
    ]
  },
  {
    "sourceBankVersion": "2026.10.02-regular.1",
    "bankSchemaVersion": 3,
    "originalQuestion": {
      "questionId": "r001-internet-html-w02",
      "revision": 1,
      "templateId": "r001-internet-html-t-w02",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s2",
      "topicIds": [
        "r001-internet-html-topic-uri-query"
      ],
      "stem": "URL “https://catalog.example.org/books?tag=history#reading”에서 질의(query) 구성 요소의 값을 고르시오.",
      "notes": [],
      "explanation": "RFC 3986의 일반 문법에서 질의는 첫 ? 뒤에 시작하여 # 또는 URI 끝까지 이어진다. 따라서 이 URL의 질의 값은 tag=history이다.",
      "sourceRefs": [
        "r001-internet-html-src02",
        "r001-internet-html-src26"
      ],
      "verificationStatus": "published",
      "testOnly": false,
      "contentStage": "regular",
      "standardVersion": "RFC 3986 (2005)",
      "difficulty": "기초",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "reviewNote": "자체 제작 비공식 일반 학습 문항. round-001 검토 1회차에서 독립 풀이·1차 출처·단일 정답/반례·문안/접근성·자동 구조 검사를 통과했다. 공개 판정과 근거: docs/rounds/round-001.json (r001-internet-html-w02, 개정 1)."
    },
    "correctOptionIds": [
      "r001-internet-html-w02-o02"
    ],
    "options": [
      {
        "original": {
          "optionId": "r001-internet-html-w02-o02",
          "revision": 1,
          "content": "tag=history",
          "explanation": "물음표 뒤에서 # 앞까지의 부분이 질의 값이다.",
          "memberQuestionIds": [
            "r001-internet-html-w02"
          ],
          "contextExplanation": "제시된 URL에서 ? 다음부터 # 직전까지의 값이므로 질의에 해당한다.",
          "role": "correct"
        },
        "displayField": "explanation",
        "reviewReason": "두 필드는 같은 URL의 물음표 뒤부터 # 앞까지가 질의라는 경계를 재진술한다. 기본 해설에 이 경계가 온전히 남는다."
      }
    ]
  },
  {
    "sourceBankVersion": "2026.10.02-regular.1",
    "bankSchemaVersion": 3,
    "originalQuestion": {
      "questionId": "r001-internet-html-w04",
      "revision": 1,
      "templateId": "r001-internet-html-t-w04",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s2",
      "topicIds": [
        "r001-internet-html-topic-dns-cache"
      ],
      "stem": "DNS 자원 레코드에 있는 TTL의 기본 의미로 알맞은 것을 고르시오.",
      "notes": [
        "일반적인 DNS 자원 레코드 필드의 정의를 묻고, 장애 시 만료된 응답을 제공하는 확장 동작은 다루지 않는다."
      ],
      "explanation": "DNS 자원 레코드 TTL은 초 단위의 캐시 수명을 뜻한다. 도메인 등록 기간이나 페이지 표시 시간과 구분한다.",
      "sourceRefs": [
        "r001-internet-html-src03",
        "r001-internet-html-src26"
      ],
      "verificationStatus": "published",
      "testOnly": false,
      "contentStage": "regular",
      "standardVersion": "RFC 1034 (1987)",
      "difficulty": "기초",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "reviewNote": "자체 제작 비공식 일반 학습 문항. round-001 검토 1회차에서 독립 풀이·1차 출처·단일 정답/반례·문안/접근성·자동 구조 검사를 통과했다. 공개 판정과 근거: docs/rounds/round-001.json (r001-internet-html-w04, 개정 1)."
    },
    "correctOptionIds": [
      "r001-internet-html-w04-o03"
    ],
    "options": [
      {
        "original": {
          "optionId": "r001-internet-html-w04-o01",
          "revision": 1,
          "content": "도메인 등록 계약의 남은 기간",
          "explanation": "도메인 등록 계약 기간과 DNS 자원 레코드의 캐시 수명은 다른 개념이다.",
          "memberQuestionIds": [
            "r001-internet-html-w04"
          ],
          "contextExplanation": "TTL은 등록 계약의 만료일을 나타내는 필드가 아니다.",
          "role": "distractor"
        },
        "displayField": "explanation",
        "reviewReason": "기본 해설의 도메인 등록 기간과 DNS 캐시 수명이 다르다는 이유를 맥락 필드가 등록 만료일이 아니라는 말로 되풀이한다."
      },
      {
        "original": {
          "optionId": "r001-internet-html-w04-o02",
          "revision": 1,
          "content": "DNS 서버에 연결할 수 있는 최대 사용자 수",
          "explanation": "동시 사용자 수는 자원 레코드 TTL의 의미가 아니다.",
          "memberQuestionIds": [
            "r001-internet-html-w04"
          ],
          "contextExplanation": "TTL은 연결 수나 사용자의 수를 제한하는 값이 아니다.",
          "role": "distractor"
        },
        "displayField": "explanation",
        "reviewReason": "두 필드는 DNS 자원 레코드 TTL이 사용자·연결 수가 아님을 반복한다."
      },
      {
        "original": {
          "optionId": "r001-internet-html-w04-o03",
          "revision": 1,
          "content": "해당 자원 레코드를 캐시에 보관할 수 있는 수명",
          "explanation": "DNS 자원 레코드의 TTL은 초 단위로 주어지는 캐시 수명이다.",
          "memberQuestionIds": [
            "r001-internet-html-w04"
          ],
          "contextExplanation": "자원 레코드 캐시가 정보를 얼마나 오래 보관할지 판단하는 기본 수명을 나타내므로 맞다.",
          "role": "correct"
        },
        "displayField": "explanation",
        "reviewReason": "맥락 필드는 DNS 레코드 캐시 수명이라는 정의를 재진술하며, 기본 해설은 초 단위라는 정보도 보존한다."
      },
      {
        "original": {
          "optionId": "r001-internet-html-w04-o04",
          "revision": 1,
          "content": "웹 페이지를 화면에 표시하는 데 걸린 시간",
          "explanation": "페이지 표시 시간은 DNS 자원 레코드의 TTL과 다르다.",
          "memberQuestionIds": [
            "r001-internet-html-w04"
          ],
          "contextExplanation": "TTL은 웹 페이지 렌더링을 측정한 결과가 아니다.",
          "role": "distractor"
        },
        "displayField": "explanation",
        "reviewReason": "두 필드는 DNS TTL과 웹 페이지 표시·렌더링 시간이 다르다는 같은 이유다."
      },
      {
        "original": {
          "optionId": "r001-internet-html-w04-o05",
          "revision": 1,
          "content": "한 IP 패킷이 통과할 수 있는 라우터 수",
          "explanation": "IP 패킷의 수명·홉 제한과 DNS 레코드 TTL은 별개의 계층에 있는 값이다.",
          "memberQuestionIds": [
            "r001-internet-html-w04"
          ],
          "contextExplanation": "질문은 DNS 자원 레코드의 TTL이므로 IP 패킷 전달 제한의 설명은 맞지 않는다.",
          "role": "distractor"
        },
        "displayField": "explanation",
        "reviewReason": "두 필드는 IP 패킷의 수명·홉 제한과 DNS 자원 레코드의 TTL을 구별한다. 기본 해설이 계층 차이도 남긴다."
      }
    ]
  },
  {
    "sourceBankVersion": "2026.10.02-regular.1",
    "bankSchemaVersion": 3,
    "originalQuestion": {
      "questionId": "r001-internet-html-w05",
      "revision": 1,
      "templateId": "r001-internet-html-t-w05",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s2",
      "topicIds": [
        "r001-internet-html-topic-ipv6-length"
      ],
      "stem": "축약 표기 여부와 관계없이 IPv6 주소 하나의 길이로 알맞은 것을 고르시오.",
      "notes": [],
      "explanation": "IPv6 주소는 128비트 식별자이다. 표기상 연속된 0을 줄이는 방식은 주소 자체의 비트 길이를 줄이지 않는다.",
      "sourceRefs": [
        "r001-internet-html-src04",
        "r001-internet-html-src26"
      ],
      "verificationStatus": "published",
      "testOnly": false,
      "contentStage": "regular",
      "standardVersion": "RFC 4291 (2006)",
      "difficulty": "기초",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "reviewNote": "자체 제작 비공식 일반 학습 문항. round-001 검토 1회차에서 독립 풀이·1차 출처·단일 정답/반례·문안/접근성·자동 구조 검사를 통과했다. 공개 판정과 근거: docs/rounds/round-001.json (r001-internet-html-w05, 개정 1)."
    },
    "correctOptionIds": [
      "r001-internet-html-w05-o05"
    ],
    "options": [
      {
        "original": {
          "optionId": "r001-internet-html-w05-o01",
          "revision": 1,
          "content": "16비트",
          "explanation": "주소 전체 길이를 나타내는 후보 값이다.",
          "memberQuestionIds": [
            "r001-internet-html-w05"
          ],
          "contextExplanation": "IPv6 주소 전체는 128비트이므로 16비트는 맞지 않는다.",
          "role": "distractor"
        },
        "displayField": "contextExplanation",
        "reviewReason": "기본 해설은 네 오답 모두에 똑같이 붙은 ‘주소 전체 길이를 나타내는 후보 값’이라는 비정보성 설명이다. 해당 문항의 IPv6 길이 판정 이유를 담은 기존 맥락 해설 전체를 보존한다."
      },
      {
        "original": {
          "optionId": "r001-internet-html-w05-o02",
          "revision": 1,
          "content": "32비트",
          "explanation": "주소 전체 길이를 나타내는 후보 값이다.",
          "memberQuestionIds": [
            "r001-internet-html-w05"
          ],
          "contextExplanation": "IPv6 주소 전체는 128비트이므로 32비트는 맞지 않는다.",
          "role": "distractor"
        },
        "displayField": "contextExplanation",
        "reviewReason": "기본 해설은 네 오답 모두에 똑같이 붙은 ‘주소 전체 길이를 나타내는 후보 값’이라는 비정보성 설명이다. 해당 문항의 IPv6 길이 판정 이유를 담은 기존 맥락 해설 전체를 보존한다."
      },
      {
        "original": {
          "optionId": "r001-internet-html-w05-o03",
          "revision": 1,
          "content": "64비트",
          "explanation": "주소 전체 길이를 나타내는 후보 값이다.",
          "memberQuestionIds": [
            "r001-internet-html-w05"
          ],
          "contextExplanation": "IPv6 주소의 일부 구성을 주소 전체 길이와 혼동해서는 안 되며 전체는 128비트이다.",
          "role": "distractor"
        },
        "displayField": "contextExplanation",
        "reviewReason": "기본 해설은 네 오답 모두에 똑같이 붙은 ‘주소 전체 길이를 나타내는 후보 값’이라는 비정보성 설명이다. 해당 문항의 IPv6 길이 판정 이유를 담은 기존 맥락 해설 전체를 보존한다."
      },
      {
        "original": {
          "optionId": "r001-internet-html-w05-o04",
          "revision": 1,
          "content": "256비트",
          "explanation": "주소 전체 길이를 나타내는 후보 값이다.",
          "memberQuestionIds": [
            "r001-internet-html-w05"
          ],
          "contextExplanation": "IPv6 주소 전체 길이의 두 배이므로 맞지 않는다.",
          "role": "distractor"
        },
        "displayField": "contextExplanation",
        "reviewReason": "기본 해설은 네 오답 모두에 똑같이 붙은 ‘주소 전체 길이를 나타내는 후보 값’이라는 비정보성 설명이다. 해당 문항의 IPv6 길이 판정 이유를 담은 기존 맥락 해설 전체를 보존한다."
      }
    ]
  },
  {
    "sourceBankVersion": "2026.10.02-regular.1",
    "bankSchemaVersion": 3,
    "originalQuestion": {
      "questionId": "r001-internet-html-w06",
      "revision": 1,
      "templateId": "r001-internet-html-t-w06",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s2",
      "topicIds": [
        "r001-internet-html-topic-http-get"
      ],
      "stem": "서버의 자원을 변경하도록 요청하지 않고, 지정한 자원의 현재 선택된 표현을 응답 콘텐츠로 받아 오려는 경우에 해당하는 HTTP 메서드를 고르시오.",
      "notes": [
        "서버에 실제로 어떤 부수 효과가 구현되어 있는지가 아니라 메서드가 정의하는 요청 의미를 묻는다."
      ],
      "explanation": "GET은 대상 자원의 현재 선택된 표현을 요청하는 메서드이다. HEAD는 응답 콘텐츠를 전송하지 않으며 POST·PUT·DELETE는 서로 다른 요청 의미를 가진다.",
      "sourceRefs": [
        "r001-internet-html-src05",
        "r001-internet-html-src26"
      ],
      "verificationStatus": "published",
      "testOnly": false,
      "contentStage": "regular",
      "standardVersion": "RFC 9110 (2022)",
      "difficulty": "기초",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "reviewNote": "자체 제작 비공식 일반 학습 문항. round-001 검토 1회차에서 독립 풀이·1차 출처·단일 정답/반례·문안/접근성·자동 구조 검사를 통과했다. 공개 판정과 근거: docs/rounds/round-001.json (r001-internet-html-w06, 개정 1)."
    },
    "correctOptionIds": [
      "r001-internet-html-w06-o03"
    ],
    "options": [
      {
        "original": {
          "optionId": "r001-internet-html-w06-o03",
          "revision": 1,
          "content": "GET",
          "explanation": "대상 자원의 현재 선택된 표현 전송을 요청한다.",
          "memberQuestionIds": [
            "r001-internet-html-w06"
          ],
          "contextExplanation": "제시된 조회 목적은 GET의 표준 의미와 일치한다.",
          "role": "correct"
        },
        "displayField": "explanation",
        "reviewReason": "기본 해설은 GET의 표현 전송 요청을 설명한다. 맥락은 현재 조회 목적과 일치한다는 판정만 되풀이한다."
      }
    ]
  },
  {
    "sourceBankVersion": "2026.10.02-regular.1",
    "bankSchemaVersion": 3,
    "originalQuestion": {
      "questionId": "r001-internet-html-w08",
      "revision": 1,
      "templateId": "r001-internet-html-t-w08",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s2",
      "topicIds": [
        "r001-internet-html-topic-https-protection"
      ],
      "stem": "인증서 검증을 포함한 HTTPS 연결이 정상적으로 수립되었을 때, TLS가 제공하는 보호를 바르게 설명한 것을 고르시오.",
      "notes": [],
      "explanation": "HTTPS에서 TLS는 검증된 통신 상대와의 통신에 기밀성·무결성 보호를 제공한다. 콘텐츠의 진실성, 서버 내부 처리나 사용자 기기의 안전 전체를 보증하는 것은 아니다.",
      "sourceRefs": [
        "r001-internet-html-src07",
        "r001-internet-html-src08",
        "r001-internet-html-src26"
      ],
      "verificationStatus": "published",
      "testOnly": false,
      "contentStage": "regular",
      "standardVersion": "RFC 8446 (2018) / RFC 9110 (2022)",
      "difficulty": "기초",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "reviewNote": "자체 제작 비공식 일반 학습 문항. round-001 검토 1회차에서 독립 풀이·1차 출처·단일 정답/반례·문안/접근성·자동 구조 검사를 통과했다. 공개 판정과 근거: docs/rounds/round-001.json (r001-internet-html-w08, 개정 1)."
    },
    "correctOptionIds": [
      "r001-internet-html-w08-o01"
    ],
    "options": [
      {
        "original": {
          "optionId": "r001-internet-html-w08-o02",
          "revision": 1,
          "content": "해당 웹 페이지에 실린 모든 정보가 사실임을 보증한다.",
          "explanation": "통신 데이터의 보호와 콘텐츠의 사실 여부는 별개의 판단이다.",
          "memberQuestionIds": [
            "r001-internet-html-w08"
          ],
          "contextExplanation": "TLS는 전송을 보호하며 페이지 주장의 진실성을 보증하는 규격이 아니다.",
          "role": "distractor"
        },
        "displayField": "explanation",
        "reviewReason": "두 필드는 전송 데이터 보호가 페이지 내용의 진실성을 보증하지 않는다는 같은 구별이다."
      },
      {
        "original": {
          "optionId": "r001-internet-html-w08-o04",
          "revision": 1,
          "content": "사용자 기기에 설치된 모든 악성 프로그램을 제거한다.",
          "explanation": "TLS는 악성 프로그램 제거 기능을 정의하는 규격이 아니다.",
          "memberQuestionIds": [
            "r001-internet-html-w08"
          ],
          "contextExplanation": "암호화된 통신 채널을 수립하는 보호와 기기 치료는 다르다.",
          "role": "distractor"
        },
        "displayField": "explanation",
        "reviewReason": "기본 해설은 TLS가 악성 프로그램 제거 규격이 아니라고 설명한다. 맥락의 통신 보호와 기기 치료 구별은 새 조건을 더하지 않는다."
      },
      {
        "original": {
          "optionId": "r001-internet-html-w08-o05",
          "revision": 1,
          "content": "이용자가 선택한 비밀번호가 다른 서비스에서 재사용되는 것을 막는다.",
          "explanation": "TLS는 다른 서비스에서의 비밀번호 사용 정책을 통제하지 않는다.",
          "memberQuestionIds": [
            "r001-internet-html-w08"
          ],
          "contextExplanation": "전송 보호만으로 사용자의 비밀번호 재사용을 막을 수 없다.",
          "role": "distractor"
        },
        "displayField": "explanation",
        "reviewReason": "두 필드는 TLS가 다른 서비스의 비밀번호 재사용을 통제할 수 없다는 같은 이유다."
      }
    ]
  },
  {
    "sourceBankVersion": "2026.10.02-regular.1",
    "bankSchemaVersion": 3,
    "originalQuestion": {
      "questionId": "r001-internet-html-w10",
      "revision": 1,
      "templateId": "r001-internet-html-t-w10",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s2",
      "topicIds": [
        "r001-internet-html-topic-smtp-transfer"
      ],
      "stem": "전자우편 서버가 다른 전자우편 서버로 메시지를 전달하거나 중계할 때 사용하는 기본 프로토콜을 고르시오.",
      "notes": [],
      "explanation": "SMTP는 전자우편을 서버 사이에서 전송·중계한다. IMAP은 서버의 메일함 접근, DNS는 전달할 서버 정보의 조회 등에 쓰이며 메시지 중계와 구분된다.",
      "sourceRefs": [
        "r001-internet-html-src10",
        "r001-internet-html-src11",
        "r001-internet-html-src12",
        "r001-internet-html-src01",
        "r001-internet-html-src03",
        "r001-internet-html-src26"
      ],
      "verificationStatus": "published",
      "testOnly": false,
      "contentStage": "regular",
      "standardVersion": "RFC 5321 (2008) / RFC 9051 (2021)",
      "difficulty": "기초",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "reviewNote": "자체 제작 비공식 일반 학습 문항. round-001 검토 1회차에서 독립 풀이·1차 출처·단일 정답/반례·문안/접근성·자동 구조 검사를 통과했다. 공개 판정과 근거: docs/rounds/round-001.json (r001-internet-html-w10, 개정 1)."
    },
    "correctOptionIds": [
      "r001-internet-html-w10-o03"
    ],
    "options": [
      {
        "original": {
          "optionId": "r001-internet-html-w10-o03",
          "revision": 1,
          "content": "SMTP",
          "explanation": "전자우편 메시지의 전송과 중계를 수행하는 프로토콜이다.",
          "memberQuestionIds": [
            "r001-internet-html-w10"
          ],
          "contextExplanation": "제시된 메일 서버 간 전달·중계의 목적에 맞다.",
          "role": "correct"
        },
        "displayField": "explanation",
        "reviewReason": "기본 해설은 SMTP의 전자우편 전송·중계 기능을 명시한다. 맥락은 질문 목적에 맞다는 판정만 추가한다."
      }
    ]
  },
  {
    "sourceBankVersion": "2026.10.02-regular.1",
    "bankSchemaVersion": 3,
    "originalQuestion": {
      "questionId": "r001-internet-html-w14",
      "revision": 1,
      "templateId": "r001-internet-html-t-w14",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s3",
      "topicIds": [
        "r001-internet-html-topic-html-orderedlist"
      ],
      "stem": "작업 절차에서 항목의 순서를 바꾸면 안내의 의미가 달라지는 목록을 HTML로 표현하려 할 때 알맞은 요소를 고르시오.",
      "notes": [],
      "explanation": "ol은 항목 순서가 의미에 영향을 주는 목록이다. 화면에 숫자를 장식으로 붙이는 것과 목록 의미를 마크업으로 전달하는 것은 구분한다.",
      "sourceRefs": [
        "r001-internet-html-src15",
        "r001-internet-html-src26"
      ],
      "verificationStatus": "published",
      "testOnly": false,
      "contentStage": "regular",
      "standardVersion": "HTML 5.2 (2017-12-14)",
      "difficulty": "기초",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "reviewNote": "자체 제작 비공식 일반 학습 문항. round-001 검토 1회차에서 독립 풀이·1차 출처·단일 정답/반례·문안/접근성·자동 구조 검사를 통과했다. 공개 판정과 근거: docs/rounds/round-001.json (r001-internet-html-w14, 개정 1)."
    },
    "correctOptionIds": [
      "r001-internet-html-w14-o05"
    ],
    "options": [
      {
        "original": {
          "optionId": "r001-internet-html-w14-o05",
          "revision": 1,
          "content": "ol",
          "explanation": "순서가 의미에 영향을 주도록 의도된 항목 목록을 나타낸다.",
          "memberQuestionIds": [
            "r001-internet-html-w14"
          ],
          "contextExplanation": "작업 절차의 순서가 의미를 가진다는 조건에 맞다.",
          "role": "correct"
        },
        "displayField": "explanation",
        "reviewReason": "기본 해설은 ol의 순서가 의미에 영향을 준다는 정의다. 맥락은 작업 순서가 의미를 가진다는 질문 조건을 되풀이한다."
      }
    ]
  },
  {
    "sourceBankVersion": "2026.10.02-regular.1",
    "bankSchemaVersion": 3,
    "originalQuestion": {
      "questionId": "r001-internet-html-w15",
      "revision": 1,
      "templateId": "r001-internet-html-t-w15",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s3",
      "topicIds": [
        "r001-internet-html-topic-html-strong"
      ],
      "stem": "“기록을 삭제하기 전에 반드시 사본을 보관하세요”라는 경고의 중요성과 심각성을 HTML 의미로 나타내기에 가장 알맞은 요소를 고르시오.",
      "notes": [],
      "explanation": "strong은 중요성·심각성·긴급성을 전달한다. 시각적으로 굵게 보이는지와 별개로, b·em·small·mark는 각기 다른 의미를 갖는다.",
      "sourceRefs": [
        "r001-internet-html-src16",
        "r001-internet-html-src26"
      ],
      "verificationStatus": "published",
      "testOnly": false,
      "contentStage": "regular",
      "standardVersion": "HTML 5.2 (2017-12-14)",
      "difficulty": "기초",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "reviewNote": "자체 제작 비공식 일반 학습 문항. round-001 검토 1회차에서 독립 풀이·1차 출처·단일 정답/반례·문안/접근성·자동 구조 검사를 통과했다. 공개 판정과 근거: docs/rounds/round-001.json (r001-internet-html-w15, 개정 1)."
    },
    "correctOptionIds": [
      "r001-internet-html-w15-o03"
    ],
    "options": [
      {
        "original": {
          "optionId": "r001-internet-html-w15-o03",
          "revision": 1,
          "content": "strong",
          "explanation": "내용의 중요성·심각성·긴급성을 나타낸다.",
          "memberQuestionIds": [
            "r001-internet-html-w15"
          ],
          "contextExplanation": "경고의 중요성과 심각성을 표시하려는 목적과 일치한다.",
          "role": "correct"
        },
        "displayField": "explanation",
        "reviewReason": "기본 해설은 strong의 중요성·심각성·긴급성을 모두 보존한다. 맥락은 그중 중요성과 심각성이 질문 목적과 일치한다는 판정만 더한다."
      }
    ]
  },
  {
    "sourceBankVersion": "2026.10.02-regular.1",
    "bankSchemaVersion": 3,
    "originalQuestion": {
      "questionId": "r001-internet-html-w20",
      "revision": 1,
      "templateId": "r001-internet-html-t-w20",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s3",
      "topicIds": [
        "r001-internet-html-topic-html-details"
      ],
      "stem": "다음 보기의 코드를 읽고, 추가 안내를 펼치고 접는 details 요소의 요약 제목을 제공하도록 빈칸 A에 넣을 요소 이름을 고르시오.",
      "notes": [],
      "explanation": "details는 추가 정보를 공개하는 위젯이며 첫 summary 자식이 요약 제목을 제공한다. summary의 활성화는 부모 details의 open 상태를 바꾼다.",
      "sourceRefs": [
        "r001-internet-html-src20",
        "r001-internet-html-src17",
        "r001-internet-html-src18",
        "r001-internet-html-src13",
        "r001-internet-html-src14",
        "r001-internet-html-src26"
      ],
      "verificationStatus": "published",
      "testOnly": false,
      "contentStage": "regular",
      "standardVersion": "HTML 5.2 (2017-12-14)",
      "difficulty": "적용",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": [
        {
          "filename": "w20.html",
          "content": "<details>\n  <A>현장 방문 전 확인 사항</A>\n  <p>예약한 시간보다 10분 일찍 안내 데스크에 도착하세요.</p>\n</details>",
          "purpose": "question",
          "instruction": "다음 보기의 코드를 읽고, 추가 안내를 펼치고 접는 details 요소의 요약 제목을 제공하도록 빈칸 A에 넣을 요소 이름을 고르시오."
        }
      ],
      "reviewNote": "자체 제작 비공식 일반 학습 문항. round-001 검토 1회차에서 독립 풀이·1차 출처·단일 정답/반례·문안/접근성·자동 구조 검사를 통과했다. 공개 판정과 근거: docs/rounds/round-001.json (r001-internet-html-w20, 개정 1)."
    },
    "correctOptionIds": [
      "r001-internet-html-w20-o01"
    ],
    "options": [
      {
        "original": {
          "optionId": "r001-internet-html-w20-o01",
          "revision": 1,
          "content": "summary",
          "explanation": "부모 details의 첫 자식으로 요약이나 이름을 제공한다.",
          "memberQuestionIds": [
            "r001-internet-html-w20"
          ],
          "contextExplanation": "추가 안내를 여닫는 위젯의 요약 제목을 제공하려는 조건에 맞다.",
          "role": "correct"
        },
        "displayField": "explanation",
        "reviewReason": "기본 해설은 summary의 details 첫 자식 위치와 요약·이름 기능을 보존한다. 맥락은 위젯의 요약 제목이라는 목적에 맞다는 판정만 더한다."
      }
    ]
  }
];
