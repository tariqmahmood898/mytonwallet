// netlify/functions/proxy.js

import fetch from 'node-fetch';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // ✅ Ignore self-signed SSL (for dev only)

export const handler = async (event) => {
  const { path } = event;
  const proxyPath = path.replace('/.netlify/functions/proxy', '');
  const targetUrl = `https://api.mytonwallet.org${proxyPath}`;

  try {
    const response = await fetch(targetUrl, {
      method: event.httpMethod,
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.text();

    return {
      statusCode: response.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: data,
    };
  } catch (error) {
    console.error('Proxy error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
