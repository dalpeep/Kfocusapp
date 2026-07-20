const { createClient } = require('@supabase/supabase-js');

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, {
      error: 'POST 요청만 허용됩니다.'
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, {
      error: 'Supabase 서버 환경변수가 없습니다.'
    });
  }

  const adminClient = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  try {
    const body = JSON.parse(event.body || '{}');

    const email = String(body.email || '')
      .trim()
      .toLowerCase();

    const role = String(body.role || '').trim();
    const area = String(body.area || '').trim();

    if (!email) {
      return json(400, {
        error: '이메일을 입력하세요.'
      });
    }

    const allowedRoles = [
    'super_admin',
    'regional_editor',
    'regional_admin',
    'admin'
    ];

    if (!allowedRoles.includes(role)) {
      return json(400, {
        error: '허용되지 않은 관리자 권한입니다.'
      });
    }

    const allowedAreas = [
      'all',
      'dallas',
      'colorado',
      'denver'
    ];

    if (!allowedAreas.includes(area)) {
      return json(400, {
        error: '허용되지 않은 지역입니다.'
      });
    }

    /*
     * Auth 사용자를 이메일로 검색
     * Supabase listUsers는 페이지 단위이므로
     * 여러 페이지를 순차적으로 확인
     */
    let user = null;
    let page = 1;
    const perPage = 1000;

    while (!user) {
      const {
        data,
        error
      } = await adminClient.auth.admin.listUsers({
        page,
        perPage
      });

      if (error) {
        throw error;
      }

      const users = data?.users || [];

      user = users.find(
        (item) =>
          String(item.email || '').toLowerCase() === email
      );

      if (user || users.length < perPage) {
        break;
      }

      page += 1;
    }

    if (!user) {
      return json(404, {
        error: 'Authentication에서 사용자를 찾을 수 없습니다.'
      });
    }

    /*
     * profiles 테이블에 관리자 권한 저장
     */
    const profilePayload = {
      user_id: user.id,
      role,
      area
    };

    const {
      error: profileError
    } = await adminClient
      .from('profiles')
      .upsert(profilePayload, {
        onConflict: 'user_id'
      });

    if (profileError) {
      throw profileError;
    }

    return json(200, {
      ok: true,
      user: {
        id: user.id,
        email: user.email
      },
      profile: profilePayload
    });
  } catch (error) {
    console.error('set-admin-user error:', error);

    return json(500, {
      error:
        error?.message ||
        '관리자 권한 저장 중 오류가 발생했습니다.'
    });
  }
};

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type':
        'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(data)
  };
}