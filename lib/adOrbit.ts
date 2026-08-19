import axios from 'axios';
import CryptoJS from 'crypto-js';

async function fetchFromAdOrbit(url: string, method: string, headers?: {}) {
    const API_KEY = process.env.API_KEY;
    const API_PUB = process.env.PUBLIC_KEY;



    // Check if API key is provided
    if (!API_KEY) {
        console.error('Error: API_KEY is required. Please set it in your .env file.');
        process.exit(1);
    }


    const msg = method.toUpperCase() + "\n" + url;

    const hash = CryptoJS.HmacSHA512(msg, API_KEY);
    const crypt = CryptoJS.enc.Utf8.parse(hash.toString());
    const base64 = CryptoJS.enc.Base64.stringify(crypt);

    const res = await axios.get(url, {
        headers: {
            Authorization: "ADORBIT " + API_PUB + ":" + base64,
            Accept: 'application/json',
            Method: method,
            ...headers
        }
    });

    return res.data;
}

export async function getAdOrbitOrders() {
    const API_BASE_URL = process.env.API_BASE_URL || 'https://api.adorbit.com';
    const API_KEY = process.env.API_KEY;

// Check if API key is provided
    if (!API_KEY) {
        console.error('Error: API_KEY is required. Please set it in your .env file.');
        process.exit(1);
    }

    const routes = await fetchFromAdOrbit(API_BASE_URL+"/", 'GET');

    return await fetchFromAdOrbit(routes.orders + "?currentPrint=1", 'GET');
}