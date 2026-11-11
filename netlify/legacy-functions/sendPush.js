exports.handler = async (event) => {
  if (event.httpMethod && event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { title, message, region } = JSON.parse(event.body || '{}');

    if (!title || !message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'title and message are required' })
      };
    }

    const appId = process.env.ONESIGNAL_APP_ID;
    const apiKey = process.env.ONESIGNAL_REST_API_KEY;

    if (!appId || !apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing OneSignal environment variables' })
      };
    }

    const payload = {
      app_id: appId,
      headings: { en: title, ko: title },
      contents: { en: message, ko: message }
    };

    if (region && region !== 'all') {
      payload.filters = [
        { field: 'tag', key: 'region', relation: '=', value: region }
      ];
    } else {
      payload.included_segments = ['Subscribed Users'];
    }

    const response = await fetch('https://api.onesignal.com/notifications?c=push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.errors || data.error || 'OneSignal request failed', raw: data })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Unexpected server error' })
    };
  }
};
