import axios from 'axios';
import { toast } from 'react-toastify';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

const AUTH_STATUS_ENDPOINT = '/auth/user';

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const requestUrl = error.config?.url ?? '';
    const isAuthStatusCheck = requestUrl.endsWith(AUTH_STATUS_ENDPOINT);

    if (status === 401 && !isAuthStatusCheck) {
      toast.error('Session expired. Please log in again.');

      if (window.location.pathname !== '/') {
        window.location.assign('/');
      }
    }

    return Promise.reject(error);
  },
);

export default api;
