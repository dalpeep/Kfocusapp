exports.handler = async (event) => {
  try {
    const { name, address, google_maps_url } = JSON.parse(event.body || '{}');

    const query = [name, address].filter(Boolean).join(' ');
    if (!query) {
      return { statusCode: 400, body: JSON.stringify({ error: 'name/address required' }) };
    }

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.googleMapsUri'
      },
      body: JSON.stringify({
        textQuery: query
      })
    });
    console.log("Google Status:", res.status);
    const json = await res.json();

    console.log(JSON.stringify(json, null, 2));
	
	if (!res.ok) {
    return {
    statusCode: res.status,
    body: JSON.stringify({
      error: json.error?.message || `Google API error ${res.status}`,
      details: json
    })
  };
}
    const place = json.places?.[0];

    if (!place) {
      return { statusCode: 404, body: JSON.stringify({ error: 'place not found' }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        rating: place.rating || null,
        review_count: place.userRatingCount || 0,
        google_maps_url: place.googleMapsUri || google_maps_url || '',
        place_id: place.id || ''
      })
    };
  } catch (e) {
    console.error(e);

    return {
        statusCode: 500,
        body: JSON.stringify({
            error: e.message,
            stack: e.stack
        })
    };
}
};