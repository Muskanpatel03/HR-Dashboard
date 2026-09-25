import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://hr-dashboard-k21f.onrender.com/api';

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
