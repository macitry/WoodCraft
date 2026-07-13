import axios from 'axios';
import type { AxiosInstance, AxiosError } from 'axios';

const API_URL: string = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';

const client: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 120000,  // 120s — CAD generation can take ~60s
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error normalization
client.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      console.error(
        `[API Error] ${error.response.status}:`,
        error.response.data,
      );
    } else if (error.request) {
      console.error('[API Error] No response received:', error.message);
    } else {
      console.error('[API Error]', error.message);
    }
    return Promise.reject(error);
  },
);

export default client;
