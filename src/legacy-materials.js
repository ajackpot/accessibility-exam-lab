/** Exact, reviewed material purposes from immutable seed.1. Unknown legacy material defaults to explanation. */
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
    "purpose": "question"
  },
  {
    "bankVersion": "2026.10.02-seed.1",
    "questionId": "seed-w08",
    "revision": 1,
    "stem": "표준 JavaScript에서 아래 세 문장을 순서대로 한 번 실행한 직후 count의 숫자 값은 무엇인가? 모든 값은 Number이며 다른 코드의 개입은 없다.",
    "filename": "calculation.js",
    "content": "let count = 2;\nconst step = 3;\ncount += step * 2;",
    "purpose": "question"
  },
  {
    "bankVersion": "2026.10.02-seed.1",
    "questionId": "seed-p01",
    "revision": 1,
    "stem": "화면에는 “회신 받을 이메일” 레이블과 입력칸이 나란히 보인다. label과 input을 명시적으로 연결하라. 요소 구조와 input의 id는 바꾸지 않는다. 빈칸 A는 소문자 속성명만, B는 따옴표 없는 속성값만 입력한다. 앞뒤 공백은 무시하고 대소문자·철자는 그대로 비교한다. 이 과제의 앱 연습 배점은 10점이다.",
    "filename": "seed-p01.html",
    "content": "<label [A]=\"[B]\">회신 받을 이메일</label>\n<input type=\"email\" id=\"reply-email\" name=\"email\">",
    "purpose": "question"
  },
  {
    "bankVersion": "2026.10.02-seed.1",
    "questionId": "seed-p02",
    "revision": 1,
    "stem": "“즐겨찾기”는 두 상태를 번갈아 전환하는 네이티브 버튼이다. 화면 설명: 현재 항목은 즐겨찾기에 추가되어 있고 버튼 이름은 상태와 무관하게 “즐겨찾기”로 고정된다. 아래 미완성 마크업의 눌림 상태를 채운다. A는 소문자 속성명만 입력하며 앞뒤 공백만 무시한다. 키보드·클릭 이벤트 연결은 별도로 정상 구현되어 있다고 가정한다. 앱 연습 배점은 10점이다.",
    "filename": "seed-p02.html",
    "content": "<button type=\"button\" id=\"favorite\" [A]=\"[B]\">즐겨찾기</button>",
    "purpose": "question"
  },
  {
    "bankVersion": "2026.10.02-seed.1",
    "questionId": "seed-p03",
    "revision": 1,
    "stem": "화면에는 달력 모양의 이미지 하나만 있는 링크가 보인다. 이 링크를 누르면 “교육 일정” 페이지로 이동한다. 아래 코드가 링크의 전부이며 다른 텍스트, title, ARIA 이름 또는 숨긴 레이블은 없다. 문제점·이유·개선안을 각각 하나 고른다. 이 과제의 앱 연습 배점은 10점이다.",
    "filename": "seed-p03.html",
    "content": "<a href=\"/education/schedule\">\n  <img src=\"calendar-mark.svg\" alt=\"\">\n</a>",
    "purpose": "question"
  },
  {
    "bankVersion": "2026.10.02-seed.1",
    "questionId": "seed-p04",
    "revision": 1,
    "stem": "화면에는 “요약 열기” 글자가 버튼처럼 꾸며져 있다. 마우스로 누르면 요약이 열린다. 아래 요소에는 다른 속성·이벤트가 없고, 키보드로 같은 기능을 실행할 대체 경로도 없다. openSummary는 정상 작동하는 함수이며 요약은 같은 페이지에 표시된다. 일반 브라우저에서 키보드 기본 동작을 막는 코드는 없다. 이 과제는 키보드 사용 보장과 개선 방법을 점검한다. 앱 연습 배점은 10점이다.",
    "filename": "seed-p04.html",
    "content": "<span onclick=\"openSummary()\">요약 열기</span>",
    "purpose": "question"
  }
];
