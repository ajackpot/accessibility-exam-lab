/** Written-only compatibility data projected for the service runtime. Internal source tables remain immutable. */
export const LEGACY_QUESTION_DISPLAYS = [
  {
    "bankVersion": "2026.10.02-seed.1",
    "original": {
      "questionId": "seed-w01",
      "revision": 1,
      "templateId": "seed-w01-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s1",
      "topicIds": [
        "seed-w01"
      ],
      "stem": "KWCAG 2.2에서 일반적인 저장 기능을 키보드만으로도 실행할 수 있게 만드는 요구와 직접 연결되는 원칙은 무엇인가?",
      "explanation": "키보드 사용 보장은 운용의 용이성의 입력장치 접근성 지침에 속한다. 일반 저장 버튼은 커서의 이동 궤적 자체가 본질적인 예외 기능이 아니다.",
      "sourceRefs": [
        "kw-keyboard"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "KWCAG 2.2",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "KWCAG 2.2에서 저장 기능을 키보드만으로도 실행할 수 있게 하는 요구와 직접 연결되는 원칙을 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 1
  },
  {
    "bankVersion": "2026.10.02-seed.1",
    "original": {
      "questionId": "seed-w02",
      "revision": 1,
      "templateId": "seed-w02-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s1",
      "topicIds": [
        "seed-w02"
      ],
      "stem": "검토 목록은 각 항목 오른쪽에 같은 모양의 원을 표시하고, 초록 원은 완료, 빨간 원은 미완료라는 범례만 제공한다. 색에 관계없이 상태를 구별할 수 있게 하는 개선은 무엇인가?",
      "explanation": "동일한 모양에 색만 다른 상태는 색을 구분하기 어려운 환경에서 의미가 사라질 수 있다. 상태 텍스트를 함께 두면 색 외의 수단으로 구분할 수 있다.",
      "sourceRefs": [
        "kw-color"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "KWCAG 2.2",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "검토 목록은 각 항목 오른쪽의 같은 모양의 원으로 상태를 표시하고, 초록 원은 완료, 빨간 원은 미완료라는 범례만 제공한다. 색에 관계없이 상태를 구별할 수 있도록 개선한 방법을 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 1
  },
  {
    "bankVersion": "2026.10.02-seed.1",
    "original": {
      "questionId": "seed-w03",
      "revision": 1,
      "templateId": "seed-w03-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s2",
      "topicIds": [
        "seed-w03"
      ],
      "stem": "호스트 이름에 대응하는 IPv4 주소를 A 레코드로 조회하려 한다. 이 조회를 제공하는 이름 체계는 무엇인가?",
      "explanation": "DNS에서는 A 레코드로 호스트 이름에 대응하는 IPv4 주소를 조회한다. DNS의 역할이 주소 변환 한 가지로만 제한되는 것은 아니다.",
      "sourceRefs": [
        "dns",
        "http",
        "html52",
        "css-definition",
        "js"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "RFC 1034 / RFC 9110",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "shared",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "호스트 이름에 대응하는 IPv4 주소를 A 레코드로 조회할 때 사용하는 이름 체계를 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 1
  },
  {
    "bankVersion": "2026.10.02-seed.1",
    "original": {
      "questionId": "seed-w04",
      "revision": 1,
      "templateId": "seed-w04-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s2",
      "topicIds": [
        "seed-w04"
      ],
      "stem": "브라우저가 서버에 GET 요청을 보내고 서버가 상태 코드와 문서 데이터를 포함한 응답을 돌려주는 통신을 한다. 이 요청·응답의 의미를 정의하는 웹 프로토콜은 무엇인가?",
      "explanation": "HTTP는 GET 같은 요청 메서드와 응답 상태 코드의 의미를 정의한다. DNS는 이름 조회라는 다른 역할을 한다.",
      "sourceRefs": [
        "dns",
        "http",
        "html52",
        "css-definition",
        "js"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "RFC 1034 / RFC 9110",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "shared",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "브라우저가 GET 요청을 보내면 서버가 상태 코드와 문서 데이터가 담긴 응답을 돌려준다. 이 요청과 응답의 의미를 정의하는 웹 프로토콜을 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 1
  },
  {
    "bankVersion": "2026.10.02-seed.1",
    "original": {
      "questionId": "seed-w05",
      "revision": 1,
      "templateId": "seed-w05-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s3",
      "topicIds": [
        "seed-w05"
      ],
      "stem": "HTML 5.2 기준으로, label 요소의 for 속성으로 바로 뒤의 input 요소를 명시적으로 연결한다. for=\"ticket-email\"과 값이 같아야 하는 input의 속성은 무엇인가?",
      "explanation": "for와 id가 정확히 대응해야 한다. label과 input을 단지 나란히 놓거나 name만 맞추는 것으로 이 명시적 연결이 만들어지지 않는다.",
      "sourceRefs": [
        "html52-forms",
        "label-technique",
        "html52"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "HTML 5.2 (2017-12-14)",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": [
        {
          "filename": "label-example.html",
          "content": "<label for=\"ticket-email\">알림 받을 이메일</label>\n<input type=\"email\" id=\"ticket-email\" name=\"email\">"
        }
      ]
    },
    "display": {
      "stem": "HTML 5.2 기준으로, label 요소의 for 속성값이 \"ticket-email\"일 때 명시적으로 연결할 input 요소에서 같은 값을 가져야 하는 속성을 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 1
  },
  {
    "bankVersion": "2026.10.02-seed.1",
    "original": {
      "questionId": "seed-w06",
      "revision": 1,
      "templateId": "seed-w06-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s3",
      "topicIds": [
        "seed-w06"
      ],
      "stem": "WAI-ARIA 1.2에서, 누를 때마다 켜짐과 꺼짐을 전환하는 “즐겨찾기” 버튼의 현재 눌림 상태를 나타내는 속성은 무엇인가? 버튼의 이름은 두 상태 모두 “즐겨찾기”로 유지한다.",
      "explanation": "토글 버튼의 눌림 상태에는 aria-pressed를 사용한다. ARIA는 의미와 상태를 전달하며, 그 속성만으로 클릭 처리나 상태 전환 코드가 자동 생성되지는 않는다.",
      "sourceRefs": [
        "aria"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "WAI-ARIA 1.2",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "WAI-ARIA 1.2를 기준으로, 누를 때마다 켜짐과 꺼짐을 전환하는 “즐겨찾기” 버튼의 현재 눌림 상태를 나타내는 속성을 고르시오.",
      "notes": [
        "버튼의 이름은 두 상태 모두 “즐겨찾기”로 유지한다."
      ]
    },
    "bankSchemaVersion": 1
  },
  {
    "bankVersion": "2026.10.02-seed.1",
    "original": {
      "questionId": "seed-w07",
      "revision": 1,
      "templateId": "seed-w07-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s4",
      "topicIds": [
        "seed-w07"
      ],
      "stem": "CSS 2.2의 명시도 규칙으로 제시된 p 요소에 적용되는 color 값은 무엇인가? 아래 다섯 선언만 경쟁하며 모두 작성자 일반 선언이다. style 속성, !important, 사용자 스타일, 애니메이션·전환은 없고 모두 같은 매체 조건에 적용된다.",
      "explanation": "동일 출처·중요도 조건에서 #notice의 ID 계수가 우선하므로 navy가 적용된다. 선언 순서는 명시도까지 같은 경우에 비교한다. CSS 2.2 문서는 초안이다.",
      "sourceRefs": [
        "css"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "CSS 2.2 Working Draft",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": [
        {
          "filename": "specificity.html",
          "content": "<div><p id=\"notice\" class=\"note\">접수 안내</p></div>\n<style>\n  p { color: black; }\n  .note { color: green; }\n  #notice { color: navy; }\n  div p.note { color: red; }\n  * { color: orange; }\n</style>"
        }
      ]
    },
    "display": {
      "stem": "다음 보기의 코드를 읽고, CSS 2.2의 명시도 규칙으로 제시된 p 요소에 적용되는 color 값을 고르시오.",
      "notes": [
        "보기의 다섯 선언만 경쟁하며 모두 작성자 일반 선언이다.",
        "style 속성, !important, 사용자 스타일, 애니메이션·전환은 없고 모두 같은 매체 조건에 적용된다."
      ]
    },
    "bankSchemaVersion": 1
  },
  {
    "bankVersion": "2026.10.02-seed.1",
    "original": {
      "questionId": "seed-w08",
      "revision": 1,
      "templateId": "seed-w08-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s4",
      "topicIds": [
        "seed-w08"
      ],
      "stem": "표준 JavaScript에서 아래 세 문장을 순서대로 한 번 실행한 직후 count의 숫자 값은 무엇인가? 모든 값은 Number이며 다른 코드의 개입은 없다.",
      "explanation": "우변의 3 * 2는 6이다. count += 6은 이 숫자 변수에 대해 count = count + 6과 같은 결과를 내므로 8이다.",
      "sourceRefs": [
        "js"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "JavaScript Number / += / *",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": [
        {
          "filename": "calculation.js",
          "content": "let count = 2;\nconst step = 3;\ncount += step * 2;"
        }
      ]
    },
    "display": {
      "stem": "다음 보기의 JavaScript 코드 세 문장을 순서대로 한 번 실행한 직후 count의 숫자 값을 고르시오.",
      "notes": [
        "표준 JavaScript를 기준으로 하며, 모든 값은 Number이고 다른 코드의 개입은 없다."
      ]
    },
    "bankSchemaVersion": 1
  },
  {
    "bankVersion": "2026.10.02-seed.1",
    "original": {
      "questionId": "seed-w09",
      "revision": 1,
      "templateId": "seed-w09-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s5",
      "topicIds": [
        "seed-w09"
      ],
      "stem": "웹 페이지의 텍스트와 조작 요소 정보를 음성으로 듣고 탐색하려는 사용자에게 해당 역할을 수행하는 대표적인 보조기술은 무엇인가?",
      "explanation": "화면 낭독기는 웹 콘텐츠를 읽고 탐색하도록 돕는다. 한 사용자가 화면 낭독기, 확대기, 입력 보조기술을 함께 쓸 수도 있으며 장애 유형만으로 도구 사용을 단정해서는 안 된다.",
      "sourceRefs": [
        "at"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "W3C WAI 보조기술 개요",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "웹 페이지의 텍스트와 조작 요소 정보를 음성으로 듣고 탐색할 때 사용하는 대표적인 보조기술을 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 1
  },
  {
    "bankVersion": "2026.10.02-seed.1",
    "original": {
      "questionId": "seed-w10",
      "revision": 1,
      "templateId": "seed-w10-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s5",
      "topicIds": [
        "seed-w10"
      ],
      "stem": "한 자동 접근성 검사 도구가 제시한 오류가 0개였다. 이 결과를 해석한 설명으로 가장 적절한 것은 무엇인가?",
      "explanation": "오류 0개는 그 도구의 검사에서 오류가 보고되지 않았다는 뜻이다. 자동 결과를 근거로 접근성 전체를 보장하지 않으며 사람의 판단과 수동 점검을 결합한다.",
      "sourceRefs": [
        "evaluation"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "W3C WAI 평가 방법",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "자동 접근성 검사 도구가 제시한 오류가 0개였다. 이 결과를 해석한 설명으로 가장 적절한 것을 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 1
  },
  {
    "bankVersion": "2026.10.02-seed.2",
    "original": {
      "questionId": "seed-w01",
      "revision": 1,
      "templateId": "seed-w01-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s1",
      "topicIds": [
        "seed-w01"
      ],
      "stem": "KWCAG 2.2에서 일반적인 저장 기능을 키보드만으로도 실행할 수 있게 만드는 요구와 직접 연결되는 원칙은 무엇인가?",
      "explanation": "키보드 사용 보장은 운용의 용이성의 입력장치 접근성 지침에 속한다. 일반 저장 버튼은 커서의 이동 궤적 자체가 본질적인 예외 기능이 아니다.",
      "sourceRefs": [
        "kw-keyboard"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "KWCAG 2.2",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "KWCAG 2.2에서 저장 기능을 키보드만으로도 실행할 수 있게 하는 요구와 직접 연결되는 원칙을 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 2
  },
  {
    "bankVersion": "2026.10.02-seed.2",
    "original": {
      "questionId": "seed-w02",
      "revision": 1,
      "templateId": "seed-w02-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s1",
      "topicIds": [
        "seed-w02"
      ],
      "stem": "검토 목록은 각 항목 오른쪽에 같은 모양의 원을 표시하고, 초록 원은 완료, 빨간 원은 미완료라는 범례만 제공한다. 색에 관계없이 상태를 구별할 수 있게 하는 개선은 무엇인가?",
      "explanation": "동일한 모양에 색만 다른 상태는 색을 구분하기 어려운 환경에서 의미가 사라질 수 있다. 상태 텍스트를 함께 두면 색 외의 수단으로 구분할 수 있다.",
      "sourceRefs": [
        "kw-color"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "KWCAG 2.2",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "검토 목록은 각 항목 오른쪽의 같은 모양의 원으로 상태를 표시하고, 초록 원은 완료, 빨간 원은 미완료라는 범례만 제공한다. 색에 관계없이 상태를 구별할 수 있도록 개선한 방법을 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 2
  },
  {
    "bankVersion": "2026.10.02-seed.2",
    "original": {
      "questionId": "seed-w03",
      "revision": 1,
      "templateId": "seed-w03-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s2",
      "topicIds": [
        "seed-w03"
      ],
      "stem": "호스트 이름에 대응하는 IPv4 주소를 A 레코드로 조회하려 한다. 이 조회를 제공하는 이름 체계는 무엇인가?",
      "explanation": "DNS에서는 A 레코드로 호스트 이름에 대응하는 IPv4 주소를 조회한다. DNS의 역할이 주소 변환 한 가지로만 제한되는 것은 아니다.",
      "sourceRefs": [
        "dns",
        "http",
        "html52",
        "css-definition",
        "js"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "RFC 1034 / RFC 9110",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "shared",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "호스트 이름에 대응하는 IPv4 주소를 A 레코드로 조회할 때 사용하는 이름 체계를 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 2
  },
  {
    "bankVersion": "2026.10.02-seed.2",
    "original": {
      "questionId": "seed-w04",
      "revision": 1,
      "templateId": "seed-w04-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s2",
      "topicIds": [
        "seed-w04"
      ],
      "stem": "브라우저가 서버에 GET 요청을 보내고 서버가 상태 코드와 문서 데이터를 포함한 응답을 돌려주는 통신을 한다. 이 요청·응답의 의미를 정의하는 웹 프로토콜은 무엇인가?",
      "explanation": "HTTP는 GET 같은 요청 메서드와 응답 상태 코드의 의미를 정의한다. DNS는 이름 조회라는 다른 역할을 한다.",
      "sourceRefs": [
        "dns",
        "http",
        "html52",
        "css-definition",
        "js"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "RFC 1034 / RFC 9110",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "shared",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "브라우저가 GET 요청을 보내면 서버가 상태 코드와 문서 데이터가 담긴 응답을 돌려준다. 이 요청과 응답의 의미를 정의하는 웹 프로토콜을 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 2
  },
  {
    "bankVersion": "2026.10.02-seed.2",
    "original": {
      "questionId": "seed-w05",
      "revision": 2,
      "templateId": "seed-w05-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s3",
      "topicIds": [
        "seed-w05"
      ],
      "stem": "HTML 5.2 기준으로, label 요소의 for 속성으로 바로 뒤의 input 요소를 명시적으로 연결한다. for=\"ticket-email\"과 값이 같아야 하는 input의 속성은 무엇인가?",
      "explanation": "for와 id가 정확히 대응해야 한다. label과 input을 단지 나란히 놓거나 name만 맞추는 것으로 이 명시적 연결이 만들어지지 않는다.",
      "sourceRefs": [
        "html52-forms",
        "label-technique",
        "html52"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "HTML 5.2 (2017-12-14)",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다. 자료 역할 검토: 코드 읽기·미완성 구현·점검 자료는 question, label 완성 예시는 explanation으로 분류. 지문·정답·배점·학습 목표는 유지.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": [
        {
          "filename": "label-example.html",
          "content": "<label for=\"ticket-email\">알림 받을 이메일</label>\n<input type=\"email\" id=\"ticket-email\" name=\"email\">",
          "purpose": "explanation"
        }
      ]
    },
    "display": {
      "stem": "HTML 5.2 기준으로, label 요소의 for 속성값이 \"ticket-email\"일 때 명시적으로 연결할 input 요소에서 같은 값을 가져야 하는 속성을 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 2
  },
  {
    "bankVersion": "2026.10.02-seed.2",
    "original": {
      "questionId": "seed-w06",
      "revision": 1,
      "templateId": "seed-w06-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s3",
      "topicIds": [
        "seed-w06"
      ],
      "stem": "WAI-ARIA 1.2에서, 누를 때마다 켜짐과 꺼짐을 전환하는 “즐겨찾기” 버튼의 현재 눌림 상태를 나타내는 속성은 무엇인가? 버튼의 이름은 두 상태 모두 “즐겨찾기”로 유지한다.",
      "explanation": "토글 버튼의 눌림 상태에는 aria-pressed를 사용한다. ARIA는 의미와 상태를 전달하며, 그 속성만으로 클릭 처리나 상태 전환 코드가 자동 생성되지는 않는다.",
      "sourceRefs": [
        "aria"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "WAI-ARIA 1.2",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "WAI-ARIA 1.2를 기준으로, 누를 때마다 켜짐과 꺼짐을 전환하는 “즐겨찾기” 버튼의 현재 눌림 상태를 나타내는 속성을 고르시오.",
      "notes": [
        "버튼의 이름은 두 상태 모두 “즐겨찾기”로 유지한다."
      ]
    },
    "bankSchemaVersion": 2
  },
  {
    "bankVersion": "2026.10.02-seed.2",
    "original": {
      "questionId": "seed-w07",
      "revision": 2,
      "templateId": "seed-w07-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s4",
      "topicIds": [
        "seed-w07"
      ],
      "stem": "CSS 2.2의 명시도 규칙으로 제시된 p 요소에 적용되는 color 값은 무엇인가? 아래 다섯 선언만 경쟁하며 모두 작성자 일반 선언이다. style 속성, !important, 사용자 스타일, 애니메이션·전환은 없고 모두 같은 매체 조건에 적용된다.",
      "explanation": "동일 출처·중요도 조건에서 #notice의 ID 계수가 우선하므로 navy가 적용된다. 선언 순서는 명시도까지 같은 경우에 비교한다. CSS 2.2 문서는 초안이다.",
      "sourceRefs": [
        "css"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "CSS 2.2 Working Draft",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다. 자료 역할 검토: 코드 읽기·미완성 구현·점검 자료는 question, label 완성 예시는 explanation으로 분류. 지문·정답·배점·학습 목표는 유지.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": [
        {
          "filename": "specificity.html",
          "content": "<div><p id=\"notice\" class=\"note\">접수 안내</p></div>\n<style>\n  p { color: black; }\n  .note { color: green; }\n  #notice { color: navy; }\n  div p.note { color: red; }\n  * { color: orange; }\n</style>",
          "purpose": "question",
          "instruction": "아래 다섯 선언만 경쟁하며 모두 작성자 일반 선언이다."
        }
      ]
    },
    "display": {
      "stem": "다음 보기의 코드를 읽고, CSS 2.2의 명시도 규칙으로 제시된 p 요소에 적용되는 color 값을 고르시오.",
      "notes": [
        "보기의 다섯 선언만 경쟁하며 모두 작성자 일반 선언이다.",
        "style 속성, !important, 사용자 스타일, 애니메이션·전환은 없고 모두 같은 매체 조건에 적용된다."
      ]
    },
    "bankSchemaVersion": 2
  },
  {
    "bankVersion": "2026.10.02-seed.2",
    "original": {
      "questionId": "seed-w08",
      "revision": 2,
      "templateId": "seed-w08-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s4",
      "topicIds": [
        "seed-w08"
      ],
      "stem": "표준 JavaScript에서 아래 세 문장을 순서대로 한 번 실행한 직후 count의 숫자 값은 무엇인가? 모든 값은 Number이며 다른 코드의 개입은 없다.",
      "explanation": "우변의 3 * 2는 6이다. count += 6은 이 숫자 변수에 대해 count = count + 6과 같은 결과를 내므로 8이다.",
      "sourceRefs": [
        "js"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "JavaScript Number / += / *",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다. 자료 역할 검토: 코드 읽기·미완성 구현·점검 자료는 question, label 완성 예시는 explanation으로 분류. 지문·정답·배점·학습 목표는 유지.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": [
        {
          "filename": "calculation.js",
          "content": "let count = 2;\nconst step = 3;\ncount += step * 2;",
          "purpose": "question",
          "instruction": "아래 세 문장을 순서대로 한 번 실행한 직후 count의 숫자 값은 무엇인가?"
        }
      ]
    },
    "display": {
      "stem": "다음 보기의 JavaScript 코드 세 문장을 순서대로 한 번 실행한 직후 count의 숫자 값을 고르시오.",
      "notes": [
        "표준 JavaScript를 기준으로 하며, 모든 값은 Number이고 다른 코드의 개입은 없다."
      ]
    },
    "bankSchemaVersion": 2
  },
  {
    "bankVersion": "2026.10.02-seed.2",
    "original": {
      "questionId": "seed-w09",
      "revision": 1,
      "templateId": "seed-w09-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s5",
      "topicIds": [
        "seed-w09"
      ],
      "stem": "웹 페이지의 텍스트와 조작 요소 정보를 음성으로 듣고 탐색하려는 사용자에게 해당 역할을 수행하는 대표적인 보조기술은 무엇인가?",
      "explanation": "화면 낭독기는 웹 콘텐츠를 읽고 탐색하도록 돕는다. 한 사용자가 화면 낭독기, 확대기, 입력 보조기술을 함께 쓸 수도 있으며 장애 유형만으로 도구 사용을 단정해서는 안 된다.",
      "sourceRefs": [
        "at"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "W3C WAI 보조기술 개요",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "웹 페이지의 텍스트와 조작 요소 정보를 음성으로 듣고 탐색할 때 사용하는 대표적인 보조기술을 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 2
  },
  {
    "bankVersion": "2026.10.02-seed.2",
    "original": {
      "questionId": "seed-w10",
      "revision": 1,
      "templateId": "seed-w10-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s5",
      "topicIds": [
        "seed-w10"
      ],
      "stem": "한 자동 접근성 검사 도구가 제시한 오류가 0개였다. 이 결과를 해석한 설명으로 가장 적절한 것은 무엇인가?",
      "explanation": "오류 0개는 그 도구의 검사에서 오류가 보고되지 않았다는 뜻이다. 자동 결과를 근거로 접근성 전체를 보장하지 않으며 사람의 판단과 수동 점검을 결합한다.",
      "sourceRefs": [
        "evaluation"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "W3C WAI 평가 방법",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "자동 접근성 검사 도구가 제시한 오류가 0개였다. 이 결과를 해석한 설명으로 가장 적절한 것을 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 2
  },
  {
    "bankVersion": "2026.10.02-seed.3",
    "original": {
      "questionId": "seed-w01",
      "revision": 1,
      "templateId": "seed-w01-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s1",
      "topicIds": [
        "seed-w01"
      ],
      "stem": "KWCAG 2.2에서 일반적인 저장 기능을 키보드만으로도 실행할 수 있게 만드는 요구와 직접 연결되는 원칙은 무엇인가?",
      "explanation": "키보드 사용 보장은 운용의 용이성의 입력장치 접근성 지침에 속한다. 일반 저장 버튼은 커서의 이동 궤적 자체가 본질적인 예외 기능이 아니다.",
      "sourceRefs": [
        "kw-keyboard"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "KWCAG 2.2",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "KWCAG 2.2에서 저장 기능을 키보드만으로도 실행할 수 있게 하는 요구와 직접 연결되는 원칙을 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 2
  },
  {
    "bankVersion": "2026.10.02-seed.3",
    "original": {
      "questionId": "seed-w02",
      "revision": 1,
      "templateId": "seed-w02-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s1",
      "topicIds": [
        "seed-w02"
      ],
      "stem": "검토 목록은 각 항목 오른쪽에 같은 모양의 원을 표시하고, 초록 원은 완료, 빨간 원은 미완료라는 범례만 제공한다. 색에 관계없이 상태를 구별할 수 있게 하는 개선은 무엇인가?",
      "explanation": "동일한 모양에 색만 다른 상태는 색을 구분하기 어려운 환경에서 의미가 사라질 수 있다. 상태 텍스트를 함께 두면 색 외의 수단으로 구분할 수 있다.",
      "sourceRefs": [
        "kw-color"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "KWCAG 2.2",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "검토 목록은 각 항목 오른쪽의 같은 모양의 원으로 상태를 표시하고, 초록 원은 완료, 빨간 원은 미완료라는 범례만 제공한다. 색에 관계없이 상태를 구별할 수 있도록 개선한 방법을 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 2
  },
  {
    "bankVersion": "2026.10.02-seed.3",
    "original": {
      "questionId": "seed-w03",
      "revision": 1,
      "templateId": "seed-w03-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s2",
      "topicIds": [
        "seed-w03"
      ],
      "stem": "호스트 이름에 대응하는 IPv4 주소를 A 레코드로 조회하려 한다. 이 조회를 제공하는 이름 체계는 무엇인가?",
      "explanation": "DNS에서는 A 레코드로 호스트 이름에 대응하는 IPv4 주소를 조회한다. DNS의 역할이 주소 변환 한 가지로만 제한되는 것은 아니다.",
      "sourceRefs": [
        "dns",
        "http",
        "html52",
        "css-definition",
        "js"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "RFC 1034 / RFC 9110",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "shared",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "호스트 이름에 대응하는 IPv4 주소를 A 레코드로 조회할 때 사용하는 이름 체계를 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 2
  },
  {
    "bankVersion": "2026.10.02-seed.3",
    "original": {
      "questionId": "seed-w04",
      "revision": 1,
      "templateId": "seed-w04-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s2",
      "topicIds": [
        "seed-w04"
      ],
      "stem": "브라우저가 서버에 GET 요청을 보내고 서버가 상태 코드와 문서 데이터를 포함한 응답을 돌려주는 통신을 한다. 이 요청·응답의 의미를 정의하는 웹 프로토콜은 무엇인가?",
      "explanation": "HTTP는 GET 같은 요청 메서드와 응답 상태 코드의 의미를 정의한다. DNS는 이름 조회라는 다른 역할을 한다.",
      "sourceRefs": [
        "dns",
        "http",
        "html52",
        "css-definition",
        "js"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "RFC 1034 / RFC 9110",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "shared",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "브라우저가 GET 요청을 보내면 서버가 상태 코드와 문서 데이터가 담긴 응답을 돌려준다. 이 요청과 응답의 의미를 정의하는 웹 프로토콜을 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 2
  },
  {
    "bankVersion": "2026.10.02-seed.3",
    "original": {
      "questionId": "seed-w05",
      "revision": 3,
      "templateId": "seed-w05-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s3",
      "topicIds": [
        "seed-w05"
      ],
      "stem": "HTML 5.2 기준으로, label 요소의 for 속성값이 \"ticket-email\"일 때 명시적으로 연결할 input 요소에서 값이 \"ticket-email\"이어야 하는 속성은 무엇인가?",
      "explanation": "for와 id가 정확히 대응해야 한다. label과 input을 단지 나란히 놓거나 name만 맞추는 것으로 이 명시적 연결이 만들어지지 않는다.",
      "sourceRefs": [
        "html52-forms",
        "label-technique",
        "html52"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "HTML 5.2 (2017-12-14)",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다. 자료 역할 검토: 코드 읽기·미완성 구현·점검 자료는 question, label 완성 예시는 explanation으로 분류. 지문·정답·배점·학습 목표는 유지. 보기 연결 전수 검토: 지문→필수 보기→선택지/실기 답안 순서에 맞춰 구체 지시를 정정했으며 원본 코드·정답·배점·판단 조건·학습 목표는 그대로 유지했다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": [
        {
          "filename": "label-example.html",
          "content": "<label for=\"ticket-email\">알림 받을 이메일</label>\n<input type=\"email\" id=\"ticket-email\" name=\"email\">",
          "purpose": "explanation"
        }
      ]
    },
    "display": {
      "stem": "HTML 5.2 기준으로, label 요소의 for 속성값이 \"ticket-email\"일 때 명시적으로 연결할 input 요소에서 같은 값을 가져야 하는 속성을 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 2
  },
  {
    "bankVersion": "2026.10.02-seed.3",
    "original": {
      "questionId": "seed-w06",
      "revision": 1,
      "templateId": "seed-w06-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s3",
      "topicIds": [
        "seed-w06"
      ],
      "stem": "WAI-ARIA 1.2에서, 누를 때마다 켜짐과 꺼짐을 전환하는 “즐겨찾기” 버튼의 현재 눌림 상태를 나타내는 속성은 무엇인가? 버튼의 이름은 두 상태 모두 “즐겨찾기”로 유지한다.",
      "explanation": "토글 버튼의 눌림 상태에는 aria-pressed를 사용한다. ARIA는 의미와 상태를 전달하며, 그 속성만으로 클릭 처리나 상태 전환 코드가 자동 생성되지는 않는다.",
      "sourceRefs": [
        "aria"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "WAI-ARIA 1.2",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "WAI-ARIA 1.2를 기준으로, 누를 때마다 켜짐과 꺼짐을 전환하는 “즐겨찾기” 버튼의 현재 눌림 상태를 나타내는 속성을 고르시오.",
      "notes": [
        "버튼의 이름은 두 상태 모두 “즐겨찾기”로 유지한다."
      ]
    },
    "bankSchemaVersion": 2
  },
  {
    "bankVersion": "2026.10.02-seed.3",
    "original": {
      "questionId": "seed-w07",
      "revision": 3,
      "templateId": "seed-w07-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s4",
      "topicIds": [
        "seed-w07"
      ],
      "stem": "CSS 2.2의 명시도 규칙으로 판단한다. 다음 보기의 다섯 선언만 경쟁하며 모두 작성자 일반 선언이다. style 속성, !important, 사용자 스타일, 애니메이션·전환은 없고 모두 같은 매체 조건에 적용된다. 다음 보기의 코드를 읽고, p 요소에 적용되는 color 값을 고르시오.",
      "explanation": "동일 출처·중요도 조건에서 #notice의 ID 계수가 우선하므로 navy가 적용된다. 선언 순서는 명시도까지 같은 경우에 비교한다. CSS 2.2 문서는 초안이다.",
      "sourceRefs": [
        "css"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "CSS 2.2 Working Draft",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다. 자료 역할 검토: 코드 읽기·미완성 구현·점검 자료는 question, label 완성 예시는 explanation으로 분류. 지문·정답·배점·학습 목표는 유지. 보기 연결 전수 검토: 지문→필수 보기→선택지/실기 답안 순서에 맞춰 구체 지시를 정정했으며 원본 코드·정답·배점·판단 조건·학습 목표는 그대로 유지했다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": [
        {
          "filename": "specificity.html",
          "content": "<div><p id=\"notice\" class=\"note\">접수 안내</p></div>\n<style>\n  p { color: black; }\n  .note { color: green; }\n  #notice { color: navy; }\n  div p.note { color: red; }\n  * { color: orange; }\n</style>",
          "purpose": "question",
          "instruction": "다음 보기의 코드를 읽고, p 요소에 적용되는 color 값을 고르시오."
        }
      ]
    },
    "display": {
      "stem": "다음 보기의 코드를 읽고, CSS 2.2의 명시도 규칙으로 제시된 p 요소에 적용되는 color 값을 고르시오.",
      "notes": [
        "보기의 다섯 선언만 경쟁하며 모두 작성자 일반 선언이다.",
        "style 속성, !important, 사용자 스타일, 애니메이션·전환은 없고 모두 같은 매체 조건에 적용된다."
      ]
    },
    "bankSchemaVersion": 2
  },
  {
    "bankVersion": "2026.10.02-seed.3",
    "original": {
      "questionId": "seed-w08",
      "revision": 3,
      "templateId": "seed-w08-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s4",
      "topicIds": [
        "seed-w08"
      ],
      "stem": "표준 JavaScript로 판단한다. 모든 값은 Number이며 다른 코드의 개입은 없다. 다음 보기의 JavaScript 코드 세 문장을 순서대로 한 번 실행한 직후 count의 숫자 값을 고르시오.",
      "explanation": "우변의 3 * 2는 6이다. count += 6은 이 숫자 변수에 대해 count = count + 6과 같은 결과를 내므로 8이다.",
      "sourceRefs": [
        "js"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "JavaScript Number / += / *",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다. 자료 역할 검토: 코드 읽기·미완성 구현·점검 자료는 question, label 완성 예시는 explanation으로 분류. 지문·정답·배점·학습 목표는 유지. 보기 연결 전수 검토: 지문→필수 보기→선택지/실기 답안 순서에 맞춰 구체 지시를 정정했으며 원본 코드·정답·배점·판단 조건·학습 목표는 그대로 유지했다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": [
        {
          "filename": "calculation.js",
          "content": "let count = 2;\nconst step = 3;\ncount += step * 2;",
          "purpose": "question",
          "instruction": "다음 보기의 JavaScript 코드 세 문장을 순서대로 한 번 실행한 직후 count의 숫자 값을 고르시오."
        }
      ]
    },
    "display": {
      "stem": "다음 보기의 JavaScript 코드 세 문장을 순서대로 한 번 실행한 직후 count의 숫자 값을 고르시오.",
      "notes": [
        "표준 JavaScript를 기준으로 하며, 모든 값은 Number이고 다른 코드의 개입은 없다."
      ]
    },
    "bankSchemaVersion": 2
  },
  {
    "bankVersion": "2026.10.02-seed.3",
    "original": {
      "questionId": "seed-w09",
      "revision": 1,
      "templateId": "seed-w09-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s5",
      "topicIds": [
        "seed-w09"
      ],
      "stem": "웹 페이지의 텍스트와 조작 요소 정보를 음성으로 듣고 탐색하려는 사용자에게 해당 역할을 수행하는 대표적인 보조기술은 무엇인가?",
      "explanation": "화면 낭독기는 웹 콘텐츠를 읽고 탐색하도록 돕는다. 한 사용자가 화면 낭독기, 확대기, 입력 보조기술을 함께 쓸 수도 있으며 장애 유형만으로 도구 사용을 단정해서는 안 된다.",
      "sourceRefs": [
        "at"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "W3C WAI 보조기술 개요",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "웹 페이지의 텍스트와 조작 요소 정보를 음성으로 듣고 탐색할 때 사용하는 대표적인 보조기술을 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 2
  },
  {
    "bankVersion": "2026.10.02-seed.3",
    "original": {
      "questionId": "seed-w10",
      "revision": 1,
      "templateId": "seed-w10-template",
      "learningGoalRevision": 1,
      "type": "written",
      "subjectId": "s5",
      "topicIds": [
        "seed-w10"
      ],
      "stem": "한 자동 접근성 검사 도구가 제시한 오류가 0개였다. 이 결과를 해석한 설명으로 가장 적절한 것은 무엇인가?",
      "explanation": "오류 0개는 그 도구의 검사에서 오류가 보고되지 않았다는 뜻이다. 자동 결과를 근거로 접근성 전체를 보장하지 않으며 사람의 판단과 수동 점검을 결합한다.",
      "sourceRefs": [
        "evaluation"
      ],
      "verificationStatus": "published",
      "testOnly": true,
      "contentStage": "test_seed",
      "standardVersion": "W3C WAI 평가 방법",
      "difficulty": "기초",
      "reviewNote": "독자적으로 만든 비공식 기능 검증용 문항. 원문 근거와 단일 정답성을 검토했으며 시험 출제를 예측하거나 공식 정답을 주장하지 않습니다.",
      "optionMode": "exclusive",
      "supportedOptionCounts": [
        4,
        5
      ],
      "materials": []
    },
    "display": {
      "stem": "자동 접근성 검사 도구가 제시한 오류가 0개였다. 이 결과를 해석한 설명으로 가장 적절한 것을 고르시오.",
      "notes": []
    },
    "bankSchemaVersion": 2
  }
];
