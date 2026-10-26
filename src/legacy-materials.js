/** Written-only compatibility data projected for the service runtime. Internal source tables remain immutable. */
export const LEGACY_MATERIAL_PURPOSES = [
  {
    "bankVersion": "2026.10.02-seed.1",
    "questionId": "seed-w05",
    "revision": 1,
    "stem": "HTML 5.2 기준으로, label 요소의 for 속성으로 바로 뒤의 input 요소를 명시적으로 연결한다. for=\"ticket-email\"과 값이 같아야 하는 input의 속성은 무엇인가?",
    "filename": "label-example.html",
    "content": "<label for=\"ticket-email\">알림 받을 이메일</label>\n<input type=\"email\" id=\"ticket-email\" name=\"email\">",
    "purpose": "explanation"
  },
  {
    "bankVersion": "2026.10.02-seed.1",
    "questionId": "seed-w07",
    "revision": 1,
    "stem": "CSS 2.2의 명시도 규칙으로 제시된 p 요소에 적용되는 color 값은 무엇인가? 아래 다섯 선언만 경쟁하며 모두 작성자 일반 선언이다. style 속성, !important, 사용자 스타일, 애니메이션·전환은 없고 모두 같은 매체 조건에 적용된다.",
    "filename": "specificity.html",
    "content": "<div><p id=\"notice\" class=\"note\">접수 안내</p></div>\n<style>\n  p { color: black; }\n  .note { color: green; }\n  #notice { color: navy; }\n  div p.note { color: red; }\n  * { color: orange; }\n</style>",
    "purpose": "question",
    "displayInstruction": "다음 보기의 코드를 읽고, p 요소에 적용되는 color 값을 고르시오."
  },
  {
    "bankVersion": "2026.10.02-seed.1",
    "questionId": "seed-w08",
    "revision": 1,
    "stem": "표준 JavaScript에서 아래 세 문장을 순서대로 한 번 실행한 직후 count의 숫자 값은 무엇인가? 모든 값은 Number이며 다른 코드의 개입은 없다.",
    "filename": "calculation.js",
    "content": "let count = 2;\nconst step = 3;\ncount += step * 2;",
    "purpose": "question",
    "displayInstruction": "다음 보기의 JavaScript 코드 세 문장을 순서대로 한 번 실행한 직후 count의 숫자 값을 고르시오."
  },
  {
    "bankVersion": "2026.10.02-seed.2",
    "questionId": "seed-w05",
    "revision": 2,
    "stem": "HTML 5.2 기준으로, label 요소의 for 속성으로 바로 뒤의 input 요소를 명시적으로 연결한다. for=\"ticket-email\"과 값이 같아야 하는 input의 속성은 무엇인가?",
    "filename": "label-example.html",
    "content": "<label for=\"ticket-email\">알림 받을 이메일</label>\n<input type=\"email\" id=\"ticket-email\" name=\"email\">",
    "purpose": "explanation",
    "storedPurpose": "explanation"
  },
  {
    "bankVersion": "2026.10.02-seed.2",
    "questionId": "seed-w07",
    "revision": 2,
    "stem": "CSS 2.2의 명시도 규칙으로 제시된 p 요소에 적용되는 color 값은 무엇인가? 아래 다섯 선언만 경쟁하며 모두 작성자 일반 선언이다. style 속성, !important, 사용자 스타일, 애니메이션·전환은 없고 모두 같은 매체 조건에 적용된다.",
    "filename": "specificity.html",
    "content": "<div><p id=\"notice\" class=\"note\">접수 안내</p></div>\n<style>\n  p { color: black; }\n  .note { color: green; }\n  #notice { color: navy; }\n  div p.note { color: red; }\n  * { color: orange; }\n</style>",
    "purpose": "question",
    "storedPurpose": "question",
    "storedInstruction": "아래 다섯 선언만 경쟁하며 모두 작성자 일반 선언이다.",
    "displayInstruction": "다음 보기의 코드를 읽고, p 요소에 적용되는 color 값을 고르시오."
  },
  {
    "bankVersion": "2026.10.02-seed.2",
    "questionId": "seed-w08",
    "revision": 2,
    "stem": "표준 JavaScript에서 아래 세 문장을 순서대로 한 번 실행한 직후 count의 숫자 값은 무엇인가? 모든 값은 Number이며 다른 코드의 개입은 없다.",
    "filename": "calculation.js",
    "content": "let count = 2;\nconst step = 3;\ncount += step * 2;",
    "purpose": "question",
    "storedPurpose": "question",
    "storedInstruction": "아래 세 문장을 순서대로 한 번 실행한 직후 count의 숫자 값은 무엇인가?",
    "displayInstruction": "다음 보기의 JavaScript 코드 세 문장을 순서대로 한 번 실행한 직후 count의 숫자 값을 고르시오."
  }
];
