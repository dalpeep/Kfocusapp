# 업소 상세 AI Pick v1

## 표시 위치
업소 상세 대표 이미지 바로 아래, 업소명/전화/길찾기 영역보다 먼저 표시됩니다.

## 콘텐츠 연결 방식
아래 중 최신 공개 콘텐츠 1개를 자동 표시합니다.

1. `boards` 테이블
   - `type` 또는 `subtype`: `ai_pick`
   - `business_id`: 해당 업소 ID
   - 게시 상태 및 노출기간이 유효해야 함

2. `dalpick` 테이블(대체 콘텐츠)
   - `category`: `ai_pick` 또는 `recommended`
   - `business_id`: 해당 업소 ID
   - 활성 및 노출기간이 유효해야 함

콘텐츠가 없으면 AI Pick 카드는 표시되지 않습니다.
