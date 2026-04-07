let bannerTimer = null;

function stopBannerAuto() {
  if (bannerTimer) {
    clearInterval(bannerTimer);
    bannerTimer = null;
  }
}

function isDallasPage() {
  const txt =
    document.getElementById('topRegionLabel')?.textContent ||
    document.querySelector('.brand-sub.solo')?.textContent ||
    document.querySelector('.brand-sub')?.textContent ||
    '';

  const r = String(txt).toLowerCase();
  return r.includes('dallas') || r.includes('dfw') || r.includes('fort worth');
}

function getBannerConfig() {
  const cfg = window.KFOCUS_CONFIG || {};
  return {
    url: String(cfg.SUPABASE_URL || '').trim().replace(/\/+$/, ''),
    key: String(cfg.SUPABASE_ANON_KEY || '').trim()
  };
}

async function fetchDallasBanners() {
  const { url, key } = getBannerConfig();
  if (!url || !key) return [];

  const endpoint =
    `${url}/rest/v1/banners?select=*` +
    `&is_active=eq.true` +
    `&region=eq.dallas` +
    `&order=sort_order.asc`;

  const res = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`
    }
  });

  if (!res.ok) return [];
  return await res.json();
}

function renderBannerSlider(container, banners) {
  container.innerHTML = `
    <div class="kfocus-banner-wrap">
      <div class="kfocus-banner-stage">
        ${banners.map((banner, i) => `
          <article class="kfocus-banner-card ${i === 0 ? 'active' : ''}" data-index="${i}">
            <a href="#" class="kfocus-banner-link" data-business-id="${banner.business_id || ''}" data-link-url="${banner.link_url || ''}"><img src="${banner.image_url}" alt=""></a>
          </article>
        `).join('')}
      </div>
      <div class="kfocus-banner-nav">
        ${banners.map((_, i) => `
          <button type="button" class="kfocus-banner-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></button>
        `).join('')}
      </div>
    </div>
  `;

  const slides = Array.from(container.querySelectorAll('.kfocus-banner-card'));
  const dots = Array.from(container.querySelectorAll('.kfocus-banner-dot'));
  let current = 0;

  function showSlide(index) {
    if (!slides.length) return;
    if (index < 0) index = slides.length - 1;
    if (index >= slides.length) index = 0;
    current = index;

    slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === current);
    });

    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === current);
    });

    console.log('showSlide index =', current);
  }

  function nextSlide() {
    showSlide(current + 1);
  }

  stopBannerAuto();
  if (slides.length > 1) {
    bannerTimer = setInterval(nextSlide, 4000);
  }

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const idx = Number(dot.dataset.index || 0);
      showSlide(idx);
    });
  });

  showSlide(0);
}

async function loadMainBanners() {
  const container = document.getElementById('mainBanners');
  if (!container) return;

  if (!isDallasPage()) {
    container.innerHTML = '';
    stopBannerAuto();
    return;
  }

  const data = await fetchDallasBanners();

  if (!Array.isArray(data) || !data.length) {
    container.innerHTML = '';
    stopBannerAuto();
    return;
  }

  renderBannerSlider(container, data);
}

document.addEventListener('DOMContentLoaded', () => {
  loadMainBanners();
  setTimeout(loadMainBanners, 800);
  setTimeout(loadMainBanners, 1800);
  setTimeout(loadMainBanners, 3000);
});

window.loadMainBanners = loadMainBanners;


// 배너 클릭 -> 지도 이동 + 하단 카드 자동 오픈
(function() {
  if (window.__kfocusBannerMapCardApplied) return;
  window.__kfocusBannerMapCardApplied = true;

  document.addEventListener('click', function(e) {
    const link = e.target.closest('.kfocus-banner-link');
    if (!link) return;

    const businessId = link.dataset.businessId;
    const linkUrl = link.dataset.linkUrl;

    if (businessId) {
      e.preventDefault();

      if (typeof window.openBusinessMapCard === 'function') {
        window.openBusinessMapCard(businessId);
        return;
      }

      console.warn('openBusinessMapCard 함수 없음:', businessId);
      return;
    }

    if (linkUrl) {
      e.preventDefault();
      window.open(linkUrl, '_blank');
    }
  });
})();
