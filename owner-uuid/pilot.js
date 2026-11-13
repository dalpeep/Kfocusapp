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
      error.code = body.code;
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
          card.classList.add('owner-management-card');
          const tabs = append(card, 'div', '');
          tabs.className = 'owner-management-tabs';
          tabs.setAttribute('role', 'tablist');
          tabs.setAttribute('aria-label', '업소 관리 메뉴');
          const items = [];
          function selectTab(item) {
            for (const entry of items) {
              const selected = entry === item;
              entry.button.setAttribute('aria-selected', String(selected));
              entry.button.tabIndex = selected ? 0 : -1;
              entry.panel.hidden = !selected;
            }
            const bounds = tabs.getBoundingClientRect();
            const button = item.button.getBoundingClientRect();
            if (button.left < bounds.left) tabs.scrollLeft += button.left - bounds.left;
            else if (button.right > bounds.right) tabs.scrollLeft += button.right - bounds.right;
            void item.activate?.();
          }
          function managementPanel(key, label, icon) {
            const button = append(tabs, 'button', '');
            button.type = 'button';
            button.id = 'owner-tab-' + business.id + '-' + key;
            button.setAttribute('role', 'tab');
            append(button, 'span', icon).setAttribute('aria-hidden', 'true');
            button.append(label);
            const panel = append(card, 'div', '');
            panel.className = 'owner-management-panel';
            panel.id = button.id + '-panel';
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', button.id);
            button.setAttribute('aria-controls', panel.id);
            const item = {button, panel};
            items.push(item);
            button.onclick = () => selectTab(item);
            button.onkeydown = event => {
              const index = items.indexOf(item);
              const next = {ArrowLeft:(index + items.length - 1) % items.length,
                ArrowRight:(index + 1) % items.length, Home:0, End:items.length - 1}[event.key];
              if (next === undefined) return;
              event.preventDefault();
              selectTab(items[next]);
              items[next].button.focus({preventScroll:true});
            };
            return item;
          }
          const basicTab = managementPanel('info', '기본정보', 'ℹ');
          const galleryTab = managementPanel('photos', '업소 사진', '📷');
          const gallery = galleryTab.panel;
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
          galleryTab.activate = async () => {
            if (expected || busy) return;
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
          };
          const specialsTab = managementPanel('specials', '할인·특선', '🏷');
          const specials = specialsTab.panel;
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

          let specialsLoading = false;
          specialsTab.activate = async () => {
            if (specialsLoading || specialBusy || specialBody.querySelector('form')) return;
            specialsLoading = true;
            try { await loadSpecials(); }
            finally { specialsLoading = false; }
          };
          const couponsTab = managementPanel('coupons', '쿠폰', '🎟');
          const coupons = couponsTab.panel;
          const couponStatus = append(coupons, 'p', '');
          couponStatus.setAttribute('role', 'status');
          const couponBody = append(coupons, 'div', '');
          const couponQuery = '?content=coupons&business=' + encodeURIComponent(business.id);
          let couponBusy = false;
          const history = append(coupons, 'details', '');
          append(history, 'summary', '사용 내역');
          const historyBody = append(history, 'div', '');
          const historyDate = new Intl.DateTimeFormat('ko-KR', {
            timeZone:'America/Chicago', dateStyle:'medium', timeStyle:'short',
          });
          async function loadCouponHistory() {
            historyBody.textContent = '사용 내역을 불러오는 중입니다.';
            try {
              const {totals, recent} = await request(couponQuery + '&view=history');
              historyBody.replaceChildren();
              append(historyBody, 'p', '미사용은 만료되거나 재발급으로 취소된 코드를 포함합니다. 시간은 Dallas 기준입니다.');
              for (const row of totals) {
                append(historyBody, 'p', row.title + ' · 발급 ' + row.issued + ' · 사용 완료 ' + row.used + ' · 미사용 ' + row.unused);
              }
              append(historyBody, 'h4', '최근 기록 (최대 100건)');
              const states = {used:'사용 완료',pending:'미사용',expired:'만료',revoked:'재발급으로 취소'};
              for (const row of recent) {
                append(historyBody, 'p', historyDate.format(new Date(row.occurred_at)) + ' · ' + row.title + ' · ' + states[row.state]);
              }
              if (!recent.length) append(historyBody, 'p', '사용 내역이 없습니다.');
            } catch (error) {
              const code = ['COUPON_HISTORY_DENIED','COUPON_HISTORY_UNAVAILABLE','COUPON_HISTORY_QUERY_FAILED','OWNER_QA_PILOT_OFF','OWNER_AUTH_REQUIRED'].includes(error.code)
                ? error.code : error.status ? 'HTTP_' + error.status : 'COUPON_HISTORY_NETWORK';
              historyBody.textContent = '사용 내역을 불러오지 못했습니다. (' + code + ')';
            }
          }
          history.addEventListener('toggle', () => { if (history.open) void loadCouponHistory(); });

          async function loadCoupons() {
            try {
              const rows = await request(couponQuery);
              couponBody.replaceChildren();
              const list = append(couponBody, 'div', '');
              const form = append(couponBody, 'form', '');
              let selected;
              const fields = {};
              function field(name, label, type) {
                const input = append(append(form, 'label', label), type === 'textarea' ? 'textarea' : 'input', '');
                if (type !== 'textarea') input.type = type;
                fields[name] = input;
                return input;
              }
              field('title', '쿠폰 제목', 'text').required = true;
              field('description_ko', '한글 설명', 'textarea');
              field('description_en', 'English description', 'textarea');
              field('terms', '사용 조건', 'textarea');
              field('discount_label', '할인 내용', 'text').required = true;
              field('start_at', '시작 (기기 현지 시간)', 'datetime-local').required = true;
              field('end_at', '종료 (기기 현지 시간)', 'datetime-local').required = true;
              const localTime = value => {
                if (!value) return '';
                const date = new Date(value);
                return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
              };
              const media = append(form, 'div', '');
              media.className = 'pilot-special-image';
              const preview = append(media, 'img', '');
              preview.alt = '쿠폰 이미지';
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
                if ((imageUrl || imageFile) && !window.confirm('쿠폰 이미지를 교체할까요?')) return;
                imagePicker.value = '';
                imagePicker.click();
              };
              imagePicker.onchange = () => {
                const file = imagePicker.files[0];
                if (!file) return;
                if (file.size > 4 * 1024 * 1024) {
                  couponStatus.textContent = '4MB 이하의 사진을 선택해 주세요.';
                  return;
                }
                imageFile = file;
                renderImage();
              };
              removeImage.onclick = () => {
                if (!window.confirm('쿠폰 이미지 참조를 삭제할까요?')) return;
                imageFile = undefined;
                imageUrl = null;
                renderImage();
              };
              append(form, 'button', '저장 및 공개').type = 'submit';
              const reset = append(form, 'button', '새 쿠폰');
              reset.type = 'button';
              reset.onclick = () => { selected = undefined; form.reset(); imageUrl = null; imageFile = undefined; renderImage(); };
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
                  const description = (row.description || '').split(/\n\n(?=English:|사용 조건:)/);
                  fields.description_ko.value = description.find(text => !/^(English:|사용 조건:)/.test(text)) || '';
                  fields.description_en.value = (description.find(text => text.startsWith('English: ')) || '').slice(9);
                  fields.terms.value = (description.find(text => text.startsWith('사용 조건: ')) || '').slice(7);
                  fields.title.value = row.title || '';
                  fields.discount_label.value = row.discount_label || '';
                  fields.start_at.value = localTime(row.start_at);
                  fields.end_at.value = localTime(row.end_at);
                };
                if (row.is_active) {
                  const verify = append(item, 'button', '고객 사용 코드 확인');
                  verify.type = 'button';
                  verify.onclick = async () => {
                    if (couponBusy) return;
                    const proof = window.prompt('고객 화면의 일회용 사용 코드를 입력해 주세요.')?.trim();
                    if (!proof || !window.confirm('이 쿠폰을 사용 처리할까요?')) return;
                    couponBusy = true;
                    verify.disabled = true;
                    try {
                      const result = await request(couponQuery, {action:'redeem_use_proof',id:row.id,proof});
                      const messages = {
                        redeemed:'쿠폰 사용이 확인되었습니다.',
                        used:'이미 사용된 쿠폰입니다.',
                        expired:'사용 코드가 만료되었습니다.',
                        revoked:'재발급으로 취소된 코드입니다.',
                        invalid:'이 쿠폰의 사용 코드가 아닙니다.',
                        rate_limited:'확인 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.',
                      };
                      couponStatus.textContent = messages[result] || '사용 코드를 확인하지 못했습니다.';
                      if (history.open) void loadCouponHistory();
                    } catch {
                      couponStatus.textContent = '사용 코드를 확인하지 못했습니다. 코드와 유효기간을 확인해 주세요.';
                    } finally {
                      couponBusy = false;
                      verify.disabled = false;
                    }
                  };
                }
                const end = append(item, 'button', '종료');
                end.type = 'button';
                end.disabled = !row.is_active;
                end.onclick = () => {
                  if (window.confirm('이 쿠폰의 공개를 종료할까요?')) void saveCoupon({action:'end',id:row.id,expected:row.updated_at});
                };
              }
              form.onsubmit = async event => {
                event.preventDefault();
                if (couponBusy) return;
                const start = new Date(fields.start_at.value);
                const end = new Date(fields.end_at.value);
                if (!(end > start)) {
                  couponStatus.textContent = '종료일은 시작일보다 뒤여야 합니다.';
                  return;
                }
                const description = [fields.description_ko.value.trim(),
                  fields.description_en.value.trim() && 'English: ' + fields.description_en.value.trim(),
                  fields.terms.value.trim() && '사용 조건: ' + fields.terms.value.trim()].filter(Boolean).join('\n\n');
                await saveCoupon({action:'save', fields:{title:fields.title.value.trim(),
                  discount_label:fields.discount_label.value.trim(), description,
                  start_at:start.toISOString(),end_at:end.toISOString(),image_url:imageUrl},
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
              couponStatus.textContent = error.status === 503 ? '쿠폰 관리는 준비 중입니다.' : '쿠폰을 불러오지 못했습니다.';
            }
          }

          async function saveCoupon(command, prepare) {
            if (couponBusy || current !== generation) return;
            couponBusy = true;
            const controls = [...couponBody.querySelectorAll('button, input, textarea, select')]
              .filter(control => !control.disabled);
            for (const control of controls) control.disabled = true;
            try {
              if (prepare) await prepare(command);
              await request(couponQuery, {...command,key:crypto.randomUUID()});
              couponStatus.textContent = command.action === 'end' ? '공개를 종료했습니다.'
                : '저장되었습니다. 적용 조건에 따라 공개됩니다.';
              await loadCoupons();
            } catch (error) {
              couponStatus.textContent = error.status === 409 ? '목록을 다시 열어 최신 내용을 확인해 주세요.'
                : '저장 결과를 확인하지 못했습니다. 목록을 다시 열어 확인해 주세요.';
            } finally {
              couponBusy = false;
              for (const control of controls) control.disabled = false;
            }
          }

          let couponsLoading = false;
          couponsTab.activate = async () => {
            if (couponsLoading || couponBusy || couponBody.querySelector('form')) return;
            couponsLoading = true;
            try { await loadCoupons(); }
            finally { couponsLoading = false; }
          };
          const eventsTab = managementPanel('events', '이벤트', '🎉');
          const events = eventsTab.panel;
          const eventStatus = append(events, 'p', '');
          eventStatus.setAttribute('role', 'status');
          const eventBody = append(events, 'div', '');
          const eventQuery = '?content=events&business=' + encodeURIComponent(business.id);
          let eventBusy = false;
          async function loadEvents() {
            try {
              const rows = await request(eventQuery);
              eventBody.replaceChildren();
              const list = append(eventBody, 'div', '');
              const form = append(eventBody, 'form', '');
              let selected;
              const fields = {};
              function field(name, label, type) {
                const input = append(append(form, 'label', label), type === 'textarea' ? 'textarea' : 'input', '');
                if (type !== 'textarea') input.type = type;
                fields[name] = input;
                return input;
              }
              field('title', '이벤트 제목', 'text').required = true;
              field('title_en', 'English title', 'text');
              field('description', '설명', 'textarea');
              field('address', '장소', 'text').required = true;
              field('start_at', '시작 (기기 현지 시간)', 'datetime-local').required = true;
              field('end_at', '종료 (기기 현지 시간)', 'datetime-local').required = true;
              const localTime = value => {
                if (!value) return '';
                const date = new Date(value);
                return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
              };
              const media = append(form, 'div', '');
              media.className = 'pilot-special-image';
              const preview = append(media, 'img', '');
              preview.alt = '이벤트 이미지';
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
                if ((imageUrl || imageFile) && !window.confirm('이벤트 이미지를 교체할까요?')) return;
                imagePicker.value = '';
                imagePicker.click();
              };
              imagePicker.onchange = () => {
                const file = imagePicker.files[0];
                if (!file) return;
                if (file.size > 4 * 1024 * 1024) {
                  eventStatus.textContent = '4MB 이하의 사진을 선택해 주세요.';
                  return;
                }
                imageFile = file;
                renderImage();
              };
              removeImage.onclick = () => {
                if (!window.confirm('이벤트 이미지 참조를 삭제할까요?')) return;
                imageFile = undefined;
                imageUrl = null;
                renderImage();
              };
              append(form, 'button', '저장 및 공개').type = 'submit';
              const reset = append(form, 'button', '새 이벤트');
              reset.type = 'button';
              reset.onclick = () => { selected = undefined; form.reset(); imageUrl = null; imageFile = undefined; renderImage(); };
              for (const row of rows) {
                const item = append(list, 'div', '');
                append(item, 'p', row.title + (!row.is_active ? ' · 종료' : new Date(row.end_at)<=new Date() ? ' · 만료' : new Date(row.start_at)>new Date() ? ' · 공개 예정' : ' · 공개'));
                const edit = append(item, 'button', '수정');
                edit.type = 'button';
                edit.onclick = () => {
                  selected = row;
                  imageUrl = row.image_url || null;
                  imageFile = undefined;
                  renderImage();
                  for (const name of ['title','title_en','description','address']) fields[name].value = row[name] || '';
                  fields.start_at.value = localTime(row.start_at);
                  fields.end_at.value = localTime(row.end_at);
                };
                const end = append(item, 'button', '종료');
                end.type = 'button';
                end.disabled = !row.is_active;
                end.onclick = () => {
                  if (window.confirm('이 이벤트의 공개를 종료할까요?')) void saveEvent({action:'end',id:row.id,expected:row.updated_at});
                };
              }
              if (!rows.length) append(list, 'p', '등록된 이벤트가 없습니다.');
              form.onsubmit = async event => {
                event.preventDefault();
                if (eventBusy) return;
                const start = new Date(fields.start_at.value);
                const end = new Date(fields.end_at.value);
                if (!(end > start)) {
                  eventStatus.textContent = '종료일은 시작일보다 뒤여야 합니다.';
                  return;
                }
                await saveEvent({action:'save', fields:{title:fields.title.value.trim(),title_en:fields.title_en.value.trim(),
                  address:fields.address.value.trim(),description:fields.description.value.trim(),
                  start_at:start.toISOString(),end_at:end.toISOString(),image_url:imageUrl},
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
              eventStatus.textContent = error.status === 503 ? '이벤트 관리는 준비 중입니다.' : '이벤트을 불러오지 못했습니다.';
            }
          }

          async function saveEvent(command, prepare) {
            if (eventBusy || current !== generation) return;
            eventBusy = true;
            const controls = [...eventBody.querySelectorAll('button, input, textarea, select')]
              .filter(control => !control.disabled);
            for (const control of controls) control.disabled = true;
            try {
              if (prepare) await prepare(command);
              await request(eventQuery, {...command,key:crypto.randomUUID()});
              eventStatus.textContent = command.action === 'end' ? '공개를 종료했습니다.'
                : '저장되었습니다. 적용 조건에 따라 공개됩니다.';
              await loadEvents();
            } catch (error) {
              eventStatus.textContent = error.status === 409 ? '목록을 다시 열어 최신 내용을 확인해 주세요.'
                : '저장 결과를 확인하지 못했습니다. 목록을 다시 열어 확인해 주세요.';
            } finally {
              eventBusy = false;
              for (const control of controls) control.disabled = false;
            }
          }

          let eventsLoading = false;
          eventsTab.activate = async () => {
            if (eventsLoading || eventBusy || eventBody.querySelector('form')) return;
            eventsLoading = true;
            try { await loadEvents(); }
            finally { eventsLoading = false; }
          };
          const menuTab = managementPanel('menu', '메뉴 관리', '📋');
          const menu = menuTab.panel;
          const menuStatus = append(menu, 'p', '');
          menuStatus.setAttribute('role', 'status');
          const menuBody = append(menu, 'div', '');
          const menuQuery = '?content=menu&business=' + encodeURIComponent(business.id);
          let menuBusy = false;
          let menuRequest;
          async function loadMenu() {
            try {
              const rows = await request(menuQuery);
              menuBody.replaceChildren();
              const list = append(menuBody, 'div', '');
              const form = append(menuBody, 'form', '');
              let selected;
              const fields = {};
              function field(name, label, type) {
                const input = append(append(form, 'label', label), type === 'textarea' ? 'textarea' : 'input', '');
                if (type !== 'textarea') input.type = type;
                fields[name] = input;
                return input;
              }
              field('title', '메뉴·서비스명', 'text').required = true;
              field('title_en', 'English title', 'text');
              field('description', '설명', 'textarea');
              const price = field('price', '가격 (USD, 선택)', 'number');
              price.min = '0'; price.max = '1000000'; price.step = '0.01';
              const order = field('sort_order', '표시 순서 (작은 숫자부터)', 'number');
              order.required = true; order.min = '0'; order.max = '100000'; order.defaultValue = '100';
              field('sold_out', '품절', 'checkbox');
              field('is_active', '공개', 'checkbox').defaultChecked = true;
              const media = append(form, 'div', '');
              media.className = 'pilot-special-image';
              const preview = append(media, 'img', '');
              preview.alt = '메뉴 이미지';
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
                if ((imageUrl || imageFile) && !window.confirm('메뉴 이미지를 교체할까요?')) return;
                imagePicker.value = '';
                imagePicker.click();
              };
              imagePicker.onchange = () => {
                const file = imagePicker.files[0];
                if (!file) return;
                if (file.size > 4 * 1024 * 1024) {
                  menuStatus.textContent = '4MB 이하의 사진을 선택해 주세요.';
                  return;
                }
                imageFile = file;
                renderImage();
              };
              removeImage.onclick = () => {
                if (!window.confirm('메뉴 이미지 참조를 삭제할까요?')) return;
                imageFile = undefined;
                imageUrl = null;
                renderImage();
              };
              append(form, 'button', '저장 및 공개').type = 'submit';
              const reset = append(form, 'button', '새 메뉴');
              reset.type = 'button';
              reset.onclick = () => { selected = undefined; form.reset(); imageUrl = null; imageFile = undefined; renderImage(); };
              for (const row of rows) {
                const item = append(list, 'div', '');
                append(item, 'p', row.title + (!row.is_active ? ' · 비공개' : row.sold_out ? ' · 품절' : ' · 공개'));
                const edit = append(item, 'button', '수정');
                edit.type = 'button';
                edit.onclick = () => {
                  selected = row;
                  imageUrl = row.image_url || null;
                  imageFile = undefined;
                  renderImage();
                  for (const name of ['title','title_en','description']) fields[name].value = row[name] || '';
                  fields.price.value = row.price_cents == null ? '' : (row.price_cents / 100).toFixed(2);
                  fields.sort_order.value = row.sort_order;
                  fields.sold_out.checked = row.sold_out;
                  fields.is_active.checked = row.is_active;
                };
                const end = append(item, 'button', '목록에서 제거');
                end.type = 'button';
                end.disabled = !row.is_active;
                end.onclick = () => {
                  if (window.confirm('이 메뉴를 공개 목록에서 제거할까요?')) void saveMenu({action:'end',id:row.id,expected:row.updated_at});
                };
              }
              if (!rows.length) append(list, 'p', '등록된 메뉴가 없습니다.');
              form.onsubmit = async event => {
                event.preventDefault();
                if (menuBusy) return;
                await saveMenu({action:'save', fields:{title:fields.title.value.trim(),title_en:fields.title_en.value.trim(),
                  description:fields.description.value.trim(),price_cents:fields.price.value === '' ? null : Math.round(Number(fields.price.value)*100),
                  sort_order:Number(fields.sort_order.value),sold_out:fields.sold_out.checked,is_active:fields.is_active.checked,image_url:imageUrl},
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
              return true;
            } catch (error) {
              menuStatus.textContent = error.status === 503 ? '메뉴 관리는 준비 중입니다.' : '메뉴를 불러오지 못했습니다.';
              return false;
            }
          }

          async function saveMenu(command, prepare) {
            if (menuBusy || current !== generation) return;
            menuBusy = true;
            const controls = [...menuBody.querySelectorAll('button, input, textarea, select')]
              .filter(control => !control.disabled);
            for (const control of controls) control.disabled = true;
            try {
              if (prepare) {
                try { await prepare(command); }
                catch (_) { menuStatus.textContent = '사진을 업로드하지 못했습니다. 입력 내용은 유지됩니다.'; return; }
              }
              const payload = JSON.stringify(command);
              if (menuRequest && menuRequest.payload !== payload) {
                menuStatus.textContent = '이전 저장 결과가 미확인입니다. 목록을 새로고침해 확인해 주세요.';
                return;
              }
              menuRequest ??= {payload,key:crypto.randomUUID()};
              const saved = await request(menuQuery, {...command,key:menuRequest.key});
              if (!saved?.id) throw Error('Missing menu receipt');
              menuRequest = undefined;
              const refreshed = await loadMenu();
              menuStatus.textContent = refreshed
                ? command.action === 'end' ? '공개를 종료했습니다.' : '메뉴를 저장했습니다.'
                : '저장됐지만 메뉴 목록을 새로고침하지 못했습니다.';
            } catch (error) {
              if ([400,401,403,409].includes(error.status)) menuRequest = undefined;
              menuStatus.textContent = ({
                400:'메뉴 이름, 가격, 순서와 사진을 확인해 주세요.',
                401:'로그인이 만료됐습니다. 다시 로그인해 주세요.',
                403:'이 업소의 메뉴를 변경할 권한이 없습니다.',
                409:'메뉴가 변경됐습니다. 목록을 다시 열어 최신 내용을 확인해 주세요.',
              })[error.status] || '저장 결과를 확인하지 못했습니다. 같은 내용으로 재시도해 주세요.';
            } finally {
              menuBusy = false;
              for (const control of controls) control.disabled = false;
            }
          }

          let menuLoading = false;
          menuTab.activate = async () => {
            if (menuLoading || menuBusy || menuBody.querySelector('form')) return;
            menuLoading = true;
            try { await loadMenu(); }
            finally { menuLoading = false; }
          };
          const bookingTab = managementPanel('booking', '예약 관리', '📅');
          const booking = bookingTab.panel;
          const bookingStatus=append(booking,'p','');
          bookingStatus.setAttribute('role','status');
          const bookingBody=append(booking,'div','');
          const bookingQuery='?content=reservations&business='+encodeURIComponent(business.id);
          const states={pending:'승인 대기',confirmed:'확정',rejected:'거절',cancelled:'취소'};
          let bookingBusy=false;
          async function changeBooking(command){
            if(bookingBusy)return;
            bookingBusy=true;
            try{
              await request(bookingQuery,command);
              const result=await request(bookingQuery);
              if(command.action==='settings' && result.settings?.enabled!==command.settings.enabled)
                throw Error('Settings mismatch');
              drawBooking(result);
              bookingStatus.textContent='예약 변경을 저장했습니다.';
            }catch(error){
              bookingStatus.textContent=error.code==='RESERVATION_BOT_CHECK_UNAVAILABLE'?'예약 보안 확인 설정이 완료되면 접수를 켤 수 있습니다.':error.status===403?'이 업소는 예약 파일럿 대상이 아닙니다.':
                error.status===409?'이미 변경된 예약입니다. 목록을 다시 열어 주세요.':'예약 변경 결과를 확인하지 못했습니다.';
            }finally{bookingBusy=false;}
          }
          function drawBooking(result){
            bookingBody.replaceChildren();
            const cfg=result.settings||{};
            const form=append(bookingBody,'form','');
            function field(label,type,value){
              const input=append(append(form,'label',label),'input','');
              input.type=type;
              if(type==='checkbox')input.checked=!!value;
              else input.value=value;
              return input;
            }
            const enabled=field('예약 기능 켜기','checkbox',cfg.enabled);
            const days=['일','월','화','수','목','금','토'].map((label,i)=>field(label,'checkbox',(cfg.weekdays||[1,2,3,4,5]).includes(i)));
            const opens=field('접수 시작','time',cfg.opens||'09:00');
            const closes=field('접수 종료','time',cfg.closes||'17:00');
            function select(label,choices,value){
              const input=append(append(form,'label',label),'select','');
              for(const [key,text] of choices)append(input,'option',text).value=key;
              input.value=value;
              return input;
            }
            const interval=select('간격',[15,30,60].map(n=>[n,n+'분']),cfg.slot_minutes||30);
            const capacity=field('정원','number',cfg.capacity||4);
            capacity.min='1';capacity.max='100';capacity.required=true;
            const mode=select('정원 단위',[['people','인원'],['bookings','건수']],cfg.capacity_mode||'people');
            const zone=select('현지 시간대',[['America/Chicago','Dallas'],['America/Denver','Denver']],cfg.zone||'America/Chicago');
            append(form,'p','업주 승인 후 예약이 확정됩니다.');
            append(form,'button','예약 설정 저장').type='submit';
            form.onsubmit=event=>{
              event.preventDefault();
              void changeBooking({action:'settings',settings:{enabled:enabled.checked,
                weekdays:days.flatMap((d,i)=>d.checked?[i]:[]),opens:opens.value,closes:closes.value,
                slot_minutes:Number(interval.value),capacity:Number(capacity.value),capacity_mode:mode.value,zone:zone.value}});
            };
            append(bookingBody,'p',Object.entries(states).map(([key,value])=>value+' '+(result.counts[key]||0)+'건').join(' · '));
            const filter=append(append(bookingBody,'label','상태'),'select','');
            append(filter,'option','전체').value='';
            for(const [key,value] of Object.entries(states))append(filter,'option',value).value=key;
            const day=append(append(bookingBody,'label','예약 날짜'),'input','');day.type='date';
            const list=append(bookingBody,'div','');
            const tz=cfg.zone||'America/Chicago';
            const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'});
            const timeFormat=new Intl.DateTimeFormat('ko-KR',{timeZone:tz,dateStyle:'medium',timeStyle:'short'});
            function drawList(){
              list.replaceChildren();
              for(const row of result.reservations){
                if(filter.value&&row.status!==filter.value)continue;
                const when=new Date(row.starts_at);
                if(day.value&&dateFormat.format(when)!==day.value)continue;
                const item=append(list,'details','');
                append(item,'summary',timeFormat.format(when)+' · '+states[row.status]+' · '+row.party+'명');
                append(item,'p',[row.name,row.phone,row.email,row.note].filter(Boolean).join(' · '));
                const actions=row.status==='pending'?[['confirmed','승인'],['rejected','거절'],['cancelled','취소']]:
                  row.status==='confirmed'?[['cancelled','취소']]:[];
                for(const [action,label] of actions){
                  const button=append(item,'button',label);button.type='button';
                  button.onclick=()=>{if(window.confirm(label+' 처리할까요?'))void changeBooking({action,id:row.id});};
                }
              }
              if(!list.childElementCount)append(list,'p','해당 예약이 없습니다.');
            }
            filter.onchange=day.onchange=drawList;drawList();
          }
          bookingTab.activate = async () => {
            if (bookingBusy || bookingBody.querySelector('form')) return;
            bookingBusy = true;
            try { drawBooking(await request(bookingQuery)); }
            catch { bookingStatus.textContent = '예약 목록을 불러오지 못했습니다.'; }
            finally { bookingBusy = false; }
          };
          const basic = basicTab.panel;
          const description = append(append(basic, 'label', '소개'), 'textarea', '');
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
          const hours = append(basic, 'fieldset', '');
          append(hours, 'legend', '영업시간');
          const feedbackHours = append(basic, 'p', '');
          feedbackHours.setAttribute('role', 'status');
          const saveInfo = append(basic, 'button', '정보 저장');
          saveInfo.type = 'button';
          saveInfo.disabled = true;
          const hoursQuery = '?content=hours&business=' + encodeURIComponent(business.id);
          const dayFields = new Map();
          const legacyHours = typeof business.hours === 'string' ? business.hours : '';
          let originalHours, originalDescription = description.value, loadingHours = false;
          function drawHours(value) {
            originalHours = value;
            dayFields.clear();
            hours.replaceChildren();
            append(hours, 'legend', '영업시간');
            if (legacyHours) append(hours, 'p', '기존 영업시간 안내 · ' + legacyHours);
            if (value !== null && (typeof value !== 'object' || Array.isArray(value))) {
              append(hours, 'p', '기존 영업시간 형식은 관리자에게 수정을 요청해 주세요.');
              return;
            }
            for (const [day, name] of [['mon','월'],['tue','화'],['wed','수'],['thu','목'],['fri','금'],['sat','토'],['sun','일']]) {
              const row = append(hours, 'fieldset', '');
              row.className = 'owner-hours-day';
              append(row, 'legend', name + '요일');
              const previous = value?.[day];
              if (previous !== undefined && (!previous || typeof previous !== 'object' || Array.isArray(previous))) {
                append(row, 'p', '기존 값은 관리자에게 수정을 요청해 주세요.');
                continue;
              }
              const closedLabel = append(row, 'label', '');
              const closed = append(closedLabel, 'input', '');
              closed.type = 'checkbox';
              closed.checked = previous?.closed === true || previous?.closed === 'true';
              closedLabel.append('휴무');
              const grid = append(row, 'div', '');
              grid.className = 'owner-hours-fields';
              const fields = new Map([['closed', closed]]);
              for (const [key, label] of [['open1','시작'],['close1','종료'],['open2','추가 시작'],['close2','추가 종료']]) {
                const input = append(append(grid, 'label', label), 'input', '');
                input.placeholder = '11:00 AM';
                input.maxLength = 60;
                input.value = typeof previous?.[key] === 'string' ? previous[key] : '';
                fields.set(key,input);
              }
              dayFields.set(day, {fields, initial:new Map([...fields].map(([key,input])=>[key,key==='closed'?input.checked:input.value]))});
            }
          }
          basicTab.activate = async () => {
            fitDescription();
            if (loadingHours || originalHours !== undefined) return;
            loadingHours = true;
            try {
              drawHours((await request(hoursQuery)).hours);
              saveInfo.disabled = false;
              feedbackHours.textContent = '';
            } catch (error) {
              feedbackHours.textContent = error.message + ' 기본정보 탭을 다시 선택해 주세요.';
            } finally { loadingHours = false; }
          };
          saveInfo.onclick = async () => {
            if (saveInfo.disabled) return;
            const days = {}, expected = {};
            for (const [day, {fields, initial}] of dayFields) {
              const patch = {};
              for (const [key, input] of fields) {
                const value = key==='closed'?input.checked:input.value;
                if (value !== initial.get(key)) patch[key]=value;
              }
              if (Object.keys(patch).length) {
                days[day]=patch;
                expected[day]=originalHours?.[day]??null;
              }
            }
            const submittedDescription = description.value;
            const command = {days, expected, key:crypto.randomUUID()};
            if (submittedDescription !== originalDescription) command.description=submittedDescription;
            saveInfo.disabled = true;
            for (const group of dayFields.values()) for (const input of group.fields.values()) input.disabled=true;
            description.readOnly = true;
            try {
              const result = await request(hoursQuery, command);
              originalDescription = submittedDescription;
              drawHours(result.hours);
              feedbackHours.textContent = '기본정보를 저장했습니다.';
            } catch (error) {
              feedbackHours.textContent = error.status===409
                ? '영업시간이 변경됐거나 기존 형식을 확인해야 합니다. 입력을 복사한 뒤 새로고침해 주세요.' : error.message;
            } finally {
              for (const group of dayFields.values()) for (const input of group.fields.values()) input.disabled=false;
              description.readOnly = false;
              saveInfo.disabled = false;
            }
          };
          selectTab(basicTab);
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
