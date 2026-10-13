import axios from 'axios';

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim();
const normalizedApiBase = configuredApiBase
  ? (/^https?:\/\//i.test(configuredApiBase)
      ? configuredApiBase
      : `${configuredApiBase.startsWith('localhost') || configuredApiBase.startsWith('127.0.0.1') ? 'http' : 'https'}://${configuredApiBase}`)
  : '';
const API_BASE = normalizedApiBase
  ? `${normalizedApiBase.replace(/\/+$/, '')}${/\/api$/i.test(normalizedApiBase) ? '' : '/api'}`
  : import.meta.env.DEV
    ? 'http://localhost:4000/api'
    : 'https://hr-dashboard-k21f.onrender.com/api';

const client = axios.create({ baseURL: API_BASE });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('automat_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      localStorage.removeItem('automat_token');
      localStorage.removeItem('automat_user');
    }
    return Promise.reject(err);
  }
);

export default client;
