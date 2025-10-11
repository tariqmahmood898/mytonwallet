// netlify/functions/proxy.js
import fetch from 'node-fetch';

export async function handler(event) {
  const { path, queryStringParameters, httpMethod, body } = event;

  // اصل Brilliant API URL
  const targetBase = "https://api.mytonwallet.org"; // ← یہ وہ URL ہے جو آپ bypass کرنا چاہتے ہیں
  const targetUrl = `${targetBase}${path.replace('/.netlify/functions/proxy', '')}`;

  const options = {
    method: httpMethod,
    headers: {
      'Content-Type': 'application/json',
      ...(event.headers || {}),
    },
    body: httpMethod !== 'GET' && body ? body : undefined,
  };

  try {
    const response = await fetch(targetUrl, options);
    const data = await response.text();

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: data,
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}