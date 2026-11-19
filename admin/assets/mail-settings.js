const mailKinds = {
  business: '업소 등록', claim: '소유권 신청', core: '정보 수정',
  coupon: '쿠폰 신청', event: '이벤트 신청', ad: '광고 문의',
};

export function mountMailSettings(anchor, call) {
  if (anchor.querySelector('[data-mail-settings]')) return;
  const section = document.createElement('details');
  section.dataset.mailSettings = '';
  section.innerHTML = '<summary>이메일 알림 관리</summary><form><label>수신 이메일 <input type="email" required maxlength="254"></label><button>확인 메일 보내기</button><button type="button" data-bootstrap>기본 주소 등록</button></form><p role="status"></p><div data-recipients></div><h4>최근 발송 상태</h4><ul></ul>';
  anchor.prepend(section);
  const status = section.querySelector('[role=status]');
  const recipients = section.querySelector('[data-recipients]');
  const history = section.querySelector('ul');
  async function refresh() {
    const result = await call({ action: 'list' });
    recipients.replaceChildren();
    history.replaceChildren(...result.deliveries.map(row => {
      const item = document.createElement('li');
      item.textContent = [row.email, mailKinds[row.kind], row.status, row.finished_at].filter(Boolean).join(' · ');
      return item;
    }));
    for (const row of result.recipients) {
      const form = document.createElement('form');
      const title = document.createElement('h4');
      title.textContent = row.email + (row.verified ? '' : ' · 확인 대기');
      form.append(title);
      const enabled = document.createElement('label');
      enabled.innerHTML = '<input type="checkbox"> 알림 활성화';
      enabled.firstElementChild.checked = row.enabled;
      form.append(enabled);
      const choices = Object.entries(mailKinds).map(([key, label]) => {
        const choice = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = key;
        input.checked = row.kinds.includes(key);
        choice.append(input, ' ' + label);
        form.append(choice);
        return input;
      });
      const save = document.createElement('button');
      save.textContent = '저장';
      const remove = document.createElement('button');
      remove.textContent = '삭제';
      remove.type = 'button';
      form.append(save, remove);
      form.onsubmit = event => {
        event.preventDefault();
        const kinds = choices.filter(input => input.checked).map(input => input.value);
        if (!kinds.length) { status.textContent = '알림 유형을 하나 이상 선택하세요.'; return; }
        void run({ action: 'update', email: row.email, kinds, enabled: enabled.firstElementChild.checked });
      };
      remove.onclick = () => {
        if (confirm('이 수신자를 삭제할까요?')) void run({ action: 'remove', email: row.email });
      };
      recipients.append(form);
    }
  }
  let busy = false;
  async function run(command) {
    if (busy) return;
    busy = true;
    status.textContent = '처리 중…';
    try {
      if (command) await call(command);
      await refresh();
      status.textContent = command?.action === 'add' || command?.action === 'bootstrap'
        ? '확인 메일을 보냈습니다.' : '';
    } catch {
      status.textContent = '이메일 알림 설정을 처리하지 못했습니다.';
    } finally { busy = false; }
  }
  section.ontoggle = () => { if (section.open) void run(); };
  const add = section.querySelector('form');
  add.onsubmit = event => {
    event.preventDefault();
    void run({ action: 'add', email: add.querySelector('input').value });
  };
  section.querySelector('[data-bootstrap]').onclick = () => void run({ action: 'bootstrap' });
}
