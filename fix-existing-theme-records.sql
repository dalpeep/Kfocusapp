-- 기존에 지역 정보(local_info)로 잘못 저장된 추천 테마를 바로잡습니다.
-- target_categories 값이 있는 레코드만 대상으로 하므로 일반 지역 정보 글은 변경하지 않습니다.
update public.dalpick
set category = 'themed',
    show_in_dalpick = false,
    updated_at = now()
where category <> 'themed'
  and coalesce(array_length(target_categories, 1), 0) > 0;
