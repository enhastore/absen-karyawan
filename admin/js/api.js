// API Helper - Centralized API communication
const API_BASE = (window.location.protocol === 'file:' ? 'http://localhost:3000' : window.location.origin) + '/api';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('auth_token');
    // Bersihkan sisa flag demo di localStorage jika ada
    localStorage.removeItem('absenku_demo_mode');
    localStorage.removeItem('absenku_demo_db_v2');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    localStorage.removeItem('absenku_demo_mode');
    localStorage.removeItem('absenku_demo_db_v2');
  }

  getUser() {
    const data = localStorage.getItem('user_data');
    return data ? JSON.parse(data) : null;
  }

  setUser(user) {
    localStorage.setItem('user_data', JSON.stringify(user));
  }

  isDemoMode() {
    return false;
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...headers, ...options.headers },
        body: options.body instanceof FormData ? options.body : (options.body ? JSON.stringify(options.body) : undefined),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.clearToken();
          window.location.href = typeof getAppUrl === 'function' ? getAppUrl('index.html') : '/admin/index.html';
          return;
        }
        throw new Error(data.error || 'Terjadi kesalahan');
      }

      return data;
    } catch (err) {
      if (err.message === 'Failed to fetch') {
        throw new Error('Tidak dapat terhubung ke server backend');
      }
      throw err;
    }
  }

  get(endpoint) { return this.request(endpoint); }
  post(endpoint, body) { return this.request(endpoint, { method: 'POST', body }); }
  put(endpoint, body) { return this.request(endpoint, { method: 'PUT', body }); }
  delete(endpoint) { return this.request(endpoint, { method: 'DELETE' }); }
}

const api = new ApiClient();
