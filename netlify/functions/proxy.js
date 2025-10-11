// netlify/functions/proxy.js
import fetch from 'node-fetch';

export async function handler(event) {
  try {
    // dynamic path capture
    const path = event.path.replace('/.netlify/functions/proxy', '');
    const targetUrl = `https://api.mytonwallet.org${path}`;

    const resp = await fetch(targetUrl, {
      method: event.httpMethod,
      headers: { Accept: 'application/json' },
    });

    const text = await resp.text();

    return {
      statusCode: resp.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: text,
    };
  } catch (err) {
    console.error('Proxy error:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Proxy failed' }),
    };
  }
}
