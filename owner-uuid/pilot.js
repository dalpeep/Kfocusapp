(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const status = get('pilot-status');
  const pageHeading = get('owner-page-heading');
  const owner = get('pilot-owner');
  const ownerTitle = owner.querySelector('h2');
  const admin = get('admin');
  const labels = {new: '신규 업소', claim: '소유권', core: '핵심 정보', name_ko: '업소명',
    name_en: '영문 업소명', address: '주소', phone: '전화', category_ko: '업종'};
  const endpoint = 'https://ydrxuqmjzayejlnjzzew.supabase.co/functions/v1/owner-phase1';
  const off = '업주 관리 시험 운영이 중지됐습니다.';
  let generation = 0;
  let descriptionObserver;

  function append(parent, tag, value) {
    const element = document.createElement(tag);
    element.textContent = value;
    parent.append(element);
    return element;
  }

  function show(client, active) {
    const current = ++generation;
    pageHeading.textContent = '업주 관리';
    ownerTitle.textContent = '내 업소';
    descriptionObserver?.disconnect();
    descriptionObserver = undefined;
    admin.hidden = owner.hidden = true;
    get('pilot-queue').replaceChildren();
    get('pilot-businesses').replaceChildren();
    status.textContent = '';
    if (!active) return;
    let offset = 0;

    async function request(query, command, file) {
      const {data} = await client.auth.getSession();
      if (current !== generation || !data?.session) throw Error('다시 로그인해 주세요.');
      const response = await fetch(endpoint + query, {
        method: command || file ? 'POST' : 'GET', redirect: 'error', cache: 'no-store',
        headers: {apikey: window.APP_CONFIG.SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + data.session.access_token,
          ...(command || file ? {'Content-Type': file ? 'application/octet-stream' : 'application/json'} : {})},
        ...(command || file ? {body: file || JSON.stringify(command)} : {}),
      });
      const body = await response.json();
      if (response.ok && body.ok) return body.result;
      const error = Error(response.status === 503 ? off : response.status === 401 ? '다시 로그인해 주세요.'
        : response.status === 403 ? '이 작업에 대한 시험 운영 권한이 없습니다.'
        : response.status === 409 ? '신청이 변경됐습니다. 목록을 다시 확인해 주세요.'
        : '입력 내용을 확인해 주세요.');
      error.status = response.status;
      throw error;
    }

    function action(parent, label, command) {
      const button = append(parent, 'button', label);
      button.type = 'button';
      let pending;
      button.onclick = async () => {
        if (button.disabled || current !== generation) return;
        button.disabled = true;
        try {
          if (!pending) {
            const payload = command();
            if (!payload) return;
            pending = {...payload, key: crypto.randomUUID()};
          }
          await request('', pending);
          pending = null;
          if (await load() && current === generation) status.textContent = '처리했습니다.';
        } catch (error) {
          if (error.status >= 400 && error.status < 500) pending = null;
          if (current === generation) status.textContent = error.status ? error.message : '응답을 확인하지 못했습니다. 같은 버튼으로 재시도해 주세요.';
        } finally {
          button.disabled = false;
        }
      };
    }

    async function load() {
      try {
        const data = await request('?status=pending&offset=' + offset);
        if (current !== generation) return;
        const isAdmin = data.is_admin === true;
        pageHeading.textContent = isAdmin ? '업소 관리' : '업주 관리';
        ownerTitle.textContent = isAdmin ? '관리 업소' : '내 업소';
        const businesses = get('pilot-businesses');
        descriptionObserver?.disconnect();
        descriptionObserver = undefined;
        businesses.replaceChildren();
        const resizeDescriptions = new Map();
        if (!isAdmin) {
          for (const candidate of data.claim_candidates || []) {
            const card = append(businesses, 'article', '');
            append(card, 'h3', candidate.name_ko || candidate.name_en || '지정 시험 업소');
            const pending = data.requests.some(r => r.kind === 'claim' && r.business_id === candidate.id);
            if (pending) append(card, 'p', '소유권 신청 승인 대기 중');
            else action(card, '소유권 신청', () => ({action: 'submit', kind: 'claim', business_id: candidate.id}));
          }
        }
        if (!data.businesses.length) append(businesses, 'p', '아직 승인된 시험 업소가 없습니다.');
        for (const business of data.businesses) {
          const card = append(businesses, 'article', '');
          append(card, 'h3', business.name_ko || business.name_en || '시험 업소');
          const gallery = append(card, 'details', '');
          append(gallery, 'summary', '업소 사진');
          const feedback = append(gallery, 'p', '');
          feedback.setAttribute('role', 'status');
          const galleryQuery = '?content=gallery&business=' + encodeURIComponent(business.id);
          const uploadPrefix = endpoint.split('/functions/')[0]
            + '/storage/v1/object/public/public-images/owner-phase2/' + business.id + '/';
          const grid = append(gallery, 'div', '');
          grid.className = 'pilot-photo-grid';
          const controls = append(gallery, 'div', '');
          const add = append(controls, 'button', '사진 추가');
          const picker = append(controls, 'input', '');
          add.type = 'button';
          picker.type = 'file';
          picker.accept = 'image/jpeg,image/png,image/webp';
          picker.hidden = true;
          let expected;
          let busy = false;
          let replacement;
          add.disabled = true;

          function choose(index) {
            if (busy) return;
            replacement = index;
            picker.multiple = index === undefined;
            picker.value = '';
            picker.click();
          }

          function renderPhotos() {
            grid.replaceChildren();
            if (!expected.length) append(grid, 'p', '등록된 사진이 없습니다.');
            expected.forEach((url, index) => {
              const photo = append(grid, 'div', '');
              photo.className = 'pilot-photo';
              const image = append(photo, 'img', '');
              image.alt = '업소 사진 ' + (index + 1);
              image.loading = 'lazy';
              image.referrerPolicy = 'no-referrer';
              if (/^https?:\/\//i.test(url)) image.src = url;
              if (!url.startsWith(uploadPrefix)) {
                append(photo, 'small', '관리자 등록 사진');
                return;
              }
              const buttons = append(photo, 'div', '');
              const replace = append(buttons, 'button', '교체');
              const remove = append(buttons, 'button', '삭제');
              replace.type = remove.type = 'button';
              replace.onclick = () => choose(index);
              remove.onclick = () => {
                if (busy || !window.confirm('이 사진을 업소 사진 목록에서 삭제할까요?')) return;
                void changePhotos([], index);
              };
            });
          }

          async function changePhotos(files, index) {
            if (busy || current !== generation || !expected) return;
            if (files.some(file => file.size > 4 * 1024 * 1024)) {
              feedback.textContent = '각 사진은 4MB 이하여야 합니다.';
              return;
            }
            if (index === undefined && expected.length + files.length > 20) {
              feedback.textContent = '사진은 최대 20장까지 등록할 수 있습니다.';
              return;
            }
            busy = true;
            for (const button of gallery.querySelectorAll('button')) button.disabled = true;
            let saved = 0;
            try {
              if (!files.length) {
                expected = await request(galleryQuery, {expected, urls: expected.filter((_, i) => i !== index)});
              }
              for (const file of files) {
                feedback.textContent = '사진 저장 중 (' + (saved + 1) + '/' + files.length + ')';
                const uploaded = await request(galleryQuery + '&upload=1', null, file);
                const urls = expected.slice();
                if (index === undefined) urls.push(uploaded);
                else urls[index] = uploaded;
                expected = await request(galleryQuery, {expected, urls});
                saved++;
              }
              feedback.textContent = !files.length ? '사진을 목록에서 삭제했습니다.'
                : index === undefined ? '사진 ' + saved + '장을 저장했습니다.' : '사진을 교체했습니다.';
            } catch (error) {
              const message = error.status === 409 ? '다른 곳에서 사진 목록이 변경됐습니다.'
                : '사진 저장 결과를 확인하지 못했습니다.';
              feedback.textContent = (saved ? saved + '장 저장 완료. ' : '') + message;
              try { expected = await request(galleryQuery); }
              catch { expected = undefined; grid.replaceChildren(); feedback.textContent += ' 사진 영역을 다시 열어 확인해 주세요.'; }
            } finally {
              busy = false;
              if (current === generation && expected) renderPhotos();
              add.disabled = !expected;
            }
          }

          add.onclick = () => choose();
          picker.onchange = () => {
            const files = Array.from(picker.files);
            if (files.length) void changePhotos(files, replacement);
          };
          gallery.addEventListener('toggle', async () => {
            if (!gallery.open || expected || busy) return;
            busy = true;
            feedback.textContent = '사진 목록을 불러오는 중입니다.';
            try {
              expected = await request(galleryQuery);
              if (current !== generation) return;
              renderPhotos();
              add.disabled = false;
              feedback.textContent = '';
            } catch (error) {
              feedback.textContent = error.status === 503 ? '사진 관리는 준비 중입니다.' : '사진 목록을 불러오지 못했습니다.';
            } finally {
              busy = false;
            }
          });
          const specials = append(card, 'details', '');
          append(specials, 'summary', '할인·특선');
          const specialStatus = append(specials, 'p', '');
          specialStatus.setAttribute('role', 'status');
          const specialBody = append(specials, 'div', '');
          const specialQuery = '?content=specials&business=' + encodeURIComponent(business.id);
          let specialBusy = false;

          async function loadSpecials() {
            try {
              const rows = await request(specialQuery);
              specialBody.replaceChildren();
              const list = append(specialBody, 'div', '');
              const form = append(specialBody, 'form', '');
              let selected;
              const fields = {};
              function field(name, label, type) {
                const input = append(append(form, 'label', label), type === 'textarea' ? 'textarea' : 'input', '');
                if (type !== 'textarea') input.type = type;
                fields[name] = input;
                return input;
              }
              const kind = append(append(form, 'label', '종류'), 'select', '');
              for (const [value, label] of [['lunch_special', '런치·요일 할인'], ['happy_hour', '해피아워']]) {
                append(kind, 'option', label).value = value;
              }
              field('title', '제목', 'text').required = true;
              fields.title.maxLength = 120;
              field('description', '설명', 'textarea').maxLength = 2000;
              field('price_text', '가격·할인 내용', 'text').maxLength = 80;
              field('start_date', '시작일', 'date');
              field('end_date', '종료일', 'date');
              field('start_time', '시작 시간 (업소 현지 시간)', 'time');
              field('end_time', '종료 시간 (업소 현지 시간)', 'time');
              const media = append(form, 'div', '');
              media.className = 'pilot-special-image';
              const preview = append(media, 'img', '');
              preview.alt = '특선 이미지';
              preview.referrerPolicy = 'no-referrer';
              const imageButton = append(media, 'button', '이미지 추가');
              const removeImage = append(media, 'button', '이미지 삭제');
              imageButton.type = removeImage.type = 'button';
              const imagePicker = append(media, 'input', '');
              imagePicker.type = 'file';
              imagePicker.accept = 'image/jpeg,image/png,image/webp';
              imagePicker.hidden = true;
              let imageUrl = null;
              let imageFile;
              let previewUrl;

              function renderImage() {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                previewUrl = imageFile ? URL.createObjectURL(imageFile) : undefined;
                const src = previewUrl || (/^https?:\/\//i.test(imageUrl || '') ? imageUrl : '');
                if (src) preview.src = src;
                else preview.removeAttribute('src');
                preview.hidden = !src;
                imageButton.textContent = imageUrl || imageFile ? '이미지 교체' : '이미지 추가';
                removeImage.hidden = !(imageUrl || imageFile);
              }
              renderImage();
              imageButton.onclick = () => {
                if ((imageUrl || imageFile) && !window.confirm('특선 이미지를 교체할까요?')) return;
                imagePicker.value = '';
                imagePicker.click();
              };
              imagePicker.onchange = () => {
                const file = imagePicker.files[0];
                if (!file) return;
                if (file.size > 4 * 1024 * 1024) {
                  specialStatus.textContent = '4MB 이하의 사진을 선택해 주세요.';
                  return;
                }
                imageFile = file;
                renderImage();
              };
              removeImage.onclick = () => {
                if (!window.confirm('특선 이미지 참조를 삭제할까요?')) return;
                imageFile = undefined;
                imageUrl = null;
                renderImage();
              };
              const days = append(form, 'fieldset', '');
              append(days, 'legend', '요일 (선택하지 않으면 매일)');
              const dayRow = append(days, 'div', '');
              dayRow.className = 'pilot-special-days';
              const dayInputs = ['일', '월', '화', '수', '목', '금', '토'].map(label => {
                const input = append(append(dayRow, 'label', label), 'input', '');
                input.type = 'checkbox';
                return input;
              });
              const itemList = append(form, 'fieldset', '');
              append(itemList, 'legend', '특선 하위 항목');
              const itemRows = append(itemList, 'div', '');
              const itemEditors = [];
              function addItem(item = {}) {
                const row = append(itemRows, 'div', '');
                const inputs = {};
                for (const [name, label, max] of [['item_name', '항목 이름', 160], ['description', '설명', 2000], ['price_text', '가격', 80]]) {
                  const input = append(append(row, 'label', label), 'input', '');
                  input.maxLength = max;
                  input.value = item[name] ?? '';
                  inputs[name] = input;
                }
                itemEditors.push({item, inputs});
              }
              const addItemButton = append(itemList, 'button', '하위 항목 추가');
              addItemButton.type = 'button';
              addItemButton.onclick = () => addItem();
              function resetItems(items = []) {
                itemRows.replaceChildren();
                itemEditors.length = 0;
                items.forEach(addItem);
              }
              append(form, 'button', '저장 및 공개').type = 'submit';
              const reset = append(form, 'button', '새 특선');
              reset.type = 'button';
              reset.onclick = () => { selected = undefined; form.reset(); resetItems(); imageUrl = null; imageFile = undefined; renderImage(); };
              for (const row of rows) {
                const item = append(list, 'div', '');
                append(item, 'p', row.title + (row.is_active ? ' · 공개' : ' · 비공개'));
                const edit = append(item, 'button', '수정');
                edit.type = 'button';
                edit.onclick = () => {
                  selected = row;
                  imageUrl = row.image_url || null;
                  imageFile = undefined;
                  renderImage();
                  resetItems(row.items);
                  kind.value = row.type;
                  for (const [name, input] of Object.entries(fields)) {
                    if (input.type === 'checkbox') input.checked = row[name];
                    else input.value = row[name] ?? '';
                  }
                  dayInputs.forEach((input, i) => { input.checked = row.days_of_week.includes(i); });
                };
                const end = append(item, 'button', '종료');
                end.type = 'button';
                end.disabled = !row.is_active;
                end.onclick = () => {
                  if (window.confirm('이 특선의 공개를 종료할까요?')) void saveSpecial({action:'end',id:row.id,expected:row.updated_at});
                };
              }
              form.onsubmit = async event => {
                event.preventDefault();
                const values = Object.fromEntries(Object.entries(fields).map(([name, input]) =>
                  [name, input.type === 'checkbox' ? input.checked : input.value.trim() || null]));
                const items = itemEditors.flatMap(({item, inputs}) => {
                  const values = Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, input.value.trim()]));
                  if (!Object.values(values).some(Boolean) && !item.id) return [];
                  if (item.id && Object.entries(values).every(([name, value]) => value === (item[name] ?? ''))) return [];
                  return [{...values, ...(item.id ? {id:item.id, expected:item.updated_at} : {})}];
                });
                if (specialBusy) return;
                await saveSpecial({action:'save', items, fields:{...values,type:kind.value,
                  image_url:imageUrl, is_active:selected?.is_active ?? true,
                  days_of_week:dayInputs.flatMap((input, i) => input.checked ? [i] : [])},
                  ...(selected ? {id:selected.id,expected:selected.updated_at} : {})}, async command => {
                    if (imageFile) {
                      imageUrl = await request(galleryQuery + '&upload=1', null, imageFile);
                      imageFile = undefined;
                      renderImage();
                      command.fields.image_url = imageUrl;
                    }
                  });
                if (!form.isConnected && previewUrl) URL.revokeObjectURL(previewUrl);
              };
            } catch (error) {
              specialStatus.textContent = error.status === 503 ? '할인·특선 관리는 준비 중입니다.' : '할인·특선을 불러오지 못했습니다.';
            }
          }

          async function saveSpecial(command, prepare) {
            if (specialBusy || current !== generation) return;
            specialBusy = true;
            const controls = [...specialBody.querySelectorAll('button, input, textarea, select')]
              .filter(control => !control.disabled);
            for (const control of controls) control.disabled = true;
            try {
              if (prepare) await prepare(command);
              await request(specialQuery, {...command,key:crypto.randomUUID()});
              specialStatus.textContent = command.action === 'end' ? '공개를 종료했습니다.'
                : '저장되었습니다. 적용 조건에 따라 공개됩니다.';
              await loadSpecials();
            } catch (error) {
              specialStatus.textContent = error.status === 409 ? '목록을 다시 열어 최신 내용을 확인해 주세요.'
                : '저장 결과를 확인하지 못했습니다. 목록을 다시 열어 확인해 주세요.';
            } finally {
              specialBusy = false;
              for (const control of controls) control.disabled = false;
            }
          }

          specials.addEventListener('toggle', () => {
            if (specials.open && !specialBusy) void loadSpecials();
          });
          const description = append(append(card, 'label', '소개'), 'textarea', '');
          description.className = 'pilot-business-description';
          description.value = business.description || '';
          const fitDescription = () => {
            description.style.height = '0px';
            const borders = description.offsetHeight - description.clientHeight;
            description.style.height = (description.scrollHeight + borders) + 'px';
          };
          description.addEventListener('input', fitDescription);
          descriptionObserver ??= new ResizeObserver(entries => {
            for (const {target} of entries) resizeDescriptions.get(target)();
          });
          let width;
          resizeDescriptions.set(card, () => {
            if (width === card.clientWidth) return;
            width = card.clientWidth;
            fitDescription();
          });
          descriptionObserver.observe(card);
          const hours = append(append(card, 'label', '영업시간'), 'input', '');
          hours.value = business.hours || '';
          action(card, '정보 저장', () => ({action: 'update', business_id: business.id,
            changes: {description: description.value, hours: hours.value}}));
        }
        owner.hidden = false;
        for (const fitDescription of resizeDescriptions.values()) fitDescription();
        const queue = get('pilot-queue');
        queue.replaceChildren();
        admin.hidden = !isAdmin;
        if (admin.hidden) return true;
        const {data: sessionData} = await client.auth.getSession();
        if (current !== generation || !sessionData?.session) return;
        if (!data.requests.length) append(queue, 'p', '승인 대기 신청이 없습니다.');
        for (const item of data.requests) {
          const card = append(queue, 'article', '');
          append(card, 'h3', (labels[item.kind] || item.kind) + ' · ' + item.region);
          const candidate = data.claim_candidates?.find(business => business.id === item.business_id);
          if (candidate) append(card, 'p', candidate.name_ko || candidate.name_en || '지정 시험 업소');
          append(card, 'p', '신청 ' + item.id + ' · 업소 ' + (item.business_id || '신규'));
          for (const [heading, fields] of [['변경 전', item.baseline], ['신청 내용', item.changes]]) {
            if (!Object.keys(fields || {}).length) continue;
            append(card, 'h4', heading);
            for (const [key, value] of Object.entries(fields)) append(card, 'p', (labels[key] || key) + ' ' + (value ?? '없음'));
          }
          if (item.submission_reason) append(card, 'p', '신청 사유 ' + item.submission_reason);
          if (item.user_id === sessionData.session.user.id) continue;
          const reason = append(append(card, 'label', '처리 사유'), 'textarea', '');
          reason.maxLength = 1000;
          const area = item.kind === 'new' ? append(append(card, 'label', '승인 지역'), 'input', '') : null;
          action(card, '승인', () => {
            if (area && !area.value.trim()) { status.textContent = '승인 지역을 입력해 주세요.'; return; }
            return {action: 'approve', request_id: item.id, reason: reason.value, ...(area ? {area: area.value.trim()} : {})};
          });
          action(card, '거절', () => {
            if (!reason.value.trim()) { status.textContent = '거절 사유를 입력해 주세요.'; return; }
            return {action: 'reject', request_id: item.id, reason: reason.value.trim()};
          });
        }
        get('pilot-prev').disabled = offset === 0;
        get('pilot-next').disabled = offset + 20 >= data.request_total;
        if (location.hash === '#admin') admin.scrollIntoView();
        return true;
      } catch (error) {
        if (current !== generation) return;
        pageHeading.textContent = '업주 관리';
        owner.hidden = admin.hidden = true;
        status.textContent = error.status ? error.message : '업주 관리 상태를 확인할 수 없습니다.';
      }
    }
    get('pilot-prev').onclick = () => { offset = Math.max(0, offset - 20); void load(); };
    get('pilot-next').onclick = () => { offset += 20; void load(); };
    void load();
  }
  window.OwnerPilot = Object.freeze({show});
})();
